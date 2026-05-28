from sqlalchemy import Column, Integer, String, Date, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class ConsultationType(str, enum.Enum):
    FIRST = "primeira_consulta"
    RETURN = "retorno"
    EMERGENCY = "urgencia"
    PROCEDURE = "procedimento"
    TELECONSULTA = "teleconsulta"


class Consultation(Base):
    __tablename__ = "consultations"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    type = Column(String(30), default=ConsultationType.RETURN)

    # Queixa e história
    chief_complaint = Column(Text, nullable=True)
    history_of_illness = Column(Text, nullable=True)
    pain_scale = Column(Integer, nullable=True)
    pain_location = Column(String(200), nullable=True)
    symptom_duration = Column(String(100), nullable=True)
    aggravating_factors = Column(Text, nullable=True)
    relieving_factors = Column(Text, nullable=True)
    previous_treatments = Column(Text, nullable=True)

    # Exame físico
    physical_exam = Column(Text, nullable=True)
    vital_signs = Column(Text, nullable=True)
    range_of_motion = Column(Text, nullable=True)
    special_tests = Column(Text, nullable=True)
    imaging_findings = Column(Text, nullable=True)

    # Hipótese diagnóstica e conduta
    diagnosis = Column(Text, nullable=True)
    cid10 = Column(String(20), nullable=True)
    treatment_plan = Column(Text, nullable=True)
    evolution = Column(Text, nullable=True)
    procedure_performed = Column(Text, nullable=True)

    # Retorno e observações
    next_appointment = Column(Date, nullable=True)
    next_appointment_notes = Column(String(500), nullable=True)
    doctor_private_notes = Column(Text, nullable=True)

    # Teleconsulta
    teleconsult_url = Column(String(200), nullable=True)

    # Meta
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relacionamentos
    patient = relationship("Patient", back_populates="consultations")
    prescriptions = relationship("Prescription", back_populates="consultation")
    exam_requests = relationship("ExamRequest", back_populates="consultation")
    physio_requests = relationship("PhysioRequest", back_populates="consultation")
    medical_reports = relationship("MedicalReport", back_populates="consultation")
    financial_records = relationship("FinancialRecord", back_populates="consultation")
    media = relationship("ConsultationMedia", back_populates="consultation", cascade="all, delete-orphan")
