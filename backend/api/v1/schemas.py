"""
Pydantic schemas for the OrthoClinic Public API v1.

Separate from internal schemas (backend/schemas/) so the public API surface
can evolve independently without breaking internal code.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic import ConfigDict

# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

T = TypeVar("T")


class CursorPage(BaseModel, Generic[T]):
    """
    Cursor-based pagination envelope used by all list endpoints.

    next_cursor is an opaque base64 string. Pass it as ?cursor=<value> to
    get the next page. None means you have reached the last page.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    data: List[T]
    total: Optional[int] = None       # total count when cheap to compute
    next_cursor: Optional[str] = None
    has_more: bool = False


class PaginationParams(BaseModel):
    """Query parameters common to all list endpoints."""
    limit:  int = Field(20, ge=1, le=100, description="Items per page (1-100)")
    cursor: Optional[str] = Field(None, description="Opaque cursor from previous response")


# ---------------------------------------------------------------------------
# Patient schemas
# ---------------------------------------------------------------------------

class PatientBase(BaseModel):
    name:           str            = Field(..., min_length=2, max_length=200)
    birthdate:      Optional[date] = None
    cpf:            Optional[str]  = Field(None, max_length=14, description="Brazilian CPF (XXX.XXX.XXX-XX)")
    phone:          Optional[str]  = Field(None, max_length=20)
    email:          Optional[str]  = Field(None, max_length=200)
    gender:         Optional[str]  = Field(None, max_length=10)
    insurance:      Optional[str]  = Field(None, max_length=100)
    insurance_plan: Optional[str]  = Field(None, max_length=100)
    notes:          Optional[str]  = None


class PatientCreate(PatientBase):
    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) != 11:
            raise ValueError("CPF must contain exactly 11 digits")
        return v


class PatientOut(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id:             int
    organization_id: Optional[int]  = None
    active:         bool
    created_at:     datetime
    updated_at:     Optional[datetime] = None

    # Computed
    age:            Optional[int]    = None

    @model_validator(mode="after")
    def compute_age(self) -> "PatientOut":
        if self.birthdate:
            today = date.today()
            self.age = (
                today.year - self.birthdate.year
                - ((today.month, today.day) < (self.birthdate.month, self.birthdate.day))
            )
        return self


class PatientSummary(BaseModel):
    """Lightweight representation used in list responses."""
    model_config = ConfigDict(from_attributes=True)

    id:         int
    name:       str
    phone:      Optional[str]
    cpf:        Optional[str]
    insurance:  Optional[str]
    active:     bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Appointment / Consultation schemas
# ---------------------------------------------------------------------------

APPOINTMENT_TYPES = [
    "primeira_consulta",
    "retorno",
    "urgencia",
    "procedimento",
    "teleconsulta",
]

APPOINTMENT_STATUS = ["scheduled", "confirmed", "arrived", "in_progress", "completed", "cancelled", "no_show"]


class AppointmentCreate(BaseModel):
    patient_id:   int
    scheduled_at: datetime   = Field(..., description="ISO-8601 datetime in UTC")
    type:         str        = Field("retorno", description=f"One of: {', '.join(APPOINTMENT_TYPES)}")
    doctor_id:    Optional[int]   = None
    clinic_id:    Optional[int]   = None
    notes:        Optional[str]   = None
    chief_complaint: Optional[str] = None

    @field_validator("scheduled_at")
    @classmethod
    def must_be_future(cls, v: datetime) -> datetime:
        now = datetime.now(v.tzinfo) if v.tzinfo else datetime.utcnow()
        if v <= now:
            raise ValueError("The 'scheduled_at' field must be a future datetime.")
        return v

    @field_validator("type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in APPOINTMENT_TYPES:
            raise ValueError(f"Invalid type '{v}'. Must be one of: {', '.join(APPOINTMENT_TYPES)}")
        return v


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             int
    patient_id:     int
    scheduled_at:   datetime
    type:           str
    status:         str  = "scheduled"
    doctor_id:      Optional[int]   = None
    clinic_id:      Optional[int]   = None
    notes:          Optional[str]   = None
    chief_complaint: Optional[str]  = None
    created_at:     datetime
    updated_at:     Optional[datetime] = None

    # Expanded sub-objects (populated when ?expand=patient,doctor)
    patient:        Optional[PatientSummary] = None


class AppointmentFilter(BaseModel):
    date_from:  Optional[datetime] = None
    date_to:    Optional[datetime] = None
    patient_id: Optional[int]      = None
    doctor_id:  Optional[int]      = None
    status:     Optional[str]      = None
    type:       Optional[str]      = None


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

class AvailabilitySlot(BaseModel):
    starts_at: datetime
    ends_at:   datetime
    doctor_id: int
    clinic_id: Optional[int]
    available: bool = True


class AvailabilityResponse(BaseModel):
    doctor_id:  int
    date_from:  datetime
    date_to:    datetime
    slots:      List[AvailabilitySlot]


# ---------------------------------------------------------------------------
# API Key management (portal)
# ---------------------------------------------------------------------------

class APIKeyCreate(BaseModel):
    name:           str            = Field(..., min_length=2, max_length=200)
    description:    Optional[str]  = Field(None, max_length=500)
    scopes:         List[str]      = Field(..., min_length=1, description="List of scope strings")
    environment:    str            = Field("live", description="'live' or 'test'")
    expires_days:   Optional[int]  = Field(None, ge=1, le=365, description="Days until expiry (omit = never)")

    @field_validator("environment")
    @classmethod
    def valid_env(cls, v: str) -> str:
        if v not in ("live", "test"):
            raise ValueError("environment must be 'live' or 'test'")
        return v


class APIKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             int
    name:           str
    description:    Optional[str]
    key_prefix:     str
    scopes:         List[str]
    environment:    str
    created_at:     datetime
    last_used_at:   Optional[datetime]
    expires_at:     Optional[datetime]
    revoked:        bool

    # Only present at creation time
    plaintext_key:  Optional[str] = Field(None, description="Shown ONCE at creation. Store it securely.")


class APIKeyRotateOut(BaseModel):
    old_key_id:       int
    new_key:          APIKeyOut
    grace_expires_at: datetime
    message:          str


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------

WEBHOOK_EVENTS = [
    "appointment.created",
    "appointment.updated",
    "appointment.cancelled",
    "patient.created",
    "patient.updated",
    "document.uploaded",
    "payment.received",
]


class WebhookCreate(BaseModel):
    url:          str            = Field(..., description="HTTPS URL that receives POST payloads")
    events:       List[str]      = Field(..., min_length=1, description=f"Event types: {', '.join(WEBHOOK_EVENTS)} or '*' for all")
    secret:       Optional[str]  = Field(None, min_length=16, max_length=500,
                                         description="HMAC-SHA256 signing secret. Min 16 chars. Shown once.")
    description:  Optional[str]  = Field(None, max_length=500)
    active:       bool           = True
    ip_allowlist: Optional[List[str]] = Field(
        None,
        description="Enterprise: list of CIDR strings. Deliveries rejected if source IP not in list.",
        examples=[["203.0.113.0/24", "198.51.100.42/32"]],
    )
    mtls_cert_pem: Optional[str] = Field(
        None,
        description="Enterprise: PEM-encoded client certificate for mTLS. Include both cert and private key.",
    )

    @field_validator("url")
    @classmethod
    def must_be_https(cls, v: str) -> str:
        test_mode = os.getenv("WEBHOOK_ALLOW_HTTP", "false").lower() == "true"
        if not v.startswith("https://") and not test_mode:
            raise ValueError("Webhook URL must use HTTPS")
        return v

    @field_validator("events", mode="before")
    @classmethod
    def valid_events(cls, v: List[str]) -> List[str]:
        for e in v:
            if e not in WEBHOOK_EVENTS and e != "*":
                raise ValueError(f"Unknown event '{e}'. Valid: {', '.join(WEBHOOK_EVENTS)}, *")
        return v

    @field_validator("ip_allowlist", mode="before")
    @classmethod
    def validate_cidrs(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        import ipaddress
        for cidr in v:
            try:
                ipaddress.ip_network(cidr, strict=False)
            except ValueError:
                raise ValueError(f"'{cidr}' is not a valid CIDR notation")
        return v


class WebhookUpdate(BaseModel):
    """Partial update — all fields optional."""
    url:          Optional[str]       = Field(None, description="New destination URL (HTTPS)")
    events:       Optional[List[str]] = None
    secret:       Optional[str]       = Field(None, min_length=16, max_length=500)
    description:  Optional[str]       = Field(None, max_length=500)
    active:       Optional[bool]      = None
    ip_allowlist: Optional[List[str]] = None


class WebhookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:                   int
    url:                  str
    events:               List[str]
    description:          Optional[str]
    active:               bool
    created_at:           datetime
    updated_at:           Optional[datetime] = None
    consecutive_failures: int = 0
    circuit_opened_at:    Optional[datetime] = None
    # Never expose the raw secret or mTLS key — only show a masked hint
    secret_hint:          Optional[str] = None
    has_ip_allowlist:     bool = False
    has_mtls:             bool = False


class WebhookTestResult(BaseModel):
    webhook_id:    int
    delivered:     bool
    http_status:   Optional[int]
    response_body: Optional[str]
    duration_ms:   int
    error:         Optional[str] = None
    payload:       Dict[str, Any]


# ---------------------------------------------------------------------------
# Webhook delivery log / dashboard
# ---------------------------------------------------------------------------

class DeliveryLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:              int
    endpoint_id:     int
    evt_id:          str
    event_type:      str
    attempt_number:  int
    status:          str           # success | failed | dead
    http_status:     Optional[int]
    response_body:   Optional[str]
    error_message:   Optional[str]
    duration_ms:     Optional[int]
    attempted_at:    datetime
    next_retry_at:   Optional[datetime] = None


class DeadLetterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:                  int
    endpoint_id:         int
    evt_id:              str
    event_type:          str
    total_attempts:      int
    first_attempted_at:  Optional[datetime]
    last_attempted_at:   Optional[datetime]
    last_error:          Optional[str]
    created_at:          datetime
    replayed_at:         Optional[datetime] = None
    replay_task_id:      Optional[str]      = None


import os  # noqa: E402 — needed by WebhookCreate validator above
