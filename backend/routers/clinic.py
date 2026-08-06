from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import date, datetime, timedelta
from pydantic import BaseModel
import logging
import secrets
from database import get_db
from tzutil import today_br
from models.clinic import Clinic, ClinicSchedule, Appointment
from models.patient import Patient
from models.organization import User
from deps import get_current_user
from services.whatsapp import send_whatsapp, build_booking_message, is_demo

router = APIRouter(tags=["Clínicas"], dependencies=[Depends(get_current_user)])
public_router = APIRouter(tags=["Agendamento Público"])

MAX_WALK_IN = 30  # limite por turno para ordem de chegada


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ScheduleOut(BaseModel):
    id: int
    day_of_week: int
    start_time: str
    end_time: str
    schedule_type: str
    slot_duration: int
    active: bool
    model_config = {"from_attributes": True}


class ClinicOut(BaseModel):
    id: int
    name: str
    city: str
    state: str
    color: str
    slug: str
    active: bool
    address: Optional[str] = None
    phone: Optional[str] = None
    schedules: List[ScheduleOut] = []
    model_config = {"from_attributes": True}


class AppointmentOut(BaseModel):
    id: int
    clinic_id: int
    date: date
    start_time: str
    end_time: str
    patient_name: str
    patient_phone: Optional[str] = None
    reason: Optional[str] = None
    status: str
    queue_number: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class ClinicCreate(BaseModel):
    name: str
    slug: str
    city: Optional[str] = None
    state: Optional[str] = None
    address: Optional[str] = None
    color: Optional[str] = "#0F2D5E"
    phone: Optional[str] = None


class ClinicUpdate(BaseModel):
    name: str
    slug: str
    city: Optional[str] = None
    state: Optional[str] = None
    address: Optional[str] = None
    color: Optional[str] = None
    phone: Optional[str] = None


class ScheduleUpdate(BaseModel):
    slot_duration: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    active: Optional[bool] = None


class BookIn(BaseModel):
    date: date
    start_time: Optional[str] = None
    patient_name: str
    patient_phone: Optional[str] = None
    reason: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

logger = logging.getLogger("orthoclinic.clinic")

DIAS_PT = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def assert_clinica_atende(db: Session, clinic: Clinic, quando: date, start_time: Optional[str] = None) -> None:
    """TRAVA (05/08): recusa agendamento em dia/hora que a clínica NÃO atende.

    Caso real: o bot marcou a Rayanne na Clínica IP numa QUINTA (o IP só abre
    quarta de manhã) — resquício do bug de dia-da-semana corrigido em 30/07.
    O app aceitou porque nunca houve validação. Esta função é o portão único:
    vale para o bot (agendamento público), para a secretária e para o médico.

    Se a clínica não tiver grade cadastrada, não bloqueia (não dá pra afirmar
    que ela não atende) — mas registra no log.
    """
    dow = quando.weekday()  # 0=Seg
    grade = [s for s in (clinic.schedules or []) if s.active]
    if not grade:
        logger.warning("Clínica %s sem grade cadastrada — trava de dia não aplicada", clinic.id)
        return

    do_dia = [s for s in grade if s.day_of_week == dow]
    if not do_dia:
        dias_ok = sorted({s.day_of_week for s in grade})
        nomes = ", ".join(DIAS_PT[d] for d in dias_ok) or "nenhum dia cadastrado"
        raise HTTPException(
            409,
            f"{clinic.name} não atende {DIAS_PT[dow]}-feira. "
            f"Dias de atendimento: {nomes}. Escolha outro dia ou outra unidade.",
        )

    # Hora fora de qualquer turno do dia (tolerância: bloqueia só se claramente fora)
    if start_time:
        dentro = any(
            (s.start_time or "00:00") <= start_time <= (s.end_time or "23:59")
            for s in do_dia
        )
        if not dentro:
            turnos = " · ".join(f"{s.start_time}–{s.end_time}" for s in do_dia)
            raise HTTPException(
                409,
                f"{clinic.name} não atende às {start_time} na {DIAS_PT[dow]}-feira. "
                f"Horário de atendimento: {turnos}.",
            )


def _add_minutes(time_str: str, minutes: int) -> str:
    h, m = map(int, time_str.split(":"))
    total = h * 60 + m + minutes
    return f"{total // 60:02d}:{total % 60:02d}"


def _generate_slots(start: str, end: str, duration: int, booked_times: set) -> list:
    slots = []
    current = start
    while True:
        nxt = _add_minutes(current, duration)
        if nxt > end:
            break
        slots.append({
            "time": current,
            "end_time": nxt,
            "available": current not in booked_times,
        })
        current = nxt
    return slots


def _walk_in_count(db: Session, clinic_id: int, appt_date: date, start_time: str) -> int:
    return db.query(Appointment).filter(
        Appointment.clinic_id == clinic_id,
        Appointment.date == appt_date,
        Appointment.start_time == start_time,
        Appointment.status.in_(["pending", "confirmed"]),
    ).count()


# ── Doctor endpoints ──────────────────────────────────────────────────────────

@router.get("/clinics", response_model=List[ClinicOut])
def list_clinics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Clinic).filter(Clinic.active == True)
    # Isolamento multi-cliente: cada conta só vê as próprias clínicas.
    # O superadmin da plataforma (dono do SaaS) enxerga todas.
    if current_user.role != "superadmin":
        q = q.filter(Clinic.organization_id == current_user.organization_id)
    return q.order_by(Clinic.name).all()


@router.post("/clinics", response_model=ClinicOut, status_code=201)
def create_clinic(
    data: ClinicCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria uma nova clínica (superadmin/admin)."""
    existing = db.query(Clinic).filter(Clinic.slug == data.slug).first()
    if existing:
        raise HTTPException(409, f"Já existe uma clínica com slug '{data.slug}'")
    clinic = Clinic(
        organization_id=current_user.organization_id,  # amarra a clínica à conta de quem cria
        name=data.name,
        slug=data.slug,
        city=data.city or "",
        state=data.state or "",
        address=data.address or "",
        color=data.color or "#0F2D5E",
        active=True,
    )
    db.add(clinic)
    db.commit()
    db.refresh(clinic)
    return clinic


def _clinic_da_conta(clinic_id: int, db: Session, current_user: User) -> Clinic:
    """Busca a clínica garantindo que pertence à conta do usuário (superadmin vê qualquer uma).
    Retorna 404 (não 403) quando é de outra conta, pra não revelar que ela existe."""
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")
    if current_user.role != "superadmin" and clinic.organization_id != current_user.organization_id:
        raise HTTPException(404, "Clínica não encontrada")
    return clinic


@router.get("/clinics/{clinic_id}", response_model=ClinicOut)
def get_clinic(
    clinic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _clinic_da_conta(clinic_id, db, current_user)


@router.put("/clinics/{clinic_id}", response_model=ClinicOut)
def update_clinic(
    clinic_id: int,
    data: ClinicUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    clinic = _clinic_da_conta(clinic_id, db, current_user)
    clinic.name = data.name
    clinic.slug = data.slug
    if data.city is not None:
        clinic.city = data.city
    if data.state is not None:
        clinic.state = data.state
    if data.address is not None:
        clinic.address = data.address
    if data.color is not None:
        clinic.color = data.color
    if data.phone is not None:
        clinic.phone = data.phone
    db.commit()
    db.refresh(clinic)
    return clinic


@router.put("/clinics/{clinic_id}/schedules/{schedule_id}", response_model=ScheduleOut)
def update_schedule(
    clinic_id: int,
    schedule_id: int,
    data: ScheduleUpdate,
    db: Session = Depends(get_db),
):
    sched = db.query(ClinicSchedule).filter(
        ClinicSchedule.id == schedule_id,
        ClinicSchedule.clinic_id == clinic_id,
    ).first()
    if not sched:
        raise HTTPException(404, "Horário não encontrado")
    if data.slot_duration is not None:
        sched.slot_duration = data.slot_duration
    if data.start_time is not None:
        sched.start_time = data.start_time
    if data.end_time is not None:
        sched.end_time = data.end_time
    if data.active is not None:
        sched.active = data.active
    db.commit()
    db.refresh(sched)
    return sched


@router.get("/clinics/{clinic_id}/appointments", response_model=List[AppointmentOut])
def list_appointments(
    clinic_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Garante que a clínica é da conta do usuário antes de expor os agendamentos (dado de paciente).
    _clinic_da_conta(clinic_id, db, current_user)
    q = db.query(Appointment).filter(Appointment.clinic_id == clinic_id)
    if date_from:
        q = q.filter(Appointment.date >= date_from)
    if date_to:
        q = q.filter(Appointment.date <= date_to)
    if status:
        q = q.filter(Appointment.status == status)
    return q.order_by(Appointment.date, Appointment.queue_number, Appointment.start_time).all()


@router.get("/appointments/week")
def appointments_week(
    start: Optional[date] = None,
    end: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = today_br()
    if start is None:
        dow = today.weekday()
        start = today - timedelta(days=dow)
    if end is None:
        end = start + timedelta(days=6)

    # Isolamento multi-cliente: a agenda mostra só as clínicas da conta (superadmin vê todas).
    clinics_q = db.query(Clinic).filter(Clinic.active == True)
    if current_user.role != "superadmin":
        clinics_q = clinics_q.filter(Clinic.organization_id == current_user.organization_id)
    clinics = clinics_q.all()
    clinic_ids = [c.id for c in clinics]
    appointments = (
        db.query(Appointment)
        .filter(Appointment.clinic_id.in_(clinic_ids))
        .filter(Appointment.date >= start, Appointment.date <= end)
        # Bloqueios (status=blocked) AGORA entram no feed — a agenda mostra a
        # faixa "Bloqueado" (férias/almoço, 02/08); só cancelados ficam de fora.
        .filter(Appointment.status != "cancelled")
        .order_by(Appointment.date, Appointment.queue_number, Appointment.start_time)
        .all()
    ) if clinic_ids else []

    result = []

    # Walk-in / clinic blocks per day
    current = start
    while current <= end:
        dow = current.weekday()
        for clinic in clinics:
            for sched in clinic.schedules:
                if sched.active and sched.day_of_week == dow:
                    count = _walk_in_count(db, clinic.id, current, sched.start_time) if sched.schedule_type == "walk_in" else 0
                    result.append({
                        "source": "walk_in_block" if sched.schedule_type == "walk_in" else "clinic_block",
                        "clinic_id": clinic.id,
                        "clinic_name": clinic.name,
                        "clinic_color": clinic.color,
                        "clinic_slug": clinic.slug,
                        "city": clinic.city,
                        "state": clinic.state,
                        "schedule_type": sched.schedule_type,
                        "date": current.isoformat(),
                        "start_time": sched.start_time,
                        "end_time": sched.end_time,
                        "walk_in_count": count,
                        "walk_in_max": MAX_WALK_IN,
                    })
        current += timedelta(days=1)

    # Individual appointments (timed + walk-in registrations)
    for a in appointments:
        clinic = next((c for c in clinics if c.id == a.clinic_id), None)
        sched = next((s for s in (clinic.schedules if clinic else []) if s.start_time == a.start_time), None)
        result.append({
            "source": "appointment",
            "id": a.id,
            "patient_id": a.patient_id,
            "clinic_id": a.clinic_id,
            "clinic_name": clinic.name if clinic else "",
            "clinic_color": clinic.color if clinic else "#888",
            "schedule_type": sched.schedule_type if sched else "appointment",
            "date": a.date.isoformat(),
            "start_time": a.start_time,
            "end_time": a.end_time,
            "patient_name": a.patient_name,
            "patient_phone": a.patient_phone,
            "reason": a.reason,
            "status": a.status,
            "queue_number": a.queue_number,
        })

    return result


@router.put("/appointments/{appointment_id}", response_model=AppointmentOut)
def update_appointment(appointment_id: int, data: StatusUpdate, db: Session = Depends(get_db)):
    a = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not a:
        raise HTTPException(404, "Agendamento não encontrado")
    a.status = data.status
    if data.notes:
        a.notes = data.notes
    db.commit()
    db.refresh(a)
    return a


@router.post("/appointments/{appointment_id}/checkin", status_code=201)
def checkin_from_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """E4 (05/08): "Chegou" — joga o paciente agendado direto na sala de espera,
    sem precisar buscá-lo de novo e redigitar tudo."""
    from models.queue import WaitingRoomEntry
    from models.patient import Patient as P
    from sqlalchemy import func as _f

    a = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not a:
        raise HTTPException(404, "Agendamento não encontrado")
    if not a.patient_id:
        raise HTTPException(422, "Agendamento sem paciente cadastrado — cadastre o paciente antes")

    paciente = db.query(P).filter(P.id == a.patient_id).first()
    if not paciente:
        raise HTTPException(404, "Paciente não encontrado")

    hoje = today_br()
    ja = (
        db.query(WaitingRoomEntry)
        .filter(
            WaitingRoomEntry.patient_id == a.patient_id,
            WaitingRoomEntry.entry_date == hoje,
            WaitingRoomEntry.status.in_(["waiting", "attending", "suspended"]),
        )
        .first()
    )
    if ja:
        raise HTTPException(409, "Paciente já está na fila")

    max_pos = (
        db.query(_f.max(WaitingRoomEntry.position))
        .filter(WaitingRoomEntry.entry_date == hoje)
        .scalar()
    ) or 0
    entry = WaitingRoomEntry(
        patient_id=a.patient_id,
        clinic_id=a.clinic_id,
        reason=a.reason,
        position=max_pos + 1,
        entry_date=hoje,
        arrived_at=datetime.utcnow(),
        status="waiting",
    )
    db.add(entry)
    a.status = "confirmed"  # chegou
    db.commit()
    db.refresh(entry)
    return {"ok": True, "entry_id": entry.id, "patient_name": paciente.name}


@router.delete("/appointments/{appointment_id}", status_code=204)
def delete_appointment(appointment_id: int, db: Session = Depends(get_db)):
    a = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not a:
        raise HTTPException(404, "Agendamento não encontrado")
    db.delete(a)
    db.commit()


@router.post("/clinics/{clinic_id}/block", response_model=AppointmentOut, status_code=201)
def block_slot(clinic_id: int, data: BookIn, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")
    sched = next((s for s in clinic.schedules if s.active), None)
    duration = sched.slot_duration if sched else 12
    start = data.start_time or (sched.start_time if sched else "08:00")
    end_time = _add_minutes(start, duration)
    a = Appointment(
        clinic_id=clinic_id,
        date=data.date,
        start_time=start,
        end_time=end_time,
        patient_name="[BLOQUEADO]",
        status="blocked",
        notes=data.reason,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


class BlockPeriodIn(BaseModel):
    start_date: date
    end_date: Optional[date] = None       # None = só o start_date
    start_time: Optional[str] = None      # None = dia todo (07:00)
    end_time: Optional[str] = None        # None = dia todo (19:00)
    reason: Optional[str] = None


@router.post("/clinics/{clinic_id}/block-period", status_code=201)
def block_period(clinic_id: int, data: BlockPeriodIn, db: Session = Depends(get_db)):
    """Bloqueia um PERÍODO na agenda (férias, almoço, congresso — 02/08).

    Cria um Appointment status=blocked por dia do intervalo. O agendamento
    público/bot já trata blocked como horário ocupado; a agenda mostra a faixa.
    """
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")
    end_date = data.end_date or data.start_date
    if end_date < data.start_date:
        raise HTTPException(422, "Data final antes da inicial")
    if (end_date - data.start_date).days > 90:
        raise HTTPException(422, "Bloqueio máximo de 90 dias por vez")
    start_t = data.start_time or "07:00"
    end_t = data.end_time or "19:00"
    if end_t <= start_t:
        raise HTTPException(422, "Horário final deve ser depois do inicial")

    created_ids = []
    d = data.start_date
    while d <= end_date:
        exists = db.query(Appointment).filter(
            Appointment.clinic_id == clinic_id,
            Appointment.date == d,
            Appointment.status == "blocked",
            Appointment.start_time == start_t,
            Appointment.end_time == end_t,
        ).first()
        if not exists:
            a = Appointment(
                clinic_id=clinic_id,
                date=d,
                start_time=start_t,
                end_time=end_t,
                patient_name="[BLOQUEADO]",
                status="blocked",
                reason=data.reason,  # o feed da agenda expõe 'reason' (motivo na faixa)
                notes=data.reason,
            )
            db.add(a)
            db.flush()
            created_ids.append(a.id)
        d = d + timedelta(days=1)
    db.commit()
    return {"created": len(created_ids), "ids": created_ids}


# ── PUBLIC endpoints ───────────────────────────────────────────────────────────

@public_router.get("/agendar/{slug}")
def get_clinic_public(slug: str, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.slug == slug, Clinic.active == True).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")
    active_schedules = [s for s in clinic.schedules if s.active]
    if not active_schedules:
        raise HTTPException(404, "Clínica sem horários ativos")
    return {
        "id": clinic.id,
        "name": clinic.name,
        "city": clinic.city,
        "state": clinic.state,
        "color": clinic.color,
        "schedules": [
            {
                "day_of_week": s.day_of_week,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "schedule_type": s.schedule_type,
                "slot_duration": s.slot_duration,
            }
            for s in active_schedules
        ],
    }


@public_router.get("/agendar/{slug}/slots")
def get_available_slots(slug: str, date_req: date, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.slug == slug, Clinic.active == True).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")

    dow = date_req.weekday()
    sched = next((s for s in clinic.schedules if s.active and s.day_of_week == dow), None)
    if not sched:
        return {"available": False, "message": "Sem atendimento neste dia", "schedule_type": None}

    if date_req < today_br():
        return {"available": False, "message": "Data no passado", "schedule_type": sched.schedule_type}

    # ── Walk-in: return spot count ────────────────────────────────────────────
    if sched.schedule_type == "walk_in":
        count = _walk_in_count(db, clinic.id, date_req, sched.start_time)
        return {
            "schedule_type": "walk_in",
            "available": count < MAX_WALK_IN,
            "booked_count": count,
            "max_patients": MAX_WALK_IN,
            "available_spots": max(0, MAX_WALK_IN - count),
            "start_time": sched.start_time,
            "end_time": sched.end_time,
            "message": "Vagas esgotadas para este turno" if count >= MAX_WALK_IN else None,
        }

    # ── Appointment: return time slots ────────────────────────────────────────
    now = datetime.now()
    existing = db.query(Appointment).filter(
        Appointment.clinic_id == clinic.id,
        Appointment.date == date_req,
        Appointment.status.in_(["pending", "confirmed", "blocked"]),
    ).all()
    booked = {a.start_time for a in existing}

    if date_req == now.date():
        current_total = now.hour * 60 + now.minute + 60
        h, m = map(int, sched.start_time.split(":"))
        t = h * 60 + m
        while t < current_total:
            booked.add(f"{t // 60:02d}:{t % 60:02d}")
            t += sched.slot_duration

    slots = _generate_slots(sched.start_time, sched.end_time, sched.slot_duration, booked)
    available_count = sum(1 for s in slots if s["available"])

    return {
        "schedule_type": "appointment",
        "available": available_count > 0,
        "total_slots": len(slots),
        "available_count": available_count,
        "slots": slots,
    }


@public_router.post("/agendar/{slug}/book", response_model=AppointmentOut, status_code=201)
def book_slot(slug: str, data: BookIn, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.slug == slug, Clinic.active == True).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")

    # TRAVA 2/3 (05/08): mesma regra vale para o BOT — foi por aqui que entrou o
    # agendamento da Rayanne no IP numa quinta.
    assert_clinica_atende(db, clinic, data.date, data.start_time)

    dow = data.date.weekday()
    sched = next((s for s in clinic.schedules if s.active and s.day_of_week == dow), None)
    if not sched:
        raise HTTPException(400, "Sem atendimento neste dia")

    if data.date < today_br():
        raise HTTPException(400, "Data no passado")

    # TRAVA extra: o mesmo paciente não pode ficar com 2 marcações no mesmo dia
    # (caso Vyctor: IP de manhã + Unimagem à tarde, marcado pelo bot).
    if data.patient_name:
        dupl = (
            db.query(Appointment)
            .filter(
                Appointment.date == data.date,
                Appointment.patient_name.ilike(data.patient_name.strip()),
                Appointment.status.notin_(["cancelled", "blocked", "no_show"]),
            )
            .first()
        )
        if dupl:
            raise HTTPException(
                409,
                f"{data.patient_name} já tem agendamento neste dia às {dupl.start_time}. "
                "Cancele o anterior antes de marcar outro.",
            )

    token = secrets.token_urlsafe(32)

    # ── Walk-in booking ───────────────────────────────────────────────────────
    if sched.schedule_type == "walk_in":
        count = _walk_in_count(db, clinic.id, data.date, sched.start_time)
        if count >= MAX_WALK_IN:
            raise HTTPException(400, f"Vagas esgotadas — limite de {MAX_WALK_IN} pacientes atingido")
        queue_number = count + 1
        a = Appointment(
            clinic_id=clinic.id,
            date=data.date,
            start_time=sched.start_time,
            end_time=sched.end_time,
            patient_name=data.patient_name,
            patient_phone=data.patient_phone,
            reason=data.reason,
            status="pending",
            queue_number=queue_number,
            confirmation_token=token,
        )
        db.add(a)
        db.commit()
        db.refresh(a)
        _try_send_booking_wa(a, clinic, sched.schedule_type)
        return a

    # ── Timed appointment ─────────────────────────────────────────────────────
    if not data.start_time:
        raise HTTPException(400, "Horário obrigatório para agendamento")

    conflict = db.query(Appointment).filter(
        Appointment.clinic_id == clinic.id,
        Appointment.date == data.date,
        Appointment.start_time == data.start_time,
        Appointment.status.in_(["pending", "confirmed", "blocked"]),
    ).first()
    if conflict:
        raise HTTPException(409, "Horário já ocupado")

    end_time = _add_minutes(data.start_time, sched.slot_duration)
    a = Appointment(
        clinic_id=clinic.id,
        date=data.date,
        start_time=data.start_time,
        end_time=end_time,
        patient_name=data.patient_name,
        patient_phone=data.patient_phone,
        reason=data.reason,
        status="pending",
        confirmation_token=token,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    _try_send_booking_wa(a, clinic, sched.schedule_type)
    return a


# ── WhatsApp helper ───────────────────────────────────────────────────────────

def _try_send_booking_wa(appt: Appointment, clinic: Clinic, schedule_type: str):
    """Envia mensagem de confirmação via WhatsApp após agendamento."""
    if not appt.patient_phone:
        return
    msg = build_booking_message(
        patient_name=appt.patient_name,
        clinic_name=clinic.name,
        clinic_city=clinic.city or "",
        appt_date=appt.date,
        start_time=appt.start_time,
        end_time=appt.end_time,
        confirmation_token=appt.confirmation_token,
        queue_number=appt.queue_number,
        schedule_type=schedule_type,
    )
    send_whatsapp(appt.patient_phone, msg, clinic.whatsapp_instance)


# ── Confirmation endpoints (PUBLIC) ───────────────────────────────────────────

class ConfirmationOut(BaseModel):
    id: int
    clinic_name: str
    clinic_city: str
    clinic_color: str
    date: date
    start_time: str
    end_time: str
    patient_name: str
    queue_number: int | None
    schedule_type: str
    status: str
    model_config = {"from_attributes": True}


class ConfirmAction(BaseModel):
    action: str  # "confirm" | "cancel"


@public_router.get("/confirmar/{token}", response_model=ConfirmationOut)
def get_confirmation(token: str, db: Session = Depends(get_db)):
    a = db.query(Appointment).filter(Appointment.confirmation_token == token).first()
    if not a:
        raise HTTPException(404, "Link inválido ou expirado")
    clinic = db.query(Clinic).filter(Clinic.id == a.clinic_id).first()
    sched = next((s for s in clinic.schedules if s.start_time == a.start_time), None) if clinic else None
    return {
        "id": a.id,
        "clinic_name": clinic.name if clinic else "",
        "clinic_city": clinic.city if clinic else "",
        "clinic_color": clinic.color if clinic else "#0F2D5E",
        "date": a.date,
        "start_time": a.start_time,
        "end_time": a.end_time,
        "patient_name": a.patient_name,
        "queue_number": a.queue_number,
        "schedule_type": sched.schedule_type if sched else "appointment",
        "status": a.status,
    }


@public_router.post("/confirmar/{token}", response_model=ConfirmationOut)
def confirm_appointment(token: str, data: ConfirmAction, db: Session = Depends(get_db)):
    a = db.query(Appointment).filter(Appointment.confirmation_token == token).first()
    if not a:
        raise HTTPException(404, "Link inválido ou expirado")
    if a.status in ("completed", "blocked"):
        raise HTTPException(400, "Este agendamento não pode ser alterado")
    if data.action == "confirm":
        a.status = "confirmed"
    elif data.action == "cancel":
        a.status = "cancelled"
    else:
        raise HTTPException(400, "Ação inválida. Use 'confirm' ou 'cancel'")
    db.commit()
    db.refresh(a)
    clinic = db.query(Clinic).filter(Clinic.id == a.clinic_id).first()
    sched = next((s for s in clinic.schedules if s.start_time == a.start_time), None) if clinic else None
    return {
        "id": a.id,
        "clinic_name": clinic.name if clinic else "",
        "clinic_city": clinic.city if clinic else "",
        "clinic_color": clinic.color if clinic else "#0F2D5E",
        "date": a.date,
        "start_time": a.start_time,
        "end_time": a.end_time,
        "patient_name": a.patient_name,
        "queue_number": a.queue_number,
        "schedule_type": sched.schedule_type if sched else "appointment",
        "status": a.status,
    }


# ── Sprint 6: Internal appointment management ──────────────────────────────────

class AppointmentCreateIn(BaseModel):
    clinic_id: int
    date: date
    start_time: Optional[str] = None
    patient_name: str
    patient_phone: Optional[str] = None
    patient_id: Optional[int] = None
    reason: Optional[str] = None
    appointment_type: Optional[str] = "consulta"   # consulta | retorno | procedimento | urgencia | teleconsulta
    notes: Optional[str] = None


class AppointmentUpdateIn(BaseModel):
    date: Optional[date] = None
    start_time: Optional[str] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    patient_id: Optional[int] = None
    reason: Optional[str] = None
    appointment_type: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class AppointmentDetailOut(BaseModel):
    id: int
    clinic_id: int
    clinic_name: str
    clinic_color: str
    date: date
    start_time: str
    end_time: str
    patient_name: str
    patient_phone: Optional[str] = None
    patient_id: Optional[int] = None
    reason: Optional[str] = None
    appointment_type: Optional[str] = None
    status: str
    queue_number: Optional[int] = None
    notes: Optional[str] = None
    confirmation_token: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class ConflictCheckIn(BaseModel):
    clinic_id: int
    date: date
    start_time: str
    exclude_id: Optional[int] = None


class DoctorAvailabilityOut(BaseModel):
    date: str
    available: bool
    slots: list
    booked_count: int
    schedule_type: str


class PatientSearchOut(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    cpf: Optional[str] = None
    model_config = {"from_attributes": True}


# ── Patient autocomplete search ───────────────────────────────────────────────

@router.get("/appointments/patients/search", response_model=List[PatientSearchOut])
def search_patients_for_appointment(
    q: str = Query(..., min_length=2),
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Autocomplete de pacientes para o formulário de agendamento."""
    term = f"%{q}%"
    query = db.query(Patient).filter(
        Patient.active == True,
        or_(
            Patient.name.ilike(term),
            Patient.cpf.ilike(term),
            Patient.phone.ilike(term),
        )
    )
    if current_user.role != "superadmin":
        query = query.filter(Patient.organization_id == current_user.organization_id)
    patients = query.order_by(Patient.name).limit(limit).all()
    return [
        PatientSearchOut(id=p.id, name=p.name, phone=p.phone, cpf=p.cpf)
        for p in patients
    ]


# ── Conflict detection ─────────────────────────────────────────────────────────

@router.post("/appointments/check-conflict")
def check_conflict(data: ConflictCheckIn, db: Session = Depends(get_db)):
    """Verifica se existe conflito de horário antes de criar/editar agendamento."""
    q = db.query(Appointment).filter(
        Appointment.clinic_id == data.clinic_id,
        Appointment.date == data.date,
        Appointment.start_time == data.start_time,
        Appointment.status.in_(["pending", "confirmed", "blocked"]),
    )
    if data.exclude_id:
        q = q.filter(Appointment.id != data.exclude_id)
    conflict = q.first()
    if conflict:
        return {
            "conflict": True,
            "appointment_id": conflict.id,
            "patient_name": conflict.patient_name,
            "status": conflict.status,
        }
    return {"conflict": False}


# ── Doctor availability for a date range ──────────────────────────────────────

@router.get("/appointments/availability")
def get_doctor_availability(
    clinic_id: int,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
):
    """Disponibilidade do médico por dia — usado pelo calendário."""
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")

    result = []
    current = date_from
    today = today_br()
    while current <= date_to:
        dow = current.weekday()
        sched = next((s for s in clinic.schedules if s.active and s.day_of_week == dow), None)
        if not sched:
            result.append({"date": current.isoformat(), "available": False, "slots": [], "booked_count": 0, "schedule_type": "none"})
            current += timedelta(days=1)
            continue

        existing = db.query(Appointment).filter(
            Appointment.clinic_id == clinic_id,
            Appointment.date == current,
            Appointment.status.in_(["pending", "confirmed", "blocked"]),
        ).all()
        booked_times = {a.start_time for a in existing}

        if sched.schedule_type == "walk_in":
            count = len([a for a in existing if a.start_time == sched.start_time])
            result.append({
                "date": current.isoformat(),
                "available": count < MAX_WALK_IN and current >= today,
                "slots": [],
                "booked_count": count,
                "schedule_type": "walk_in",
                "start_time": sched.start_time,
                "end_time": sched.end_time,
            })
        else:
            slots = _generate_slots(sched.start_time, sched.end_time, sched.slot_duration, booked_times)
            avail = sum(1 for s in slots if s["available"])
            result.append({
                "date": current.isoformat(),
                "available": avail > 0 and current >= today,
                "slots": slots,
                "booked_count": len(booked_times),
                "schedule_type": "appointment",
                "start_time": sched.start_time,
                "end_time": sched.end_time,
            })
        current += timedelta(days=1)
    return result


# ── Create appointment (internal, by doctor/secretary) ────────────────────────

@router.post("/appointments", response_model=AppointmentDetailOut, status_code=201)
def create_appointment_internal(
    data: AppointmentCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria agendamento interno (pelo médico ou secretária)."""
    clinic = db.query(Clinic).filter(Clinic.id == data.clinic_id).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")

    # TRAVA 1/3 (05/08): clínica precisa atender neste dia/hora (caso Rayanne)
    assert_clinica_atende(db, clinic, data.date, data.start_time)

    dow = data.date.weekday()
    sched = next((s for s in clinic.schedules if s.active and s.day_of_week == dow), None)

    # E7a (05/08): o MESMO paciente não pode ter duas marcações no mesmo dia —
    # caso real: Vyctor ficou marcado no IP de manhã e na Unimagem à tarde.
    if data.patient_id:
        dupl = (
            db.query(Appointment)
            .join(Clinic, Clinic.id == Appointment.clinic_id)
            .filter(
                Appointment.patient_id == data.patient_id,
                Appointment.date == data.date,
                Appointment.status.notin_(["cancelled", "blocked", "no_show"]),
            )
            .first()
        )
        if dupl:
            outra = db.query(Clinic).filter(Clinic.id == dupl.clinic_id).first()
            raise HTTPException(
                409,
                f"{dupl.patient_name} já tem agendamento neste dia"
                + (f" na {outra.name}" if outra else "")
                + f" às {dupl.start_time}. Cancele o outro antes de remarcar.",
            )

    # Conflict check for timed appointments
    if data.start_time and sched and sched.schedule_type == "appointment":
        conflict = db.query(Appointment).filter(
            Appointment.clinic_id == data.clinic_id,
            Appointment.date == data.date,
            Appointment.start_time == data.start_time,
            Appointment.status.in_(["pending", "confirmed", "blocked"]),
        ).first()
        if conflict:
            raise HTTPException(409, f"Horário {data.start_time} já ocupado por {conflict.patient_name}")

    duration = sched.slot_duration if sched else 30
    start = data.start_time or (sched.start_time if sched else "08:00")
    end_time = _add_minutes(start, duration)
    token = secrets.token_urlsafe(32)

    # Walk-in queue number
    queue_number = None
    if sched and sched.schedule_type == "walk_in":
        count = _walk_in_count(db, clinic.id, data.date, sched.start_time)
        if count >= MAX_WALK_IN:
            raise HTTPException(400, f"Vagas esgotadas — limite de {MAX_WALK_IN} atingido")
        queue_number = count + 1

    a = Appointment(
        clinic_id=data.clinic_id,
        date=data.date,
        start_time=start,
        end_time=end_time,
        patient_name=data.patient_name,
        patient_phone=data.patient_phone,
        patient_id=data.patient_id,
        reason=data.reason,
        notes=data.notes,
        status="confirmed",   # interno → já confirmado
        queue_number=queue_number,
        confirmation_token=token,
    )
    db.add(a)
    db.commit()
    db.refresh(a)

    return AppointmentDetailOut(
        id=a.id,
        clinic_id=clinic.id,
        clinic_name=clinic.name,
        clinic_color=clinic.color,
        date=a.date,
        start_time=a.start_time,
        end_time=a.end_time,
        patient_name=a.patient_name,
        patient_phone=a.patient_phone,
        patient_id=a.patient_id,
        reason=a.reason,
        appointment_type=data.appointment_type,
        status=a.status,
        queue_number=a.queue_number,
        notes=a.notes,
        confirmation_token=a.confirmation_token,
        created_at=a.created_at,
    )


# ── Edit appointment (internal) ────────────────────────────────────────────────

@router.patch("/appointments/{appointment_id}", response_model=AppointmentDetailOut)
def edit_appointment(
    appointment_id: int,
    data: AppointmentUpdateIn,
    db: Session = Depends(get_db),
):
    a = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not a:
        raise HTTPException(404, "Agendamento não encontrado")
    if a.status in ("completed", "blocked"):
        raise HTTPException(400, "Agendamento não pode ser editado")

    # Conflict check if changing time
    new_date = data.date or a.date
    new_time = data.start_time or a.start_time

    # TRAVA 3/3 (05/08): REMARCAR também não pode cair em dia/hora que a clínica
    # não atende — senão o erro entra pela porta dos fundos.
    if data.date or data.start_time:
        cl = db.query(Clinic).filter(Clinic.id == a.clinic_id).first()
        if cl:
            assert_clinica_atende(db, cl, new_date, new_time)

    if (data.date or data.start_time) and new_time:
        conflict = db.query(Appointment).filter(
            Appointment.clinic_id == a.clinic_id,
            Appointment.date == new_date,
            Appointment.start_time == new_time,
            Appointment.status.in_(["pending", "confirmed", "blocked"]),
            Appointment.id != appointment_id,
        ).first()
        if conflict:
            raise HTTPException(409, f"Horário {new_time} já ocupado por {conflict.patient_name}")

    for field, value in data.model_dump(exclude_none=True).items():
        if hasattr(a, field):
            setattr(a, field, value)

    # Recalculate end_time if start changed
    if data.start_time:
        clinic = db.query(Clinic).filter(Clinic.id == a.clinic_id).first()
        sched = next((s for s in (clinic.schedules if clinic else []) if s.active), None)
        duration = sched.slot_duration if sched else 30
        a.end_time = _add_minutes(a.start_time, duration)

    db.commit()
    db.refresh(a)
    clinic = db.query(Clinic).filter(Clinic.id == a.clinic_id).first()
    return AppointmentDetailOut(
        id=a.id,
        clinic_id=a.clinic_id,
        clinic_name=clinic.name if clinic else "",
        clinic_color=clinic.color if clinic else "#0F2D5E",
        date=a.date,
        start_time=a.start_time,
        end_time=a.end_time,
        patient_name=a.patient_name,
        patient_phone=a.patient_phone,
        patient_id=a.patient_id,
        reason=a.reason,
        appointment_type=None,
        status=a.status,
        queue_number=a.queue_number,
        notes=a.notes,
        confirmation_token=a.confirmation_token,
        created_at=a.created_at,
    )


# ── Cancel appointment ─────────────────────────────────────────────────────────

@router.post("/appointments/{appointment_id}/cancel")
def cancel_appointment(
    appointment_id: int,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
):
    a = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not a:
        raise HTTPException(404, "Agendamento não encontrado")
    if a.status in ("completed", "blocked", "cancelled"):
        raise HTTPException(400, f"Agendamento já está {a.status}")
    a.status = "cancelled"
    if reason:
        a.notes = (a.notes or "") + f"\n[Cancelado: {reason}]"
    db.commit()
    return {"ok": True, "id": appointment_id, "status": "cancelled"}


# ── Notification scheduling endpoint ──────────────────────────────────────────

class ReminderIn(BaseModel):
    appointment_id: int
    remind_hours_before: int = 24   # quantas horas antes enviar


@router.post("/appointments/schedule-reminder")
def schedule_reminder(
    data: ReminderIn,
    db: Session = Depends(get_db),
):
    """
    Registra agendamento de lembrete por WhatsApp.
    O envio real acontece via worker/cron que chama send_whatsapp
    na hora certa. Aqui apenas valida e retorna metadados para
    o cliente enfileirar localmente (Notification API / Service Worker).
    """
    a = db.query(Appointment).filter(Appointment.id == data.appointment_id).first()
    if not a:
        raise HTTPException(404, "Agendamento não encontrado")
    if a.status == "cancelled":
        raise HTTPException(400, "Agendamento cancelado — não faz sentido lembrar")

    # Calcular timestamp do lembrete
    appt_dt = datetime.combine(a.date, datetime.strptime(a.start_time, "%H:%M").time())
    remind_at = appt_dt - timedelta(hours=data.remind_hours_before)

    return {
        "ok": True,
        "appointment_id": a.id,
        "patient_name": a.patient_name,
        "patient_phone": a.patient_phone,
        "remind_at": remind_at.isoformat(),
        "remind_hours_before": data.remind_hours_before,
        "appt_datetime": appt_dt.isoformat(),
    }
