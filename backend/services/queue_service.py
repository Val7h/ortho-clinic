"""Queue Management Services - Business logic for queue operations."""

from datetime import datetime, time, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func

from models.queue import ClinicQueue, PrescriptionSignature, AnamnesisTemplate
from models.clinic import Clinic, Appointment
from models.patient import Patient
from models.documents import Prescription
from tzutil import today_br


class QueueService:
    """Service class for queue management operations."""

    @staticmethod
    def add_patient_to_queue(
        clinic_id: int,
        appointment_id: int,
        patient_id: int,
        db: Session
    ) -> ClinicQueue:
        """Add patient to queue."""
        # Check if already in queue
        existing = db.query(ClinicQueue).filter(
            ClinicQueue.appointment_id == appointment_id
        ).first()

        if existing:
            return existing

        queue_entry = ClinicQueue(
            clinic_id=clinic_id,
            appointment_id=appointment_id,
            patient_id=patient_id,
            status="pending"
        )

        db.add(queue_entry)
        db.commit()
        db.refresh(queue_entry)

        return queue_entry

    @staticmethod
    def get_next_patient(
        clinic_id: int,
        db: Session
    ) -> Optional[ClinicQueue]:
        """Get next patient waiting in queue."""
        return db.query(ClinicQueue).filter(
            ClinicQueue.clinic_id == clinic_id,
            ClinicQueue.status == "pending"
        ).order_by(ClinicQueue.created_at).first()

    @staticmethod
    def get_queue_count(
        clinic_id: int,
        status: Optional[str] = None,
        db: Session = None
    ) -> int:
        """Get count of patients in queue."""
        query = db.query(func.count(ClinicQueue.id)).filter(
            ClinicQueue.clinic_id == clinic_id
        )

        if status:
            query = query.filter(ClinicQueue.status == status)

        return query.scalar()

    @staticmethod
    def get_avg_wait_time(
        clinic_id: int,
        hours: int = 24,
        db: Session = None
    ) -> Optional[int]:
        """Get average wait time in minutes for clinic."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        completed = db.query(ClinicQueue).filter(
            ClinicQueue.clinic_id == clinic_id,
            ClinicQueue.status == "completed",
            ClinicQueue.called_at >= cutoff
        ).all()

        if not completed:
            return None

        total_minutes = 0
        count = 0

        for entry in completed:
            if entry.called_at and entry.updated_at:
                delta = entry.updated_at - entry.called_at
                minutes = int(delta.total_seconds() / 60)
                total_minutes += minutes
                count += 1

        if count == 0:
            return None

        return int(total_minutes / count)

    @staticmethod
    def get_clinic_stats(
        clinic_id: int,
        db: Session
    ) -> Dict[str, Any]:
        """Get queue statistics for clinic."""
        pending = db.query(func.count(ClinicQueue.id)).filter(
            ClinicQueue.clinic_id == clinic_id,
            ClinicQueue.status == "pending"
        ).scalar()

        called = db.query(func.count(ClinicQueue.id)).filter(
            ClinicQueue.clinic_id == clinic_id,
            ClinicQueue.status.in_(["called", "arrived", "in_consultation"])
        ).scalar()

        completed_today = db.query(func.count(ClinicQueue.id)).filter(
            ClinicQueue.clinic_id == clinic_id,
            ClinicQueue.status == "completed",
            # 'hoje' comeca a meia-noite do consultorio, nao de Londres
            ClinicQueue.updated_at >= datetime.combine(today_br(), time.min)
        ).scalar()

        avg_wait = QueueService.get_avg_wait_time(clinic_id=clinic_id, db=db)

        return {
            "pending": pending or 0,
            "current": called or 0,
            "completed_today": completed_today or 0,
            "avg_wait_minutes": avg_wait
        }


class PrescriptionService:
    """Service for prescription-related operations."""

    @staticmethod
    def create_signature(
        prescription_id: int,
        db: Session
    ) -> PrescriptionSignature:
        """Create signature entry for prescription."""
        signature = PrescriptionSignature(
            prescription_id=prescription_id,
            status="pending"
        )

        db.add(signature)
        db.commit()
        db.refresh(signature)

        return signature

    @staticmethod
    def update_signature_status(
        signature_id: int,
        status: str,
        signature_proof: Optional[Dict[str, Any]] = None,
        db: Session = None
    ) -> PrescriptionSignature:
        """Update signature status."""
        signature = db.query(PrescriptionSignature).filter(
            PrescriptionSignature.id == signature_id
        ).first()

        if not signature:
            raise ValueError("Signature not found")

        signature.status = status

        if status == "signed":
            signature.signed_at = datetime.utcnow()

        if signature_proof:
            signature.signature_proof = signature_proof

        db.commit()
        db.refresh(signature)

        return signature

    @staticmethod
    def get_prescription_signatures(
        prescription_id: int,
        db: Session
    ) -> List[PrescriptionSignature]:
        """Get all signatures for prescription."""
        return db.query(PrescriptionSignature).filter(
            PrescriptionSignature.prescription_id == prescription_id
        ).all()

    @staticmethod
    def is_prescription_fully_signed(
        prescription_id: int,
        db: Session
    ) -> bool:
        """Check if prescription has valid signature."""
        signature = db.query(PrescriptionSignature).filter(
            PrescriptionSignature.prescription_id == prescription_id,
            PrescriptionSignature.status == "signed"
        ).first()

        return signature is not None


class AnamnesisService:
    """Service for anamnesis template management."""

    @staticmethod
    def create_template(
        name: str,
        structure: Dict[str, Any],
        clinic_id: Optional[int] = None,
        specialty: Optional[str] = None,
        created_by: Optional[int] = None,
        db: Session = None
    ) -> AnamnesisTemplate:
        """Create new anamnesis template."""
        template = AnamnesisTemplate(
            name=name,
            structure=structure,
            clinic_id=clinic_id,
            specialty=specialty,
            created_by=created_by
        )

        db.add(template)
        db.commit()
        db.refresh(template)

        return template

    @staticmethod
    def get_templates_by_clinic(
        clinic_id: int,
        db: Session
    ) -> List[AnamnesisTemplate]:
        """Get templates for clinic."""
        return db.query(AnamnesisTemplate).filter(
            AnamnesisTemplate.clinic_id == clinic_id
        ).all()

    @staticmethod
    def get_templates_by_specialty(
        specialty: str,
        db: Session
    ) -> List[AnamnesisTemplate]:
        """Get templates for specialty."""
        return db.query(AnamnesisTemplate).filter(
            AnamnesisTemplate.specialty == specialty
        ).all()

    @staticmethod
    def get_default_template(
        specialty: str,
        clinic_id: Optional[int] = None,
        db: Session = None
    ) -> Optional[AnamnesisTemplate]:
        """Get default/first template for specialty."""
        query = db.query(AnamnesisTemplate).filter(
            AnamnesisTemplate.specialty == specialty
        )

        if clinic_id:
            query = query.filter(AnamnesisTemplate.clinic_id == clinic_id)

        return query.order_by(AnamnesisTemplate.created_at).first()


class PatientMedicalService:
    """Service for patient medical data operations."""

    @staticmethod
    def enrich_patient_data(
        patient_id: int,
        db: Session
    ) -> Dict[str, Any]:
        """Get enriched patient data with medical history."""
        patient = db.query(Patient).filter(Patient.id == patient_id).first()

        if not patient:
            raise ValueError("Patient not found")

        return {
            "id": patient.id,
            "name": patient.name,
            "birthdate": patient.birthdate,
            "allergies": patient.allergies,
            "chronic_conditions": patient.chronic_conditions,
            "current_medications": patient.current_medications,
            "blood_type": patient.blood_type,
            "weight_kg": patient.peso_kg if hasattr(patient, 'peso_kg') else None,
            "height_cm": patient.altura_cm if hasattr(patient, 'altura_cm') else None,
            "comorbidities": patient.comorbidades if hasattr(patient, 'comorbidades') else None,
            "surgeries_history": patient.surgeries_history
        }

    @staticmethod
    def calculate_bmi(patient_id: int, db: Session) -> Optional[float]:
        """Calculate BMI if weight and height available."""
        patient = db.query(Patient).filter(Patient.id == patient_id).first()

        if not patient:
            return None

        weight = getattr(patient, 'peso_kg', None)
        height = getattr(patient, 'altura_cm', None)

        if weight and height:
            height_m = height / 100
            bmi = weight / (height_m ** 2)
            return round(bmi, 1)

        return None

    @staticmethod
    def update_vital_signs(
        patient_id: int,
        weight: Optional[float] = None,
        height: Optional[float] = None,
        db: Session = None
    ) -> Patient:
        """Update patient vital signs."""
        patient = db.query(Patient).filter(Patient.id == patient_id).first()

        if not patient:
            raise ValueError("Patient not found")

        if weight is not None:
            patient.peso_kg = weight

        if height is not None:
            patient.altura_cm = height

        db.commit()
        db.refresh(patient)

        return patient
