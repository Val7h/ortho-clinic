from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import List, Optional
from datetime import date, datetime
from pydantic import BaseModel
from database import get_db
from models.patient import Patient
from models.financial import FinancialRecord
from deps import get_current_user
from models.organization import User

router = APIRouter(prefix="/financial", tags=["Financeiro"], dependencies=[Depends(get_current_user)])


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

    model_config = {"from_attributes": True}


@router.post("", response_model=FinancialOut, status_code=201)
def create_record(data: FinancialIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Patient).filter(Patient.id == data.patient_id).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    if current_user.role != "superadmin" and p.organization_id != current_user.organization_id:
        raise HTTPException(403, "Acesso negado: paciente não pertence à sua organização")
    record = FinancialRecord(
        **data.model_dump(exclude_none=False),
        date=data.date or date.today(),
    )
    if data.date is None:
        record.date = date.today()
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


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
    if patient_id:
        q = q.filter(FinancialRecord.patient_id == patient_id)
    if year:
        q = q.filter(extract("year", FinancialRecord.date) == year)
    if month:
        q = q.filter(extract("month", FinancialRecord.date) == month)
    return q.order_by(FinancialRecord.date.desc()).all()


@router.get("/summary")
def get_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    m = month or today.month
    y = year or today.year

    base_q = db.query(FinancialRecord)
    if current_user.role != "superadmin":
        base_q = base_q.join(Patient, FinancialRecord.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )

    records = (
        base_q.filter(
            extract("year", FinancialRecord.date) == y,
            extract("month", FinancialRecord.date) == m,
            FinancialRecord.status == "paid",
        )
        .all()
    )

    total = sum(r.amount for r in records)
    by_method: dict = {}
    for r in records:
        by_method[r.payment_method] = by_method.get(r.payment_method, 0) + r.amount

    # Year to date
    ytd_base_q = db.query(FinancialRecord)
    if current_user.role != "superadmin":
        ytd_base_q = ytd_base_q.join(Patient, FinancialRecord.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    ytd_records = (
        ytd_base_q.filter(
            extract("year", FinancialRecord.date) == y,
            FinancialRecord.status == "paid",
        )
        .all()
    )
    ytd_total = sum(r.amount for r in ytd_records)

    # Monthly totals for the year (chart data)
    monthly = {}
    for r in ytd_records:
        k = r.date.month
        monthly[k] = monthly.get(k, 0) + r.amount

    pending_q = db.query(func.sum(FinancialRecord.amount)).filter(FinancialRecord.status == "pending")
    if current_user.role != "superadmin":
        pending_q = pending_q.join(Patient, FinancialRecord.patient_id == Patient.id).filter(
            Patient.organization_id == current_user.organization_id
        )
    pending = pending_q.scalar() or 0

    return {
        "month": m,
        "year": y,
        "total_month": round(total, 2),
        "total_ytd": round(ytd_total, 2),
        "pending": round(pending, 2),
        "count_month": len(records),
        "by_method": {k: round(v, 2) for k, v in by_method.items()},
        "monthly_totals": {str(k): round(v, 2) for k, v in sorted(monthly.items())},
    }


@router.delete("/{record_id}", status_code=204)
def delete_record(record_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = db.query(FinancialRecord).filter(FinancialRecord.id == record_id).first()
    if not r:
        raise HTTPException(404, "Registro não encontrado")
    if current_user.role != "superadmin":
        p = db.query(Patient).filter(Patient.id == r.patient_id).first()
        if not p or p.organization_id != current_user.organization_id:
            raise HTTPException(403, "Acesso negado: registro não pertence à sua organização")
    db.delete(r)
    db.commit()
