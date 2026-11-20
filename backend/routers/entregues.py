"""
Documento ENTREGUE ao paciente = versão oficial (19/11/2026).

Valth: "foi a versão oficial entregue, então não pode ser mudada. Se ele
solicitar, a gente faz uma nova." (o laudo de um paciente foi apagado e refeito
depois de já estar na mão dele).

Um documento vira "entregue" quando sai pela impressora da clínica
(print_jobs/done), pelo "Tudo de hoje" (Imprimir ou Mandar para a secretária)
ou por marcação explícita. Depois disso, apagar devolve 409: a correção é um
documento NOVO, e o antigo fica no prontuário.

- GET    /patients/{pid}/entregues                 -> o que já foi entregue
- POST   /patients/{pid}/entregues                 -> marca (qualquer login da conta)
- DELETE /patients/{pid}/entregues/{kind}/{ref_id} -> desfaz a marca (só médico;
                                                      para marca feita por engano)

Tabela criada na primeira chamada (como print_jobs). SQL portátil (Postgres e
SQLite dos testes). Log só com ids.
"""
import logging
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_doctor
from models.organization import User
from models.patient import Patient
from models.documents import ExamRequest, MedicalReport, PhysioRequest
from models.patient_documents import PatientDocument
from models.patient_rx import PatientRx

logger = logging.getLogger("orthoclinic.entregues")
router = APIRouter(prefix="/patients/{patient_id}/entregues", tags=["Documento entregue"])

Kind = Literal["receita", "exame", "laudo", "documento", "fisio"]
KINDS = ("receita", "exame", "laudo", "documento", "fisio")

_tabela_ok = False


def garantir_tabela(db: Session) -> None:
    global _tabela_ok
    if _tabela_ok:
        return
    try:
        _criar(db)
    except Exception:  # duas chamadas ao mesmo tempo criando a tabela: a outra ganhou
        db.rollback()
    _tabela_ok = True


def _criar(db: Session) -> None:
    db.execute(text("""create table if not exists documentos_entregues(
        organization_id integer not null,
        patient_id integer not null,
        kind varchar(20) not null,
        ref_id integer not null,
        origem varchar(40),
        marked_by integer,
        marked_at timestamp not null default CURRENT_TIMESTAMP,
        primary key (organization_id, kind, ref_id))"""))
    db.commit()


def _org(user: User) -> int:
    return user.organization_id or 1


def marcar(db: Session, user: User, patient_id: int, kind: str, ref_id: int, origem: str) -> None:
    """Marca como entregue. Idempotente: a 1ª marca vale (data e origem não mudam)."""
    if kind not in KINDS:
        return
    garantir_tabela(db)
    db.execute(text(
        "insert into documentos_entregues(organization_id,patient_id,kind,ref_id,origem,marked_by) "
        "values (:o,:p,:k,:r,:og,:u) on conflict do nothing"),
        {"o": _org(user), "p": patient_id, "k": kind, "r": ref_id, "og": origem[:40], "u": user.id})


def bloquear_se_entregue(db: Session, user: User, kind: str, ref_id: int) -> None:
    """Chamar ANTES de apagar. Documento entregue não se apaga: faz-se um novo."""
    garantir_tabela(db)
    row = db.execute(text(
        "select marked_at, origem from documentos_entregues where organization_id=:o and kind=:k and ref_id=:r"),
        {"o": _org(user), "k": kind, "r": ref_id}).first()
    if row:
        quando = str(row[0])[:16]
        logger.info("[ENTREGUE] bloqueado apagar %s %s", kind, ref_id)
        raise HTTPException(409, f"Documento já entregue ao paciente ({quando}, {row[1] or 'impresso'}). "
                                 "É a versão oficial: não pode ser apagado. Para corrigir, gere um documento novo.")


def _paciente(db: Session, patient_id: int, user: User) -> Patient:
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p or (p.organization_id or 1) != _org(user):
        raise HTTPException(404, "Paciente não encontrado")
    return p


_MODELO = {"receita": PatientRx, "exame": ExamRequest, "laudo": MedicalReport, "documento": PatientDocument,
           "fisio": PhysioRequest}


def _do_paciente(db: Session, kind: str, ref_id: int, patient_id: int) -> bool:
    """Só marca documento que existe e é DESTE paciente (o paciente já foi conferido na organização)."""
    m = _MODELO.get(kind)
    return bool(m and db.query(m.id).filter(m.id == ref_id, m.patient_id == patient_id).first())


class ItemEntregue(BaseModel):
    kind: Kind
    ref_id: int


class MarcarIn(BaseModel):
    itens: List[ItemEntregue]
    origem: Optional[str] = "impresso"


@router.get("")
def listar(patient_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _paciente(db, patient_id, user)
    garantir_tabela(db)
    rows = db.execute(text(
        "select kind, ref_id, origem, marked_at from documentos_entregues "
        "where organization_id=:o and patient_id=:p order by marked_at"),
        {"o": _org(user), "p": patient_id}).fetchall()
    return [{"kind": k, "ref_id": r, "origem": og, "marked_at": str(m)} for k, r, og, m in rows]


@router.post("")
def marcar_varios(patient_id: int, data: MarcarIn, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    _paciente(db, patient_id, user)
    n = 0
    for it in data.itens[:100]:
        if _do_paciente(db, it.kind, it.ref_id, patient_id):
            marcar(db, user, patient_id, it.kind, it.ref_id, data.origem or "impresso"); n += 1
    db.commit()
    logger.info("[ENTREGUE] paciente %s: %d marcado(s)", patient_id, n)
    return {"ok": True, "marcados": n}


@router.delete("/{kind}/{ref_id}", status_code=204)
def desmarcar(patient_id: int, kind: Kind, ref_id: int, db: Session = Depends(get_db),
              user: User = Depends(require_doctor)):
    _paciente(db, patient_id, user)
    garantir_tabela(db)
    db.execute(text("delete from documentos_entregues where organization_id=:o and patient_id=:p "
                    "and kind=:k and ref_id=:r"), {"o": _org(user), "p": patient_id, "k": kind, "r": ref_id})
    db.commit()
    logger.info("[ENTREGUE] marca desfeita: %s %s (usuario %s)", kind, ref_id, user.id)
