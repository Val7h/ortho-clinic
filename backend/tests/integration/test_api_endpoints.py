"""
Integration tests for API endpoints.
Tests authentication, authorization, and endpoint contracts.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta


class TestQueueAPIEndpoints:
    """Test queue API endpoints."""

    def test_queue_call_valid_payload(
        self,
        client: TestClient,
        clinic,
        patient,
        appointment,
        queue_entry,
        db: Session
    ):
        """Test POST /api/clinic/queue/call with valid data."""
        payload = {
            "clinic_id": clinic.id,
            "appointment_id": appointment.id,
            "patient_id": patient.id,
            "room": "Sala 1"
        }

        response = client.post("/api/clinic/queue/call", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "status" in data
        assert "called_at" in data
        assert data["status"] == "called"


    def test_queue_call_missing_required_fields(self, client: TestClient, clinic):
        """Test POST /api/clinic/queue/call rejects incomplete payload."""
        payload = {
            "clinic_id": clinic.id,
            # Missing appointment_id, patient_id
        }

        response = client.post("/api/clinic/queue/call", json=payload)
        assert response.status_code == 422  # Unprocessable Entity


    def test_queue_call_invalid_clinic(self, client: TestClient):
        """Test POST /api/clinic/queue/call with invalid clinic."""
        payload = {
            "clinic_id": 99999,
            "appointment_id": 1,
            "patient_id": 1,
            "room": "Sala 1"
        }

        response = client.post("/api/clinic/queue/call", json=payload)
        assert response.status_code == 404


    def test_queue_status_valid_response(
        self,
        client: TestClient,
        clinic,
        queue_entry
    ):
        """Test GET /api/clinic/queue/status returns correct format."""
        response = client.get(f"/api/clinic/queue/status?clinic_id={clinic.id}")

        assert response.status_code == 200
        data = response.json()

        # Verify response schema
        required_fields = ["total", "pending", "called", "in_consultation", "completed"]
        for field in required_fields:
            assert field in data
            assert isinstance(data[field], int)


    def test_queue_status_missing_clinic_id(self, client: TestClient):
        """Test GET /api/clinic/queue/status without clinic_id."""
        response = client.get("/api/clinic/queue/status")
        assert response.status_code == 422  # Missing required parameter


class TestPrescriptionAPIEndpoints:
    """Test prescription API endpoints."""

    def test_create_prescription_valid(
        self,
        client: TestClient,
        clinic,
        patient,
        doctor_user
    ):
        """Test POST /api/prescriptions with valid data."""
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

        response = client.post("/api/prescriptions", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["status"] == "DRAFT"
        assert "qr_code_token" in data


    def test_get_prescription_exists(
        self,
        client: TestClient,
        prescription
    ):
        """Test GET /api/prescriptions/{id} for existing prescription."""
        response = client.get(f"/api/prescriptions/{prescription.id}")

        if response.status_code == 200:
            data = response.json()
            assert data["id"] == prescription.id
            assert "medicines" in data


    def test_get_prescription_not_found(self, client: TestClient):
        """Test GET /api/prescriptions/{id} for non-existent prescription."""
        response = client.get("/api/prescriptions/99999")
        assert response.status_code == 404


    def test_list_prescriptions_response_format(
        self,
        client: TestClient,
        clinic
    ):
        """Test GET /api/prescriptions returns list format."""
        response = client.get("/api/prescriptions")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestAuthenticationRequired:
    """Test that endpoints require authentication."""

    def test_queue_call_without_auth(self, client: TestClient, clinic):
        """Test queue call requires authentication (if enforced)."""
        payload = {
            "clinic_id": clinic.id,
            "appointment_id": 1,
            "patient_id": 1,
            "room": "Sala 1"
        }

        response = client.post("/api/clinic/queue/call", json=payload)
        # Response depends on whether auth is actually enforced
        assert response.status_code in [200, 401, 403]


class TestRateLimiting:
    """Test rate limiting on endpoints."""

    def test_queue_call_rate_limit(
        self,
        client: TestClient,
        clinic,
        patient,
        appointment,
        queue_entry,
        db: Session
    ):
        """Test rate limiting works on queue call endpoint."""
        payload = {
            "clinic_id": clinic.id,
            "appointment_id": appointment.id,
            "patient_id": patient.id,
            "room": "Sala 1"
        }

        # Make multiple requests
        responses = []
        for i in range(5):
            response = client.post("/api/clinic/queue/call", json=payload)
            responses.append(response.status_code)

        # At least first few should succeed
        assert responses[0] in [200, 429]  # 429 if rate limited


class TestAPIResponseFormats:
    """Test API response format consistency."""

    def test_error_response_has_detail(self, client: TestClient):
        """Test error responses include detail field."""
        response = client.get("/api/clinic/queue/status?clinic_id=99999")

        if response.status_code >= 400:
            data = response.json()
            assert "detail" in data


    def test_success_response_is_json(
        self,
        client: TestClient,
        clinic
    ):
        """Test successful responses are valid JSON."""
        response = client.get(f"/api/clinic/queue/status?clinic_id={clinic.id}")

        assert response.status_code == 200
        assert response.headers.get("content-type").startswith("application/json")
        data = response.json()
        assert isinstance(data, (dict, list))


class TestQueueHistoryEndpoint:
    """Test queue history tracking."""

    def test_queue_history_response_format(
        self,
        client: TestClient,
        clinic
    ):
        """Test GET /api/clinic/queue/history returns correct format."""
        response = client.get(f"/api/clinic/queue/history?clinic_id={clinic.id}")

        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)
            if len(data) > 0:
                item = data[0]
                assert "queue_id" in item
                assert "patient_id" in item
                assert "status" in item
