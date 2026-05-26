from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from database import get_db
from models.patient import Patient
from models.consultation import Consultation
from schemas.consultation import ConsultationCreate, ConsultationUpdate, ConsultationOut

router = APIRouter(prefix="/patients/{patient_id}/consultations", tags=["consultations"])


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
    consultation = Consultation(
        patient_id=patient_id,
        **{**data.model_dump(), "type": consultation_type}
    )
    db.add(consultation)
    db.commit()
    db.refresh(consultation)
    return consultation


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
