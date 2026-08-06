from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import List, Optional
from calendar import monthrange
from datetime import date, datetime, timezone, timedelta
from pydantic import BaseModel
from database import get_db
from models.patient import Patient
from models.financial import FinancialRecord
from models.clinic import Clinic, ClinicSchedule, Appointment
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


@router.get("/analytics")
def get_analytics(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Central de análises do médico/admin (decisão Valth 02/08): séries de
    receita (dia/mês/ano), formas de pagamento, ticket médio e demografia de
    pacientes (convênio×particular, cidades, sexo)."""
    if current_user.role == "secretary":
        raise HTTPException(403, "Análises disponíveis apenas para o médico/administração")

    org_id = current_user.organization_id
    hoje = _br_today()

    def _pagos_q():
        q = db.query(FinancialRecord).filter(FinancialRecord.status == "paid")
        if current_user.role != "superadmin":
            q = q.join(Patient, FinancialRecord.patient_id == Patient.id).filter(
                Patient.organization_id == org_id
            )
        return q

    pagos = _pagos_q().all()

    # ── Séries de receita ────────────────────────────────────────────────────
    por_dia: dict = {}
    por_mes: dict = {}
    por_ano: dict = {}
    por_metodo: dict = {}
    d30 = hoje - timedelta(days=29)
    ano_corrente = hoje.year
    receita_ano_corrente = 0.0
    count_ano_corrente = 0
    for r in pagos:
        if not r.date:
            continue
        a = r.date.year
        por_ano[a] = por_ano.get(a, 0.0) + r.amount
        if a == ano_corrente:
            receita_ano_corrente += r.amount
            count_ano_corrente += 1
            por_metodo[r.payment_method] = por_metodo.get(r.payment_method, 0.0) + r.amount
        mkey = f"{r.date.year:04d}-{r.date.month:02d}"
        por_mes[mkey] = por_mes.get(mkey, 0.0) + r.amount
        if r.date >= d30:
            dkey = r.date.isoformat()
            por_dia[dkey] = por_dia.get(dkey, 0.0) + r.amount

    # últimos 12 meses contínuos (zera os vazios pro gráfico não "pular")
    meses_12 = []
    y, m = hoje.year, hoje.month
    for _ in range(12):
        meses_12.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    meses_12.reverse()
    dias_30 = [(d30 + timedelta(days=i)).isoformat() for i in range(30)]

    # ── Demografia dos pacientes da organização ─────────────────────────────
    pq = db.query(Patient)
    if current_user.role != "superadmin":
        pq = pq.filter(Patient.organization_id == org_id)
    pacientes = pq.all()
    total_pac = len(pacientes)
    particular = convenio = sem_info = 0
    top_convenios: dict = {}
    por_cidade: dict = {}
    por_sexo: dict = {"M": 0, "F": 0, "outro": 0}
    for p in pacientes:
        ins = (p.insurance or "").strip()
        if not ins:
            sem_info += 1
        elif ins.lower() == "particular":
            particular += 1
        else:
            convenio += 1
            top_convenios[ins] = top_convenios.get(ins, 0) + 1
        cid = (p.address_city or "").strip().title()
        if cid:
            por_cidade[cid] = por_cidade.get(cid, 0) + 1
        g = (getattr(p, "gender", None) or "").upper()
        if g in ("M", "F"):
            por_sexo[g] += 1
        else:
            por_sexo["outro"] += 1

    return {
        "receita_por_dia": [{"dia": d[8:10] + "/" + d[5:7], "total": round(por_dia.get(d, 0.0), 2)} for d in dias_30],
        "receita_por_mes": [{"mes": mk[5:7] + "/" + mk[2:4], "total": round(por_mes.get(mk, 0.0), 2)} for mk in meses_12],
        "receita_por_ano": [{"ano": a, "total": round(t, 2)} for a, t in sorted(por_ano.items())],
        "por_metodo": {k: round(v, 2) for k, v in por_metodo.items()},
        "receita_ano": round(receita_ano_corrente, 2),
        "ticket_medio": round(receita_ano_corrente / count_ano_corrente, 2) if count_ano_corrente else None,
        "pagamentos_ano": count_ano_corrente,
        "convenio_particular": {
            "particular": particular,
            "convenio": convenio,
            "sem_info": sem_info,
            "top_convenios": sorted(
                [{"nome": k, "qtd": v} for k, v in top_convenios.items()],
                key=lambda x: -x["qtd"],
            )[:8],
        },
        "por_cidade": sorted(
            [{"cidade": k, "qtd": v} for k, v in por_cidade.items()], key=lambda x: -x["qtd"]
        )[:8],
        "por_sexo": por_sexo,
        "total_pacientes": total_pac,
    }


def _periodo(start_time: Optional[str]) -> str:
    """Turno da manha ou da tarde, pela hora de inicio da grade."""
    try:
        hora = int((start_time or "08:00").split(":")[0])
    except (ValueError, AttributeError):
        hora = 8
    return "manhã" if hora < 13 else "tarde"


def _horas_do_turno(sched, inicio: date, fim: date) -> float:
    """Horas de consultorio que o turno reservou no periodo.

    Regua do painel (06/08): a hora e a que o medico bloqueou na vida dele,
    esteja ela preenchida ou nao — turno vazio DEVE pesar contra o turno.
    Feriado nao e descontado: o app nao tem calendario de feriados e inventar
    um seria manutencao.
    """
    try:
        h1, m1 = map(int, (sched.start_time or "").split(":"))
        h2, m2 = map(int, (sched.end_time or "").split(":"))
    except (ValueError, AttributeError):
        return 0.0
    minutos = (h2 * 60 + m2) - (h1 * 60 + m1)
    if minutos <= 0:
        return 0.0
    ocorrencias = 0
    d = inicio
    while d <= fim:
        if d.weekday() == sched.day_of_week:
            ocorrencias += 1
        d += timedelta(days=1)
    return round(ocorrencias * minutos / 60.0, 2)


# Etiquetas que NAO sao procedimento. Registro sem etiqueta (historico antigo)
# entra como consulta e nunca como procedimento: melhor a faixa 3 nascer
# modesta do que mostrar uma infiltracao que ninguem sabe se aconteceu.
NAO_PROCEDIMENTO = ("Consulta", "Retorno", None)


def _classificar_mix(linhas) -> dict:
    """Divide o faturamento entre consulta e procedimento.

    `linhas` = lista de (procedure_type, soma, quantidade).
    """
    c_valor, c_qtd = 0.0, 0
    p_valor, p_qtd = 0.0, 0
    detalhe = []
    for tipo, soma, qtd in linhas:
        soma = float(soma or 0)
        qtd = int(qtd or 0)
        if tipo in NAO_PROCEDIMENTO:
            c_valor += soma
            c_qtd += qtd
        else:
            p_valor += soma
            p_qtd += qtd
            detalhe.append({
                "tipo": tipo,
                "qtd": qtd,
                "valor": round(soma, 2),
                "ticket": round(soma / qtd, 2) if qtd else None,
            })
    detalhe.sort(key=lambda l: l["valor"], reverse=True)
    ticket_c = (c_valor / c_qtd) if c_qtd else 0.0
    ticket_p = (p_valor / p_qtd) if p_qtd else 0.0
    return {
        "consulta": {"valor": round(c_valor, 2), "qtd": c_qtd},
        "procedimento": {"valor": round(p_valor, 2), "qtd": p_qtd},
        "razao_ticket": round(ticket_p / ticket_c, 2) if ticket_c and ticket_p else None,
        "linhas": detalhe,
    }


@router.get("/painel")
def get_painel(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Financeiro em tres faixas (06/08). Regua = R$ por hora de grade.

    Faturamento absoluto engana: a clinica onde o medico passa mais horas
    sempre lidera, o que mede presenca e nao rentabilidade.
    """
    if current_user.role == "secretary":
        raise HTTPException(403, "Painel financeiro disponível apenas para o médico/administração")

    hoje = _br_today()
    mes_inicio = hoje.replace(day=1)

    clinics_q = db.query(Clinic).filter(Clinic.active == True)
    if current_user.role != "superadmin":
        clinics_q = clinics_q.filter(Clinic.organization_id == current_user.organization_id)
    clinicas = {c.id: c for c in clinics_q.all()}
    ids = list(clinicas)

    receita_por_clinica: dict[int, float] = {}
    qtd_por_clinica: dict[int, int] = {}
    if ids:
        for cid, soma, n in (
            db.query(FinancialRecord.clinic_id,
                     func.coalesce(func.sum(FinancialRecord.amount), 0),
                     func.count(FinancialRecord.id))
            .filter(FinancialRecord.clinic_id.in_(ids),
                    FinancialRecord.date >= mes_inicio,
                    FinancialRecord.date <= hoje,
                    FinancialRecord.status == "paid")
            .group_by(FinancialRecord.clinic_id).all()
        ):
            receita_por_clinica[cid] = float(soma or 0)
            qtd_por_clinica[cid] = int(n or 0)

    marcados: dict[int, int] = {}
    if ids:
        for cid, n in (
            db.query(Appointment.clinic_id, func.count(Appointment.id))
            .filter(Appointment.clinic_id.in_(ids),
                    Appointment.date >= mes_inicio, Appointment.date <= hoje,
                    Appointment.status.in_(("pending", "confirmed", "completed")))
            .group_by(Appointment.clinic_id).all()
        ):
            marcados[cid] = n

    scheds = (
        db.query(ClinicSchedule)
        .filter(ClinicSchedule.clinic_id.in_(ids), ClinicSchedule.active == True)
        .all()
    ) if ids else []

    DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    turnos = []
    horas_por_clinica: dict[int, float] = {}
    for s in scheds:
        horas_por_clinica[s.clinic_id] = horas_por_clinica.get(s.clinic_id, 0.0) + _horas_do_turno(s, mes_inicio, hoje)

    vistos: set[int] = set()
    for s in scheds:
        c = clinicas.get(s.clinic_id)
        if c is None:
            continue
        horas = _horas_do_turno(s, mes_inicio, hoje)
        if horas <= 0:
            continue
        horas_totais = horas_por_clinica.get(s.clinic_id, 0.0) or horas
        fatia = horas / horas_totais
        receita = round(receita_por_clinica.get(s.clinic_id, 0.0) * fatia, 2)
        qtd = qtd_por_clinica.get(s.clinic_id, 0)
        slot = s.slot_duration or 12
        capacidade = int(horas * 60 // slot) if slot else 0
        booked = round(marcados.get(s.clinic_id, 0) * fatia)
        nome = c.name.replace("Clínica ", "")
        periodo = _periodo(s.start_time)
        turnos.append({
            "clinic_id": c.id,
            "clinica": nome,
            "dia_semana": s.day_of_week,
            "periodo": periodo,
            "label": f"{DIAS[s.day_of_week]} {periodo} · {nome}",
            "horas_mes": horas,
            "receita_mes": receita,
            "receita_por_hora": round(receita / horas, 2) if horas else 0.0,
            "ocupacao": round(booked / capacidade, 3) if capacidade else None,
            "ticket": round(receita / qtd, 2) if qtd else None,
            "atencao": False,
        })
        vistos.add(s.clinic_id)

    turnos.sort(key=lambda t: t["receita_por_hora"], reverse=True)

    # Destaque em ambar: no maximo UM turno — o de pior R$/hora, e so se
    # estiver com ocupacao >= 60%. Se o pior turno estiver vazio, o problema
    # e agenda e nao preco, e a coluna de ocupacao ja conta essa historia.
    if turnos:
        pior = turnos[-1]
        if (pior["ocupacao"] or 0) >= 0.6:
            pior["atencao"] = True

    # ── FAIXA 1: o mes ──────────────────────────────────────────────────────
    def _org_q(q):
        if current_user.role != "superadmin":
            q = q.join(Patient, FinancialRecord.patient_id == Patient.id).filter(
                Patient.organization_id == current_user.organization_id
            )
        return q

    doze_meses_atras = (mes_inicio - timedelta(days=340)).replace(day=1)
    serie_bruta = (
        _org_q(db.query(
            func.extract("year", FinancialRecord.date),
            func.extract("month", FinancialRecord.date),
            func.coalesce(func.sum(FinancialRecord.amount), 0),
        ))
        .filter(FinancialRecord.date >= doze_meses_atras,
                FinancialRecord.date <= hoje,
                FinancialRecord.status == "paid")
        .group_by(func.extract("year", FinancialRecord.date),
                  func.extract("month", FinancialRecord.date))
        .all()
    )
    por_mes = {(int(a), int(m)): float(v or 0) for a, m, v in serie_bruta}

    serie_12m = []
    ref = doze_meses_atras
    while ref <= mes_inicio:
        serie_12m.append({
            "label": f"{ref.month:02d}/{ref.year}",
            "valor": round(por_mes.get((ref.year, ref.month), 0.0), 2),
        })
        ref = (ref.replace(day=28) + timedelta(days=7)).replace(day=1)

    realizado = round(por_mes.get((hoje.year, hoje.month), 0.0), 2)

    def _uteis(inicio: date, fim: date) -> int:
        n, d = 0, inicio
        while d <= fim:
            if d.weekday() < 5:
                n += 1
            d += timedelta(days=1)
        return n

    ultimo_dia = hoje.replace(day=monthrange(hoje.year, hoje.month)[1])
    uteis_ate_hoje = _uteis(mes_inicio, hoje)
    uteis_total = _uteis(mes_inicio, ultimo_dia)
    projecao = round(realizado / uteis_ate_hoje * uteis_total, 2) if uteis_ate_hoje else realizado

    anterior_ref = (mes_inicio - timedelta(days=1))
    anterior = por_mes.get((anterior_ref.year, anterior_ref.month), 0.0)
    variacao = round((projecao - anterior) / anterior, 3) if anterior else None

    # ── FAIXA 3: consulta x procedimento ────────────────────────────────────
    linhas_mix = (
        _org_q(db.query(
            FinancialRecord.procedure_type,
            func.coalesce(func.sum(FinancialRecord.amount), 0),
            func.count(FinancialRecord.id),
        ))
        .filter(FinancialRecord.date >= mes_inicio,
                FinancialRecord.date <= hoje,
                FinancialRecord.status == "paid")
        .group_by(FinancialRecord.procedure_type)
        .all()
    )
    mix = _classificar_mix(linhas_mix)

    return {
        "mes": {
            "label": f"{hoje.month:02d}/{hoje.year}",
            "realizado": realizado,
            "projecao": projecao,
            "dias_uteis_decorridos": uteis_ate_hoje,
            "dias_uteis_total": uteis_total,
            "variacao_vs_anterior": variacao,
            "serie_12m": serie_12m,
        },
        "turnos": turnos,
        "mix": mix,
    }


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
