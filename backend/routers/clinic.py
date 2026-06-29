from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import date, datetime, timedelta
from pydantic import BaseModel
import secrets
from database import get_db
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
def list_clinics(db: Session = Depends(get_db)):
    return db.query(Clinic).filter(Clinic.active == True).order_by(Clinic.name).all()


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


@router.get("/clinics/{clinic_id}", response_model=ClinicOut)
def get_clinic(clinic_id: int, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")
    return clinic


@router.put("/clinics/{clinic_id}", response_model=ClinicOut)
def update_clinic(
    clinic_id: int,
    data: ClinicUpdate,
    db: Session = Depends(get_db),
):
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")
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
):
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")
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
):
    today = date.today()
    if start is None:
        dow = today.weekday()
        start = today - timedelta(days=dow)
    if end is None:
        end = start + timedelta(days=6)

    clinics = db.query(Clinic).filter(Clinic.active == True).all()
    appointments = (
        db.query(Appointment)
        .filter(Appointment.date >= start, Appointment.date <= end)
        .filter(Appointment.status.notin_(["cancelled", "blocked"]))
        .order_by(Appointment.date, Appointment.queue_number, Appointment.start_time)
        .all()
    )

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

    if date_req < date.today():
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

    dow = data.date.weekday()
    sched = next((s for s in clinic.schedules if s.active and s.day_of_week == dow), None)
    if not sched:
        raise HTTPException(400, "Sem atendimento neste dia")

    if data.date < date.today():
        raise HTTPException(400, "Data no passado")

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
    today = date.today()
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

    dow = data.date.weekday()
    sched = next((s for s in clinic.schedules if s.active and s.day_of_week == dow), None)

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
