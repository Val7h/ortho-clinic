"""
Chat IA — assistente operacional da clínica (estilo WhatsApp).

Contexto enviado à IA: fila de espera + agenda do dia (dados operacionais).
Sem acesso a prontuário, anamnese, exames ou histórico clínico do paciente.
"""
import logging
import os
from datetime import date, datetime
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models.clinic import Appointment
from models.organization import User
from models.patient import Patient
from models.queue import WaitingRoomEntry
from services.whatsapp import send_whatsapp

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

SYSTEM_PERSONA = """Você é o assistente virtual da OrthoClinic, um sistema de gestão de consultório ortopédico.
Seu papel é ajudar o médico e a secretária com informações OPERACIONAIS sobre a agenda e a fila de atendimento do dia.
Responda em português do Brasil, de forma curta e direta — isto é um chat, não um relatório.
Você NÃO tem acesso a prontuário médico, anamnese, exames ou histórico clínico dos pacientes — apenas à fila de espera e à agenda do dia.
Se perguntarem algo clínico (diagnóstico, receita, conduta), explique educadamente que isso não é sua função e sugira abrir o prontuário do paciente.

Se o usuário pedir para avisar, notificar ou mandar uma mensagem de WhatsApp para um paciente, use a
ferramenta propose_whatsapp_message com o nome do paciente (deve estar na fila ou agenda de hoje) e o
texto da mensagem. Você NUNCA envia a mensagem sozinho — o envio só acontece depois que o usuário
revisar e aprovar o rascunho na interface."""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class WhatsAppDraft(BaseModel):
    patient_id: int
    patient_name: str
    phone: Optional[str] = None
    message: str


class ChatResponse(BaseModel):
    reply: str
    draft: Optional[WhatsAppDraft] = None


class SendWhatsAppRequest(BaseModel):
    patient_id: int
    message: str


class SendWhatsAppResponse(BaseModel):
    sent: bool
    demo: bool
    error: Optional[str] = None


def _build_context(db: Session, current_user: User) -> str:
    today = date.today()
    now = datetime.utcnow()

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

    counts = {"waiting": 0, "attending": 0, "attended": 0, "absent": 0}
    queue_lines = []
    for entry in entries:
        counts[entry.status] = counts.get(entry.status, 0) + 1
        patient = db.query(Patient).filter(Patient.id == entry.patient_id).first()
        name = patient.name if patient else "Desconhecido"
        waited = None
        if entry.arrived_at:
            waited = int((now - entry.arrived_at).total_seconds() / 60)
        wait_txt = f", {waited}min de espera" if waited is not None and entry.status == "waiting" else ""
        queue_lines.append(f"- {name}: {STATUS_LABELS.get(entry.status, entry.status)}{wait_txt}")

    appt_q = db.query(Appointment).filter(Appointment.date == today)
    if current_user.role != "superadmin":
        appt_q = appt_q.join(Patient, Appointment.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    appointments = appt_q.order_by(Appointment.start_time.asc()).all()
    agenda_lines = [
        f"- {appt.start_time or '?'}: {appt.patient_name} ({appt.status})"
        for appt in appointments
    ]

    return f"""DATA DE HOJE: {today.strftime('%d/%m/%Y')}
USUÁRIO LOGADO: {current_user.name} ({current_user.role})

SALA DE ESPERA HOJE: {counts['waiting']} aguardando, {counts['attending']} em atendimento, {counts['attended']} atendidos, {counts['absent']} ausentes
{chr(10).join(queue_lines) if queue_lines else '(fila vazia hoje)'}

AGENDA DE HOJE ({len(appointments)} consulta(s)):
{chr(10).join(agenda_lines) if agenda_lines else '(nenhuma consulta agendada hoje)'}
"""


def _find_today_patient(db: Session, current_user: User, name_query: str) -> Optional[Patient]:
    """Procura, por nome, um paciente entre os que estão na fila ou na agenda de hoje.
    Retorna None se não achar exatamente um candidato — evita mandar mensagem pra pessoa errada."""
    today = date.today()

    waiting_q = db.query(WaitingRoomEntry.patient_id).filter(WaitingRoomEntry.entry_date == today)
    if current_user.role != "superadmin":
        waiting_q = waiting_q.join(Patient, WaitingRoomEntry.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    patient_ids = {row[0] for row in waiting_q.all()}

    appt_q = db.query(Appointment.patient_id).filter(Appointment.date == today)
    if current_user.role != "superadmin":
        appt_q = appt_q.join(Patient, Appointment.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    patient_ids |= {row[0] for row in appt_q.all() if row[0] is not None}

    if not patient_ids:
        return None

    candidates = db.query(Patient).filter(Patient.id.in_(patient_ids)).all()
    query_lower = name_query.strip().lower()
    matches = [
        p for p in candidates
        if query_lower in p.name.lower() or p.name.lower() in query_lower
    ]
    return matches[0] if len(matches) == 1 else None


@router.post("/send-whatsapp", response_model=SendWhatsAppResponse)
def send_whatsapp_message(
    request: SendWhatsAppRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    if current_user.role != "superadmin" and patient.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Sem permissão para este paciente")
    if not patient.phone:
        raise HTTPException(status_code=422, detail="Paciente sem telefone cadastrado")
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Mensagem vazia")
    result = send_whatsapp(patient.phone, message)
    return SendWhatsAppResponse(**result)


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
        patient = _find_today_patient(db, current_user, patient_name) if patient_name else None
        if patient and draft_message:
            draft = WhatsAppDraft(
                patient_id=patient.id,
                patient_name=patient.name,
                phone=patient.phone,
                message=draft_message,
            )
            if not reply_text:
                reply_text = f"Preparei uma mensagem para {patient.name}. Revise e confirme o envio abaixo."
            if not patient.phone:
                reply_text += "\n\n⚠️ Esse paciente não tem telefone cadastrado — não será possível enviar até isso ser corrigido no cadastro."
        elif not reply_text:
            reply_text = f"Não encontrei exatamente um paciente chamado \"{patient_name}\" na fila ou agenda de hoje. Pode confirmar o nome completo?"

    if not reply_text:
        raise HTTPException(status_code=502, detail="Resposta vazia do serviço de IA")

    return ChatResponse(reply=reply_text, draft=draft)
