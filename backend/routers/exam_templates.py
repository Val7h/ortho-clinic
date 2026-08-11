"""
Modelos de solicitação de exame, reutilizáveis.
Prefixo: /exam-templates

11/08 — antes ficavam SÓ no localStorage do navegador. O Valth abriu o app em
outra máquina e não achou os modelos que tinha montado; pior, eles sumiriam de
vez numa limpeza de cache. Agora moram no banco, como os de receita.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models.exam_template import ExamTemplate
from models.organization import User

router = APIRouter(prefix="/exam-templates", tags=["exam-templates"])


class ExamTemplateIn(BaseModel):
    name: str
    content: str


class ExamTemplateOut(BaseModel):
    id: int
    name: str
    content: str
    model_config = {"from_attributes": True}


def _da_organizacao(q, user: User):
    if user.role != "superadmin":
        q = q.filter(ExamTemplate.organization_id == user.organization_id)
    return q


@router.get("", response_model=List[ExamTemplateOut])
def listar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = _da_organizacao(db.query(ExamTemplate), current_user)
    return q.order_by(ExamTemplate.name).all()


@router.post("", response_model=ExamTemplateOut, status_code=201)
def criar(
    data: ExamTemplateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    nome = (data.name or "").strip()
    conteudo = (data.content or "").strip()
    if not nome:
        raise HTTPException(422, "Dê um nome ao modelo")
    if not conteudo:
        raise HTTPException(422, "O modelo está vazio")

    # Mesmo nome na organização = atualiza, não duplica. Ele salva o mesmo
    # modelo de novo depois de ajustar o texto, e não quer dois na lista.
    existente = _da_organizacao(
        db.query(ExamTemplate).filter(ExamTemplate.name == nome), current_user
    ).first()
    if existente:
        existente.content = conteudo
        db.commit()
        db.refresh(existente)
        return existente

    novo = ExamTemplate(
        name=nome,
        content=conteudo,
        organization_id=current_user.organization_id,
        created_by=current_user.id,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


@router.delete("/{template_id}", status_code=204)
def apagar(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tpl = _da_organizacao(
        db.query(ExamTemplate).filter(ExamTemplate.id == template_id), current_user
    ).first()
    if not tpl:
        raise HTTPException(404, "Modelo não encontrado")
    db.delete(tpl)
    db.commit()
