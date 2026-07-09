"""
Chat IA — assistente operacional da clínica (estilo WhatsApp).

Contexto enviado à IA: fila de espera + agenda do dia (dados operacionais).
Sem acesso a prontuário, anamnese, exames ou histórico clínico do paciente.
"""
import logging
import os
from datetime import date, datetime
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models.clinic import Appointment, Clinic
from models.organization import User
from models.patient import Patient
from models.queue import WaitingRoomEntry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"], dependencies=[Depends(get_current_user)])

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-opus-4-8"
MAX_HISTORY_MESSAGES = 40

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
Se perguntarem algo clínico (diagnóstico, receita, conduta), explique educadamente que isso não é sua função e sugira abrir o prontuário do paciente."""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


def _org_clinic_ids(db: Session, current_user: User) -> List[int]:
    q = db.query(Clinic.id).filter(Clinic.active == True)
    if current_user.role != "superadmin":
        q = q.filter(Clinic.organization_id == current_user.organization_id)
    return [row[0] for row in q.all()]


def _build_context(db: Session, current_user: User) -> str:
    today = date.today()
    now = datetime.utcnow()
    clinic_ids = _org_clinic_ids(db, current_user)

    waiting_q = db.query(WaitingRoomEntry).filter(WaitingRoomEntry.entry_date == today)
    if clinic_ids:
        waiting_q = waiting_q.filter(WaitingRoomEntry.clinic_id.in_(clinic_ids))
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
    if clinic_ids:
        appt_q = appt_q.filter(Appointment.clinic_id.in_(clinic_ids))
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


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    api_key = os.getenv("ANTHROPIC_API_KEY")
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
        logger.error(f"Erro de rede ao chamar Anthropic API: {exc}")
        raise HTTPException(status_code=502, detail="Falha ao conectar com o serviço de IA")

    if resp.status_code != 200:
        logger.error(f"Anthropic API retornou {resp.status_code}: {resp.text[:500]}")
        raise HTTPException(status_code=502, detail="Serviço de IA indisponível no momento")

    data = resp.json()
    reply_text = "".join(
        block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
    ).strip()

    if not reply_text:
        raise HTTPException(status_code=502, detail="Resposta vazia do serviço de IA")

    return ChatResponse(reply=reply_text)
