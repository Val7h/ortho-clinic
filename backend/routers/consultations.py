from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, date, timedelta
import uuid
from database import get_db
from models.patient import Patient
from models.consultation import Consultation
from schemas.consultation import ConsultationCreate, ConsultationUpdate, ConsultationOut
from deps import require_doctor, get_current_user

router = APIRouter(prefix="/patients/{patient_id}/consultations", tags=["consultations"], dependencies=[Depends(require_doctor)])


@router.get("", response_model=List[ConsultationOut])
def list_consultations(patient_id: int, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    return db.query(Consultation).filter(Consultation.patient_id == patient_id).order_by(Consultation.date.desc()).all()


@router.post("", response_model=ConsultationOut, status_code=201)
def create_consultation(patient_id: int, data: ConsultationCreate, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    count = db.query(Consultation).filter(Consultation.patient_id == patient_id).count()
    if count == 0:
        consultation_type = "primeira_consulta"
    else:
        consultation_type = data.type or "retorno"
    data_dict = {**data.model_dump(), "type": consultation_type}
    # Auto-generate Jitsi Meet URL for teleconsultas
    if consultation_type == "teleconsulta" and not data_dict.get("teleconsult_url"):
        room = str(uuid.uuid4()).replace("-", "")[:10]
        data_dict["teleconsult_url"] = f"https://meet.jit.si/OrthoClinic-{room}"
    consultation = Consultation(patient_id=patient_id, **data_dict)
    db.add(consultation)
    db.commit()
    db.refresh(consultation)
    return consultation


# ── Agenda ────────────────────────────────────────────────────────────────────
agenda_router = APIRouter(prefix="/agenda", tags=["Agenda"], dependencies=[Depends(get_current_user)])

@agenda_router.get("")
def get_agenda(
    start: date = None,
    end: date = None,
    db: Session = Depends(get_db),
):
    from models.patient import Patient
    today = date.today()
    if start is None:
        start = today - timedelta(days=today.weekday())  # Monday of current week
    if end is None:
        end = start + timedelta(days=6)

    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.max.time())

    consultations = (
        db.query(Consultation)
        .filter(Consultation.date >= start_dt, Consultation.date <= end_dt)
        .order_by(Consultation.date)
        .all()
    )

    result = []
    for c in consultations:
        p = db.query(Patient).filter(Patient.id == c.patient_id).first()
        result.append({
            "id": c.id,
            "patient_id": c.patient_id,
            "patient_name": p.name if p else "—",
            "date": c.date.isoformat(),
            "type": c.type,
            "diagnosis": c.diagnosis,
            "teleconsult_url": c.teleconsult_url,
            "next_appointment": str(c.next_appointment) if c.next_appointment else None,
        })

    # Also include next_appointments (returns) in range
    returns = (
        db.query(Consultation)
        .filter(
            Consultation.next_appointment >= start,
            Consultation.next_appointment <= end,
        )
        .order_by(Consultation.next_appointment)
        .all()
    )
    return_ids = {c.id for c in consultations}
    for c in returns:
        if c.id in return_ids:
            continue
        p = db.query(Patient).filter(Patient.id == c.patient_id).first()
        result.append({
            "id": c.id,
            "patient_id": c.patient_id,
            "patient_name": p.name if p else "—",
            "date": f"{c.next_appointment}T08:00:00",  # placeholder time for return
            "type": "retorno_agendado",
            "diagnosis": c.diagnosis,
            "teleconsult_url": None,
            "next_appointment": str(c.next_appointment),
            "is_return": True,
        })

    result.sort(key=lambda x: x["date"])
    return result


@router.get("/{consultation_id}", response_model=ConsultationOut)
def get_consultation(patient_id: int, consultation_id: int, db: Session = Depends(get_db)):
    c = db.query(Consultation).filter(
        Consultation.id == consultation_id,
        Consultation.patient_id == patient_id
    ).first()
    if not c:
        raise HTTPException(404, "Consulta não encontrada")
    return c


@router.put("/{consultation_id}", response_model=ConsultationOut)
def update_consultation(patient_id: int, consultation_id: int, data: ConsultationUpdate, db: Session = Depends(get_db)):
    c = db.query(Consultation).filter(
        Consultation.id == consultation_id,
        Consultation.patient_id == patient_id
    ).first()
    if not c:
        raise HTTPException(404, "Consulta não encontrada")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(c, key, value)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{consultation_id}", status_code=204)
def delete_consultation(patient_id: int, consultation_id: int, db: Session = Depends(get_db)):
    c = db.query(Consultation).filter(
        Consultation.id == consultation_id,
        Consultation.patient_id == patient_id
    ).first()
    if not c:
        raise HTTPException(404, "Consulta não encontrada")
    db.delete(c)
    db.commit()
