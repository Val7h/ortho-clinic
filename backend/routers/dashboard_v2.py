"""Dashboard v2 — redesign aprovado 02/08 (analytics + rentabilidade).

Um único endpoint agregador devolve as 4 faixas:
  HOJE (ação imediata) · O MÊS EM 4 NÚMEROS · POR CLÍNICA · MÁQUINA DE PACIENTES

Ajustes de dados embutidos:
- tempo médio de consulta usa waiting_room_entries.active_seconds (o cálculo
  antigo em dashboard.py somava a pausa do RX como atendimento);
- falta (no-show) DERIVADA: appointment passado que morreu em pending/confirmed;
- receita/ticket POR CLÍNICA via waiting_room_entries.value_cents (o financeiro
  não tem clinic_id — coluna adicionada p/ o futuro, proxy usado hoje).
Só médico/admin veem (mesma regra do financeiro analítico).
"""

from calendar import monthrange
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models.clinic import Appointment, Clinic
from models.consultation import Consultation
from models.financial import FinancialRecord
from models.organization import User
from models.patient import Patient
from models.queue import WaitingRoomEntry
from models.whatsapp import WhatsAppMessage

router = APIRouter(prefix="/dashboard/v2", tags=["Dashboard v2"])

BRT = timezone(timedelta(hours=-3))

# "no_show" = falta MARCADA (pelo médico ou pela fila). pending/confirmed no
# passado = falta presumida (paciente que não passou pela sala de espera).
NOSHOW_STATUSES = ("pending", "confirmed", "no_show")
ACTIVE_STATUSES = ("pending", "confirmed", "completed")  # sem cancelled/blocked/no_show


def require_viewer(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "superadmin", "doctor"):
        raise HTTPException(403, "Sem permissão")
    return current_user


def _capacity_only(clinic: Clinic, start: date, end: date) -> int:
    """Capacidade teórica da clínica no intervalo (sem tocar o banco).

    PERF 05/08: antes esta função também consultava os agendamentos, 1 query por
    clínica. Agora só faz a conta com os schedules já carregados; a contagem de
    marcados vem de UMA query agregada para todas as clínicas.
    """
    schedules = [s for s in clinic.schedules if s.active]
    if not schedules:
        return 0
    by_dow: dict[int, int] = {}
    for s in schedules:
        try:
            h1, m1 = map(int, s.start_time.split(":"))
            h2, m2 = map(int, s.end_time.split(":"))
            slots = max(0, ((h2 * 60 + m2) - (h1 * 60 + m1)) // (s.slot_duration or 12))
        except Exception:
            slots = 0
        by_dow[s.day_of_week] = by_dow.get(s.day_of_week, 0) + slots
    capacity = 0
    d = start
    while d <= end:
        capacity += by_dow.get(d.weekday(), 0)
        d += timedelta(days=1)
    return capacity


@router.get("")
def dashboard_v2(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_viewer),
):
    today = datetime.now(BRT).date()
    tomorrow = today + timedelta(days=1)
    month_start = today.replace(day=1)
    month_end = today.replace(day=monthrange(today.year, today.month)[1])
    prev_month_end = month_start - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1)
    d28 = today - timedelta(days=28)
    org = current_user.organization_id
    is_super = current_user.role == "superadmin"

    def org_p(q):  # escopo por organização via paciente
        return q if is_super else q.filter(Patient.organization_id == org)

    # ── HOJE ────────────────────────────────────────────────────────────────
    caixa_dia = (
        db.query(func.coalesce(func.sum(FinancialRecord.amount), 0))
        .filter(FinancialRecord.date == today, FinancialRecord.status == "paid")
        .scalar()
    ) or 0
    # PERF 05/08: contagens do dia numa query so, agrupada por status
    pagamentos_dia = (
        db.query(func.count(FinancialRecord.id))
        .filter(FinancialRecord.date == today, FinancialRecord.status == "paid")
        .scalar()
    ) or 0
    pacientes_hoje, cancelados_hoje = 0, 0
    for status_, n in (
        db.query(Appointment.status, func.count(Appointment.id))
        .filter(Appointment.date == today).group_by(Appointment.status).all()
    ):
        if status_ in ACTIVE_STATUSES:
            pacientes_hoje += n
        elif status_ == "cancelled":
            cancelados_hoje += n
    nao_conf = (
        db.query(Appointment, Clinic.name)
        .join(Clinic, Clinic.id == Appointment.clinic_id)
        .filter(Appointment.date == tomorrow, Appointment.status == "pending")
        .limit(12)
        .all()
    )
    nao_confirmados_amanha = [
        {"nome": a.patient_name, "telefone": a.patient_phone, "clinica": cname.replace("Clínica ", "")}
        for a, cname in nao_conf
    ]

    # ── MÊS ─────────────────────────────────────────────────────────────────
    def paid_sum(d1: date, d2: date) -> float:
        return float(
            db.query(func.coalesce(func.sum(FinancialRecord.amount), 0))
            .filter(FinancialRecord.date >= d1, FinancialRecord.date <= d2, FinancialRecord.status == "paid")
            .scalar() or 0
        )

    receita_mes = paid_sum(month_start, month_end)
    receita_mes_anterior = paid_sum(prev_month_start, prev_month_end)
    pend_row = (
        db.query(func.coalesce(func.sum(FinancialRecord.amount), 0))
        .filter(FinancialRecord.date >= month_start, FinancialRecord.date <= month_end, FinancialRecord.status == "pending")
        .scalar()
    ) or 0
    n_pagos_mes = (
        db.query(func.count(FinancialRecord.id))
        .filter(FinancialRecord.date >= month_start, FinancialRecord.date <= month_end, FinancialRecord.status == "paid")
        .scalar()
    ) or 0
    ticket_geral = (receita_mes / n_pagos_mes) if n_pagos_mes else 0.0

    # Quem PASSOU pela sala de espera compareceu — mesmo que o agendamento
    # tenha ficado "confirmado" (o médico não fecha status na correria).
    # Sem isso a taxa de falta dava 96% num mês de agenda cheia. (06/08)
    atendidos_pares = {
        (pid, dia)
        for pid, dia in db.query(WaitingRoomEntry.patient_id, WaitingRoomEntry.entry_date)
        .filter(WaitingRoomEntry.entry_date >= min(month_start, d28),
                WaitingRoomEntry.entry_date <= month_end,
                WaitingRoomEntry.status == "attended").all()
    }

    # Faltas x comparecimentos do mês (UMA query; a mesma alimenta "por clínica")
    ap_mes = (
        db.query(Appointment.status, Appointment.patient_id, Appointment.date, Appointment.clinic_id)
        .filter(Appointment.date >= month_start, Appointment.date < today).all()
    )

    def _compareceu(st, pid, dia) -> bool:
        return st == "completed" or (pid is not None and (pid, dia) in atendidos_pares)

    faltas_mes, compareceram_mes = 0, 0
    for st, pid, dia, _cid in ap_mes:
        if _compareceu(st, pid, dia):
            compareceram_mes += 1
        elif st in NOSHOW_STATUSES:
            faltas_mes += 1
    taxa_falta = (faltas_mes / (faltas_mes + compareceram_mes)) if (faltas_mes + compareceram_mes) else 0.0
    receita_perdida = round(faltas_mes * ticket_geral, 2)

    # Ticket particular × convênio (financeiro pago do mês join paciente)
    def ticket_por_grupo():
        rows = (
            org_p(
                db.query(Patient.insurance, func.avg(FinancialRecord.amount))
                .join(Patient, Patient.id == FinancialRecord.patient_id)
            )
            .filter(FinancialRecord.date >= month_start, FinancialRecord.date <= month_end, FinancialRecord.status == "paid")
            .group_by(Patient.insurance)
            .all()
        )
        part, part_n, conv, conv_n = 0.0, 0, 0.0, 0
        for insurance, avg_amount in rows:
            g = (insurance or "").strip().lower()
            if g == "particular":
                part, part_n = float(avg_amount or 0), part_n + 1
            elif g:
                conv += float(avg_amount or 0)
                conv_n += 1
        return round(part, 2), round(conv / conv_n, 2) if conv_n else 0.0

    ticket_particular, ticket_convenio = ticket_por_grupo()

    # Projeção: realizado + futuros × ticket × taxa histórica de comparecimento
    futuros_mes = (
        db.query(func.count(Appointment.id))
        .filter(Appointment.date > today, Appointment.date <= month_end, Appointment.status.in_(ACTIVE_STATUSES))
        .scalar()
    ) or 0
    taxa_comparecimento = (compareceram_mes / (faltas_mes + compareceram_mes)) if (faltas_mes + compareceram_mes) else 0.85
    projecao_mes = round(receita_mes + futuros_mes * ticket_geral * taxa_comparecimento, 2)

    # ── POR CLÍNICA ─────────────────────────────────────────────────────────
    # PERF 05/08: eram ~4 queries POR clínica (20+ idas ao banco, ~4,5s de
    # carregamento). Agora são 4 queries agregadas com GROUP BY, para todas.
    clinics_q = db.query(Clinic).filter(Clinic.active == True)
    if not is_super:
        clinics_q = clinics_q.filter(Clinic.organization_id == org)
    clinicas = clinics_q.all()
    ids = [c.id for c in clinicas]

    booked_map: dict[int, int] = {}
    faltas_map: dict[int, int] = {}
    comp_map: dict[int, int] = {}
    receita_map: dict[int, tuple[float, int]] = {}
    tempo_map: dict[int, float] = {}

    if ids:
        for cid, n in (
            db.query(Appointment.clinic_id, func.count(Appointment.id))
            .filter(Appointment.clinic_id.in_(ids), Appointment.date >= d28,
                    Appointment.date <= today, Appointment.status.in_(ACTIVE_STATUSES))
            .group_by(Appointment.clinic_id).all()
        ):
            booked_map[cid] = n

        # Reaproveita ap_mes (já veio do banco) e aplica a MESMA regra do mês:
        # passou pela sala de espera = compareceu.
        for st, pid, dia, cid in ap_mes:
            if cid is None:
                continue
            if _compareceu(st, pid, dia):
                comp_map[cid] = comp_map.get(cid, 0) + 1
            elif st in NOSHOW_STATUSES:
                faltas_map[cid] = faltas_map.get(cid, 0) + 1

        # Receita por clínica sai do MESMO lugar que a receita do mês (o
        # financeiro). Antes vinha da sala de espera, e por isso o mês fechava
        # em R$ 5.685 com todas as clínicas zeradas: pagamento lançado direto
        # no Caixa não passa pela fila. (05/08)
        for cid, soma, n in (
            db.query(FinancialRecord.clinic_id,
                     func.coalesce(func.sum(FinancialRecord.amount), 0),
                     func.count(FinancialRecord.id))
            .filter(FinancialRecord.clinic_id.in_(ids),
                    FinancialRecord.date >= month_start,
                    FinancialRecord.date <= month_end,
                    FinancialRecord.status == "paid")
            .group_by(FinancialRecord.clinic_id).all()
        ):
            receita_map[cid] = (float(soma or 0), int(n or 0))

        for cid, media in (
            db.query(WaitingRoomEntry.clinic_id, func.avg(WaitingRoomEntry.active_seconds))
            .filter(WaitingRoomEntry.clinic_id.in_(ids), WaitingRoomEntry.status == "attended",
                    WaitingRoomEntry.entry_date >= d28, WaitingRoomEntry.active_seconds > 0)
            .group_by(WaitingRoomEntry.clinic_id).all()
        ):
            if media:
                tempo_map[cid] = float(media)

    clinicas_out = []
    ocupacao_pond_num, ocupacao_pond_den = 0, 0
    for c in clinicas:
        capacity = _capacity_only(c, d28, today)
        booked = booked_map.get(c.id, 0)
        ocupacao = (booked / capacity) if capacity else None
        if capacity:
            ocupacao_pond_num += booked
            ocupacao_pond_den += capacity
        faltas_c = faltas_map.get(c.id, 0)
        comp_c = comp_map.get(c.id, 0)
        receita_c, n_val = receita_map.get(c.id, (0.0, 0))
        tempo_medio_s = tempo_map.get(c.id)
        sched = next((s for s in c.schedules if s.active), None)
        clinicas_out.append({
            "id": c.id,
            "nome": c.name.replace("Clínica ", ""),
            "color": c.color,
            "ocupacao": round(ocupacao, 3) if ocupacao is not None else None,
            "faltas": faltas_c,
            "taxa_falta": round(faltas_c / (faltas_c + comp_c), 3) if (faltas_c + comp_c) else None,
            "atendidos_mes": comp_c,
            "ticket": round(receita_c / n_val, 2) if n_val else None,
            "receita_mes": round(receita_c, 2),
            "tempo_medio_min": round(tempo_medio_s / 60.0, 1) if tempo_medio_s else None,
            "slot_min": sched.slot_duration if sched else None,
        })
    ocupacao_media = round(ocupacao_pond_num / ocupacao_pond_den, 3) if ocupacao_pond_den else None

    # ── MÁQUINA DE PACIENTES ────────────────────────────────────────────────
    marcados_28 = (
        db.query(func.count(Appointment.id))
        .filter(Appointment.date >= d28, Appointment.date <= today)
        .scalar()
    ) or 0
    confirmados_28 = (
        db.query(func.count(Appointment.id))
        .filter(Appointment.date >= d28, Appointment.date <= today, Appointment.status.in_(("confirmed", "completed")))
        .scalar()
    ) or 0
    # Mesma regra do mês: quem passou pela sala de espera compareceu (06/08)
    compareceram_28 = sum(
        1
        for st, pid, dia in db.query(Appointment.status, Appointment.patient_id, Appointment.date)
        .filter(Appointment.date >= d28, Appointment.date <= today).all()
        if _compareceu(st, pid, dia)
    )

    novos_mes = (
        org_p(db.query(func.count(Patient.id)))
        .filter(Patient.created_at >= datetime(month_start.year, month_start.month, 1, tzinfo=timezone.utc))
        .scalar()
    ) or 0
    retornos_mes = (
        db.query(func.count(Consultation.id))
        .filter(Consultation.date >= month_start, Consultation.date <= month_end,
                Consultation.type == "retorno")
        .scalar()
    ) or 0

    # Recall: paciente com CID/condição crônica, sem consulta há 180+ dias e sem futuro
    corte = today - timedelta(days=180)
    last_consult = (
        db.query(Consultation.patient_id, func.max(Consultation.date).label("ult"))
        .group_by(Consultation.patient_id)
        .subquery()
    )
    future_appt = (
        db.query(Appointment.patient_id)
        .filter(Appointment.date >= today, Appointment.status.in_(ACTIVE_STATUSES),
                Appointment.patient_id.isnot(None))
        .subquery()
    )
    recall_q = (
        org_p(db.query(func.count(Patient.id)))
        .join(last_consult, last_consult.c.patient_id == Patient.id)
        .filter(last_consult.c.ult < corte)
        .filter(~Patient.id.in_(db.query(future_appt.c.patient_id)))
        .filter((Patient.cids.isnot(None)) | (Patient.chronic_conditions.isnot(None)))
    )
    recall_n = recall_q.scalar() or 0

    folhetos_mes = (
        db.query(func.count(WhatsAppMessage.id))
        .filter(WhatsAppMessage.message_type == "folheto", WhatsAppMessage.status == "sent",
                WhatsAppMessage.created_at >= datetime(month_start.year, month_start.month, 1, tzinfo=timezone.utc))
        .scalar()
    ) or 0

    # ── SENTINELA (05/08): agendamento futuro em dia que a clínica NÃO abre ──
    # Cinto e suspensório: as travas impedem novos, mas se algo entrar por outro
    # caminho (importação, bug futuro), aparece aqui no topo do painel.
    alertas_agenda = []
    try:
        # PERF: janela de 60 dias (o que importa operacionalmente) em vez de todo
        # o futuro, e reaproveita as clinicas ja carregadas acima.
        mapa_dias = {c.id: {s.day_of_week for s in (c.schedules or []) if s.active} for c in clinicas}
        futuros = [
            (a, next((c for c in clinicas if c.id == a.clinic_id), None))
            for a in db.query(Appointment)
            .filter(
                Appointment.date >= today,
                Appointment.date <= today + timedelta(days=60),
                Appointment.status.notin_(["cancelled", "blocked", "no_show"]),
            ).all()
        ]
        futuros = [(a, c) for a, c in futuros if c is not None]
        for a, c in futuros:
            dias_ativos = mapa_dias.get(c.id) or set()
            if dias_ativos and a.date.weekday() not in dias_ativos:
                alertas_agenda.append({
                    "appointment_id": a.id,
                    "paciente": a.patient_name,
                    "telefone": a.patient_phone,
                    "clinica": c.name.replace("Clínica ", ""),
                    "data": str(a.date),
                    "hora": a.start_time,
                    "motivo": f"{c.name} não atende neste dia da semana",
                })
    except Exception:
        pass

    return {
        "alertas_agenda": alertas_agenda,
        "hoje": {
            "caixa_dia": float(caixa_dia),
            "pagamentos_dia": pagamentos_dia,
            "pacientes_hoje": pacientes_hoje,
            "cancelados_hoje": cancelados_hoje,
            "nao_confirmados_amanha": nao_confirmados_amanha,
        },
        "mes": {
            "label": today.strftime("%m/%Y"),
            "receita": round(receita_mes, 2),
            "receita_pendente": float(pend_row),
            "receita_mes_anterior": round(receita_mes_anterior, 2),
            "projecao": projecao_mes,
            "faltas": faltas_mes,
            "taxa_falta": round(taxa_falta, 3),
            "receita_perdida_faltas": receita_perdida,
            "ticket_geral": round(ticket_geral, 2),
            "ticket_particular": ticket_particular,
            "ticket_convenio": ticket_convenio,
            "ocupacao_media": ocupacao_media,
        },
        "clinicas": clinicas_out,
        "funil_28d": {
            "marcados": marcados_28,
            "confirmados": confirmados_28,
            "compareceram": compareceram_28,
        },
        "pacientes": {
            "novos_mes": novos_mes,
            "retornos_mes": retornos_mes,
            "recall_6m": recall_n,
            "folhetos_mes": folhetos_mes,
        },
    }


@router.get("/recall")
def recall_list(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_viewer),
):
    """Lista de crônicos sem retorno há 6+ meses — vira LISTA pra secretária
    contatar 1 a 1 (nunca disparo em massa)."""
    today = datetime.now(BRT).date()
    corte = today - timedelta(days=180)
    org = current_user.organization_id
    is_super = current_user.role == "superadmin"

    last_consult = (
        db.query(Consultation.patient_id, func.max(Consultation.date).label("ult"))
        .group_by(Consultation.patient_id)
        .subquery()
    )
    future_ids = (
        db.query(Appointment.patient_id)
        .filter(Appointment.date >= today, Appointment.status.in_(ACTIVE_STATUSES),
                Appointment.patient_id.isnot(None))
    )
    q = (
        db.query(Patient, last_consult.c.ult)
        .join(last_consult, last_consult.c.patient_id == Patient.id)
        .filter(last_consult.c.ult < corte)
        .filter(~Patient.id.in_(future_ids))
        .filter((Patient.cids.isnot(None)) | (Patient.chronic_conditions.isnot(None)))
    )
    if not is_super:
        q = q.filter(Patient.organization_id == org)
    q = q.order_by(last_consult.c.ult.asc()).limit(200)
    return [
        {
            "id": p.id,
            "nome": p.name,
            "telefone": p.phone,
            "cids": p.cids or [],
            "condicoes": p.chronic_conditions,
            "ultima_consulta": str(ult),
        }
        for p, ult in q.all()
    ]
