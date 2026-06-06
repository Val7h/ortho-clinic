from sqlalchemy import Column, Integer, String, Date, DateTime, Text, ForeignKey, Enum, Boolean, Float, LargeBinary
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum
from datetime import datetime, timedelta


class PrescriptionStatus(str, enum.Enum):
    DRAFT = "rascunho"
    PENDING_SIGNATURE = "aguardando_assinatura"
    SIGNED = "assinado"
    ARCHIVED = "arquivado"
    EXPIRED = "expirado"


class PrescriptionMedicineUnit(str, enum.Enum):
    MG = "mg"
    G = "g"
    ML = "ml"
    UNIT = "unidade"
    PATCH = "adesivo"
    PERCENT = "%"


class PrescriptionMedicineFrequency(str, enum.Enum):
    ONCE_DAILY = "1x ao dia"
    TWICE_DAILY = "2x ao dia"
    THREE_TIMES_DAILY = "3x ao dia"
    FOUR_TIMES_DAILY = "4x ao dia"
    EVERY_6_HOURS = "a cada 6 horas"
    EVERY_8_HOURS = "a cada 8 horas"
    EVERY_12_HOURS = "a cada 12 horas"
    AS_NEEDED = "conforme necessário"


class PrescriptionMedicineRoute(str, enum.Enum):
    ORAL = "via oral"
    INTRAMUSCULAR = "via intramuscular"
    INTRAVENOUS = "via intravenosa"
    SUBCUTANEOUS = "via subcutânea"
    TOPICAL = "via tópica"
    NASAL = "via nasal"
    INHALATION = "inalação"
    RECTAL = "via retal"


class Prescription(Base):
    """Receita médica digital conforme CFM 2.299/21"""
    __tablename__ = "prescriptions"

    id = Column(Integer, primary_key=True, index=True)

    # Relações
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=False)

    # Status e datas
    status = Column(String(30), default=PrescriptionStatus.DRAFT, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    issued_at = Column(DateTime(timezone=True), nullable=True)  # Data/hora de emissão (imutável após assinatura)
    signed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)  # 30 dias após emissão

    # Conteúdo
    notes = Column(Text, nullable=True)  # Observações gerais
    instructions = Column(Text, nullable=True)  # Instruções especiais

    # Assinatura Digital (ClickSign)
    clicksign_doc_id = Column(String(255), nullable=True, unique=True, index=True)
    clicksign_sign_url = Column(Text, nullable=True)
    clicksign_signed_url = Column(Text, nullable=True)
    signature_proof_url = Column(Text, nullable=True)  # URL do certificado de assinatura

    # PDF armazenado
    pdf_file = Column(LargeBinary, nullable=True)
    pdf_checksum = Column(String(64), nullable=True)  # SHA256 do PDF

    # Validação
    qr_code_token = Column(String(128), unique=True, nullable=True, index=True)

    # Auditoria
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relacionamentos
    consultation = relationship("Consultation", backref="prescriptions", foreign_keys=[consultation_id])
    patient = relationship("Patient", backref="prescriptions", foreign_keys=[patient_id])
    doctor = relationship("User", backref="prescriptions", foreign_keys=[doctor_id])
    clinic = relationship("Clinic", backref="prescriptions", foreign_keys=[clinic_id])
    medicines = relationship("PrescriptionMedicine", back_populates="prescription", cascade="all, delete-orphan")
    signature_logs = relationship("PrescriptionSignatureLog", back_populates="prescription", cascade="all, delete-orphan")


class PrescriptionMedicine(Base):
    """Medicamento em uma receita"""
    __tablename__ = "prescription_medicines"

    id = Column(Integer, primary_key=True, index=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id"), nullable=False)

    # Medicamento
    name = Column(String(255), nullable=False)  # Nome genérico
    dose = Column(Float, nullable=False)
    unit = Column(String(20), default=PrescriptionMedicineUnit.MG)

    # Posologia
    frequency = Column(String(50), nullable=False)
    route = Column(String(50), nullable=False)
    quantity = Column(Integer, nullable=False)  # Quantidade total

    # Observações
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relacionamento
    prescription = relationship("Prescription", back_populates="medicines")


class PrescriptionSignatureLog(Base):
    """Log de assinatura para auditoria"""
    __tablename__ = "prescription_signature_logs"

    id = Column(Integer, primary_key=True, index=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id"), nullable=False)

    # Evento
    event = Column(String(50), nullable=False)  # "signature_requested", "signed", "webhook_received", etc
    status = Column(String(50), nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Detalhes
    details = Column(Text, nullable=True)  # JSON com detalhes do evento
    clicksign_event_id = Column(String(255), nullable=True)

    # Relacionamento
    prescription = relationship("Prescription", back_populates="signature_logs")
