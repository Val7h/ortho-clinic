"""
GET  /api/v1/patients        — list with cursor pagination
POST /api/v1/patients        — create patient
GET  /api/v1/patients/{id}   — get single patient
"""

from __future__ import annotations

import base64
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from api.v1.auth import AuthContext, require_scope
from api.v1.errors import err_conflict, err_not_found, err_validation
from api.v1.schemas import CursorPage, PatientCreate, PatientOut, PatientSummary
from database import get_db
from models.patient import Patient

router = APIRouter(prefix="/api/v1/patients", tags=["Public API — Patients"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _encode_cursor(patient_id: int) -> str:
    return base64.b64encode(f"patient:{patient_id}".encode()).decode()


def _decode_cursor(cursor: str) -> Optional[int]:
    try:
        decoded = base64.b64decode(cursor.encode()).decode()
        _, pk = decoded.split(":", 1)
        return int(pk)
    except Exception:
        return None


def _patient_to_out(p: Patient) -> PatientOut:
    return PatientOut.model_validate(p)


def _patient_to_summary(p: Patient) -> PatientSummary:
    return PatientSummary.model_validate(p)


# ---------------------------------------------------------------------------
# GET /api/v1/patients
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=CursorPage[PatientSummary],
    summary="List patients",
    description=(
        "Return a cursor-paginated list of patients. "
        "Use `next_cursor` from the response as the `cursor` query param to fetch the next page. "
        "Requires scope `patients:read`."
    ),
)
async def list_patients(
    request:  Request,
    limit:    int              = Query(20, ge=1, le=100, description="Items per page"),
    cursor:   Optional[str]    = Query(None, description="Opaque cursor for next page"),
    search:   Optional[str]    = Query(None, description="Filter by name or CPF (partial match)"),
    active:   Optional[bool]   = Query(None, description="Filter by active status"),
    ctx:      AuthContext      = Depends(require_scope("patients:read")),
    db:       Session          = Depends(get_db),
) -> CursorPage[PatientSummary]:

    query = db.query(Patient)

    # Scope to organisation when key is org-scoped
    if ctx.api_key_id:
        from models.oauth2 import OAuthAPIKey
        key_row = db.query(OAuthAPIKey).filter(OAuthAPIKey.id == ctx.api_key_id).first()
        if key_row and key_row.organization_id:
            query = query.filter(Patient.organization_id == key_row.organization_id)

    if active is not None:
        query = query.filter(Patient.active == active)

    if search:
        like = f"%{search}%"
        query = query.filter(
            Patient.name.ilike(like) | Patient.cpf.ilike(like)
        )

    # Cursor: filter by id > cursor_id
    if cursor:
        cursor_id = _decode_cursor(cursor)
        if cursor_id is None:
            return err_validation(request, "Invalid cursor value", field="cursor")
        query = query.filter(Patient.id > cursor_id)

    # Always order by id for stable pagination
    query = query.order_by(Patient.id.asc())

    # Fetch one extra to detect has_more
    rows = query.limit(limit + 1).all()
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    data = [_patient_to_summary(p) for p in rows]
    next_cursor = _encode_cursor(rows[-1].id) if has_more else None

    return CursorPage[PatientSummary](
        data=data,
        has_more=has_more,
        next_cursor=next_cursor,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/patients
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=PatientOut,
    status_code=201,
    summary="Create patient",
    description="Create a new patient record. Requires scope `patients:write`.",
)
async def create_patient(
    request: Request,
    body:    PatientCreate,
    ctx:     AuthContext  = Depends(require_scope("patients:write")),
    db:      Session      = Depends(get_db),
) -> PatientOut:

    # CPF uniqueness check
    if body.cpf:
        existing = db.query(Patient).filter(Patient.cpf == body.cpf).first()
        if existing:
            return err_conflict(request, f"A patient with CPF '{body.cpf}' already exists.")

    # Resolve organization from API key context
    org_id = None
    if ctx.api_key_id:
        from models.oauth2 import OAuthAPIKey
        key_row = db.query(OAuthAPIKey).filter(OAuthAPIKey.id == ctx.api_key_id).first()
        org_id = key_row.organization_id if key_row else None

    patient = Patient(
        organization_id=org_id,
        name=body.name,
        birthdate=body.birthdate,
        cpf=body.cpf,
        phone=body.phone,
        email=body.email,
        gender=body.gender,
        insurance=body.insurance,
        insurance_plan=body.insurance_plan,
        notes=body.notes,
        active=True,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)

    return _patient_to_out(patient)


# ---------------------------------------------------------------------------
# GET /api/v1/patients/{patient_id}
# ---------------------------------------------------------------------------

@router.get(
    "/{patient_id}",
    response_model=PatientOut,
    summary="Get patient",
    description="Retrieve a single patient by ID. Requires scope `patients:read`.",
)
async def get_patient(
    patient_id: int,
    request:    Request,
    ctx:        AuthContext = Depends(require_scope("patients:read")),
    db:         Session     = Depends(get_db),
) -> PatientOut:

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return err_not_found(request, "Patient", patient_id)

    # Organisation isolation
    if ctx.api_key_id:
        from models.oauth2 import OAuthAPIKey
        key_row = db.query(OAuthAPIKey).filter(OAuthAPIKey.id == ctx.api_key_id).first()
        if key_row and key_row.organization_id and patient.organization_id != key_row.organization_id:
            return err_not_found(request, "Patient", patient_id)

    return _patient_to_out(patient)
