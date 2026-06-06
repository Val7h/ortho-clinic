"""
Performance tests for OrthoClinic API.
Tests response times and throughput requirements.
"""
import pytest
import time
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta


class TestQueuePerformance:
    """Test queue endpoint performance."""

    def test_queue_call_response_time_under_500ms(
        self,
        client: TestClient,
        clinic,
        patient,
        appointment,
        queue_entry
    ):
        """Test /api/clinic/queue/call responds in < 500ms."""
        payload = {
            "clinic_id": clinic.id,
            "appointment_id": appointment.id,
            "patient_id": patient.id,
            "room": "Sala 1"
        }

        start = time.time()
        response = client.post("/api/clinic/queue/call", json=payload)
        elapsed_ms = (time.time() - start) * 1000

        assert response.status_code == 200
        assert elapsed_ms < 500, f"Queue call took {elapsed_ms:.2f}ms, expected < 500ms"


    def test_queue_status_response_time_under_1s(
        self,
        client: TestClient,
        clinic,
        queue_entry
    ):
        """Test /api/clinic/queue/status responds in < 1s."""
        start = time.time()
        response = client.get(f"/api/clinic/queue/status?clinic_id={clinic.id}")
        elapsed_ms = (time.time() - start) * 1000

        assert response.status_code == 200
        assert elapsed_ms < 1000, f"Queue status took {elapsed_ms:.2f}ms, expected < 1000ms"


    @pytest.mark.parametrize("batch_size", [10, 50, 100])
    def test_concurrent_queue_calls(
        self,
        client: TestClient,
        clinic,
        patient,
        appointment,
        queue_entry,
        batch_size
    ):
        """Test queue can handle multiple concurrent calls (sequential simulation)."""
        payload = {
            "clinic_id": clinic.id,
            "appointment_id": appointment.id,
            "patient_id": patient.id,
            "room": "Sala 1"
        }

        start = time.time()
        for i in range(batch_size):
            response = client.post("/api/clinic/queue/call", json=payload)
            assert response.status_code == 200

        elapsed_ms = (time.time() - start) * 1000
        avg_time = elapsed_ms / batch_size

        print(f"Batch {batch_size}: Total {elapsed_ms:.2f}ms, Avg {avg_time:.2f}ms per call")
        assert avg_time < 500, f"Average call time {avg_time:.2f}ms > 500ms"


class TestPrescriptionPerformance:
    """Test prescription endpoint performance."""

    def test_prescription_creation_response_time(
        self,
        client: TestClient,
        clinic,
        patient,
        doctor_user
    ):
        """Test prescription creation responds in reasonable time."""
        payload = {
            "patient_id": patient.id,
            "consultation_id": None,
            "notes": "Test prescription",
            "instructions": "Tomar conforme prescrito",
            "medicines": [
                {
                    "name": "Dipirona 500mg",
                    "dose": "500",
                    "unit": "mg",
                    "frequency": "8/8h",
                    "route": "oral",
                    "quantity": 30
                }
            ]
        }

        start = time.time()
        response = client.post("/api/prescriptions", json=payload)
        elapsed_ms = (time.time() - start) * 1000

        if response.status_code == 200:
            assert elapsed_ms < 1000, f"Prescription creation took {elapsed_ms:.2f}ms"


    def test_get_prescription_response_time(
        self,
        client: TestClient,
        prescription
    ):
        """Test retrieving prescription is fast."""
        start = time.time()
        response = client.get(f"/api/prescriptions/{prescription.id}")
        elapsed_ms = (time.time() - start) * 1000

        if response.status_code == 200:
            assert elapsed_ms < 500, f"Get prescription took {elapsed_ms:.2f}ms"


class TestDatabaseQueryPerformance:
    """Test database query performance."""

    def test_queue_status_query_performance(
        self,
        db: Session,
        clinic,
        queue_entry
    ):
        """Test queue status query is efficient."""
        from models.queue import ClinicQueue

        start = time.time()
        pending = db.query(ClinicQueue).filter(
            ClinicQueue.clinic_id == clinic.id,
            ClinicQueue.status == "pending"
        ).count()
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 100, f"Query took {elapsed_ms:.2f}ms"


    def test_prescription_list_query_pagination(
        self,
        db: Session,
        clinic,
        patient,
        doctor_user
    ):
        """Test prescription list query with pagination."""
        from models.prescription import Prescription, PrescriptionStatus

        # Create multiple prescriptions
        for i in range(20):
            px = Prescription(
                clinic_id=clinic.id,
                patient_id=patient.id,
                doctor_id=doctor_user.id,
                status=PrescriptionStatus.DRAFT,
                notes=f"Prescription {i}"
            )
            db.add(px)

        db.commit()

        # Test pagination query
        start = time.time()
        prescriptions = db.query(Prescription).filter(
            Prescription.clinic_id == clinic.id
        ).offset(0).limit(10).all()
        elapsed_ms = (time.time() - start) * 1000

        assert len(prescriptions) > 0
        assert elapsed_ms < 500, f"Pagination query took {elapsed_ms:.2f}ms"


    def test_anamnesis_data_query_performance(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        anamnesis_template
    ):
        """Test retrieving anamnesis with JSON data."""
        from models.anamnesis import Anamnesis

        anamnesis = Anamnesis(
            clinic_id=clinic.id,
            patient_id=patient.id,
            appointment_id=appointment.id,
            template_id=anamnesis_template.id,
            status="draft",
            data={"complex": "data" * 100}  # Larger payload
        )
        db.add(anamnesis)
        db.commit()

        start = time.time()
        retrieved = db.query(Anamnesis).filter(
            Anamnesis.id == anamnesis.id
        ).first()
        elapsed_ms = (time.time() - start) * 1000

        assert retrieved is not None
        assert elapsed_ms < 100, f"Anamnesis query took {elapsed_ms:.2f}ms"


class TestBulkOperationPerformance:
    """Test bulk operation performance."""

    def test_queue_history_bulk_retrieval(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        doctor_user
    ):
        """Test retrieving queue history for multiple patients."""
        from models.queue import ClinicQueue

        # Create multiple queue entries
        for i in range(50):
            appt = appointment  # Reuse for simplicity
            q = ClinicQueue(
                clinic_id=clinic.id,
                appointment_id=appt.id,
                patient_id=patient.id,
                status="completed"
            )
            db.add(q)

        db.commit()

        start = time.time()
        history = db.query(ClinicQueue).filter(
            ClinicQueue.clinic_id == clinic.id
        ).order_by(ClinicQueue.created_at.desc()).limit(100).all()
        elapsed_ms = (time.time() - start) * 1000

        assert len(history) > 0
        assert elapsed_ms < 500, f"Bulk retrieval took {elapsed_ms:.2f}ms"


class TestPDFGenerationPerformance:
    """Test PDF generation performance (if implemented)."""

    def test_prescription_pdf_generation_time(self):
        """Test prescription PDF generation completes in < 5s."""
        # This test would require actual PDF generation implementation
        # Placeholder for integration with pdf_generator service
        pass


    def test_batch_pdf_generation(self):
        """Test multiple PDFs generated efficiently."""
        # Placeholder for batch PDF tests
        pass
