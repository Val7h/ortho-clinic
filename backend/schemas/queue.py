"""Pydantic schemas for queue management."""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class QueueCallRequest(BaseModel):
    """Request to call next patient to room."""
    appointment_id: int
    patient_id: int
    room: str = Field(..., min_length=1, max_length=50)
    clinic_id: int


class QueueCallResponse(BaseModel):
    """Response after calling patient."""
    id: int
    clinic_id: int
    appointment_id: int
    patient_id: int
    room: str
    status: str
    called_at: datetime
    called_by_user_id: Optional[int]

    class Config:
        from_attributes = True


class QueueItemResponse(BaseModel):
    """Single queue item in waiting list."""
    id: int
    appointment_id: int
    patient_id: int
    patient_name: str
    room: Optional[str]
    status: str
    created_at: datetime
    called_at: Optional[datetime]

    class Config:
        from_attributes = True


class QueueStatus(BaseModel):
    """Overall queue status for a clinic."""
    current: Optional[QueueItemResponse] = None
    next: List[QueueItemResponse] = []
    waiting_count: int
    last_called_at: Optional[datetime] = None
    clinic_id: int


class QueueHistoryItem(BaseModel):
    """Queue call history entry."""
    id: int
    patient_name: str
    room: Optional[str]
    called_at: datetime
    duration_minutes: Optional[int] = None
    status: str

    class Config:
        from_attributes = True


class QueueUpdateRequest(BaseModel):
    """Update queue item status."""
    status: str = Field(..., pattern="^(pending|called|arrived|in_consultation|completed)$")
    room: Optional[str] = None


# Prescription Signature Schemas

class SignatureProof(BaseModel):
    """Proof of digital signature."""
    signer_name: Optional[str] = None
    signer_email: Optional[str] = None
    timestamp: Optional[datetime] = None
    doc_hash: Optional[str] = None
    signature_method: Optional[str] = None  # clicksign, memed, etc.


class PrescriptionSignatureCreate(BaseModel):
    """Create prescription signature request."""
    prescription_id: int
    clicksign_doc_id: Optional[str] = None


class PrescriptionSignatureResponse(BaseModel):
    """Prescription signature response."""
    id: int
    prescription_id: int
    clicksign_doc_id: Optional[str]
    status: str
    signed_at: Optional[datetime]
    signature_proof: Optional[Dict[str, Any]]
    created_at: datetime

    class Config:
        from_attributes = True


class PrescriptionValidateRequest(BaseModel):
    """Validate medications for interactions."""
    medicamentos: List[Dict[str, Any]] = Field(
        ...,
        description="List of medications with name, dosage, frequency"
    )
    patient_id: Optional[int] = None


class DrugInteraction(BaseModel):
    """Drug-drug interaction warning."""
    severity: str  # "low" | "moderate" | "high" | "critical"
    drug1: str
    drug2: str
    description: str
    recommendation: Optional[str] = None


class PrescriptionValidateResponse(BaseModel):
    """Validation result with interactions."""
    valid: bool
    interactions: List[DrugInteraction] = []
    warnings: List[str] = []
    contraindications: List[str] = []


# Anamnesis Template Schemas

class TemplateField(BaseModel):
    """Single field in anamnesis template."""
    id: str
    label: str
    type: str  # text, textarea, checkbox, radio, select, date
    required: bool = False
    options: Optional[List[str]] = None


class TemplateSection(BaseModel):
    """Section of template."""
    id: str
    title: str
    fields: List[TemplateField]


class AnamnesisTemplateStructure(BaseModel):
    """Template structure definition."""
    sections: List[TemplateSection]
    tabs: Optional[List[Dict[str, Any]]] = None


class AnamnesisTemplateCreate(BaseModel):
    """Create anamnesis template."""
    name: str
    specialty: Optional[str] = None
    structure: AnamnesisTemplateStructure
    clinic_id: Optional[int] = None


class AnamnesisTemplateResponse(BaseModel):
    """Anamnesis template response."""
    id: int
    clinic_id: Optional[int]
    name: str
    specialty: Optional[str]
    structure: Dict[str, Any]
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AnamnesisTemplateUpdate(BaseModel):
    """Update anamnesis template."""
    name: Optional[str] = None
    specialty: Optional[str] = None
    structure: Optional[AnamnesisTemplateStructure] = None


# WebSocket Message Schemas

class QueueBroadcastMessage(BaseModel):
    """Message broadcast to connected clients."""
    type: str  # "queue_update" | "patient_called" | "status_change"
    clinic_id: int
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class QueueConnectionMessage(BaseModel):
    """Initial connection message."""
    clinic_id: int
    user_id: Optional[int] = None
    room: Optional[str] = None
