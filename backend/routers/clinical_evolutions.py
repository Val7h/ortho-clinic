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


# ── Justificativa clínica para exame de imagem (11/08) ───────────────────────
# Pedido do Valth: ao solicitar ressonância, o convênio exige um relatório à
# parte justificando a necessidade. Ele escrevia à mão em toda consulta.
#
# Estratégia acordada: a IA redige a partir da anamnese do próprio paciente
# (fica específico, que é o que o convênio quer ver) e, se não houver anamnese
# ou a IA falhar, cai num modelo pela região. No meio da consulta ele não pode
# ficar sem papel na mão.

import os
import re
import logging as _logging

import httpx

_log = _logging.getLogger(__name__)

REGIOES = (
    "joelho", "ombro", "quadril", "tornozelo", "punho", "cotovelo", "pé", "mão",
    "coluna lombar", "coluna cervical", "coluna torácica", "coluna",
)


def _regiao_do_pedido(texto: str) -> str:
    t = (texto or "").lower()
    for r in REGIOES:
        if r in t:
            return r
    return "região solicitada"


def _modelo_justificativa(paciente, pedido: str, cids) -> str:
    """Texto de segurança: sai mesmo sem anamnese e sem internet."""
    regiao = _regiao_do_pedido(pedido)
    cid_txt = f" (CID-10: {', '.join(cids)})" if cids else ""
    return (
        f"Paciente em acompanhamento ortopédico apresenta quadro álgico e limitação "
        f"funcional em {regiao}{cid_txt}, com persistência dos sintomas apesar do "
        f"tratamento conservador instituído.\n\n"
        f"O exame físico é compatível com lesão de partes moles, cuja caracterização "
        f"não é possível pelos métodos radiográficos convencionais.\n\n"
        f"Solicito o exame de imagem para definição diagnóstica, uma vez que o "
        f"resultado é determinante para a escolha entre a manutenção do tratamento "
        f"conservador e a indicação cirúrgica.\n\n"
        f"Exame solicitado: {pedido.strip()}"
    )


class JustificativaIn(BaseModel):
    pedido: str


@router.post("/{patient_id}/justificativa-exame")
async def gerar_justificativa(
    patient_id: int,
    data: JustificativaIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    paciente = db.query(Patient).filter(Patient.id == patient_id).first()
    if not paciente:
        raise HTTPException(404, "Paciente não encontrado")
    if not (data.pedido or "").strip():
        raise HTTPException(422, "Escreva o pedido de exame antes de gerar a justificativa")

    cids = [c for c in (paciente.cids or []) if c] if getattr(paciente, "cids", None) else []

    # Anamnese mais recente — é dela que sai a justificativa específica.
    ultima = (
        db.query(ClinicalEvolution)
        .filter(ClinicalEvolution.patient_id == patient_id)
        .order_by(ClinicalEvolution.entry_date.desc(), ClinicalEvolution.id.desc())
        .first()
    )
    anamnese = (ultima.content or "").strip() if ultima else ""

    modelo = _modelo_justificativa(paciente, data.pedido, cids)
    if not anamnese:
        return {"texto": modelo, "origem": "modelo",
                "aviso": "Sem anamnese registrada — usei o modelo padrão. Revise antes de imprimir."}

    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        return {"texto": modelo, "origem": "modelo", "aviso": None}

    prompt = (
        "Você é um ortopedista redigindo a JUSTIFICATIVA CLÍNICA que a operadora de "
        "saúde exige para autorizar um exame de imagem.\n\n"
        f"Anamnese do paciente:\n{anamnese[:4000]}\n\n"
        f"Exame solicitado:\n{data.pedido.strip()}\n"
        + (f"\nCID-10 registrado: {', '.join(cids)}\n" if cids else "")
        + "\nEscreva a justificativa em português, 3 a 5 parágrafos curtos, na primeira "
        "pessoa do singular, tom técnico e impessoal. Cubra, nesta ordem: queixa e tempo "
        "de evolução; achados do exame físico; tratamento conservador já realizado e por "
        "quanto tempo; e por que o exame de imagem é determinante para a conduta.\n\n"
        "REGRAS: use SOMENTE o que está na anamnese. NUNCA invente achado, tempo de "
        "evolução ou tratamento que não esteja escrito — se algo não constar, apenas "
        "omita. Não escreva saudação, cabeçalho, título nem assinatura: só o corpo do "
        "texto, que será impresso em papel timbrado."
    )

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": "claude-opus-4-8", "max_tokens": 1200,
                      "messages": [{"role": "user", "content": prompt}]},
            )
    except httpx.RequestError as exc:
        _log.error("Justificativa: erro de rede (%s)", type(exc).__name__)
        return {"texto": modelo, "origem": "modelo",
                "aviso": "Não consegui falar com a IA — usei o modelo padrão."}

    if resp.status_code != 200:
        _log.error("Justificativa: Anthropic retornou %s", resp.status_code)
        return {"texto": modelo, "origem": "modelo",
                "aviso": "IA indisponível — usei o modelo padrão."}

    texto = "".join(
        b.get("text", "") for b in resp.json().get("content", []) if b.get("type") == "text"
    ).strip()
    if not texto:
        return {"texto": modelo, "origem": "modelo", "aviso": "IA não respondeu — usei o modelo padrão."}

    return {"texto": texto, "origem": "ia", "aviso": None}
