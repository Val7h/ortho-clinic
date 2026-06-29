"""
Rotas para gerenciar templates de prescrição reutilizáveis.
Prefixo: /prescription-templates

Permite ao médico salvar receitas frequentes para reutilização rápida.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from pydantic import BaseModel

from database import get_db
from models.prescription_template import PrescriptionTemplate
from models.organization import User
from deps import get_current_user

router = APIRouter(
    prefix="/prescription-templates",
    tags=["prescription-templates"],
)


# ── Schemas ────────────────────────────────────────────────────────────────────

class MedicationItem(BaseModel):
    name: str
    dose: str = ""
    route: str = ""
    frequency: str = ""
    duration: str = ""
    instructions: str = ""


class TemplateCreate(BaseModel):
    name: str
    prescription_type: str = "simples"
    medications: List[MedicationItem] = []
    instructions: str = ""


class TemplateOut(BaseModel):
    id: int
    name: str
    prescription_type: str
    medications: Optional[List[Any]] = None
    instructions: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Any

    class Config:
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[TemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todos os templates de prescrição do usuário logado."""
    return (
        db.query(PrescriptionTemplate)
        .filter(PrescriptionTemplate.created_by == current_user.id)
        .order_by(PrescriptionTemplate.name)
        .all()
    )


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(
    data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria novo template de prescrição."""
    if not data.name.strip():
        raise HTTPException(status_code=422, detail="Nome do modelo é obrigatório")

    template = PrescriptionTemplate(
        name=data.name.strip(),
        prescription_type=data.prescription_type,
        medications=[m.model_dump() for m in data.medications],
        instructions=data.instructions or "",
        created_by=current_user.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove um template de prescrição."""
    tmpl = db.query(PrescriptionTemplate).filter(
        PrescriptionTemplate.id == template_id,
        PrescriptionTemplate.created_by == current_user.id,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    db.delete(tmpl)
    db.commit()
