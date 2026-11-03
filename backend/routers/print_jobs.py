"""
Fila de impressão remota por clínica (03/11/2026).

Valth: o documento fica pronto na consulta (receita, pedido de exame, laudo,
encaminhamento) e sai SOZINHO na impressora da clínica. Um computador da
clínica fica com a página /impressora aberta (Chrome com --kiosk-printing):
ela consulta a fila a cada 5 s, desenha o documento com o MESMO papel que o
médico imprime e manda direto para a impressora padrão do Windows.

- POST /print-jobs              -> põe um documento salvo na fila da clínica (médico)
- GET  /print-jobs/pending      -> o que falta imprimir na clínica, do mais antigo
                                   ao mais novo, já com paciente, clínica e conteúdo
- POST /print-jobs/{id}/done    -> marca como impresso

A tabela é criada na primeira chamada (create table if not exists), como em
envio_documentos.py — sem migração. Log só com ids, nunca dado de paciente.
"""
import json
import logging
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_doctor
from models.clinic import Clinic
from models.documents import ExamRequest, MedicalReport
from models.organization import User
from models.patient import Patient
from models.patient_rx import PatientRx

logger = logging.getLogger("orthoclinic.impressora")
router = APIRouter(tags=["Impressora da clínica"])

# Pedido na fila há mais tempo que isso não sai mais sozinho: evita que um
# computador desligado por dias, ao voltar, despeje papel velho na clínica.
HORAS_VALIDADE = 24

_tabela_ok = False


def _garantir_tabela(db: Session) -> None:
    global _tabela_ok
    if _tabela_ok:
        return
    db.execute(text("""create table if not exists print_jobs(
        id serial primary key,
        organization_id int not null,
        clinic_id int not null,
        patient_id int not null,
        kind text not null check (kind in ('receita','exame','laudo','encaminhamento')),
        ref_id int not null,
        opcoes text,
        created_at timestamptz not null default now(),
        printed_at timestamptz,
        created_by int)"""))
    db.execute(text("create index if not exists ix_print_jobs_pendentes "
                    "on print_jobs(organization_id, clinic_id, created_at) where printed_at is null"))
    db.commit()
    _tabela_ok = True


def _mesma_org(org_do_registro: Optional[int], user: User) -> bool:
    # Linha legada com organization_id NULL é da conta 1 (mesma regra do tenant_guard).
    return (org_do_registro or 1) == (user.organization_id or 1)


def _clinica(db: Session, clinic_id: int, user: User) -> Clinic:
    c = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not c or not _mesma_org(c.organization_id, user):
        raise HTTPException(404, "Clínica não encontrada")
    return c


_MODELO = {"receita": PatientRx, "exame": ExamRequest, "laudo": MedicalReport, "encaminhamento": MedicalReport}


def _registro(db: Session, kind: str, ref_id: int, user: User):
    modelo = _MODELO.get(kind)
    if modelo is None:
        return None
    r = db.query(modelo).filter(modelo.id == ref_id).first()
    if not r or not _mesma_org(r.organization_id, user):
        return None
    return r


def _iso(v: Any) -> Optional[str]:
    return v.isoformat() if v is not None and hasattr(v, "isoformat") else (str(v) if v is not None else None)


def _documento(kind: str, r) -> dict:
    if kind == "receita":
        return {"date": _iso(r.date), "prescription_type": r.prescription_type or "simples",
                "medications": r.medications or [], "instructions": r.instructions or "",
                "patient_address": r.patient_address, "patient_phone": r.patient_phone}
    if kind == "exame":
        return {"date": _iso(r.date), "free_text": r.free_text or "", "exams": r.exams or []}
    return {"date": _iso(r.date), "report_type": r.report_type, "title": r.title or "", "content": r.content or ""}


def _paciente(p: Patient) -> dict:
    # Os mesmos nomes de campo que a tela da consulta recebe do /patients/{id}.
    return {"id": p.id, "name": p.name, "birthdate": _iso(p.birthdate), "cpf": p.cpf, "phone": p.phone,
            "address_street": p.address_street, "address_city": p.address_city, "address_state": p.address_state,
            "insurance": p.insurance, "cids": p.cids or []}


def _clinica_dict(c: Clinic) -> dict:
    return {"id": c.id, "name": c.name, "city": c.city, "state": c.state, "address": c.address, "phone": c.phone}


class PrintJobIn(BaseModel):
    kind: Literal["receita", "exame", "laudo", "encaminhamento"]
    ref_id: int
    clinic_id: int
    # Preferências de papel do médico (tamanho da letra da receita/pedido),
    # que ficam no navegador dele — vão junto para sair igual na clínica.
    opcoes: Optional[dict] = None


@router.post("/print-jobs", status_code=201)
def criar_job(data: PrintJobIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    _garantir_tabela(db)
    _clinica(db, data.clinic_id, user)
    r = _registro(db, data.kind, data.ref_id, user)
    if r is None:
        raise HTTPException(404, "Documento não encontrado — salve antes de mandar para a impressora.")
    org = user.organization_id or 1
    # Clique duplo não imprime duas vezes: o mesmo documento ainda na fila da mesma clínica volta o que já existe.
    ja = db.execute(text(
        "select id from print_jobs where organization_id=:o and clinic_id=:c and kind=:k and ref_id=:r "
        "and printed_at is null and created_at > now() - make_interval(hours => :h) order by id limit 1"),
        {"o": org, "c": data.clinic_id, "k": data.kind, "r": data.ref_id, "h": HORAS_VALIDADE}).scalar()
    if ja:
        return {"id": ja, "ja_estava_na_fila": True}
    novo = db.execute(text(
        "insert into print_jobs(organization_id,clinic_id,patient_id,kind,ref_id,opcoes,created_by) "
        "values (:o,:c,:p,:k,:r,:op,:u) returning id"),
        {"o": org, "c": data.clinic_id, "p": r.patient_id, "k": data.kind, "r": data.ref_id,
         "op": json.dumps(data.opcoes) if data.opcoes else None, "u": user.id}).scalar()
    db.commit()
    logger.info("[IMPRESSORA] job %s criado: clinica %s, %s %s", novo, data.clinic_id, data.kind, data.ref_id)
    return {"id": novo, "ja_estava_na_fila": False}


@router.get("/print-jobs/pending")
def pendentes(clinic_id: int = Query(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _garantir_tabela(db)
    clinica = _clinica(db, clinic_id, user)
    rows = db.execute(text(
        "select id, patient_id, kind, ref_id, opcoes, created_at from print_jobs "
        "where organization_id=:o and clinic_id=:c and printed_at is null "
        "and created_at > now() - make_interval(hours => :h) order by created_at, id limit 50"),
        {"o": user.organization_id or 1, "c": clinic_id, "h": HORAS_VALIDADE}).fetchall()
    saida, orfaos = [], []
    for job_id, patient_id, kind, ref_id, opcoes, criado in rows:
        r = _registro(db, kind, ref_id, user)
        p = db.query(Patient).filter(Patient.id == patient_id).first() if r is not None else None
        if r is None or p is None or not _mesma_org(p.organization_id, user):
            orfaos.append(job_id)  # documento apagado depois de ir para a fila
            continue
        try:
            op = json.loads(opcoes) if opcoes else {}
        except ValueError:
            op = {}
        saida.append({"id": job_id, "kind": kind, "ref_id": ref_id, "created_at": _iso(criado),
                      "opcoes": op, "clinic": _clinica_dict(clinica), "patient": _paciente(p),
                      "documento": _documento(kind, r)})
    if orfaos:
        # Sai da fila para não travar a clínica; nada é impresso.
        db.execute(text("update print_jobs set printed_at=now() where id = any(:ids) and organization_id=:o"),
                   {"ids": orfaos, "o": user.organization_id or 1})
        db.commit()
        logger.info("[IMPRESSORA] %d job(s) sem documento retirados da fila: %s", len(orfaos), orfaos)
    return {"clinic": _clinica_dict(clinica), "jobs": saida}


@router.post("/print-jobs/{job_id}/done")
def marcar_impresso(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _garantir_tabela(db)
    r = db.execute(text(
        "update print_jobs set printed_at=coalesce(printed_at, now()) "
        "where id=:i and organization_id=:o returning id"),
        {"i": job_id, "o": user.organization_id or 1}).scalar()
    db.commit()
    if not r:
        raise HTTPException(404, "Pedido de impressão não encontrado")
    logger.info("[IMPRESSORA] job %s impresso", job_id)
    return {"ok": True}
