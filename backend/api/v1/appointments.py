"""
GET  /api/v1/appointments           — list with date range + cursor pagination
POST /api/v1/appointments           — create appointment with conflict detection
GET  /api/v1/availability           — available booking slots for a doctor
"""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from api.v1.auth import AuthContext, require_scope
from api.v1.errors import err_conflict, err_not_found, err_validation
from api.v1.schemas import (
    AppointmentCreate,
    AppointmentOut,
    AvailabilityResponse,
    AvailabilitySlot,
    CursorPage,
)
from database import get_db
from models.consultation import Consultation
from models.patient import Patient

router = APIRouter(tags=["Public API — Appointments"])

DEFAULT_SLOT_DURATION_MINUTES = 30
DEFAULT_WORKING_HOURS = (8, 18)  # 08:00 – 18:00


# ---------------------------------------------------------------------------
# Cursor helpers
# ---------------------------------------------------------------------------

def _encode_cursor(record_id: int) -> str:
    return base64.b64encode(f"appt:{record_id}".encode()).decode()


def _decode_cursor(cursor: str) -> Optional[int]:
    try:
        decoded = base64.b64decode(cursor.encode()).decode()
        _, pk = decoded.split(":", 1)
        return int(pk)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# GET /api/v1/appointments
# ---------------------------------------------------------------------------

@router.get(
    "/api/v1/appointments",
    response_model=CursorPage[AppointmentOut],
    summary="List appointments",
    description=(
        "List appointments with optional date range filter and cursor pagination. "
        "Requires scope `appointments:read`."
    ),
)
async def list_appointments(
    request:    Request,
    date_from:  Optional[datetime] = Query(None, description="Start of date range (ISO-8601)"),
    date_to:    Optional[datetime] = Query(None, description="End of date range (ISO-8601)"),
    patient_id: Optional[int]      = Query(None),
    status:     Optional[str]      = Query(None, description="Filter by status"),
    type:       Optional[str]      = Query(None, alias="type", description="Filter by consultation type"),
    limit:      int                = Query(20, ge=1, le=100),
    cursor:     Optional[str]      = Query(None),
    expand:     Optional[str]      = Query(None, description="Comma-separated: patient"),
    ctx:        AuthContext        = Depends(require_scope("appointments:read")),
    db:         Session            = Depends(get_db),
) -> CursorPage[AppointmentOut]:

    # Validate date range
    if date_from and date_to and date_from > date_to:
        return err_validation(request, "date_from must be before date_to", field="date_from")

    q = db.query(Consultation)

    if date_from:
        q = q.filter(Consultation.date >= date_from)
    if date_to:
        q = q.filter(Consultation.date <= date_to)
    if patient_id:
        q = q.filter(Consultation.patient_id == patient_id)
    if type:
        q = q.filter(Consultation.type == type)

    if cursor:
        cursor_id = _decode_cursor(cursor)
        if cursor_id is None:
            return err_validation(request, "Invalid cursor value", field="cursor")
        q = q.filter(Consultation.id > cursor_id)

    q = q.order_by(Consultation.id.asc())
    rows = q.limit(limit + 1).all()
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    expand_set = set(e.strip() for e in (expand or "").split(",") if e.strip())

    def _to_out(c: Consultation) -> AppointmentOut:
        patient_obj = None
        if "patient" in expand_set and c.patient:
            from api.v1.schemas import PatientSummary
            patient_obj = PatientSummary.model_validate(c.patient)

        return AppointmentOut(
            id=c.id,
            patient_id=c.patient_id,
            scheduled_at=c.date,
            type=c.type or "retorno",
            status="scheduled",
            notes=c.next_appointment_notes,
            chief_complaint=c.chief_complaint,
            created_at=c.created_at,
            updated_at=c.updated_at,
            patient=patient_obj,
        )

    data = [_to_out(c) for c in rows]
    next_cursor = _encode_cursor(rows[-1].id) if has_more else None

    return CursorPage[AppointmentOut](
        data=data,
        has_more=has_more,
        next_cursor=next_cursor,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/appointments
# ---------------------------------------------------------------------------

@router.post(
    "/api/v1/appointments",
    response_model=AppointmentOut,
    status_code=201,
    summary="Create appointment",
    description=(
        "Create a new appointment. Validates that the requested slot is not "
        "already occupied (conflict check). Requires scope `appointments:write`."
    ),
)
async def create_appointment(
    request: Request,
    body:    AppointmentCreate,
    ctx:     AuthContext        = Depends(require_scope("appointments:write")),
    db:      Session            = Depends(get_db),
) -> AppointmentOut:

    # Patient must exist
    patient = db.query(Patient).filter(Patient.id == body.patient_id).first()
    if not patient:
        return err_not_found(request, "Patient", body.patient_id)

    # Conflict check: same patient, overlapping 30-min window
    slot_end = body.scheduled_at + timedelta(minutes=DEFAULT_SLOT_DURATION_MINUTES)
    conflict = (
        db.query(Consultation)
        .filter(
            Consultation.patient_id == body.patient_id,
            # Existing appt starts before our slot ends AND ends after our slot starts
            Consultation.date < slot_end,
            Consultation.date >= (body.scheduled_at - timedelta(minutes=DEFAULT_SLOT_DURATION_MINUTES)),
        )
        .first()
    )
    if conflict:
        return err_conflict(
            request,
            f"Patient {body.patient_id} already has an appointment at "
            f"{conflict.date.isoformat()} that conflicts with the requested slot.",
        )

    consultation = Consultation(
        patient_id=body.patient_id,
        date=body.scheduled_at,
        type=body.type,
        chief_complaint=body.chief_complaint,
        next_appointment_notes=body.notes,
        created_at=datetime.now(timezone.utc),
    )
    db.add(consultation)
    db.commit()
    db.refresh(consultation)

    return AppointmentOut(
        id=consultation.id,
        patient_id=consultation.patient_id,
        scheduled_at=consultation.date,
        type=consultation.type or "retorno",
        status="scheduled",
        notes=consultation.next_appointment_notes,
        chief_complaint=consultation.chief_complaint,
        created_at=consultation.created_at,
        updated_at=consultation.updated_at,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/availability
# ---------------------------------------------------------------------------

@router.get(
    "/api/v1/availability",
    response_model=AvailabilityResponse,
    summary="Get doctor availability",
    description=(
        "Return available time slots for a doctor within a date range. "
        "Slots are 30 minutes each, working hours 08:00-18:00. "
        "Requires scope `appointments:read`."
    ),
)
async def get_availability(
    request:   Request,
    doctor_id: int                = Query(..., description="Doctor user ID"),
    date_from: datetime           = Query(..., description="Start of range (ISO-8601)"),
    date_to:   datetime           = Query(..., description="End of range, max 7 days ahead"),
    clinic_id: Optional[int]      = Query(None),
    ctx:       AuthContext        = Depends(require_scope("appointments:read")),
    db:        Session            = Depends(get_db),
) -> AvailabilityResponse:

    # Clamp range to 7 days
    max_to = date_from + timedelta(days=7)
    if date_to > max_to:
        date_to = max_to

    if date_from >= date_to:
        return err_validation(request, "date_from must be before date_to", field="date_from")

    # Fetch existing bookings in range
    booked = (
        db.query(Consultation.date)
        .filter(
            Consultation.date >= date_from,
            Consultation.date < date_to,
        )
        .all()
    )
    booked_starts = {r.date.replace(second=0, microsecond=0) for r in booked}

    # Generate 30-min slots
    slots: List[AvailabilitySlot] = []
    cursor = date_from.replace(minute=0, second=0, microsecond=0)
    work_start, work_end = DEFAULT_WORKING_HOURS

    while cursor < date_to:
        if work_start <= cursor.hour < work_end:
            slot_end = cursor + timedelta(minutes=DEFAULT_SLOT_DURATION_MINUTES)
            is_available = cursor not in booked_starts
            slots.append(
                AvailabilitySlot(
                    starts_at=cursor,
                    ends_at=slot_end,
                    doctor_id=doctor_id,
                    clinic_id=clinic_id,
                    available=is_available,
                )
            )
        cursor += timedelta(minutes=DEFAULT_SLOT_DURATION_MINUTES)

    return AvailabilityResponse(
        doctor_id=doctor_id,
        date_from=date_from,
        date_to=date_to,
        slots=slots,
    )
