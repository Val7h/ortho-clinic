from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timedelta
from pydantic import BaseModel
from database import get_db
from models.clinic import Clinic, ClinicSchedule, Appointment

router = APIRouter(tags=["Clínicas"])
public_router = APIRouter(tags=["Agendamento Público"])


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
    notes: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class BookIn(BaseModel):
    date: date
    start_time: str
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
    return q.order_by(Appointment.date, Appointment.start_time).all()


@router.get("/appointments/week")
def appointments_week(
    start: Optional[date] = None,
    end: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Returns all appointments + clinic walk-in blocks for agenda view."""
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
        .filter(Appointment.status != "cancelled")
        .order_by(Appointment.date, Appointment.start_time)
        .all()
    )

    result = []

    # Walk-in blocks: generate one block per clinic per working day in range
    current = start
    while current <= end:
        dow = current.weekday()
        for clinic in clinics:
            for sched in clinic.schedules:
                if sched.active and sched.day_of_week == dow:
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
                    })
        current += timedelta(days=1)

    # Individual appointments
    for a in appointments:
        clinic = next((c for c in clinics if c.id == a.clinic_id), None)
        result.append({
            "source": "appointment",
            "id": a.id,
            "clinic_id": a.clinic_id,
            "clinic_name": clinic.name if clinic else "",
            "clinic_color": clinic.color if clinic else "#888",
            "date": a.date.isoformat(),
            "start_time": a.start_time,
            "end_time": a.end_time,
            "patient_name": a.patient_name,
            "patient_phone": a.patient_phone,
            "reason": a.reason,
            "status": a.status,
        })

    return result


@router.put("/appointments/{appointment_id}", response_model=AppointmentOut)
def update_appointment(
    appointment_id: int,
    data: StatusUpdate,
    db: Session = Depends(get_db),
):
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


# ── Block a slot (doctor) ─────────────────────────────────────────────────────
@router.post("/clinics/{clinic_id}/block", response_model=AppointmentOut, status_code=201)
def block_slot(clinic_id: int, data: BookIn, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")
    sched = next((s for s in clinic.schedules if s.active), None)
    duration = sched.slot_duration if sched else 12
    end_time = _add_minutes(data.start_time, duration)
    a = Appointment(
        clinic_id=clinic_id,
        date=data.date,
        start_time=data.start_time,
        end_time=end_time,
        patient_name="[BLOQUEADO]",
        status="blocked",
        notes=data.reason,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


# ── PUBLIC endpoints (patient booking) ────────────────────────────────────────

@public_router.get("/agendar/{slug}")
def get_clinic_public(slug: str, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.slug == slug, Clinic.active == True).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")
    appt_schedules = [s for s in clinic.schedules if s.active and s.schedule_type == "appointment"]
    if not appt_schedules:
        raise HTTPException(404, "Esta clínica não aceita agendamento online")
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
                "slot_duration": s.slot_duration,
            }
            for s in appt_schedules
        ],
    }


@public_router.get("/agendar/{slug}/slots")
def get_available_slots(slug: str, date_req: date, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.slug == slug, Clinic.active == True).first()
    if not clinic:
        raise HTTPException(404, "Clínica não encontrada")

    dow = date_req.weekday()
    sched = next(
        (s for s in clinic.schedules if s.active and s.day_of_week == dow and s.schedule_type == "appointment"),
        None,
    )
    if not sched:
        return {"available": False, "message": "Sem atendimento neste dia", "slots": []}

    # Can't book in the past
    now = datetime.now()
    if date_req < now.date():
        return {"available": False, "message": "Data no passado", "slots": []}

    # Booked / blocked slots
    existing = (
        db.query(Appointment)
        .filter(
            Appointment.clinic_id == clinic.id,
            Appointment.date == date_req,
            Appointment.status.in_(["pending", "confirmed", "blocked"]),
        )
        .all()
    )
    booked = {a.start_time for a in existing}

    # If booking for today, block past slots
    if date_req == now.date():
        current_h, current_m = now.hour, now.minute
        current_total = current_h * 60 + current_m + 60  # 1h antecedência
        h, m = map(int, sched.start_time.split(":"))
        t = h * 60 + m
        while t < current_total:
            booked.add(f"{t // 60:02d}:{t % 60:02d}")
            t += sched.slot_duration

    slots = _generate_slots(sched.start_time, sched.end_time, sched.slot_duration, booked)
    available_count = sum(1 for s in slots if s["available"])

    return {
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
    sched = next(
        (s for s in clinic.schedules if s.active and s.day_of_week == dow and s.schedule_type == "appointment"),
        None,
    )
    if not sched:
        raise HTTPException(400, "Sem atendimento neste dia")

    if data.date < date.today():
        raise HTTPException(400, "Data no passado")

    # Check conflict
    conflict = (
        db.query(Appointment)
        .filter(
            Appointment.clinic_id == clinic.id,
            Appointment.date == data.date,
            Appointment.start_time == data.start_time,
            Appointment.status.in_(["pending", "confirmed", "blocked"]),
        )
        .first()
    )
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
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a
