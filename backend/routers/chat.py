"""
Chat IA — assistente operacional da clínica (estilo WhatsApp).

Contexto enviado à IA: fila de espera + agenda do dia (dados operacionais).
Sem acesso a prontuário, anamnese, exames ou histórico clínico do paciente.
"""
import logging
import os
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from itertools import groupby
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from tzutil import today_br
from deps import get_current_user
from models.clinic import Appointment, Clinic
from models.organization import User
from models.patient import Patient
from models.queue import WaitingRoomEntry
from services.whatsapp import send_whatsapp, format_phone, DOCTOR_NAME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"], dependencies=[Depends(get_current_user)])

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-opus-4-8"
MAX_HISTORY_MESSAGES = 40

# Ferramenta que permite ao assistente propor uma mensagem de WhatsApp para um
# paciente da fila/agenda de hoje. O modelo NUNCA envia a mensagem diretamente —
# a chamada da ferramenta só monta um rascunho que a interface mostra para o
# usuário revisar e aprovar o envio manualmente (botão "Enviar via WhatsApp").
CHAT_TOOLS = [
    {
        "name": "propose_whatsapp_message",
        "description": (
            "Prepara um rascunho de mensagem de WhatsApp para um paciente que está na fila de "
            "espera ou na agenda de hoje. Isso NÃO envia a mensagem — apenas monta um rascunho "
            "que será exibido ao usuário para revisão e aprovação manual antes do envio real. "
            "Use sempre que o usuário pedir para avisar, notificar ou mandar mensagem para um paciente."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "patient_name": {
                    "type": "string",
                    "description": "Nome (completo ou parcial) do paciente — deve corresponder a alguém na fila de espera ou agenda de hoje.",
                },
                "message": {
                    "type": "string",
                    "description": "Texto da mensagem de WhatsApp, em português do Brasil, tom cordial e profissional.",
                },
            },
            "required": ["patient_name", "message"],
        },
    }
]

STATUS_LABELS = {
    "waiting": "aguardando",
    "attending": "em atendimento",
    "attended": "atendido",
    "absent": "ausente",
}

# Nomes que denunciam agendamento/paciente de teste — filtrados do contexto da
# agenda pra IA não misturar lixo de teste com paciente real (o Valth pede isso).
_TEST_NAME_RE = re.compile(r"\b(testes?|debug|exemplo|demo|confirm)\b", re.IGNORECASE)

# Quantos dias à frente a agenda entra no contexto (cobre "esta semana" + "semana que vem").
AGENDA_HORIZON_DAYS = 14
# Teto de agendamentos futuros no contexto (evita estourar o prompt em agendas cheias).
MAX_FUTURE_APPTS = 60

_DOW_PT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]

SYSTEM_PERSONA = """Você é o assistente virtual da OrthoClinic, um sistema de gestão de consultório ortopédico.
Seu papel é ajudar o médico e a secretária com informações OPERACIONAIS sobre a agenda e a fila de atendimento.
Responda em português do Brasil, de forma curta e direta — isto é um chat, não um relatório.
Você tem acesso à fila de espera de HOJE e à agenda de hoje + próximos 14 dias (cobre esta semana e a semana que vem). Os agendamentos de teste já vêm filtrados do contexto — trate tudo que está na agenda como real.
Você NÃO tem acesso a prontuário médico, anamnese, exames ou histórico clínico dos pacientes.
Se perguntarem algo clínico (diagnóstico, receita, conduta), explique educadamente que isso não é sua função e sugira abrir o prontuário do paciente.

Se o usuário pedir para avisar, notificar ou mandar uma mensagem de WhatsApp para um paciente, use a
ferramenta propose_whatsapp_message com o nome do paciente e o texto da mensagem. Você NUNCA envia a
mensagem sozinho — o envio só acontece depois que o usuário revisar e aprovar o rascunho na interface.
IMPORTANTE: só é possível enviar mensagem para pacientes da FILA ou da AGENDA DE HOJE. Os pacientes dos
próximos dias aparecem apenas para consulta; se pedirem para mensagear alguém que não é de hoje, explique
que, por ora, só dá para mandar mensagem para pacientes de hoje.
Os nomes no contexto aparecem só com o primeiro nome (às vezes com um número curto para desambiguar) —
isso é proposital para preservar a privacidade; ao acionar a ferramenta, use o primeiro nome mesmo."""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class WhatsAppDraft(BaseModel):
    # patient_id é opcional: agendamentos vindos do bot/formulário chegam só por
    # nome (sem patient_id) e o destino é o telefone do próprio agendamento.
    patient_id: Optional[int] = None
    patient_name: str
    phone: Optional[str] = None
    message: str


class ChatResponse(BaseModel):
    reply: str
    draft: Optional[WhatsAppDraft] = None


class SendWhatsAppRequest(BaseModel):
    # Um dos dois identifica o destinatário: patient_id (paciente cadastrado) OU
    # phone (agendamento de hoje só por nome, sem patient_id). O phone é sempre
    # validado contra os destinatários reais de hoje — nunca é um número livre.
    patient_id: Optional[int] = None
    phone: Optional[str] = None
    message: str


class SendWhatsAppResponse(BaseModel):
    sent: bool
    demo: bool
    error: Optional[str] = None


@dataclass
class _Recipient:
    """Destinatário acionável de hoje (fila ou agenda). Pode ter patient_id
    (paciente cadastrado) ou apenas telefone (agendamento só por nome)."""
    name: str
    phone: Optional[str]
    patient_id: Optional[int] = None


def _first_name(full: str) -> str:
    """Primeiro nome, para minimizar PII no contexto enviado à IA (S4/LGPD)."""
    parts = (full or "").strip().split()
    return parts[0] if parts else "Paciente"


def _mask_phone(phone: Optional[str]) -> str:
    """Mascara telefone para log: mantém só os últimos 4 dígitos (S7)."""
    digits = re.sub(r"\D", "", phone or "")
    return f"****{digits[-4:]}" if len(digits) >= 4 else "****"


def _build_context(db: Session, current_user: User) -> str:
    today = today_br()
    # tz-aware: no Postgres, colunas DateTime(timezone=True) voltam com tzinfo —
    # subtrair de um datetime.utcnow() (naive) lança TypeError. Nunca disparava
    # antes porque a fila de espera nunca tinha entrada real na hora do chat
    # (mascarado pelo bug de fuso horário do "hoje" do servidor).
    now = datetime.now(timezone.utc)

    # Escopo por organização do PACIENTE, não por clinic_id da entrada — muitos
    # check-ins da sala de espera ficam com clinic_id nulo (não é obrigatório
    # escolher clínica no check-in), o que faria um filtro por clinic_id
    # descartar silenciosamente a fila inteira (já aconteceu em produção).
    waiting_q = db.query(WaitingRoomEntry).filter(WaitingRoomEntry.entry_date == today)
    if current_user.role != "superadmin":
        waiting_q = waiting_q.join(Patient, WaitingRoomEntry.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    entries = waiting_q.order_by(WaitingRoomEntry.arrived_at.asc()).all()

    # S4/LGPD: minimizar PII no prompt — usamos só o PRIMEIRO nome no texto
    # enviado à Anthropic. O casamento de destinatário é feito no BANCO
    # (_find_today_patient/_today_recipients), então não depende deste texto.
    counts = {"waiting": 0, "attending": 0, "attended": 0, "absent": 0}
    queue_items = []  # (first_name, patient_id, entry)
    for entry in entries:
        counts[entry.status] = counts.get(entry.status, 0) + 1
        patient = db.query(Patient).filter(Patient.id == entry.patient_id).first()
        first = _first_name(patient.name) if patient else "Desconhecido"
        pid = patient.id if patient else None
        queue_items.append((first, pid, entry))

    # Desambigua só quando o mesmo primeiro nome aparece mais de uma vez.
    queue_first_counts = Counter(f for f, _, _ in queue_items)
    queue_lines = []
    for first, pid, entry in queue_items:
        label = f"{first} #{pid}" if queue_first_counts[first] > 1 and pid is not None else first
        waited = None
        if entry.arrived_at:
            arrived_at = entry.arrived_at if entry.arrived_at.tzinfo else entry.arrived_at.replace(tzinfo=timezone.utc)
            waited = int((now - arrived_at).total_seconds() / 60)
        wait_txt = f", {waited}min de espera" if waited is not None and entry.status == "waiting" else ""
        queue_lines.append(f"- {label}: {STATUS_LABELS.get(entry.status, entry.status)}{wait_txt}")

    # Agenda de hoje + próximos AGENDA_HORIZON_DAYS dias (cobre "esta semana" e
    # "semana que vem"). Escopo por Clinic.organization_id — NÃO por patient_id:
    # Appointment.clinic_id é NOT NULL (seguro), mas patient_id é nullable, então
    # um join por paciente descartaria agendamentos feitos só por nome (comuns,
    # vindos do bot de WhatsApp / formulário pré-consulta).
    horizon = today + timedelta(days=AGENDA_HORIZON_DAYS)
    appt_q = db.query(Appointment).filter(
        Appointment.date >= today,
        Appointment.date <= horizon,
        Appointment.status.notin_(["cancelled", "blocked"]),
    )
    if current_user.role != "superadmin":
        appt_q = appt_q.join(Clinic, Appointment.clinic_id == Clinic.id).filter(
            Clinic.organization_id == current_user.organization_id
        )
    all_appts = appt_q.order_by(Appointment.date.asc(), Appointment.start_time.asc()).all()
    # Tira agendamentos de teste óbvios (nome com teste/debug/exemplo/demo/confirm).
    real_appts = [a for a in all_appts if not _TEST_NAME_RE.search(a.patient_name or "")]

    today_appts = [a for a in real_appts if a.date == today]
    future_appts = [a for a in real_appts if a.date > today][:MAX_FUTURE_APPTS]

    # S4/LGPD: só primeiro nome no texto; desambigua com o id do agendamento
    # (curto e não-PII) quando o mesmo primeiro nome se repete na agenda mostrada.
    appt_first_counts = Counter(_first_name(a.patient_name) for a in today_appts + future_appts)

    def _appt_label(a) -> str:
        first = _first_name(a.patient_name)
        return f"{first} #{a.id}" if appt_first_counts[first] > 1 else first

    today_lines = [
        f"- {a.start_time or '?'}: {_appt_label(a)} ({a.status})"
        for a in today_appts
    ]

    future_blocks = []
    for d, group in groupby(future_appts, key=lambda a: a.date):
        items = list(group)
        header = f"{_DOW_PT[d.weekday()]} {d.strftime('%d/%m')} ({len(items)}):"
        lines = "\n".join(
            f"  - {a.start_time or '?'}: {_appt_label(a)} ({a.status})" for a in items
        )
        future_blocks.append(f"{header}\n{lines}")

    return f"""DATA DE HOJE: {today.strftime('%d/%m/%Y')} ({_DOW_PT[today.weekday()]})
USUÁRIO LOGADO: {current_user.name} ({current_user.role})

SALA DE ESPERA HOJE: {counts['waiting']} aguardando, {counts['attending']} em atendimento, {counts['attended']} atendidos, {counts['absent']} ausentes
{chr(10).join(queue_lines) if queue_lines else '(fila vazia hoje)'}

AGENDA DE HOJE ({len(today_appts)} consulta(s)):
{chr(10).join(today_lines) if today_lines else '(nenhuma consulta agendada hoje)'}

AGENDA DOS PRÓXIMOS {AGENDA_HORIZON_DAYS} DIAS ({len(future_appts)} consulta(s), agendamentos de teste já removidos):
{chr(10).join(future_blocks) if future_blocks else '(nenhuma consulta agendada nos próximos dias)'}
"""


def _normalize_name(text: str) -> str:
    """Normaliza um nome para casamento seguro: minúsculas, sem acentos, sem
    pontuação e com espaços colapsados. Ex.: 'João  Alves!' -> 'joao alves'."""
    nfkd = unicodedata.normalize("NFKD", text or "")
    sem_acento = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", sem_acento.lower()).strip()


def _today_recipients(db: Session, current_user: User) -> List[_Recipient]:
    """Monta a lista de destinatários ACIONÁVEIS de hoje: pacientes da fila +
    pacientes/agendamentos de hoje. Agendamentos sem patient_id (vindos do bot/
    formulário) entram com o telefone do próprio agendamento (patient_phone).

    Esta mesma lista é a fonte de verdade tanto para o casamento por nome quanto
    para validar um telefone recebido no /send-whatsapp — impedindo envio para um
    número arbitrário que não pertence a ninguém da agenda/fila de hoje."""
    today = today_br()

    # Fila de espera de hoje — sempre pacientes reais cadastrados.
    waiting_q = db.query(WaitingRoomEntry.patient_id).filter(WaitingRoomEntry.entry_date == today)
    if current_user.role != "superadmin":
        waiting_q = waiting_q.join(Patient, WaitingRoomEntry.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    waiting_ids = {row[0] for row in waiting_q.all() if row[0] is not None}

    # Agendamentos de hoje (exclui cancelados/bloqueados). Escopo por
    # Clinic.organization_id porque patient_id é nullable (só por nome).
    appt_q = db.query(Appointment).filter(
        Appointment.date == today,
        Appointment.status.notin_(["cancelled", "blocked"]),
    )
    if current_user.role != "superadmin":
        appt_q = appt_q.join(Clinic, Appointment.clinic_id == Clinic.id).filter(
            Clinic.organization_id == current_user.organization_id
        )
    appts = appt_q.all()

    # Carrega os pacientes (fila + agendamentos com patient_id) de uma vez.
    patient_ids = set(waiting_ids) | {a.patient_id for a in appts if a.patient_id is not None}
    patients_by_id = {}
    if patient_ids:
        pq = db.query(Patient).filter(Patient.id.in_(patient_ids))
        if current_user.role != "superadmin":
            pq = pq.filter(Patient.organization_id == current_user.organization_id)
        patients_by_id = {p.id: p for p in pq.all()}

    recipients: List[_Recipient] = []
    seen_ids = set()

    for pid in waiting_ids:
        p = patients_by_id.get(pid)
        if p and pid not in seen_ids:
            recipients.append(_Recipient(name=p.name, phone=p.phone, patient_id=p.id))
            seen_ids.add(pid)

    seen_named = set()  # dedupe de agendamentos só-por-nome (mesmo nome+telefone)
    for a in appts:
        # Ignora agendamentos de teste óbvios (nome com teste/debug/exemplo/demo).
        if _TEST_NAME_RE.search(a.patient_name or ""):
            continue
        if a.patient_id is not None:
            p = patients_by_id.get(a.patient_id)
            if p is None:  # patient_id de outra org / inexistente — ignora
                continue
            if a.patient_id in seen_ids:
                continue
            recipients.append(_Recipient(name=p.name, phone=p.phone, patient_id=p.id))
            seen_ids.add(a.patient_id)
        else:
            # Agendamento só por nome: destino é o telefone do agendamento.
            key = (_normalize_name(a.patient_name), (a.patient_phone or "").strip())
            if key in seen_named:
                continue
            seen_named.add(key)
            recipients.append(_Recipient(name=a.patient_name, phone=a.patient_phone, patient_id=None))

    return recipients


def _find_today_patient(db: Session, current_user: User, name_query: str) -> Optional[_Recipient]:
    """Procura, por nome, um destinatário entre os que estão na fila ou na agenda
    de hoje (pacientes cadastrados E agendamentos só por nome). Retorna None se
    não achar exatamente um candidato — evita mandar mensagem pra pessoa errada."""
    recipients = _today_recipients(db, current_user)
    if not recipients:
        return None

    query_norm = _normalize_name(name_query)
    query_tokens = query_norm.split()
    # Query curta/ambígua (1-2 caracteres) ou vazia: preferimos NÃO casar a
    # arriscar mandar mensagem/receita pro paciente errado. O chamador pede o
    # nome completo quando isto retorna None.
    if len(query_norm) < 3 or not query_tokens:
        return None

    def _match_forte(nome: str) -> bool:
        # Casamento por PALAVRAS com fronteira (nunca substring dentro de
        # palavra, nunca substring reverso). Evita que "ana" case "Mariana".
        nome_norm = _normalize_name(nome)
        # 1) Prefixo do nome completo (ex.: "mari" -> "Mariana Costa").
        if nome_norm.startswith(query_norm):
            return True
        # 2) Todos os tokens da query são PALAVRAS inteiras do nome
        #    (ex.: "ana costa" casa "Ana Paula Costa"; "ana" casa quem tem
        #    "Ana" como um dos nomes, mas NÃO casa "Mariana").
        nome_tokens = set(nome_norm.split())
        return all(tok in nome_tokens for tok in query_tokens)

    matches = [r for r in recipients if _match_forte(r.name)]
    return matches[0] if len(matches) == 1 else None


@router.post("/send-whatsapp", response_model=SendWhatsAppResponse)
def send_whatsapp_message(
    request: SendWhatsAppRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Acompanha o bloqueio do Chat IA (o card de envio nasce dele).
    if current_user.role == "secretary":
        raise HTTPException(status_code=403, detail="Envio via assistente disponível apenas para o médico")
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Mensagem vazia")

    if request.patient_id is not None:
        # Fluxo clássico: paciente cadastrado (inalterado).
        patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Paciente não encontrado")
        if current_user.role != "superadmin" and patient.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Sem permissão para este paciente")
        if not patient.phone:
            raise HTTPException(status_code=422, detail="Paciente sem telefone cadastrado")
        dest_phone = patient.phone
        dest_name = patient.name
    else:
        # M15: envio por telefone direto (agendamento só por nome, sem patient_id).
        # NUNCA confiamos no telefone cru do cliente: ele precisa bater com um
        # destinatário REAL da fila/agenda de HOJE desta organização.
        raw_phone = (request.phone or "").strip()
        if not raw_phone:
            raise HTTPException(status_code=422, detail="Informe o paciente ou o telefone do destinatário")
        norm_req = format_phone(raw_phone)
        match = next(
            (r for r in _today_recipients(db, current_user)
             if r.phone and format_phone(r.phone) == norm_req),
            None,
        )
        if match is None:
            raise HTTPException(
                status_code=403,
                detail="Telefone não corresponde a nenhum paciente/agendamento de hoje",
            )
        dest_phone = raw_phone
        dest_name = match.name

    # S7: garante a assinatura do médico ao final, sem duplicar se já houver.
    if DOCTOR_NAME and DOCTOR_NAME not in message:
        message = f"{message}\n\n— {DOCTOR_NAME}"

    result = send_whatsapp(dest_phone, message)

    # S7: log de envio (o quê/para quem/quando) sem PII crua — telefone mascarado.
    if result.get("sent"):
        outcome = "enviado"
    elif result.get("demo"):
        outcome = "demo (não enviado)"
    else:
        outcome = "falha"
    # Só primeiro nome + telefone mascarado no log (minimiza PII / LGPD).
    logger.info(
        "Chat WhatsApp: %s para %s (tel %s) por %s — %d caracteres",
        outcome, _first_name(dest_name), _mask_phone(dest_phone), current_user.name, len(message),
    )
    return SendWhatsAppResponse(**result)


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Decisão do Valth (02/08): Chat IA é só do médico/admin — controle de CUSTO
    # de API. Secretária usa o WhatsApp normal da clínica, fora do app.
    if current_user.role == "secretary":
        raise HTTPException(status_code=403, detail="Chat IA disponível apenas para o médico")
    # .strip() é essencial: um espaço/quebra de linha extra colado no valor da
    # env var no Render vira um header HTTP inválido (httpx recusa a requisição
    # inteira com "Illegal header value" antes mesmo de sair para a rede).
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Chat IA não configurado (ANTHROPIC_API_KEY ausente)")

    clean_messages = [
        {"role": m.role, "content": m.content}
        for m in request.messages
        if m.role in ("user", "assistant") and m.content.strip()
    ][-MAX_HISTORY_MESSAGES:]

    if not clean_messages:
        raise HTTPException(status_code=422, detail="Nenhuma mensagem enviada")

    system_prompt = SYSTEM_PERSONA + "\n\n" + _build_context(db, current_user)

    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 1500,
        "system": system_prompt,
        "messages": clean_messages,
        "tools": CHAT_TOOLS,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                ANTHROPIC_API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )
    except httpx.RequestError as exc:
        # NUNCA logar str(exc) aqui: para erros de header inválido (ex.: chave
        # com espaço/quebra de linha), httpx/httpcore embutem o valor do
        # header — incluindo a própria API key — na mensagem da exceção.
        logger.error(f"Erro de rede ao chamar Anthropic API: {type(exc).__name__}")
        raise HTTPException(status_code=502, detail="Falha ao conectar com o serviço de IA")

    if resp.status_code != 200:
        logger.error(f"Anthropic API retornou {resp.status_code}: {resp.text[:500]}")
        raise HTTPException(status_code=502, detail="Serviço de IA indisponível no momento")

    data = resp.json()
    content_blocks = data.get("content", [])
    reply_text = "".join(
        block.get("text", "") for block in content_blocks if block.get("type") == "text"
    ).strip()

    draft: Optional[WhatsAppDraft] = None
    tool_use = next((b for b in content_blocks if b.get("type") == "tool_use"
                      and b.get("name") == "propose_whatsapp_message"), None)
    if tool_use:
        tool_input = tool_use.get("input", {})
        patient_name = (tool_input.get("patient_name") or "").strip()
        draft_message = (tool_input.get("message") or "").strip()
        recipient = _find_today_patient(db, current_user, patient_name) if patient_name else None
        if recipient and draft_message:
            draft = WhatsAppDraft(
                patient_id=recipient.patient_id,
                patient_name=recipient.name,
                phone=recipient.phone,
                message=draft_message,
            )
            if not reply_text:
                reply_text = f"Preparei uma mensagem para {recipient.name}. Revise e confirme o envio abaixo."
            if not recipient.phone:
                reply_text += "\n\n⚠️ Esse paciente não tem telefone cadastrado — não será possível enviar até isso ser corrigido no cadastro."
        elif not reply_text:
            reply_text = f"Não encontrei exatamente um paciente chamado \"{patient_name}\" na fila ou agenda de hoje. Pode confirmar o nome completo?"

    if not reply_text:
        raise HTTPException(status_code=502, detail="Resposta vazia do serviço de IA")

    return ChatResponse(reply=reply_text, draft=draft)
