"""Queue Management Models - Real-time waiting room tracking."""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class ClinicQueue(Base):
    """
    Real-time queue management for clinic waiting rooms.
    Tracks patient flow from arrival through consultation.
    """
    __tablename__ = "clinic_queue"

    id = Column(Integer, primary_key=True, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=False, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)

    # Room/location information
    room = Column(String(50), nullable=True)

    # Queue state transitions
    called_at = Column(DateTime(timezone=True), nullable=True)
    called_by_user_id = Column(Integer, nullable=True)

    # Status: pending → called → arrived → in_consultation → completed
    status = Column(String(20), default="pending", index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    clinic = relationship("Clinic")
    appointment = relationship("Appointment")
    patient = relationship("Patient")


class WaitingRoomEntry(Base):
    """
    Sala de Espera — registro de chegada de paciente na clínica.
    Modelo simples e independente de agendamento para uso operacional diário.
    Statuses: waiting → attending → attended | absent
    """
    __tablename__ = "waiting_room_entries"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=True, index=True)

    # Motivo da visita (opcional)
    reason = Column(String(300), nullable=True)

    # Posição sequencial do dia (1, 2, 3…)
    position = Column(Integer, nullable=False, default=1)

    # Data do atendimento (facilita filtro por dia sem parsear arrived_at)
    entry_date = Column(Date, nullable=False, index=True)

    # Horário de chegada
    arrived_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Timer do atendimento: marcados nas transições de status (Chamar / Concluir)
    # para alimentar o tempo médio real (antes era um número fixo no Dashboard).
    called_at = Column(DateTime(timezone=True), nullable=True)
    attended_at = Column(DateTime(timezone=True), nullable=True)

    # Status: waiting | attending | attended | absent
    status = Column(String(20), default="waiting", index=True, nullable=False)

    # Valor do atendimento em centavos (evita erro de arredondamento com float).
    # Digitado manualmente pela secretária no check-in — sem tabela de preço fixa.
    value_cents = Column(Integer, nullable=True)

    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    patient = relationship("Patient")
    clinic = relationship("Clinic")


class PrescriptionSignature(Base):
    """
    Digital signature tracking for prescriptions.
    Integrates with ClickSign or similar e-signature platform.
    """
    __tablename__ = "prescription_signatures"

    id = Column(Integer, primary_key=True, index=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id"), nullable=False, index=True)

    # External signature service integration
    clicksign_doc_id = Column(String(255), nullable=True, unique=True)

    # Signature metadata
    signed_at = Column(DateTime(timezone=True), nullable=True)
    signature_proof = Column(JSON, nullable=True)  # Contains: signer_name, timestamp, doc_hash, etc.

    # Status: pending → signed → failed
    status = Column(String(20), default="pending", index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    prescription = relationship("Prescription", back_populates="signatures")


class AnamnesisTemplate(Base):
    """
    Customizable anamnesis templates by specialty/clinic.
    Enables structured patient history capture.
    """
    __tablename__ = "anamnesis_templates"

    id = Column(Integer, primary_key=True, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=True, index=True)

    # Template metadata
    name = Column(String(255), nullable=False)
    specialty = Column(String(100), nullable=True)  # ortopedia, general, etc.

    # Template structure as JSON
    # Format: {"fields": [...], "tabs": [...], "sections": [...]}
    structure = Column(JSON, nullable=False)

    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    clinic = relationship("Clinic")
