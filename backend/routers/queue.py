"""
Queue Management Router - Real-time waiting room management and patient flow.
Includes WebSocket support for real-time updates.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date
from typing import List, Dict, Set, Optional
from pydantic import BaseModel
import json
import logging

from database import get_db
from models.queue import ClinicQueue, PrescriptionSignature, AnamnesisTemplate, WaitingRoomEntry
from models.clinic import Appointment, Clinic
from models.patient import Patient
from schemas.queue import (
    QueueCallRequest, QueueCallResponse, QueueStatus, QueueHistoryItem,
    QueueUpdateRequest, QueueItemResponse, QueueBroadcastMessage,
    PrescriptionValidateRequest, PrescriptionValidateResponse,
    DrugInteraction, AnamnesisTemplateCreate, AnamnesisTemplateResponse,
    AnamnesisTemplateUpdate, PrescriptionSignatureCreate, PrescriptionSignatureResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/clinic", tags=["queue"])

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}  # clinic_id -> Set[WebSocket]

    async def connect(self, clinic_id: int, websocket: WebSocket):
        await websocket.accept()
        if clinic_id not in self.active_connections:
            self.active_connections[clinic_id] = set()
        self.active_connections[clinic_id].add(websocket)
        logger.info(f"Client connected to clinic {clinic_id}. Total: {len(self.active_connections[clinic_id])}")

    def disconnect(self, clinic_id: int, websocket: WebSocket):
        if clinic_id in self.active_connections:
            self.active_connections[clinic_id].discard(websocket)
            if not self.active_connections[clinic_id]:
                del self.active_connections[clinic_id]
            logger.info(f"Client disconnected from clinic {clinic_id}")

    async def broadcast(self, clinic_id: int, message: QueueBroadcastMessage):
        """Broadcast message to all connected clients for a clinic."""
        if clinic_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[clinic_id]:
                try:
                    await connection.send_json(message.model_dump())
                except Exception as e:
                    logger.error(f"Error sending message: {e}")
                    disconnected.add(connection)

            # Clean up disconnected clients
            for connection in disconnected:
                self.disconnect(clinic_id, connection)


manager = ConnectionManager()


# ==================== QUEUE ENDPOINTS ====================

@router.post("/queue/call", response_model=QueueCallResponse)
async def call_patient(
    request: QueueCallRequest,
    db: Session = Depends(get_db)
):
    """
    Call next patient to room.
    Transitions patient from 'pending' to 'called' status.
    """
    # Validate clinic and appointment exist
    clinic = db.query(Clinic).filter(Clinic.id == request.clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    appointment = db.query(Appointment).filter(
        Appointment.id == request.appointment_id,
        Appointment.clinic_id == request.clinic_id
    ).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Check if patient already in queue
    existing = db.query(ClinicQueue).filter(
        ClinicQueue.appointment_id == request.appointment_id
    ).first()

    if existing:
        existing.called_at = datetime.utcnow()
        existing.status = "called"
        existing.room = request.room
        db.commit()
        queue_entry = existing
    else:
        # Create new queue entry
        queue_entry = ClinicQueue(
            clinic_id=request.clinic_id,
            appointment_id=request.appointment_id,
            patient_id=request.patient_id,
            room=request.room,
            called_at=datetime.utcnow(),
            status="called"
        )
        db.add(queue_entry)
        db.commit()

    db.refresh(queue_entry)

    # Broadcast update
    message = QueueBroadcastMessage(
        type="patient_called",
        clinic_id=request.clinic_id,
        data={
            "queue_id": queue_entry.id,
            "patient_id": request.patient_id,
            "patient_name": patient.name,
            "room": request.room
        }
    )
    await manager.broadcast(request.clinic_id, message)

    return QueueCallResponse.model_validate(queue_entry)


@router.get("/queue/status", response_model=QueueStatus)
async def get_queue_status(
    clinic_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Get current queue status for a clinic."""
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    # Get current patient (in consultation or just called)
    current = db.query(ClinicQueue).filter(
        ClinicQueue.clinic_id == clinic_id,
        ClinicQueue.status.in_(["in_consultation", "called"])
    ).order_by(ClinicQueue.called_at.desc()).first()

    current_item = None
    if current:
        patient = db.query(Patient).filter(Patient.id == current.patient_id).first()
        appointment = db.query(Appointment).filter(Appointment.id == current.appointment_id).first()
        current_item = QueueItemResponse(
            id=current.id,
            appointment_id=current.appointment_id,
            patient_id=current.patient_id,
            patient_name=patient.name if patient else "Unknown",
            room=current.room,
            status=current.status,
            created_at=current.created_at,
            called_at=current.called_at
        )

    # Get next patients waiting (pending status)
    pending = db.query(ClinicQueue).filter(
        ClinicQueue.clinic_id == clinic_id,
        ClinicQueue.status == "pending"
    ).order_by(ClinicQueue.created_at).limit(10).all()

    next_items = []
    for entry in pending:
        patient = db.query(Patient).filter(Patient.id == entry.patient_id).first()
        next_items.append(QueueItemResponse(
            id=entry.id,
            appointment_id=entry.appointment_id,
            patient_id=entry.patient_id,
            patient_name=patient.name if patient else "Unknown",
            room=entry.room,
            status=entry.status,
            created_at=entry.created_at,
            called_at=entry.called_at
        ))

    # Count total waiting
    waiting_count = db.query(ClinicQueue).filter(
        ClinicQueue.clinic_id == clinic_id,
        ClinicQueue.status == "pending"
    ).count()

    last_called = None
    if current:
        last_called = current.called_at

    return QueueStatus(
        current=current_item,
        next=next_items,
        waiting_count=waiting_count,
        last_called_at=last_called,
        clinic_id=clinic_id
    )


@router.get("/queue/history", response_model=List[QueueHistoryItem])
async def get_queue_history(
    clinic_id: int = Query(...),
    limit: int = Query(50, le=100),
    hours: int = Query(24),
    db: Session = Depends(get_db)
):
    """Get queue call history for a clinic (last N hours)."""
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    cutoff_time = datetime.utcnow() - timedelta(hours=hours)

    history = db.query(ClinicQueue).filter(
        ClinicQueue.clinic_id == clinic_id,
        ClinicQueue.called_at.isnot(None),
        ClinicQueue.called_at >= cutoff_time
    ).order_by(ClinicQueue.called_at.desc()).limit(limit).all()

    result = []
    for entry in history:
        patient = db.query(Patient).filter(Patient.id == entry.patient_id).first()
        duration = None
        if entry.updated_at and entry.called_at:
            delta = entry.updated_at - entry.called_at
            duration = int(delta.total_seconds() / 60)

        result.append(QueueHistoryItem(
            id=entry.id,
            patient_name=patient.name if patient else "Unknown",
            room=entry.room,
            called_at=entry.called_at,
            duration_minutes=duration,
            status=entry.status
        ))

    return result


@router.patch("/queue/{queue_id}", response_model=QueueCallResponse)
async def update_queue_status(
    queue_id: int,
    request: QueueUpdateRequest,
    clinic_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Update queue entry status."""
    queue_entry = db.query(ClinicQueue).filter(
        ClinicQueue.id == queue_id,
        ClinicQueue.clinic_id == clinic_id
    ).first()

    if not queue_entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    queue_entry.status = request.status
    if request.room:
        queue_entry.room = request.room

    db.commit()
    db.refresh(queue_entry)

    # Broadcast status change
    patient = db.query(Patient).filter(Patient.id == queue_entry.patient_id).first()
    message = QueueBroadcastMessage(
        type="status_change",
        clinic_id=clinic_id,
        data={
            "queue_id": queue_id,
            "status": request.status,
            "patient_id": queue_entry.patient_id,
            "patient_name": patient.name if patient else "Unknown"
        }
    )
    await manager.broadcast(clinic_id, message)

    return QueueCallResponse.model_validate(queue_entry)


# ==================== WEBSOCKET ====================

@router.websocket("/ws/clinic/{clinic_id}/queue")
async def websocket_queue(websocket: WebSocket, clinic_id: int):
    """
    WebSocket endpoint for real-time queue updates.
    Clients connect to receive real-time queue status broadcasts.
    """
    try:
        await manager.connect(clinic_id, websocket)

        # Send initial status
        db = next(get_db())
        try:
            status = await get_queue_status(clinic_id=clinic_id, db=db)
            await websocket.send_json({
                "type": "initial_status",
                "data": status.model_dump()
            })
        finally:
            db.close()

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle client messages if needed
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(clinic_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(clinic_id, websocket)


# ==================== PRESCRIPTION VALIDATION ====================

@router.post("/prescription/validate", response_model=PrescriptionValidateResponse)
async def validate_prescription(
    request: PrescriptionValidateRequest,
    db: Session = Depends(get_db)
):
    """
    Validate medications for drug-drug interactions and contraindications.
    Integrates with drug database (DrugBank, MeMed API, etc.).
    """
    interactions: List[DrugInteraction] = []
    warnings: List[str] = []
    contraindications: List[str] = []

    if not request.medicamentos:
        return PrescriptionValidateResponse(valid=True)

    drug_names = [med.get("drug_name", med.get("nome", "")) for med in request.medicamentos]
    drug_names = [d for d in drug_names if d]

    # Check for interactions between medications
    for i, drug1 in enumerate(drug_names):
        for drug2 in drug_names[i+1:]:
            # TODO: Integrate with real drug database API
            # This is a placeholder for drug-drug interaction checking
            interaction = check_drug_interaction(drug1, drug2)
            if interaction:
                interactions.append(interaction)

    # Check patient contraindications
    if request.patient_id:
        patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
        if patient:
            patient_contraindications = check_patient_contraindications(patient, drug_names)
            contraindications.extend(patient_contraindications)

    # Generate warnings based on dosages
    for med in request.medicamentos:
        warning = validate_dosage(med)
        if warning:
            warnings.append(warning)

    valid = len(interactions) == 0 and len(contraindications) == 0
    if interactions:
        valid = False  # High severity interactions = invalid

    return PrescriptionValidateResponse(
        valid=valid,
        interactions=interactions,
        warnings=warnings,
        contraindications=contraindications
    )


def check_drug_interaction(drug1: str, drug2: str) -> DrugInteraction | None:
    """Check drug-drug interaction. Placeholder implementation."""
    # TODO: Replace with real drug interaction database
    known_interactions = {
        ("warfarin", "aspirin"): {
            "severity": "high",
            "description": "Increased bleeding risk",
            "recommendation": "Monitor INR closely"
        },
        ("metformin", "contrast_dye"): {
            "severity": "critical",
            "description": "Risk of lactic acidosis",
            "recommendation": "Hold metformin 48h after contrast"
        }
    }

    drug1_lower = drug1.lower()
    drug2_lower = drug2.lower()

    key = tuple(sorted([drug1_lower, drug2_lower]))
    if key in known_interactions:
        info = known_interactions[key]
        return DrugInteraction(
            severity=info["severity"],
            drug1=drug1,
            drug2=drug2,
            description=info["description"],
            recommendation=info.get("recommendation")
        )

    return None


def check_patient_contraindications(patient: Patient, drugs: List[str]) -> List[str]:
    """Check for patient-specific contraindications."""
    contraindications = []

    # Check allergies
    if patient.allergies:
        for drug in drugs:
            if drug.lower() in patient.allergies.lower():
                contraindications.append(f"{drug} - ALLERGY ALERT")

    # Check comorbidities (e.g., NSAIDs in renal disease)
    if patient.chronic_conditions:
        conditions_lower = patient.chronic_conditions.lower()
        for drug in drugs:
            if "ibuprofen" in drug.lower() and "kidney" in conditions_lower:
                contraindications.append(f"{drug} - Contraindicated in renal disease")

    return contraindications


def validate_dosage(medication: Dict) -> str | None:
    """Validate medication dosage. Placeholder implementation."""
    # TODO: Implement actual dosage validation against formulary
    return None


# ==================== PRESCRIPTION SIGNATURES ====================

@router.post("/prescription/sign", response_model=PrescriptionSignatureResponse)
async def create_signature(
    request: PrescriptionSignatureCreate,
    db: Session = Depends(get_db)
):
    """Create digital signature request for prescription."""
    # Verify prescription exists
    from models.documents import Prescription
    prescription = db.query(Prescription).filter(Prescription.id == request.prescription_id).first()
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")

    # Create signature entry
    signature = PrescriptionSignature(
        prescription_id=request.prescription_id,
        clicksign_doc_id=request.clicksign_doc_id,
        status="pending"
    )

    db.add(signature)
    db.commit()
    db.refresh(signature)

    # TODO: Send to ClickSign or e-signature service
    # await send_to_signature_service(signature, prescription)

    return PrescriptionSignatureResponse.model_validate(signature)


@router.get("/prescription/{prescription_id}/signatures", response_model=List[PrescriptionSignatureResponse])
async def get_prescription_signatures(
    prescription_id: int,
    db: Session = Depends(get_db)
):
    """Get all signatures for a prescription."""
    signatures = db.query(PrescriptionSignature).filter(
        PrescriptionSignature.prescription_id == prescription_id
    ).all()

    return [PrescriptionSignatureResponse.model_validate(sig) for sig in signatures]


# ==================== ANAMNESIS TEMPLATES ====================

@router.post("/anamnesis-template", response_model=AnamnesisTemplateResponse)
async def create_anamnesis_template(
    request: AnamnesisTemplateCreate,
    clinic_id: int = Query(...),
    created_by: int = Query(...),
    db: Session = Depends(get_db)
):
    """Create new anamnesis template for clinic/specialty."""
    template = AnamnesisTemplate(
        clinic_id=clinic_id,
        name=request.name,
        specialty=request.specialty,
        structure=request.structure.model_dump(),
        created_by=created_by
    )

    db.add(template)
    db.commit()
    db.refresh(template)

    return AnamnesisTemplateResponse.model_validate(template)


@router.get("/anamnesis-templates", response_model=List[AnamnesisTemplateResponse])
async def list_anamnesis_templates(
    clinic_id: int = Query(None),
    specialty: str = Query(None),
    db: Session = Depends(get_db)
):
    """List anamnesis templates."""
    query = db.query(AnamnesisTemplate)

    if clinic_id:
        query = query.filter(AnamnesisTemplate.clinic_id == clinic_id)

    if specialty:
        query = query.filter(AnamnesisTemplate.specialty == specialty)

    templates = query.all()
    return [AnamnesisTemplateResponse.model_validate(t) for t in templates]


@router.get("/anamnesis-template/{template_id}", response_model=AnamnesisTemplateResponse)
async def get_anamnesis_template(
    template_id: int,
    db: Session = Depends(get_db)
):
    """Get specific anamnesis template."""
    template = db.query(AnamnesisTemplate).filter(AnamnesisTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return AnamnesisTemplateResponse.model_validate(template)


@router.patch("/anamnesis-template/{template_id}", response_model=AnamnesisTemplateResponse)
async def update_anamnesis_template(
    template_id: int,
    request: AnamnesisTemplateUpdate,
    db: Session = Depends(get_db)
):
    """Update anamnesis template."""
    template = db.query(AnamnesisTemplate).filter(AnamnesisTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if request.name:
        template.name = request.name
    if request.specialty:
        template.specialty = request.specialty
    if request.structure:
        template.structure = request.structure.model_dump()

    db.commit()
    db.refresh(template)

    return AnamnesisTemplateResponse.model_validate(template)


@router.delete("/anamnesis-template/{template_id}")
async def delete_anamnesis_template(
    template_id: int,
    db: Session = Depends(get_db)
):
    """Delete anamnesis template."""
    template = db.query(AnamnesisTemplate).filter(AnamnesisTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    db.delete(template)
    db.commit()

    return JSONResponse(content={"message": "Template deleted"})


# ==================== SALA DE ESPERA ====================

class CheckinRequest(BaseModel):
    patient_id: int
    clinic_id: Optional[int] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


class WaitingRoomEntryOut(BaseModel):
    id: int
    patient_id: int
    patient_name: str
    patient_insurance: Optional[str]
    clinic_id: Optional[int]
    reason: Optional[str]
    position: int
    entry_date: date
    arrived_at: datetime
    status: str
    notes: Optional[str]
    waited_minutes: Optional[int]

    class Config:
        from_attributes = True


class WaitingStatusUpdate(BaseModel):
    status: str  # waiting | attending | attended | absent


def _build_entry_out(entry: WaitingRoomEntry, patient: Patient, now: datetime) -> WaitingRoomEntryOut:
    arrived = entry.arrived_at
    # normalise timezone-aware vs naive comparison
    if arrived and arrived.tzinfo is not None:
        from datetime import timezone
        now_aware = now.replace(tzinfo=timezone.utc)
        waited = int((now_aware - arrived).total_seconds() / 60)
    elif arrived:
        waited = int((now - arrived).total_seconds() / 60)
    else:
        waited = None

    return WaitingRoomEntryOut(
        id=entry.id,
        patient_id=entry.patient_id,
        patient_name=patient.name if patient else "Desconhecido",
        patient_insurance=patient.insurance if patient else None,
        clinic_id=entry.clinic_id,
        reason=entry.reason,
        position=entry.position,
        entry_date=entry.entry_date,
        arrived_at=entry.arrived_at,
        status=entry.status,
        notes=entry.notes,
        waited_minutes=waited,
    )


@router.post("/waiting-room/checkin", response_model=WaitingRoomEntryOut, status_code=201)
async def checkin_patient(
    request: CheckinRequest,
    db: Session = Depends(get_db),
):
    """Registra chegada de um paciente na sala de espera."""
    patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    today = date.today()

    # Calcula próxima posição do dia
    last_position = (
        db.query(WaitingRoomEntry)
        .filter(WaitingRoomEntry.entry_date == today)
        .count()
    )
    next_position = last_position + 1

    entry = WaitingRoomEntry(
        patient_id=request.patient_id,
        clinic_id=request.clinic_id,
        reason=request.reason,
        notes=request.notes,
        position=next_position,
        entry_date=today,
        arrived_at=datetime.utcnow(),
        status="waiting",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    now = datetime.utcnow()
    return _build_entry_out(entry, patient, now)


@router.get("/waiting-room/today", response_model=List[WaitingRoomEntryOut])
async def get_today_queue(
    clinic_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Lista todos os pacientes da fila do dia, ordenados por hora de chegada."""
    today = date.today()
    query = db.query(WaitingRoomEntry).filter(WaitingRoomEntry.entry_date == today)

    if clinic_id is not None:
        query = query.filter(WaitingRoomEntry.clinic_id == clinic_id)

    entries = query.order_by(WaitingRoomEntry.arrived_at.asc()).all()

    now = datetime.utcnow()
    result = []
    for entry in entries:
        patient = db.query(Patient).filter(Patient.id == entry.patient_id).first()
        result.append(_build_entry_out(entry, patient, now))

    return result


@router.patch("/waiting-room/{entry_id}/status", response_model=WaitingRoomEntryOut)
async def update_waiting_status(
    entry_id: int,
    request: WaitingStatusUpdate,
    db: Session = Depends(get_db),
):
    """Atualiza o status de uma entrada na sala de espera."""
    valid_statuses = {"waiting", "attending", "attended", "absent"}
    if request.status not in valid_statuses:
        raise HTTPException(
            status_code=422,
            detail=f"Status inválido. Use: {', '.join(valid_statuses)}",
        )

    entry = db.query(WaitingRoomEntry).filter(WaitingRoomEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")

    entry.status = request.status
    db.commit()
    db.refresh(entry)

    patient = db.query(Patient).filter(Patient.id == entry.patient_id).first()
    now = datetime.utcnow()
    return _build_entry_out(entry, patient, now)


@router.delete("/waiting-room/{entry_id}", status_code=204)
async def delete_waiting_entry(
    entry_id: int,
    db: Session = Depends(get_db),
):
    """Remove uma entrada da sala de espera."""
    entry = db.query(WaitingRoomEntry).filter(WaitingRoomEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")

    db.delete(entry)
    db.commit()
    return None
