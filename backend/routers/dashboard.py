from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from database import get_db
from models.patient import Patient
from models.consultation import Consultation
from models.queue import WaitingRoomEntry
from deps import get_current_user
from models.organization import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)])


@router.get("")
def get_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    start_month = today.replace(day=1)
    start_week = today - timedelta(days=today.weekday())

    q_patients = db.query(func.count(Patient.id)).filter(Patient.active == True)
    if current_user.role != "superadmin":
        q_patients = q_patients.filter(Patient.organization_id == current_user.organization_id)
    total_patients = q_patients.scalar()

    q_consult = db.query(func.count(Consultation.id))
    if current_user.role != "superadmin":
        q_consult = q_consult.join(Patient, Consultation.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    total_consultations = q_consult.scalar()

    q_month = db.query(func.count(Consultation.id)).filter(func.date(Consultation.date) >= start_month)
    if current_user.role != "superadmin":
        q_month = q_month.join(Patient, Consultation.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    consultations_this_month = q_month.scalar()

    q_week = db.query(func.count(Consultation.id)).filter(func.date(Consultation.date) >= start_week)
    if current_user.role != "superadmin":
        q_week = q_week.join(Patient, Consultation.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    consultations_this_week = q_week.scalar()

    q_recent_patients = db.query(Patient).filter(Patient.active == True)
    if current_user.role != "superadmin":
        q_recent_patients = q_recent_patients.filter(Patient.organization_id == current_user.organization_id)
    recent_patients = (
        q_recent_patients
        .order_by(Patient.created_at.desc())
        .limit(5)
        .all()
    )

    # Tempo médio real de atendimento (Chamar -> Concluir), últimos 30 dias.
    # duration_minutes = (attended_at - called_at); só entradas com timer completo entram na média.
    # Calculado em Python (não via SQL EXTRACT/EPOCH) para funcionar igual em SQLite e Postgres.
    start_30d = today - timedelta(days=30)
    q_duration = db.query(WaitingRoomEntry.called_at, WaitingRoomEntry.attended_at).filter(
        WaitingRoomEntry.called_at.isnot(None),
        WaitingRoomEntry.attended_at.isnot(None),
        WaitingRoomEntry.entry_date >= start_30d,
    )
    if current_user.role != "superadmin":
        q_duration = q_duration.join(Patient, WaitingRoomEntry.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    durations_minutes = [
        (attended_at - called_at).total_seconds() / 60.0
        for called_at, attended_at in q_duration.all()
    ]
    avg_duration_minutes = round(sum(durations_minutes) / len(durations_minutes)) if durations_minutes else None

    q_recent_consult = db.query(Consultation)
    if current_user.role != "superadmin":
        q_recent_consult = q_recent_consult.join(Patient, Consultation.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    recent_consultations = (
        q_recent_consult
        .order_by(Consultation.date.desc())
        .limit(5)
        .all()
    )

    return {
        "stats": {
            "total_patients": total_patients,
            "total_consultations": total_consultations,
            "consultations_this_month": consultations_this_month,
            "consultations_this_week": consultations_this_week,
            "avg_duration_minutes": avg_duration_minutes,
        },
        "recent_patients": [
            {"id": p.id, "name": p.name, "phone": p.phone, "created_at": p.created_at.isoformat()}
            for p in recent_patients
        ],
        "recent_consultations": [
            {
                "id": c.id,
                "patient_id": c.patient_id,
                "date": c.date.isoformat(),
                "type": c.type,
                "diagnosis": c.diagnosis,
            }
            for c in recent_consultations
        ],
    }
