"""
Unit tests for Queue Management.
Tests queue status, patient calling, and state transitions.
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from models.queue import ClinicQueue
from models.clinic import Appointment
from models.patient import Patient


class TestQueueCallEndpoint:
    """Test queue patient calling functionality."""

    def test_call_patient_success(
        self,
        client: TestClient,
        clinic,
        patient: Patient,
        appointment: Appointment,
        queue_entry: ClinicQueue,
        db: Session
    ):
        """Test calling patient to room transitions status correctly."""
        payload = {
            "clinic_id": clinic.id,
            "appointment_id": appointment.id,
            "patient_id": patient.id,
            "room": "Sala 1"
        }

        response = client.post("/api/clinic/queue/call", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "called"
        assert data["room"] == "Sala 1"
        assert "called_at" in data

        # Verify DB updated
        db_entry = db.query(ClinicQueue).filter(
            ClinicQueue.appointment_id == appointment.id
        ).first()
        assert db_entry.status == "called"
        assert db_entry.room == "Sala 1"


    def test_call_patient_not_found(self, client: TestClient, clinic):
        """Test calling non-existent patient returns 404."""
        payload = {
            "clinic_id": clinic.id,
            "appointment_id": 999,
            "patient_id": 999,
            "room": "Sala 1"
        }

        response = client.post("/api/clinic/queue/call", json=payload)
        assert response.status_code == 404


    def test_call_patient_response_time(
        self,
        client: TestClient,
        clinic,
        patient: Patient,
        appointment: Appointment,
        queue_entry: ClinicQueue
    ):
        """Test call endpoint responds in < 500ms."""
        import time

        payload = {
            "clinic_id": clinic.id,
            "appointment_id": appointment.id,
            "patient_id": patient.id,
            "room": "Sala 1"
        }

        start = time.time()
        response = client.post("/api/clinic/queue/call", json=payload)
        elapsed = (time.time() - start) * 1000  # Convert to ms

        assert response.status_code == 200
        assert elapsed < 500, f"Call took {elapsed}ms, expected < 500ms"


class TestQueueStatus:
    """Test queue status endpoint."""

    def test_get_queue_status_empty(self, client: TestClient, clinic):
        """Test getting status of empty queue."""
        response = client.get(f"/api/clinic/queue/status?clinic_id={clinic.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["pending"] == 0
        assert data["called"] == 0
        assert data["in_consultation"] == 0


    def test_get_queue_status_with_patients(
        self,
        client: TestClient,
        clinic,
        queue_entry: ClinicQueue,
        db: Session
    ):
        """Test queue status reflects current state."""
        # Add another queue entry
        from models.patient import Patient
        from models.clinic import Appointment

        patient2 = Patient(
            name="Maria Silva",
            cpf="98765432100",
            email="maria@email.com",
            phone="11999999998",
            birth_date="1990-01-01",
            gender="F"
        )
        db.add(patient2)
        db.flush()

        appt2 = Appointment(
            clinic_id=clinic.id,
            patient_id=patient2.id,
            doctor_id=queue_entry.appointment.doctor_id,
            scheduled_at=datetime.utcnow() + timedelta(days=1),
            specialty="Ortopedia"
        )
        db.add(appt2)
        db.flush()

        q2 = ClinicQueue(
            clinic_id=clinic.id,
            appointment_id=appt2.id,
            patient_id=patient2.id,
            status="called"
        )
        db.add(q2)
        db.commit()

        response = client.get(f"/api/clinic/queue/status?clinic_id={clinic.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] == 2
        assert data["pending"] == 1
        assert data["called"] == 1


    def test_get_queue_status_response_time(
        self,
        client: TestClient,
        clinic
    ):
        """Test status endpoint responds in < 1s."""
        import time

        start = time.time()
        response = client.get(f"/api/clinic/queue/status?clinic_id={clinic.id}")
        elapsed = (time.time() - start) * 1000

        assert response.status_code == 200
        assert elapsed < 1000, f"Status query took {elapsed}ms, expected < 1000ms"


    def test_get_queue_status_invalid_clinic(self, client: TestClient):
        """Test invalid clinic ID returns 404."""
        response = client.get("/api/clinic/queue/status?clinic_id=999")
        assert response.status_code == 404


class TestQueueStateTransitions:
    """Test queue status transitions."""

    def test_pending_to_called(self, db: Session, queue_entry: ClinicQueue):
        """Test pending -> called transition."""
        assert queue_entry.status == "pending"

        queue_entry.status = "called"
        queue_entry.called_at = datetime.utcnow()
        db.commit()
        db.refresh(queue_entry)

        assert queue_entry.status == "called"
        assert queue_entry.called_at is not None


    def test_called_to_in_consultation(self, db: Session, queue_entry: ClinicQueue):
        """Test called -> in_consultation transition."""
        queue_entry.status = "called"
        queue_entry.called_at = datetime.utcnow()
        db.commit()

        queue_entry.status = "in_consultation"
        db.commit()
        db.refresh(queue_entry)

        assert queue_entry.status == "in_consultation"


    def test_in_consultation_to_completed(self, db: Session, queue_entry: ClinicQueue):
        """Test in_consultation -> completed transition."""
        queue_entry.status = "in_consultation"
        db.commit()

        queue_entry.status = "completed"
        db.commit()
        db.refresh(queue_entry)

        assert queue_entry.status == "completed"


class TestQueueValidation:
    """Test queue validation."""

    def test_duplicate_patient_call_updates_entry(
        self,
        client: TestClient,
        clinic,
        patient: Patient,
        appointment: Appointment,
        queue_entry: ClinicQueue,
        db: Session
    ):
        """Test calling same patient twice updates existing entry."""
        payload = {
            "clinic_id": clinic.id,
            "appointment_id": appointment.id,
            "patient_id": patient.id,
            "room": "Sala 1"
        }

        response1 = client.post("/api/clinic/queue/call", json=payload)
        assert response1.status_code == 200

        # Call again with different room
        payload["room"] = "Sala 2"
        response2 = client.post("/api/clinic/queue/call", json=payload)
        assert response2.status_code == 200

        # Verify only one entry exists
        entries = db.query(ClinicQueue).filter(
            ClinicQueue.appointment_id == appointment.id
        ).all()
        assert len(entries) == 1
        assert entries[0].room == "Sala 2"
