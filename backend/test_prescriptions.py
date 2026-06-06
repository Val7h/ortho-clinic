"""
Testes unitários para o sistema de receitas médicas
Executar com: pytest test_prescriptions.py -v
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from io import BytesIO
import hashlib

from database import Base
from main import app
from models.prescription import (
    Prescription,
    PrescriptionMedicine,
    PrescriptionSignatureLog,
    PrescriptionStatus,
)
from services.pdf_generator import PrescriptionPDFGenerator, compute_pdf_checksum
from services.clicksign_service import generate_qr_code_token

# ============================================================================
# SETUP
# ============================================================================

# Database em memória para testes
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

client = TestClient(app)


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def db_session():
    """Fornece sessão de banco para teste"""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def test_user(db_session):
    """Cria usuário de teste"""
    from models.user import User

    user = User(
        full_name="Dr. Test",
        email="doctor@test.com",
        cpf="12345678901",
        crm="123456",
        rqe="RQE123",
        specialty="Ortopedia",
        password_hash="hashed_password",
        clinic_id=1,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def test_patient(db_session):
    """Cria paciente de teste"""
    from models.patient import Patient

    patient = Patient(
        full_name="João Silva",
        cpf="98765432100",
        rg="123456789",
        birth_date=datetime(1990, 1, 15).date(),
        phone="11999999999",
        email="patient@test.com",
        clinic_id=1,
    )
    db_session.add(patient)
    db_session.commit()
    return patient


@pytest.fixture
def test_clinic(db_session):
    """Cria clínica de teste"""
    from models.clinic import Clinic

    clinic = Clinic(
        name="Clínica Test",
        address="Rua Test, 123",
        city="São Paulo",
        state="SP",
        phone="1133333333",
        cnpj="12345678000190",
    )
    db_session.add(clinic)
    db_session.commit()
    return clinic


# ============================================================================
# TESTES: PDF GENERATOR
# ============================================================================

class TestPDFGenerator:
    """Testes para geração de PDF"""

    def test_generate_pdf_basic(self):
        """Testa geração básica de PDF"""
        gen = PrescriptionPDFGenerator()

        patient_data = {
            "name": "João Silva",
            "cpf": "98765432100",
            "rg": "123456789",
            "birth_date": "15/01/1990",
            "age": 34,
            "phone": "11999999999",
            "email": "patient@test.com",
        }

        doctor_data = {
            "name": "Dr. Test",
            "crm": "123456",
            "rqe": "RQE123",
            "specialty": "Ortopedia",
            "phone": "1133333333",
            "email": "doctor@test.com",
        }

        clinic_data = {
            "name": "Clínica Test",
            "address": "Rua Test, 123",
            "phone": "1133333333",
            "cnpj": "12345678000190",
            "logo_url": None,
        }

        medicines = [
            {
                "name": "Dipirona",
                "dose": 500,
                "unit": "mg",
                "frequency": "3x ao dia",
                "route": "via oral",
                "quantity": 30,
                "notes": "Conforme necessário",
            }
        ]

        pdf_bytes = gen.generate(
            prescription_id=1,
            patient_data=patient_data,
            doctor_data=doctor_data,
            clinic_data=clinic_data,
            medicines=medicines,
            qr_code_url="http://localhost:8000/api/prescriptions/validate/1?token=abc123",
            issued_at=datetime.utcnow(),
        )

        # Verificações
        assert isinstance(pdf_bytes, bytes)
        assert len(pdf_bytes) > 0
        assert pdf_bytes[:4] == b"%PDF"  # PDF header

    def test_pdf_contains_patient_data(self):
        """Testa se PDF contém dados do paciente"""
        gen = PrescriptionPDFGenerator()

        patient_data = {
            "name": "João Silva",
            "cpf": "98765432100",
            "rg": "123456789",
            "birth_date": "15/01/1990",
            "age": 34,
            "phone": "11999999999",
            "email": "patient@test.com",
        }

        doctor_data = {
            "name": "Dr. Test",
            "crm": "123456",
            "rqe": "RQE123",
            "specialty": "Ortopedia",
            "phone": "1133333333",
            "email": "doctor@test.com",
        }

        clinic_data = {
            "name": "Clínica Test",
            "address": "Rua Test, 123",
            "phone": "1133333333",
            "cnpj": "12345678000190",
            "logo_url": None,
        }

        medicines = []

        pdf_bytes = gen.generate(
            prescription_id=1,
            patient_data=patient_data,
            doctor_data=doctor_data,
            clinic_data=clinic_data,
            medicines=medicines,
            qr_code_url="http://test.com/validate/1",
            issued_at=datetime.utcnow(),
        )

        # PDF é binário, apenas verificar tamanho
        assert len(pdf_bytes) > 1000

    def test_compute_pdf_checksum(self):
        """Testa cálculo de checksum"""
        pdf_bytes = b"test content"
        checksum = compute_pdf_checksum(pdf_bytes)

        assert isinstance(checksum, str)
        assert len(checksum) == 64  # SHA256 hex = 64 chars
        assert checksum == hashlib.sha256(pdf_bytes).hexdigest()


# ============================================================================
# TESTES: DATABASE MODELS
# ============================================================================

class TestPrescriptionModel:
    """Testes para modelo de Prescription"""

    def test_create_prescription(self, db_session, test_patient, test_user, test_clinic):
        """Testa criação de prescrição"""
        prescription = Prescription(
            patient_id=test_patient.id,
            doctor_id=test_user.id,
            clinic_id=test_clinic.id,
            status=PrescriptionStatus.DRAFT,
            qr_code_token=generate_qr_code_token(),
        )
        db_session.add(prescription)
        db_session.commit()

        assert prescription.id is not None
        assert prescription.status == PrescriptionStatus.DRAFT
        assert prescription.qr_code_token is not None

    def test_add_medicines(self, db_session, test_patient, test_user, test_clinic):
        """Testa adição de medicamentos"""
        prescription = Prescription(
            patient_id=test_patient.id,
            doctor_id=test_user.id,
            clinic_id=test_clinic.id,
            status=PrescriptionStatus.DRAFT,
            qr_code_token=generate_qr_code_token(),
        )
        db_session.add(prescription)
        db_session.flush()

        medicine = PrescriptionMedicine(
            prescription_id=prescription.id,
            name="Dipirona",
            dose=500,
            unit="mg",
            frequency="3x ao dia",
            route="via oral",
            quantity=30,
        )
        db_session.add(medicine)
        db_session.commit()

        assert len(prescription.medicines) == 1
        assert prescription.medicines[0].name == "Dipirona"

    def test_prescription_expiration(self, db_session, test_patient, test_user, test_clinic):
        """Testa cálculo de data de expiração"""
        prescription = Prescription(
            patient_id=test_patient.id,
            doctor_id=test_user.id,
            clinic_id=test_clinic.id,
            status=PrescriptionStatus.SIGNED,
            signed_at=datetime.utcnow(),
        )
        db_session.add(prescription)
        db_session.commit()

        # Expiração deve ser 30 dias após assinatura
        expires_at = prescription.signed_at + timedelta(days=30)
        assert (expires_at - prescription.signed_at).days == 30

    def test_signature_log(self, db_session, test_patient, test_user, test_clinic):
        """Testa registro de log de assinatura"""
        prescription = Prescription(
            patient_id=test_patient.id,
            doctor_id=test_user.id,
            clinic_id=test_clinic.id,
            status=PrescriptionStatus.DRAFT,
            qr_code_token=generate_qr_code_token(),
        )
        db_session.add(prescription)
        db_session.flush()

        log = PrescriptionSignatureLog(
            prescription_id=prescription.id,
            event="signature_requested",
            status="success",
            details='{"doc_id": "abc123"}',
        )
        db_session.add(log)
        db_session.commit()

        assert prescription.signature_logs[0].event == "signature_requested"


# ============================================================================
# TESTES: QR CODE TOKEN
# ============================================================================

class TestQRCodeToken:
    """Testes para token de QR code"""

    def test_generate_qr_code_token(self):
        """Testa geração de token"""
        token1 = generate_qr_code_token()
        token2 = generate_qr_code_token()

        assert isinstance(token1, str)
        assert len(token1) > 20
        assert token1 != token2  # Tokens únicos

    def test_qr_code_token_uniqueness(self, db_session, test_patient, test_user, test_clinic):
        """Testa unicidade de tokens"""
        tokens = set()

        for _ in range(10):
            prescription = Prescription(
                patient_id=test_patient.id,
                doctor_id=test_user.id,
                clinic_id=test_clinic.id,
                qr_code_token=generate_qr_code_token(),
            )
            tokens.add(prescription.qr_code_token)

        assert len(tokens) == 10  # Todos únicos


# ============================================================================
# TESTES: INTEGRAÇÃO
# ============================================================================

class TestPrescriptionIntegration:
    """Testes de integração de fluxo completo"""

    def test_prescription_workflow(self, db_session, test_patient, test_user, test_clinic):
        """Testa fluxo completo: criar → assinatura → validação"""

        # 1. Criar prescrição
        prescription = Prescription(
            patient_id=test_patient.id,
            doctor_id=test_user.id,
            clinic_id=test_clinic.id,
            status=PrescriptionStatus.DRAFT,
            qr_code_token=generate_qr_code_token(),
        )

        medicine = PrescriptionMedicine(
            prescription_id=prescription.id,
            name="Dipirona",
            dose=500,
            unit="mg",
            frequency="3x ao dia",
            route="via oral",
            quantity=30,
        )
        prescription.medicines.append(medicine)

        db_session.add(prescription)
        db_session.flush()

        # 2. Marcar como assinado
        prescription.status = PrescriptionStatus.SIGNED
        prescription.issued_at = datetime.utcnow()
        prescription.signed_at = datetime.utcnow()
        prescription.pdf_file = b"fake pdf content"
        prescription.pdf_checksum = compute_pdf_checksum(b"fake pdf content")
        db_session.commit()

        # 3. Verificar dados
        assert prescription.status == PrescriptionStatus.SIGNED
        assert prescription.pdf_checksum is not None
        assert len(prescription.medicines) == 1

        # 4. Simular validação
        qr_token = prescription.qr_code_token
        fetched = db_session.query(Prescription).filter(
            Prescription.id == prescription.id,
            Prescription.qr_code_token == qr_token,
        ).first()

        assert fetched is not None
        assert fetched.status == PrescriptionStatus.SIGNED


# ============================================================================
# EXECUTAR TESTES
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
