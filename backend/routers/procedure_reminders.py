"""
Lembretes de repetição de procedimento.
Prefixo: /procedure-reminders

Quem usa a lista é a SECRETÁRIA (é ela quem liga) — decisão do Valth em 11/08.
Dois toques por lembrete e só: 1 mês antes de vencer (dá tempo de encaixar na
agenda) e de novo faltando 1 semana, para pegar quem escapou. Mais que isso
vira ruído e ela para de olhar.
"""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models.organization import User
from models.patient import Patient
from models.procedure_reminder import ProcedureReminder
from tzutil import today_br

router = APIRouter(prefix="/procedure-reminders", tags=["procedure-reminders"])

AVISO_ANTECEDENCIA_DIAS = 30   # 1º toque: ~1 mês antes de vencer
AVISO_ULTIMA_CHANCE_DIAS = 7   # 2º toque: faltando 1 semana


def _somar_meses(d: date, meses: int) -> date:
    """Soma meses sem depender de biblioteca extra. Dia 31 → último dia do mês."""
    ano = d.year + (d.month - 1 + meses) // 12
    mes = (d.month - 1 + meses) % 12 + 1
    # último dia do mês de destino
    if mes == 12:
        ultimo = 31
    else:
        ultimo = (date(ano, mes + 1, 1) - timedelta(days=1)).day
    return date(ano, mes, min(d.day, ultimo))


class ReminderIn(BaseModel):
    patient_id: int
    procedure: str
    interval_months: int
    applied_on: Optional[date] = None
    notes: Optional[str] = None


class ReminderOut(BaseModel):
    id: int
    patient_id: int
    paciente: str
    telefone: Optional[str]
    procedure: str
    applied_on: date
    interval_months: int
    vence_em: date
    dias_para_vencer: int
    fase: str
    status: str


def _org(q, user: User):
    if user.role != "superadmin":
        q = q.filter(ProcedureReminder.organization_id == user.organization_id)
    return q


@router.post("", response_model=ReminderOut, status_code=201)
def criar(
    data: ReminderIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.interval_months < 1 or data.interval_months > 60:
        raise HTTPException(422, "Intervalo deve ser entre 1 e 60 meses")
    paciente = db.query(Patient).filter(Patient.id == data.patient_id).first()
    if not paciente or (
        current_user.role != "superadmin"
        and paciente.organization_id != current_user.organization_id
    ):
        raise HTTPException(404, "Paciente não encontrado")

    novo = ProcedureReminder(
        organization_id=paciente.organization_id,
        patient_id=paciente.id,
        procedure=(data.procedure or "").strip() or "Procedimento",
        applied_on=data.applied_on or today_br(),
        interval_months=data.interval_months,
        notes=data.notes,
        created_by=current_user.id,
        status="pending",
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return _para_saida(novo, paciente)


def _para_saida(r: ProcedureReminder, p: Patient) -> ReminderOut:
    vence = _somar_meses(r.applied_on, r.interval_months)
    faltam = (vence - today_br()).days
    if faltam <= 0:
        fase = "vencido"
    elif faltam <= AVISO_ULTIMA_CHANCE_DIAS:
        fase = "última chamada"
    elif faltam <= AVISO_ANTECEDENCIA_DIAS:
        fase = "avisar agora"
    else:
        fase = "no prazo"
    return ReminderOut(
        id=r.id, patient_id=p.id, paciente=p.name, telefone=p.phone,
        procedure=r.procedure, applied_on=r.applied_on,
        interval_months=r.interval_months, vence_em=vence,
        dias_para_vencer=faltam, fase=fase, status=r.status,
    )


@router.get("", response_model=List[ReminderOut])
def listar(
    todos: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Por padrão devolve só quem JÁ deve ser chamado (e os vencidos).
    `todos=true` traz a agenda inteira, para conferência."""
    q = _org(
        db.query(ProcedureReminder, Patient)
        .join(Patient, Patient.id == ProcedureReminder.patient_id)
        .filter(ProcedureReminder.status == "pending"),
        current_user,
    )
    saida = [_para_saida(r, p) for r, p in q.all()]
    if not todos:
        saida = [s for s in saida if s.fase != "no prazo"]
    # Mais urgente primeiro: vencido, depois quem está mais perto de vencer.
    saida.sort(key=lambda s: s.dias_para_vencer)
    return saida


class ResolverIn(BaseModel):
    status: str   # done | cancelled


@router.patch("/{reminder_id}", response_model=ReminderOut)
def resolver(
    reminder_id: int,
    data: ResolverIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.status not in ("done", "cancelled", "pending"):
        raise HTTPException(422, "Situação inválida")
    r = _org(db.query(ProcedureReminder).filter(ProcedureReminder.id == reminder_id), current_user).first()
    if not r:
        raise HTTPException(404, "Lembrete não encontrado")
    r.status = data.status
    db.commit()
    db.refresh(r)
    paciente = db.query(Patient).filter(Patient.id == r.patient_id).first()
    return _para_saida(r, paciente)
