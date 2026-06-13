"""
Endpoint público para receber formulário pré-consulta enviado pelo paciente.
Autenticação via token HMAC-SHA256 (gerado pelo servidor WhatsApp AI / n8n).
Não exige JWT — é chamado antes da consulta, pelo próprio paciente.
"""

import hmac
import hashlib
import os
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.anamnesis import Anamnesis
from models.patient import Patient

router = APIRouter(prefix="/pre-consulta", tags=["Pré-Consulta"])

FORM_SECRET = os.getenv("FORM_SECRET", "")


# ── Schema do payload ──────────────────────────────────────────────────────────

class PreConsultaPayload(BaseModel):
    # auth
    token: str
    exp: str
    agendamento_id: str

    # identificação
    nome: str
    telefone: str
    data_consulta: Optional[str] = None
    nascimento: Optional[str] = None
    cpf: Optional[str] = None
    cidade: Optional[str] = None
    bairro: Optional[str] = None
    profissao: Optional[str] = None
    estado_civil: Optional[str] = None
    filhos: Optional[int] = None

    # saúde geral
    doencas_cronicas: Optional[list] = None
    medicacoes: Optional[str] = None
    alergias: Optional[str] = None
    cirurgias_anteriores: Optional[str] = None
    tabagismo: Optional[str] = None
    alcool: Optional[str] = None

    # queixa
    regiao_corpo: Optional[str] = None
    descricao: Optional[str] = None
    tempo_sintomas: Optional[str] = None
    mecanismo: Optional[str] = None
    eva: Optional[int] = None
    piora: Optional[str] = None
    melhora: Optional[str] = None
    tratamento_anterior: Optional[str] = None
    uso_analgesicos: Optional[str] = None

    # exames e pagamento
    exames_urls: Optional[list] = None
    forma_pagamento: Optional[str] = None
    plano_saude: Optional[str] = None

    # gerado pelo servidor após gerar o PDF
    pdf_url: Optional[str] = None


class PreConsultaOut(BaseModel):
    ok: bool
    patient_id: int
    anamnesis_id: int
    criado: bool  # True = paciente novo, False = paciente existente atualizado


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validar_token(agendamento_id: str, exp: str, token: str) -> None:
    if not FORM_SECRET:
        raise HTTPException(500, "FORM_SECRET não configurado")

    try:
        exp_num = int(exp)
    except ValueError:
        raise HTTPException(400, "exp inválido")

    if int(time.time() * 1000) > exp_num:
        raise HTTPException(401, "token_expirado")

    esperado = hmac.new(
        FORM_SECRET.encode(),
        f"{agendamento_id}:{exp_num}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(token, esperado):
        raise HTTPException(401, "token_invalido")


def _buscar_ou_criar_paciente(db: Session, data: PreConsultaPayload) -> tuple[Patient, bool]:
    """Retorna (paciente, criado). Busca por CPF, depois telefone."""
    patient = None

    if data.cpf:
        cpf_limpo = "".join(c for c in data.cpf if c.isdigit())
        patient = db.query(Patient).filter(Patient.cpf == data.cpf).first()
        if not patient and cpf_limpo:
            patient = db.query(Patient).filter(
                Patient.cpf.like(f"%{cpf_limpo[:11]}%")
            ).first()

    if not patient and data.telefone:
        tel = data.telefone.replace("+", "").replace(" ", "")
        patient = db.query(Patient).filter(
            Patient.phone.like(f"%{tel[-9:]}%")
        ).first()

    if patient:
        # atualiza campos que vieram do formulário
        _atualizar_paciente(patient, data)
        db.commit()
        db.refresh(patient)
        return patient, False

    # cria novo
    patient = Patient(
        organization_id=1,
        name=data.nome,
        phone=data.telefone,
    )
    _atualizar_paciente(patient, data)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient, True


def _atualizar_paciente(patient: Patient, data: PreConsultaPayload) -> None:
    if data.cpf:
        patient.cpf = data.cpf
    if data.nascimento:
        try:
            patient.birthdate = datetime.fromisoformat(data.nascimento).date()
        except ValueError:
            pass
    if data.cidade:
        patient.address_city = data.cidade
    if data.bairro:
        patient.address_street = data.bairro
    if data.profissao:
        patient.occupation = data.profissao
    if data.estado_civil:
        patient.civil_status = data.estado_civil
    if data.alergias:
        patient.allergies = data.alergias
        patient.alergias = data.alergias
    if data.medicacoes:
        patient.current_medications = data.medicacoes
    if data.cirurgias_anteriores:
        patient.surgeries_history = data.cirurgias_anteriores
    if data.doencas_cronicas:
        patient.chronic_conditions = ", ".join(data.doencas_cronicas)
    if data.forma_pagamento == "convenio" and data.plano_saude:
        patient.insurance = data.plano_saude
    if data.forma_pagamento:
        pass  # insurance já tratado acima


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/submit", response_model=PreConsultaOut)
def submit_pre_consulta(data: PreConsultaPayload, db: Session = Depends(get_db)):
    _validar_token(data.agendamento_id, data.exp, data.token)

    patient, criado = _buscar_ou_criar_paciente(db, data)

    # monta respostas da anamnese no formato do modelo existente
    responses = {
        "chief_complaint":     data.descricao,
        "pain_location":       data.regiao_corpo,
        "symptom_duration":    data.tempo_sintomas,
        "pain_scale":          data.eva,
        "aggravating_factors": data.piora,
        "relieving_factors":   data.melhora,
        "previous_treatments": data.tratamento_anterior,
        "current_medications": data.medicacoes,
        "allergies":           data.alergias,
        "surgeries_history":   data.cirurgias_anteriores,
        "chronic_conditions":  ", ".join(data.doencas_cronicas or []),
        "additional_notes": (
            f"Mecanismo: {data.mecanismo or '-'} | "
            f"Tabagismo: {data.tabagismo or '-'} | "
            f"Álcool: {data.alcool or '-'} | "
            f"Analgésicos: {data.uso_analgesicos or '-'} | "
            f"Exames: {', '.join(data.exames_urls or [])} | "
            f"PDF: {data.pdf_url or '-'} | "
            f"Pagamento: {data.forma_pagamento or '-'}"
            + (f" ({data.plano_saude})" if data.plano_saude else "")
        ),
    }

    # idempotente: se já existe anamnese para este agendamento, atualiza
    anamnesis = db.query(Anamnesis).filter(Anamnesis.token == data.agendamento_id).first()
    if anamnesis:
        anamnesis.responses = responses
        anamnesis.status = "filled"
        anamnesis.filled_at = datetime.now(timezone.utc)
        anamnesis.patient_id = patient.id
    else:
        anamnesis = Anamnesis(
            patient_id=patient.id,
            token=data.agendamento_id,
            responses=responses,
            status="filled",
            filled_at=datetime.now(timezone.utc),
        )
        db.add(anamnesis)
    db.commit()
    db.refresh(anamnesis)

    return PreConsultaOut(
        ok=True,
        patient_id=patient.id,
        anamnesis_id=anamnesis.id,
        criado=criado,
    )
