"""
Rotas patient-scoped para receitas simples.
Prefixo: /patients/{patient_id}/prescriptions

Estas rotas são usadas pelo frontend (prescriptionsApi) para listar,
criar e excluir receitas manuais e via Memed.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from datetime import date, datetime
from pydantic import BaseModel

from database import get_db
from models.patient import Patient
from models.patient_rx import PatientRx
from models.organization import User
from deps import get_current_user

router = APIRouter(
    prefix="/patients/{patient_id}/prescriptions",
    tags=["patient-prescriptions"],
    dependencies=[Depends(get_current_user)],
)


# ── Schemas ────────────────────────────────────────────────────────────────────

class MedicationIn(BaseModel):
    name: str
    dose: str = ""
    route: str = ""
    frequency: str = ""
    duration: str = ""
    instructions: str = ""


class PatientRxCreate(BaseModel):
    date: str  # ISO date string YYYY-MM-DD
    prescription_type: str = "simples"  # simples | controle_especial | antimicrobiano | notificacao_ab
    medications: List[MedicationIn] = []
    instructions: str = ""
    memed_id: Optional[str] = None
    # Campos extras para ATB (RDC 20/2011)
    patient_address: Optional[str] = None
    patient_phone: Optional[str] = None


class PatientRxOut(BaseModel):
    id: int
    patient_id: int
    date: Any
    prescription_type: str = "simples"
    medications: Optional[List[Any]] = None
    instructions: Optional[str] = None
    memed_id: Optional[str] = None
    # A16-back: endereço/telefone do paciente persistidos p/ receita de ATB
    # (RDC 20/2011); contrato com o front: patient_address, patient_phone.
    patient_address: Optional[str] = None
    patient_phone: Optional[str] = None
    created_at: Any

    class Config:
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[PatientRxOut])
def list_prescriptions(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista receitas do paciente, mais recente primeiro."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    return (
        db.query(PatientRx)
        .filter(PatientRx.patient_id == patient_id)
        .order_by(PatientRx.date.desc(), PatientRx.created_at.desc())
        .all()
    )


@router.post("", response_model=PatientRxOut, status_code=201)
def create_prescription(
    patient_id: int,
    data: PatientRxCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria nova receita para o paciente."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    # Parse date
    try:
        rx_date = date.fromisoformat(data.date)
    except (ValueError, TypeError):
        rx_date = date.today()

    rx = PatientRx(
        patient_id=patient_id,
        date=rx_date,
        prescription_type=data.prescription_type or "simples",
        medications=[m.model_dump() for m in data.medications],
        instructions=data.instructions or "",
        memed_id=data.memed_id,
        # A16-back: persistir dados exigidos na receita de antimicrobiano.
        patient_address=data.patient_address,
        patient_phone=data.patient_phone,
    )
    db.add(rx)
    db.commit()
    db.refresh(rx)
    return rx


@router.delete("/{rx_id}", status_code=204)
def delete_prescription(
    patient_id: int,
    rx_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove uma receita do paciente."""
    rx = db.query(PatientRx).filter(
        PatientRx.id == rx_id,
        PatientRx.patient_id == patient_id,
    ).first()
    if not rx:
        raise HTTPException(status_code=404, detail="Receita não encontrada")
    db.delete(rx)
    db.commit()
