"""Assistente ao vivo (17/11/2026): chat curto por paciente e por dia na coluna "Escriba + IA".

- GET  /patients/{id}/assistente?data=AAAA-MM-DD  -> mensagens do dia, a mais antiga primeiro
- POST /patients/{id}/assistente {texto, autor}    -> autor 'medico' (caixinha) ou 'ia' (sessao de atendimento,
  pelo consulta.assistente(), com o login do medico)
So medico (require_doctor) e so pacientes da mesma organizacao.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import require_doctor
from models.assistente import AssistenteMensagem
from models.organization import User
from models.patient import Patient
from tzutil import today_br

router = APIRouter(prefix="/patients", tags=["assistente"])
TEXTO_MAX = 4000


def _paciente_da_org(db: Session, pid: int, u: User) -> Patient:
    p = db.query(Patient).filter(Patient.id == pid).first()
    org = getattr(u, "organization_id", None) or 1
    if not p or (u.role != "superadmin" and (p.organization_id or 1) != org):
        raise HTTPException(404, "Paciente não encontrado")
    return p


def _out(m: AssistenteMensagem) -> dict:
    return {"id": m.id, "autor": m.autor, "texto": m.texto, "data": m.data.isoformat(),
            "criado_em": m.criado_em.isoformat() if m.criado_em else None}


@router.get("/{patient_id}/assistente")
def listar(patient_id: int, data: Optional[date] = None, apos: int = 0, db: Session = Depends(get_db),
           u: User = Depends(require_doctor)):
    p = _paciente_da_org(db, patient_id, u)
    q = (db.query(AssistenteMensagem).filter(AssistenteMensagem.patient_id == p.id,
                                             AssistenteMensagem.data == (data or today_br()),
                                             AssistenteMensagem.id > apos)
         .order_by(AssistenteMensagem.id).limit(300))
    return [_out(m) for m in q.all()]


class MensagemIn(BaseModel):
    texto: str
    autor: str = "medico"
    data: Optional[date] = None


@router.post("/{patient_id}/assistente")
def mandar(patient_id: int, body: MensagemIn, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    p = _paciente_da_org(db, patient_id, u)
    texto = (body.texto or "").strip()
    if not texto:
        raise HTTPException(422, "Mensagem vazia")
    if body.autor not in ("ia", "medico"):
        raise HTTPException(422, "autor: ia ou medico")
    m = AssistenteMensagem(organization_id=p.organization_id or 1, patient_id=p.id, data=body.data or today_br(),
                           autor=body.autor, texto=texto[:TEXTO_MAX], user_id=u.id)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(m)
