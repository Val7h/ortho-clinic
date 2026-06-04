from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timedelta
from pydantic import BaseModel
import secrets
from database import get_db
from models.clinic import Clinic, ClinicSchedule, Appointment
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
