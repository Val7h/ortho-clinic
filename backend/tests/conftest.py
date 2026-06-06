"""
Pytest configuration and fixtures for OrthoClinic tests.
"""
import os
import pytest
import tempfile
from datetime import datetime, timedelta
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

# Change to backend directory for imports
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base, get_db
from main import app
from fastapi.testclient import TestClient
from models.user import User, UserRole
from models.clinic import Clinic, Appointment
from models.patient import Patient
from models.queue import ClinicQueue, PrescriptionSignature, AnamnesisTemplate
from models.prescription import Prescription, PrescriptionMedicine, PrescriptionStatus
from models.anamnesis import Anamnesis


# ============================================================================
# Database Setup
# ============================================================================

@pytest.fixture(scope="session")
def test_db():
    """Create in-memory SQLite database for testing."""
    db_fd, db_path = tempfile.mkstemp()
    database_url = f"sqlite:///{db_path}"

    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
        poolclass=None
    )

    Base.metadata.create_all(bind=engine)

    yield engine

    os.close(db_fd)
    os.unlink(db_path)


@pytest.fixture
def db(test_db) -> Generator[Session, None, None]:
    """Database session for each test."""
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_db
    )

    connection = test_db.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db: Session) -> TestClient:
    """FastAPI test client."""
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    client = TestClient(app)
    yield client

    app.dependency_overrides.clear()


# ============================================================================
# Test Data Fixtures
# ============================================================================

@pytest.fixture
def clinic(db: Session) -> Clinic:
    """Create test clinic."""
    clinic = Clinic(
        name="Test Clinic",
        cnpj="12.345.678/0001-90",
        phone="1133334444",
        email="teste@clinica.com.br",
        address="Rua Teste, 123",
        city="São Paulo",
        state="SP",
        zipcode="01310-100",
        specialties=["Ortopedia"],
        owner_id=None
    )
    db.add(clinic)
    db.commit()
    db.refresh(clinic)
    return clinic


@pytest.fixture
def admin_user(db: Session, clinic: Clinic) -> User:
    """Create admin user."""
    user = User(
        email="admin@clinic.com",
        username="admin",
        password_hash="hashed_password",
        first_name="Admin",
        last_name="Test",
        role=UserRole.ADMIN,
        clinic_id=clinic.id,
        cfm=None,
        cpf="12345678901",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def doctor_user(db: Session, clinic: Clinic) -> User:
    """Create doctor user."""
    user = User(
        email="doctor@clinic.com",
        username="doctor",
        password_hash="hashed_password",
        first_name="Dr.",
        last_name="Silva",
        role=UserRole.DOCTOR,
        clinic_id=clinic.id,
        cfm="123456",
        cpf="98765432100",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def patient(db: Session) -> Patient:
    """Create test patient."""
    patient = Patient(
        name="João da Silva",
        cpf="12345678901",
        email="joao@email.com",
        phone="11999999999",
        birth_date="1985-06-15",
        gender="M",
        nationality="Brasileira",
        mother_name="Maria da Silva",
        marital_status="Casado",
        profession="Engenheiro",
        address="Rua Principal, 456",
        city="São Paulo",
        state="SP",
        zipcode="01310-200",
        health_insurance=True,
        insurance_provider="Unimed"
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@pytest.fixture
def appointment(db: Session, clinic: Clinic, patient: Patient, doctor_user: User) -> Appointment:
    """Create test appointment."""
    appointment = Appointment(
        clinic_id=clinic.id,
        patient_id=patient.id,
        doctor_id=doctor_user.id,
        scheduled_at=datetime.utcnow() + timedelta(days=1),
        specialty="Ortopedia",
        status="scheduled",
        notes="Initial consultation"
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@pytest.fixture
def queue_entry(db: Session, clinic: Clinic, patient: Patient, appointment: Appointment) -> ClinicQueue:
    """Create test queue entry."""
    queue_entry = ClinicQueue(
        clinic_id=clinic.id,
        appointment_id=appointment.id,
        patient_id=patient.id,
        status="pending",
        room=None,
        called_at=None
    )
    db.add(queue_entry)
    db.commit()
    db.refresh(queue_entry)
    return queue_entry


@pytest.fixture
def prescription(db: Session, clinic: Clinic, patient: Patient, doctor_user: User) -> Prescription:
    """Create test prescription."""
    prescription = Prescription(
        clinic_id=clinic.id,
        patient_id=patient.id,
        doctor_id=doctor_user.id,
        status=PrescriptionStatus.DRAFT,
        qr_code_token="test_token_123",
        notes="Test prescription",
        instructions="Tomar conforme prescrito"
    )
    db.add(prescription)
    db.flush()

    # Add medicines
    for i in range(2):
        medicine = PrescriptionMedicine(
            prescription_id=prescription.id,
            name=f"Medicine {i+1}",
            dose="500",
            unit="mg",
            frequency="12/12h",
            route="oral",
            quantity=30
        )
        db.add(medicine)

    db.commit()
    db.refresh(prescription)
    return prescription


@pytest.fixture
def prescription_signature(db: Session, prescription: Prescription) -> PrescriptionSignature:
    """Create test prescription signature."""
    sig = PrescriptionSignature(
        prescription_id=prescription.id,
        status="pending",
        clicksign_doc_id=None
    )
    db.add(sig)
    db.commit()
    db.refresh(sig)
    return sig


@pytest.fixture
def anamnesis_template(db: Session, clinic: Clinic) -> AnamnesisTemplate:
    """Create test anamnesis template."""
    template = AnamnesisTemplate(
        clinic_id=clinic.id,
        name="Template Ortopedia",
        specialty="Ortopedia",
        structure={
            "tabs": [
                {
                    "id": "complaint",
                    "label": "Queixa Principal",
                    "sections": [
                        {
                            "id": "complaint_section",
                            "label": "Queixa",
                            "fields": [
                                {
                                    "id": "main_complaint",
                                    "type": "textarea",
                                    "label": "Queixa Principal",
                                    "required": True
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


# ============================================================================
# Utility Fixtures
# ============================================================================

@pytest.fixture
def auth_headers(client: TestClient, admin_user: User):
    """Generate auth headers for requests."""
    # This would normally login and get a token
    # For now, return a mock
    return {"Authorization": "Bearer test_token"}
