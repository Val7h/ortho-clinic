"""
Modelos de encaminhamento salvos pelo médico. Prefixo: /referral-templates

Mesmo desenho dos modelos de exame (/exam-templates): mesmo nome na organização
atualiza em vez de duplicar. Só o médico cria/apaga (secretária não mexe em
documento médico — decisão de 28/09).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_doctor
from models.referral_template import ReferralTemplate
from models.organization import User

router = APIRouter(prefix="/referral-templates", tags=["referral-templates"])

_TIPOS = {"fisioterapia", "especialidade", "colega", "outro"}


class ReferralTemplateIn(BaseModel):
    name: str
    content: str
    ref_type: str = "fisioterapia"
    modality: Optional[str] = None
    cid: Optional[str] = None


class ReferralTemplateOut(BaseModel):
    id: int
    name: str
    content: str
    ref_type: str
    modality: Optional[str] = None
    cid: Optional[str] = None
    model_config = {"from_attributes": True}


def _da_organizacao(q, user: User):
    if user.role != "superadmin":
        q = q.filter(ReferralTemplate.organization_id == user.organization_id)
    return q


@router.get("", response_model=List[ReferralTemplateOut])
def listar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _da_organizacao(db.query(ReferralTemplate), current_user).order_by(ReferralTemplate.name).all()


@router.post("", response_model=ReferralTemplateOut, status_code=201)
def criar(
    data: ReferralTemplateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    nome = (data.name or "").strip()
    conteudo = (data.content or "").strip()
    if not nome:
        raise HTTPException(422, "Dê um nome ao modelo")
    if not conteudo:
        raise HTTPException(422, "O modelo está vazio")
    tipo = data.ref_type if data.ref_type in _TIPOS else "outro"

    existente = _da_organizacao(
        db.query(ReferralTemplate).filter(ReferralTemplate.name == nome), current_user
    ).first()
    if existente:
        existente.content = conteudo
        existente.ref_type = tipo
        existente.modality = data.modality
        existente.cid = data.cid
        db.commit()
        db.refresh(existente)
        return existente

    novo = ReferralTemplate(
        name=nome, content=conteudo, ref_type=tipo, modality=data.modality, cid=data.cid,
        organization_id=current_user.organization_id, created_by=current_user.id,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


@router.delete("/{template_id}", status_code=204)
def apagar(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    tpl = _da_organizacao(
        db.query(ReferralTemplate).filter(ReferralTemplate.id == template_id), current_user
    ).first()
    if not tpl:
        raise HTTPException(404, "Modelo não encontrado")
    db.delete(tpl)
    db.commit()
