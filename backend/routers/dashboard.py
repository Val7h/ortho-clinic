from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from database import get_db
from models.patient import Patient
from models.consultation import Consultation

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(db: Session = Depends(get_db)):
    today = date.today()
    start_month = today.replace(day=1)
    start_week = today - timedelta(days=today.weekday())

    total_patients = db.query(func.count(Patient.id)).filter(Patient.active == True).scalar()
    total_consultations = db.query(func.count(Consultation.id)).scalar()
    consultations_this_month = db.query(func.count(Consultation.id)).filter(
        func.date(Consultation.date) >= start_month
    ).scalar()
    consultations_this_week = db.query(func.count(Consultation.id)).filter(
        func.date(Consultation.date) >= start_week
    ).scalar()

    recent_patients = (
        db.query(Patient)
        .filter(Patient.active == True)
        .order_by(Patient.created_at.desc())
        .limit(5)
        .all()
    )

    recent_consultations = (
        db.query(Consultation)
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
