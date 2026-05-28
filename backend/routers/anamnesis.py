from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import secrets
from database import get_db
from models.patient import Patient
from models.anamnesis import Anamnesis

router = APIRouter(tags=["Anamnese"])


class AnamnesisCreate(BaseModel):
    patient_id: int
    expires_hours: Optional[int] = 48  # link valid for 48h


class AnamnesisResponses(BaseModel):
    chief_complaint: Optional[str] = None
    symptom_duration: Optional[str] = None
    pain_location: Optional[str] = None
    pain_scale: Optional[int] = None
    aggravating_factors: Optional[str] = None
    relieving_factors: Optional[str] = None
    previous_treatments: Optional[str] = None
    current_medications: Optional[str] = None
    allergies: Optional[str] = None
    surgeries_history: Optional[str] = None
    chronic_conditions: Optional[str] = None
    additional_notes: Optional[str] = None


class AnamnesisOut(BaseModel):
    id: int
    patient_id: int
    token: str
    status: str
    responses: Optional[dict] = None
    expires_at: Optional[datetime] = None
    filled_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/patients/{patient_id}/anamnese", response_model=AnamnesisOut, status_code=201)
def create_anamnesis(patient_id: int, data: AnamnesisCreate, db: Session = Depends(get_db)):
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=data.expires_hours or 48)
    anamnesis = Anamnesis(
        patient_id=patient_id,
        token=token,
        expires_at=expires,
    )
    db.add(anamnesis)
    db.commit()
    db.refresh(anamnesis)
    return anamnesis


@router.get("/patients/{patient_id}/anamnese", response_model=list[AnamnesisOut])
def list_anamneses(patient_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Anamnesis)
        .filter(Anamnesis.patient_id == patient_id)
        .order_by(Anamnesis.created_at.desc())
        .limit(10)
        .all()
    )


# ── Public endpoints (no auth required) ───────────────────────────────────────
@router.get("/anamnese/{token}")
def get_anamnesis_public(token: str, db: Session = Depends(get_db)):
    a = db.query(Anamnesis).filter(Anamnesis.token == token).first()
    if not a:
        raise HTTPException(404, "Formulário não encontrado")
    if a.expires_at and a.expires_at < datetime.now(timezone.utc):
        raise HTTPException(410, "Link expirado")
    p = db.query(Patient).filter(Patient.id == a.patient_id).first()
    return {
        "id": a.id,
        "status": a.status,
        "patient_name": p.name if p else "",
        "responses": a.responses,
        "expires_at": a.expires_at.isoformat() if a.expires_at else None,
    }


@router.post("/anamnese/{token}")
def fill_anamnesis(token: str, data: AnamnesisResponses, db: Session = Depends(get_db)):
    a = db.query(Anamnesis).filter(Anamnesis.token == token).first()
    if not a:
        raise HTTPException(404, "Formulário não encontrado")
    if a.expires_at and a.expires_at < datetime.now(timezone.utc):
        raise HTTPException(410, "Link expirado")
    a.responses = data.model_dump(exclude_none=True)
    a.status = "filled"
    a.filled_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "message": "Anamnese enviada com sucesso!"}
