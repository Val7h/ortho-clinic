from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import List, Optional
from datetime import date, datetime, timezone, timedelta
from pydantic import BaseModel
from database import get_db
from models.patient import Patient
from models.financial import FinancialRecord
from deps import get_current_user
from models.organization import User
from services.audit_service import AuditLogService

router = APIRouter(prefix="/financial", tags=["Financeiro"], dependencies=[Depends(get_current_user)])

# Fuso de Recife (sem horário de verão). A trava usa o dia LOCAL do Brasil, não UTC.
_BR_TZ = timezone(timedelta(hours=-3))
# Papéis que podem corrigir/excluir um lançamento JÁ FECHADO (sempre com trilha de auditoria).
_PRIVILEGED_ROLES = {"doctor", "admin", "superadmin"}


def _br_today() -> date:
    return datetime.now(_BR_TZ).date()


def _is_locked(r: FinancialRecord) -> bool:
    """Fecha no fim do dia em que foi criado: travado se criado ANTES de hoje (hora local BR)."""
    ca = r.created_at
    if ca is None:
        return False
    if ca.tzinfo is None:
        ca = ca.replace(tzinfo=timezone.utc)
    return ca.astimezone(_BR_TZ).date() < _br_today()


def _snapshot(r: FinancialRecord) -> dict:
    return {
        "amount": r.amount,
        "payment_method": r.payment_method,
        "status": r.status,
        "description": r.description,
        "date": r.date.isoformat() if r.date else None,
        "notes": r.notes,
    }


def _serialize(r: FinancialRecord) -> dict:
    return {
        "id": r.id,
        "patient_id": r.patient_id,
        "consultation_id": r.consultation_id,
        "amount": r.amount,
        "payment_method": r.payment_method,
        "status": r.status,
        "description": r.description,
        "date": r.date,
        "notes": r.notes,
        "created_at": r.created_at,
        "locked": _is_locked(r),
    }


class FinancialIn(BaseModel):
    patient_id: int
    consultation_id: Optional[int] = None
    amount: float
    payment_method: str  # pix | dinheiro | cartao_credito | cartao_debito | cortesia
    status: Optional[str] = "paid"
    description: Optional[str] = None
    date: Optional[date] = None
    notes: Optional[str] = None


class FinancialOut(BaseModel):
    id: int
    patient_id: int
    consultation_id: Optional[int]
    amount: float
    payment_method: str
    status: str
    description: Optional[str]
    date: date
    notes: Optional[str]
    created_at: datetime
    locked: bool = False

    model_config = {"from_attributes": True}


@router.post("", response_model=FinancialOut, status_code=201)
def create_record(data: FinancialIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Patient).filter(Patient.id == data.patient_id).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    if current_user.role != "superadmin" and p.organization_id != current_user.organization_id:
        raise HTTPException(403, "Acesso negado: paciente não pertence à sua organização")
    dump = data.model_dump(exclude_none=False)
    dump['date'] = data.date or date.today()
    record = FinancialRecord(**dump)
    db.add(record)
    db.commit()
    db.refresh(record)
    return _serialize(record)


@router.get("", response_model=List[FinancialOut])
def list_records(
    month: Optional[int] = None,
    year: Optional[int] = None,
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(FinancialRecord)
    if current_user.role != "superadmin":
        q = q.join(Patient, FinancialRecord.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    # CAIXA DO DIA (decisão do Valth 02/08): secretária enxerga SÓ os lançamentos
    # de HOJE (hora BR) — histórico/mês/ano são do médico/admin. Ignora os
    # filtros de mês/ano vindos do front pra não ter como contornar.
    if current_user.role == "secretary":
        q = q.filter(FinancialRecord.date == _br_today())
        return [_serialize(r) for r in q.order_by(FinancialRecord.created_at.desc()).all()]
    if patient_id:
        q = q.filter(FinancialRecord.patient_id == patient_id)
    if year:
        q = q.filter(extract("year", FinancialRecord.date) == year)
    if month:
        q = q.filter(extract("month", FinancialRecord.date) == month)
    return [_serialize(r) for r in q.order_by(FinancialRecord.date.desc()).all()]


@router.get("/summary")
def get_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Totais agregados (mês/ano/pendentes) são visão do dono — secretária tem
    # só o Caixa do Dia (lista de hoje via GET /financial).
    if current_user.role == "secretary":
        raise HTTPException(403, "Resumo financeiro disponível apenas para o médico/administração")

    today = date.today()
    m = month or today.month
    y = year or today.year

    def _base_q():
        q = db.query(FinancialRecord)
        if current_user.role != "superadmin":
            q = q.join(Patient, FinancialRecord.patient_id == Patient.id).filter(
                Patient.organization_id == current_user.organization_id
            )
        return q

    # ── Mês atual: paid ──────────────────────────────────────────────────────
    month_paid_records = (
        _base_q()
        .filter(
            extract("year", FinancialRecord.date) == y,
            extract("month", FinancialRecord.date) == m,
            FinancialRecord.status == "paid",
        )
        .all()
    )
    total_month_paid = sum(r.amount for r in month_paid_records)

    by_method: dict = {}
    for r in month_paid_records:
        by_method[r.payment_method] = by_method.get(r.payment_method, 0) + r.amount

    # ── Mês atual: pending ───────────────────────────────────────────────────
    month_pending_records = (
        _base_q()
        .filter(
            extract("year", FinancialRecord.date) == y,
            extract("month", FinancialRecord.date) == m,
            FinancialRecord.status == "pending",
        )
        .all()
    )
    total_month_pending = sum(r.amount for r in month_pending_records)
    total_month = total_month_paid + total_month_pending

    # ── Year-to-date: paid ───────────────────────────────────────────────────
    ytd_paid_records = (
        _base_q()
        .filter(
            extract("year", FinancialRecord.date) == y,
            FinancialRecord.status == "paid",
        )
        .all()
    )
    ytd_paid = sum(r.amount for r in ytd_paid_records)

    # ── Year-to-date: pending ────────────────────────────────────────────────
    ytd_pending_records = (
        _base_q()
        .filter(
            extract("year", FinancialRecord.date) == y,
            FinancialRecord.status == "pending",
        )
        .all()
    )
    ytd_pending = sum(r.amount for r in ytd_pending_records)
    ytd_total = ytd_paid + ytd_pending

    # ── Pending total (all-time, for receivable) ─────────────────────────────
    all_pending_q = _base_q().filter(FinancialRecord.status == "pending")
    total_pending = sum(r.amount for r in all_pending_q.all())

    # ── Monthly totals for chart (paid + pending) ────────────────────────────
    monthly: dict = {}
    for r in ytd_paid_records + ytd_pending_records:
        k = r.date.month
        monthly[k] = monthly.get(k, 0) + r.amount

    return {
        "month": m,
        "year": y,
        # Mês
        "total_month": round(total_month, 2),
        "total_month_paid": round(total_month_paid, 2),
        "total_month_pending": round(total_month_pending, 2),
        # Ano
        "total_ytd": round(ytd_total, 2),
        "total_ytd_paid": round(ytd_paid, 2),
        "total_ytd_pending": round(ytd_pending, 2),
        # Pendente (total histórico) e recebível
        "pending": round(total_pending, 2),          # compat. legado
        "total_pending": round(total_pending, 2),
        "total_paid": round(ytd_paid, 2),
        "total_receivable": round(ytd_paid + total_pending, 2),
        # Detalhes
        "count_month": len(month_paid_records) + len(month_pending_records),
        "count_month_paid": len(month_paid_records),
        "count_month_pending": len(month_pending_records),
        "by_method": {k: round(v, 2) for k, v in by_method.items()},
        "monthly_totals": {str(k): round(v, 2) for k, v in sorted(monthly.items())},
    }


class FinancialUpdate(BaseModel):
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    date: Optional[date] = None
    notes: Optional[str] = None


def _load_owned(record_id: int, db: Session, current_user: User) -> FinancialRecord:
    r = db.query(FinancialRecord).filter(FinancialRecord.id == record_id).first()
    if not r:
        raise HTTPException(404, "Registro não encontrado")
    if current_user.role != "superadmin":
        p = db.query(Patient).filter(Patient.id == r.patient_id).first()
        if not p or p.organization_id != current_user.organization_id:
            raise HTTPException(403, "Acesso negado: registro não pertence à sua organização")
    return r


@router.put("/{record_id}", response_model=FinancialOut)
def update_record(
    record_id: int,
    data: FinancialUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = _load_owned(record_id, db, current_user)
    locked = _is_locked(r)
    privileged = current_user.role in _PRIVILEGED_ROLES
    if locked and not privileged:
        raise HTTPException(423, "Registro fechado (lançamento de dia anterior). Só o médico pode corrigir.")
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        return _serialize(r)
    before = _snapshot(r)
    for k, v in changes.items():
        setattr(r, k, v)
    # Correção de um lançamento JÁ FECHADO fica na trilha (quem, quando, de→para).
    if locked and privileged:
        AuditLogService.from_request(
            db, request, current_user,
            action="financial.updated", resource_type="financial_record",
            resource_id=str(r.id), before_state=before, after_state=_snapshot(r),
            metadata={"locked_edit": True},
        )
    db.commit()
    db.refresh(r)
    return _serialize(r)


@router.delete("/{record_id}", status_code=204)
def delete_record(
    record_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = _load_owned(record_id, db, current_user)
    locked = _is_locked(r)
    privileged = current_user.role in _PRIVILEGED_ROLES
    if locked and not privileged:
        raise HTTPException(423, "Registro fechado (lançamento de dia anterior). Só o médico pode excluir.")
    # Exclusão de um lançamento JÁ FECHADO fica na trilha antes de sumir.
    if locked and privileged:
        AuditLogService.from_request(
            db, request, current_user,
            action="financial.deleted", resource_type="financial_record",
            resource_id=str(r.id), before_state=_snapshot(r),
            metadata={"locked_delete": True},
        )
    db.delete(r)
    db.commit()
