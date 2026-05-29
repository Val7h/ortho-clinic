from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from typing import List
from datetime import date, datetime, timedelta, timezone
import os

from database import get_db
from models.patient import Patient
from models.consultation import Consultation
from models.whatsapp import WhatsAppMessage
from schemas.whatsapp import WhatsAppMessageOut, SendMessageIn
from deps import get_current_user

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"], dependencies=[Depends(get_current_user)])

# ── Helpers ────────────────────────────────────────────────────────────────────

DOCTOR_NAME = os.getenv("DOCTOR_NAME", "Dr. Ortopedista")
CLINIC_PHONE = os.getenv("CLINIC_PHONE", "")


def _is_demo() -> bool:
    token = os.getenv("WHATSAPP_TOKEN", "").strip()
    return not token or token == "demo"


def _days_until_birthday(birthdate: date) -> int:
    today = date.today()
    try:
        next_bd = birthdate.replace(year=today.year)
    except ValueError:
        next_bd = date(today.year, 3, 1)  # 29 Feb edge case
    if next_bd < today:
        try:
            next_bd = birthdate.replace(year=today.year + 1)
        except ValueError:
            next_bd = date(today.year + 1, 3, 1)
    return (next_bd - today).days


TEMPLATES = {
    "birthday": (
        "Olá, {nome}! 🎂\n"
        "{doctor} e toda a equipe desejam um feliz aniversário! "
        "Que este novo ano seja repleto de saúde, bem-estar e muita disposição. "
        "Um grande abraço! 🎉"
    ),
    "return_reminder": (
        "Olá, {nome}! 👋\n"
        "Passando para lembrá-lo(a) que seu retorno está agendado para {data}. "
        "Qualquer dúvida, entre em contato. "
        "Esperamos você! — {doctor}"
    ),
    "post_consultation": (
        "Olá, {nome}! 😊\n"
        "Como está se sentindo após a consulta de {data}? "
        "Caso tenha alguma dúvida sobre o tratamento prescrito, estamos à disposição. "
        "Um abraço! — {doctor}"
    ),
    "semestral": (
        "Olá, {nome}! 👋\n"
        "Notamos que já faz mais de 6 meses desde sua última consulta. "
        "Uma avaliação de acompanhamento é importante para garantir a evolução do seu tratamento. "
        "Entre em contato para agendar! — {doctor}"
        + (f"\n📞 {CLINIC_PHONE}" if CLINIC_PHONE else "")
    ),
    "anual": (
        "Olá, {nome}! 👋\n"
        "Já completou um ano desde a sua última visita ao consultório. "
        "Que tal uma avaliação anual? Entre em contato para agendar sua consulta. "
        "— {doctor}"
        + (f"\n📞 {CLINIC_PHONE}" if CLINIC_PHONE else "")
    ),
}


def _render_template(
    msg_type: str,
    patient_name: str,
    extra: dict | None = None,
    custom_text: str | None = None,
) -> str:
    if msg_type == "custom" and custom_text:
        return custom_text.replace("{nome}", patient_name).replace("{doctor}", DOCTOR_NAME)
    tpl = TEMPLATES.get(msg_type, TEMPLATES["post_consultation"])
    ctx = {"nome": patient_name.split()[0], "doctor": DOCTOR_NAME}
    if extra:
        ctx.update(extra)
    return tpl.format(**ctx)


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/config")
def get_config():
    token = os.getenv("WHATSAPP_TOKEN", "").strip()
    return {
        "demo": _is_demo(),
        "configured": bool(token and token != "demo"),
        "doctor_name": DOCTOR_NAME,
    }


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    today = date.today()
    seven_days = today + timedelta(days=7)
    six_months_ago = today - timedelta(days=180)

    active_patients = db.query(Patient).filter(Patient.active == True).all()

    # ── Birthdays ──────────────────────────────────────────────────────────
    birthdays_today = []
    birthdays_week = []
    for p in active_patients:
        if not p.birthdate:
            continue
        days = _days_until_birthday(p.birthdate)
        entry = {
            "id": p.id,
            "name": p.name,
            "phone": p.phone,
            "birthdate": str(p.birthdate),
            "days_until": days,
        }
        if days == 0:
            birthdays_today.append(entry)
        elif 1 <= days <= 7:
            birthdays_week.append(entry)

    birthdays_week.sort(key=lambda x: x["days_until"])

    # ── Upcoming returns ───────────────────────────────────────────────────
    upcoming_consults = (
        db.query(Consultation)
        .filter(
            Consultation.next_appointment >= today,
            Consultation.next_appointment <= seven_days,
        )
        .order_by(Consultation.next_appointment)
        .all()
    )
    # Deduplicate by patient (take earliest next_appointment per patient)
    seen_patients: set = set()
    returns_today = []
    returns_week = []
    for c in upcoming_consults:
        if c.patient_id in seen_patients:
            continue
        seen_patients.add(c.patient_id)
        p = db.query(Patient).filter(Patient.id == c.patient_id, Patient.active == True).first()
        if not p:
            continue
        days_until = (c.next_appointment - today).days
        entry = {
            "id": p.id,
            "name": p.name,
            "phone": p.phone,
            "next_appointment": str(c.next_appointment),
            "days_until": days_until,
            "consultation_id": c.id,
        }
        if days_until == 0:
            returns_today.append(entry)
        else:
            returns_week.append(entry)

    # ── Overdue patients (no consultation in 6+ months) ───────────────────
    latest_date_subq = (
        db.query(
            Consultation.patient_id,
            sql_func.max(Consultation.date).label("last_date"),
        )
        .group_by(Consultation.patient_id)
        .subquery()
    )
    overdue_rows = (
        db.query(Patient, latest_date_subq.c.last_date)
        .join(latest_date_subq, Patient.id == latest_date_subq.c.patient_id)
        .filter(
            latest_date_subq.c.last_date < datetime(
                six_months_ago.year, six_months_ago.month, six_months_ago.day,
                tzinfo=timezone.utc,
            ),
            Patient.active == True,
        )
        .limit(10)
        .all()
    )
    overdue = [
        {
            "id": p.id,
            "name": p.name,
            "phone": p.phone,
            "last_consultation": str(last_date.date()) if last_date else None,
            "days_since": (today - last_date.date()).days if last_date else None,
        }
        for p, last_date in overdue_rows
    ]

    # ── Recent messages ───────────────────────────────────────────────────
    recent = (
        db.query(WhatsAppMessage)
        .order_by(WhatsAppMessage.created_at.desc())
        .limit(15)
        .all()
    )
    recent_messages = []
    for m in recent:
        p = db.query(Patient).filter(Patient.id == m.patient_id).first()
        recent_messages.append({
            "id": m.id,
            "patient_id": m.patient_id,
            "patient_name": p.name if p else "—",
            "message_type": m.message_type,
            "message_text": m.message_text,
            "status": m.status,
            "demo": m.demo,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })

    return {
        "birthdays_today": birthdays_today,
        "birthdays_week": birthdays_week,
        "returns_today": returns_today,
        "returns_week": returns_week,
        "overdue": overdue,
        "recent_messages": recent_messages,
    }


@router.post("/send", response_model=WhatsAppMessageOut, status_code=201)
def send_message(data: SendMessageIn, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == data.patient_id).first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")

    extra = {}
    if data.appointment_date:
        extra["data"] = data.appointment_date
    if data.consultation_date:
        extra["data"] = data.consultation_date

    text = _render_template(data.message_type, patient.name, extra, data.custom_text)
    demo = _is_demo()

    msg = WhatsAppMessage(
        patient_id=patient.id,
        phone=patient.phone,
        message_type=data.message_type,
        message_text=text,
        status="demo" if demo else "sent",
        demo=demo,
        sent_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.get("/messages", response_model=List[WhatsAppMessageOut])
def list_messages(db: Session = Depends(get_db)):
    return (
        db.query(WhatsAppMessage)
        .order_by(WhatsAppMessage.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/patients/{patient_id}/messages", response_model=List[WhatsAppMessageOut])
def list_patient_messages(patient_id: int, db: Session = Depends(get_db)):
    return (
        db.query(WhatsAppMessage)
        .filter(WhatsAppMessage.patient_id == patient_id)
        .order_by(WhatsAppMessage.created_at.desc())
        .all()
    )


@router.get("/preview")
def preview_message(
    patient_id: int,
    message_type: str,
    appointment_date: str | None = None,
    consultation_date: str | None = None,
    db: Session = Depends(get_db),
):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    extra = {}
    if appointment_date:
        extra["data"] = appointment_date
    if consultation_date:
        extra["data"] = consultation_date
    text = _render_template(message_type, patient.name, extra)
    return {"text": text, "phone": patient.phone}
