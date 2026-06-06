"""
API Routes para Anamnese (Histórico Clínico)

Endpoints:
- POST /api/anamneses - Criar nova anamnese
- GET /api/anamneses - Listar anamneses com filtros
- GET /api/anamneses/{id} - Obter anamnese específica
- PUT /api/anamneses/{id} - Atualizar anamnese
- DELETE /api/anamneses/{id} - Deletar anamnese
- GET /api/patients/{patient_id}/anamneses - Listar anamneses de um paciente
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime
import json

from app.database import get_db
from app.models import Anamnese, Patient, User
from app.schemas.anamnese import (
    AnamneseCreate,
    AnamneseUpdate,
    AnamneseResponse,
    AnamneseListResponse,
)
from app.core.security import get_current_user
from app.core.permissions import require_permission

router = APIRouter(
    prefix="/api/anamneses",
    tags=["anamneses"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=AnamneseResponse, status_code=status.HTTP_201_CREATED)
async def create_anamnese(
    anamnese_data: AnamneseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Criar nova anamnese para um paciente

    - **patient_id**: ID do paciente (required)
    - **template_type**: 'first_consultation' ou 'follow_up' (required)
    - **status**: 'draft', 'completed' ou 'signed' (default: 'draft')
    - **dados**: Objeto JSONB com dados estruturados (required)
    """
    # Verificar se paciente existe
    patient = db.query(Patient).filter(Patient.id == anamnese_data.patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado",
        )

    # Verificar permissão
    require_permission(current_user, "create_anamnese")

    try:
        # Criar anamnese
        db_anamnese = Anamnese(
            patient_id=anamnese_data.patient_id,
            template_type=anamnese_data.template_type,
            status=anamnese_data.status or "draft",
            dados=anamnese_data.dados,
            created_by=current_user.id,
        )

        db.add(db_anamnese)
        db.commit()
        db.refresh(db_anamnese)

        return db_anamnese
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao criar anamnese: {str(e)}",
        )


@router.get("", response_model=List[AnamneseListResponse])
async def list_anamneses(
    patient_id: Optional[int] = Query(None, description="Filtrar por ID do paciente"),
    template_type: Optional[str] = Query(
        None,
        description="Filtrar por tipo: 'first_consultation' ou 'follow_up'",
    ),
    status: Optional[str] = Query(
        None,
        description="Filtrar por status: 'draft', 'completed' ou 'signed'",
    ),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Listar anamneses com filtros opcionais

    **Filtros:**
    - patient_id: ID do paciente
    - template_type: Tipo de anamnese
    - status: Status da anamnese
    - limit: Número de registros (padrão: 50)
    - offset: Paginação (padrão: 0)
    """
    query = db.query(Anamnese)

    if patient_id:
        query = query.filter(Anamnese.patient_id == patient_id)

    if template_type:
        query = query.filter(Anamnese.template_type == template_type)

    if status:
        query = query.filter(Anamnese.status == status)

    # Ordenar por data de criação (mais recente primeiro)
    query = query.order_by(desc(Anamnese.created_at))

    # Paginação
    total = query.count()
    anamneses = query.limit(limit).offset(offset).all()

    # Adicionar informações de paginação aos headers (opcional)
    return anamneses


@router.get("/{anamnese_id}", response_model=AnamneseResponse)
async def get_anamnese(
    anamnese_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Obter anamnese específica por ID
    """
    db_anamnese = db.query(Anamnese).filter(Anamnese.id == anamnese_id).first()

    if not db_anamnese:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anamnese não encontrada",
        )

    # Verificar se user tem acesso (owns patient ou admin)
    if current_user.id != db_anamnese.created_by and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado",
        )

    return db_anamnese


@router.put("/{anamnese_id}", response_model=AnamneseResponse)
async def update_anamnese(
    anamnese_id: int,
    anamnese_update: AnamneseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Atualizar anamnese existente

    Apenas rascunhos podem ser editados após criação
    """
    db_anamnese = db.query(Anamnese).filter(Anamnese.id == anamnese_id).first()

    if not db_anamnese:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anamnese não encontrada",
        )

    # Verificar permissão
    if current_user.id != db_anamnese.created_by and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado",
        )

    # Apenas permitir edição de rascunhos
    if db_anamnese.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Apenas rascunhos podem ser editados",
        )

    try:
        # Atualizar campos
        if anamnese_update.status:
            db_anamnese.status = anamnese_update.status
        if anamnese_update.dados:
            db_anamnese.dados = anamnese_update.dados

        db_anamnese.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(db_anamnese)

        return db_anamnese
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao atualizar anamnese: {str(e)}",
        )


@router.delete("/{anamnese_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_anamnese(
    anamnese_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deletar anamnese (apenas rascunhos)
    """
    db_anamnese = db.query(Anamnese).filter(Anamnese.id == anamnese_id).first()

    if not db_anamnese:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anamnese não encontrada",
        )

    # Verificar permissão
    if current_user.id != db_anamnese.created_by and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado",
        )

    # Apenas permitir delete de rascunhos
    if db_anamnese.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Apenas rascunhos podem ser deletados",
        )

    try:
        db.delete(db_anamnese)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao deletar anamnese: {str(e)}",
        )


@router.get("/patients/{patient_id}/anamneses", response_model=List[AnamneseListResponse])
async def get_patient_anamneses(
    patient_id: int,
    template_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Listar todas as anamneses de um paciente (ordenadas por data decrescente)
    """
    # Verificar se paciente existe
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado",
        )

    query = db.query(Anamnese).filter(Anamnese.patient_id == patient_id)

    if template_type:
        query = query.filter(Anamnese.template_type == template_type)

    anamneses = (
        query.order_by(desc(Anamnese.created_at))
        .limit(limit)
        .all()
    )

    return anamneses


@router.post("/{anamnese_id}/sign", response_model=AnamneseResponse)
async def sign_anamnese(
    anamnese_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Assinar/finalizar uma anamnese (transição: completed -> signed)
    """
    db_anamnese = db.query(Anamnese).filter(Anamnese.id == anamnese_id).first()

    if not db_anamnese:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anamnese não encontrada",
        )

    if db_anamnese.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Apenas anamneses completadas podem ser assinadas",
        )

    try:
        db_anamnese.status = "signed"
        db_anamnese.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(db_anamnese)

        return db_anamnese
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao assinar anamnese: {str(e)}",
        )


@router.get("/stats/patient/{patient_id}")
async def get_patient_anamnese_stats(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Obter estatísticas de anamneses de um paciente
    """
    # Verificar se paciente existe
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado",
        )

    anamneses = db.query(Anamnese).filter(Anamnese.patient_id == patient_id).all()

    stats = {
        "total": len(anamneses),
        "first_consultations": len([a for a in anamneses if a.template_type == "first_consultation"]),
        "follow_ups": len([a for a in anamneses if a.template_type == "follow_up"]),
        "completed": len([a for a in anamneses if a.status == "completed"]),
        "drafts": len([a for a in anamneses if a.status == "draft"]),
        "signed": len([a for a in anamneses if a.status == "signed"]),
        "last_anamnese_date": (
            max([a.created_at for a in anamneses]).isoformat() if anamneses else None
        ),
    }

    return stats
