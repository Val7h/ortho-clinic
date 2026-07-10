"""
Endpoint público para receber formulário pré-consulta enviado pelo paciente.
Autenticação via token HMAC-SHA256 (gerado pelo servidor WhatsApp AI / n8n).
Não exige JWT — é chamado antes da consulta, pelo próprio paciente.
"""

import hmac
import hashlib
import os
import re
import secrets
import shutil
import time
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional, Union

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.anamnesis import Anamnesis
from models.clinic import Appointment, Clinic
from models.patient import Patient

router = APIRouter(prefix="/pre-consulta", tags=["Pré-Consulta"])

FORM_SECRET = os.getenv("FORM_SECRET", "")
PRE_CONSULTA_ORG_ID = int(os.getenv("PRE_CONSULTA_ORG_ID", "3"))

_HERE = os.path.dirname(__file__)
_HTML_CANDIDATES = [
    os.path.join(_HERE, "..", "static", "pre-consulta.html"),          # Docker: /app/static/
    os.path.join(_HERE, "..", "frontend_out", "pre-consulta", "index.html"),  # Docker: /app/frontend_out/
    os.path.join(_HERE, "..", "..", "frontend", "public", "pre-consulta", "index.html"),  # local dev
]


@router.get("", response_class=HTMLResponse, include_in_schema=False)
def formulario_pre_consulta():
    for path in _HTML_CANDIDATES:
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as f:
                return f.read()
    raise HTTPException(status_code=404, detail="Formulário não encontrado")


# ── Schema do payload ──────────────────────────────────────────────────────────

class PreConsultaPayload(BaseModel):
    # auth
    token: str
    # aceita string ("1784325624565", como o navegador manda) OU número
    # (como clientes de API mandam) — _validar_token faz int() de qualquer forma
    exp: Union[str, int]
    agendamento_id: str

    # identificação
    nome: str
    telefone: str
    data_consulta: Optional[str] = None
    unidade: Optional[str] = None
    nascimento: Optional[str] = None
    cpf: Optional[str] = None
    cidade: Optional[str] = None
    bairro: Optional[str] = None
    profissao: Optional[str] = None
    estado_civil: Optional[str] = None
    filhos: Optional[int] = None

    # saúde geral
    doencas_cronicas: Optional[list] = None
    medicacoes: Optional[str] = None
    alergias: Optional[str] = None
    cirurgias_anteriores: Optional[str] = None
    tabagismo: Optional[str] = None
    alcool: Optional[str] = None

    # queixa
    regiao_corpo: Optional[str] = None
    descricao: Optional[str] = None
    tempo_sintomas: Optional[str] = None
    mecanismo: Optional[str] = None
    eva: Optional[int] = None
    piora: Optional[str] = None
    melhora: Optional[str] = None
    tratamento_anterior: Optional[str] = None
    uso_analgesicos: Optional[str] = None

    # exames e pagamento
    exames_urls: Optional[list] = None
    forma_pagamento: Optional[str] = None
    plano_saude: Optional[str] = None

    # gerado pelo servidor após gerar o PDF
    pdf_url: Optional[str] = None


class PreConsultaOut(BaseModel):
    ok: bool
    patient_id: int
    anamnesis_id: int
    criado: bool  # True = paciente novo, False = paciente existente atualizado
    appointment_id: Optional[int] = None
    appointment_criado: bool = False


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validar_token(agendamento_id: str, exp: str, token: str) -> None:
    if not FORM_SECRET:
        raise HTTPException(500, "FORM_SECRET não configurado")

    try:
        exp_num = int(exp)
    except ValueError:
        raise HTTPException(400, "exp inválido")

    if int(time.time() * 1000) > exp_num:
        raise HTTPException(401, "token_expirado")

    esperado = hmac.new(
        FORM_SECRET.encode(),
        f"{agendamento_id}:{exp_num}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(token, esperado):
        raise HTTPException(401, "token_invalido")


def _buscar_ou_criar_paciente(db: Session, data: PreConsultaPayload) -> tuple[Patient, bool]:
    """Retorna (paciente, criado). Busca por CPF, depois telefone."""
    patient = None

    if data.cpf:
        cpf_limpo = "".join(c for c in data.cpf if c.isdigit())
        patient = db.query(Patient).filter(Patient.cpf == data.cpf).first()
        if not patient and cpf_limpo:
            patient = db.query(Patient).filter(
                Patient.cpf.like(f"%{cpf_limpo[:11]}%")
            ).first()

    if not patient and data.telefone:
        tel = data.telefone.replace("+", "").replace(" ", "")
        patient = db.query(Patient).filter(
            Patient.phone.like(f"%{tel[-9:]}%")
        ).first()

    if patient:
        # atualiza campos que vieram do formulário
        _atualizar_paciente(patient, data)
        db.commit()
        db.refresh(patient)
        return patient, False

    # cria novo — resolve uma organização válida (evita FK violation se
    # PRE_CONSULTA_ORG_ID não existir no banco; cai para a primeira org).
    from models.organization import Organization
    org_id = PRE_CONSULTA_ORG_ID
    if not db.query(Organization.id).filter(Organization.id == org_id).first():
        first_org = db.query(Organization).order_by(Organization.id).first()
        if first_org:
            org_id = first_org.id
    patient = Patient(
        organization_id=org_id,
        name=data.nome,
        phone=data.telefone,
    )
    _atualizar_paciente(patient, data)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient, True


def _atualizar_paciente(patient: Patient, data: PreConsultaPayload) -> None:
    if data.cpf:
        patient.cpf = data.cpf
    if data.nascimento:
        try:
            patient.birthdate = datetime.fromisoformat(data.nascimento).date()
        except ValueError:
            pass
    if data.cidade:
        patient.address_city = data.cidade
    if data.bairro:
        patient.address_street = data.bairro
    if data.profissao:
        patient.occupation = data.profissao
    if data.estado_civil:
        patient.civil_status = data.estado_civil
    if data.alergias:
        patient.allergies = data.alergias
        patient.alergias = data.alergias
    if data.medicacoes:
        patient.current_medications = data.medicacoes
    if data.cirurgias_anteriores:
        patient.surgeries_history = data.cirurgias_anteriores
    if data.doencas_cronicas:
        patient.chronic_conditions = ", ".join(data.doencas_cronicas)
    if data.forma_pagamento == "convenio" and data.plano_saude:
        patient.insurance = data.plano_saude
    if data.forma_pagamento:
        pass  # insurance já tratado acima


# Mapeia a unidade (texto livre vindo do bot do WhatsApp, ex: "CTO", "Instituto Pernambuco",
# "Unimagem", "Mário Bento", "Clínica Artro") pro nome exato da Clinic cadastrada + o
# horário de início/fim do turno daquela unidade (usado só como sugestão no agendamento
# automático — a secretária revisa e ajusta se precisar).
_UNIDADE_PARA_CLINICA = [
    (("artro",), "Clínica Artro", "15:00", "19:00"),
    (("cto",), "Clínica CTO", "08:00", "12:00"),
    (("pernambuco", " ip", "instituto pe"), "Clínica IP", "09:00", "13:00"),
    (("unimagem",), "Clínica Unimagem", "13:00", "16:00"),
    (("mário bento", "mario bento", "palmares"), "Clínica Mário Bento", "10:00", "15:00"),
]


def _resolver_clinic(db: Session, unidade: Optional[str]) -> tuple[Optional[Clinic], Optional[str], Optional[str]]:
    """Retorna (clinic, start_time_sugerido, end_time_sugerido) ou (None, None, None)
    se a unidade não veio ou não bate com nenhuma unidade conhecida."""
    if not unidade:
        return None, None, None
    texto = f" {unidade.lower()} "
    for chaves, nome_clinica, inicio, fim in _UNIDADE_PARA_CLINICA:
        if any(chave in texto for chave in chaves):
            clinic = db.query(Clinic).filter(Clinic.name == nome_clinica, Clinic.active == True).first()  # noqa: E712
            if clinic:
                return clinic, inicio, fim
    return None, None, None


_RE_DATA = re.compile(r"^(\d{1,2})/(\d{1,2})(?:/(\d{4}))?$")


def _parse_data_consulta(data_consulta: Optional[str]) -> Optional[date]:
    """Converte "dd/mm" ou "dd/mm/aaaa" (formato que o bot do WhatsApp manda) numa
    date de verdade. Se faltar o ano, assume o ano atual (ou o próximo, se a data
    com o ano atual já ficou no passado — evita marcar sem querer num dia que já passou)."""
    if not data_consulta:
        return None
    m = _RE_DATA.match(data_consulta.strip())
    if not m:
        return None
    dia, mes, ano = int(m.group(1)), int(m.group(2)), m.group(3)
    hoje = datetime.now(timezone.utc).date()
    try:
        if ano:
            return date(int(ano), mes, dia)
        candidata = date(hoje.year, mes, dia)
        if candidata < hoje:
            candidata = date(hoje.year + 1, mes, dia)
        return candidata
    except ValueError:
        return None


# ── Endpoint ───────────────────────────────────────────────────────────────────

_UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", "/app/uploads/exames"))

@router.post("/upload-exame")
async def upload_exame(
    arquivo: UploadFile = File(...),
    token: str = "",
    exp: str = "",
    agendamento_id: str = "",
):
    _validar_token(agendamento_id, exp, token)
    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(arquivo.filename or "file.bin").suffix or ".bin"
    nome = f"{uuid.uuid4()}{suffix}"
    dest = _UPLOADS_DIR / nome
    with dest.open("wb") as f:
        shutil.copyfileobj(arquivo.file, f)
    url = f"/uploads/exames/{nome}"
    return {"url": url, "nome": arquivo.filename}


@router.post("/submit", response_model=PreConsultaOut)
def submit_pre_consulta(data: PreConsultaPayload, db: Session = Depends(get_db)):
    _validar_token(data.agendamento_id, data.exp, data.token)

    patient, criado = _buscar_ou_criar_paciente(db, data)

    # monta respostas da anamnese no formato do modelo existente
    responses = {
        "chief_complaint":     data.descricao,
        "pain_location":       data.regiao_corpo,
        "symptom_duration":    data.tempo_sintomas,
        "pain_scale":          data.eva,
        "aggravating_factors": data.piora,
        "relieving_factors":   data.melhora,
        "previous_treatments": data.tratamento_anterior,
        "current_medications": data.medicacoes,
        "allergies":           data.alergias,
        "surgeries_history":   data.cirurgias_anteriores,
        "chronic_conditions":  ", ".join(data.doencas_cronicas or []),
        "additional_notes": (
            f"Mecanismo: {data.mecanismo or '-'} | "
            f"Tabagismo: {data.tabagismo or '-'} | "
            f"Álcool: {data.alcool or '-'} | "
            f"Analgésicos: {data.uso_analgesicos or '-'} | "
            f"Exames: {', '.join(data.exames_urls or [])} | "
            f"PDF: {data.pdf_url or '-'} | "
            f"Pagamento: {data.forma_pagamento or '-'}"
            + (f" ({data.plano_saude})" if data.plano_saude else "")
        ),
    }

    # idempotente: se já existe anamnese para este agendamento, atualiza
    anamnesis = db.query(Anamnesis).filter(Anamnesis.token == data.agendamento_id).first()
    if anamnesis:
        anamnesis.responses = responses
        anamnesis.status = "filled"
        anamnesis.filled_at = datetime.now(timezone.utc)
        anamnesis.patient_id = patient.id
    else:
        anamnesis = Anamnesis(
            patient_id=patient.id,
            token=data.agendamento_id,
            responses=responses,
            status="filled",
            filled_at=datetime.now(timezone.utc),
        )
        db.add(anamnesis)
    db.commit()
    db.refresh(anamnesis)

    # ── Agendamento automático (pedido do Dr. Valth, 09/07/2026): a pré-consulta já
    # deixa o paciente na agenda do dia certo, como "pending" — a secretária só revisa
    # e confirma/completa, não precisa criar o agendamento do zero. ──────────────────
    appointment_id: Optional[int] = None
    appointment_criado = False
    clinic, inicio_sugerido, fim_sugerido = _resolver_clinic(db, data.unidade)
    data_consulta = _parse_data_consulta(data.data_consulta)
    if clinic and data_consulta:
        # Dedup por TELEFONE (não só patient_id): se duas submissões quase simultâneas
        # (ex: cold-start do Render + timeout/retry) criarem 2 registros de Patient
        # diferentes pro mesmo telefone, ainda assim não deixa duplicar o agendamento.
        existente = (
            db.query(Appointment)
            .filter(
                Appointment.patient_phone == data.telefone,
                Appointment.clinic_id == clinic.id,
                Appointment.date == data_consulta,
            )
            .first()
        )
        if existente:
            appointment_id = existente.id
        else:
            agendamento = Appointment(
                clinic_id=clinic.id,
                date=data_consulta,
                start_time=inicio_sugerido,
                end_time=fim_sugerido,
                patient_name=data.nome,
                patient_phone=data.telefone,
                patient_id=patient.id,
                reason=data.descricao,
                status="pending",
                confirmation_token=secrets.token_urlsafe(32),
                notes="Criado automaticamente pelo formulário de pré-consulta (WhatsApp).",
            )
            db.add(agendamento)
            db.commit()
            db.refresh(agendamento)
            appointment_id = agendamento.id
            appointment_criado = True

    return PreConsultaOut(
        ok=True,
        patient_id=patient.id,
        anamnesis_id=anamnesis.id,
        criado=criado,
        appointment_id=appointment_id,
        appointment_criado=appointment_criado,
    )
