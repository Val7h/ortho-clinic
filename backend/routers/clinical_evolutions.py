from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import date, datetime
from pydantic import BaseModel
from database import get_db
from models.clinical_evolution import ClinicalEvolution
from models.patient import Patient
from routers.auth import get_current_user

router = APIRouter(prefix="/patients", tags=["clinical_evolutions"])

# Rotas sem o prefixo /patients (o adendo do prontuário chama PATCH /evolutions/{id})
flat_router = APIRouter(tags=["clinical_evolutions"])


class EvolutionCreate(BaseModel):
    entry_date: date
    content: str


class EvolutionUpdate(BaseModel):
    content: str


class EvolutionOut(BaseModel):
    id: int
    patient_id: int
    entry_date: date
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("/{patient_id}/evolutions", response_model=List[EvolutionOut])
def list_evolutions(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(ClinicalEvolution)
        .filter(ClinicalEvolution.patient_id == patient_id)
        .order_by(ClinicalEvolution.entry_date.asc(), ClinicalEvolution.created_at.asc())
        .all()
    )


@router.post("/{patient_id}/evolutions", response_model=EvolutionOut, status_code=201)
def create_evolution(
    patient_id: int,
    data: EvolutionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not data.content.strip():
        raise HTTPException(status_code=422, detail="Conteúdo não pode ser vazio")
    ev = ClinicalEvolution(
        patient_id=patient_id,
        entry_date=data.entry_date,
        content=data.content.strip(),
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@flat_router.patch("/evolutions/{evolution_id}", response_model=EvolutionOut)
def update_evolution(
    evolution_id: int,
    data: EvolutionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Atualiza o conteúdo de uma evolução (usado pelo ADENDO do prontuário).

    A tela chamava PATCH /evolutions/{id}, que não existia — o adendo falhava
    sempre (auditoria 02/08). Isolamento por organização via join no paciente.
    """
    if not data.content.strip():
        raise HTTPException(status_code=422, detail="Conteúdo não pode ser vazio")
    q = (
        db.query(ClinicalEvolution)
        .join(Patient, Patient.id == ClinicalEvolution.patient_id)
        .filter(ClinicalEvolution.id == evolution_id)
    )
    if current_user.role != "superadmin":
        q = q.filter(Patient.organization_id == current_user.organization_id)
    ev = q.first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evolução não encontrada")
    ev.content = data.content.strip()
    db.commit()
    db.refresh(ev)
    return ev


@router.delete("/{patient_id}/evolutions/{evolution_id}", status_code=204)
def delete_evolution(
    patient_id: int,
    evolution_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    ev = (
        db.query(ClinicalEvolution)
        .filter(
            ClinicalEvolution.id == evolution_id,
            ClinicalEvolution.patient_id == patient_id,
        )
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Evolução não encontrada")
    db.delete(ev)
    db.commit()
