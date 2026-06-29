from sqlalchemy import Column, Integer, String, Date, DateTime, Text, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=True)
    date = Column(Date, nullable=False)
    medications = Column(JSON, nullable=False, default=list)
    instructions = Column(Text, nullable=True)
    validity_days = Column(Integer, default=30)
    memed_id = Column(String(100), nullable=True)
    signed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="prescriptions")
    consultation = relationship("Consultation", back_populates="prescriptions")
    signatures = relationship("PrescriptionSignature", back_populates="prescription", cascade="all, delete-orphan")


class ExamRequest(Base):
    __tablename__ = "exam_requests"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=True)
    date = Column(Date, nullable=False)
    exams = Column(JSON, nullable=False, default=list)
    clinical_indication = Column(Text, nullable=True)
    urgency = Column(String(20), default="eletivo")
    notes = Column(Text, nullable=True)
    free_text = Column(Text, nullable=True)  # texto livre estilo documento médico
    signed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="exam_requests")
    consultation = relationship("Consultation", back_populates="exam_requests")


class PhysioRequest(Base):
    __tablename__ = "physio_requests"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=True)
    date = Column(Date, nullable=False)
    diagnosis = Column(Text, nullable=True)
    cid10 = Column(String(20), nullable=True)
    sessions = Column(Integer, default=10)
    frequency = Column(String(100), nullable=True)
    goals = Column(Text, nullable=True)
    precautions = Column(Text, nullable=True)
    techniques = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    signed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="physio_requests")
    consultation = relationship("Consultation", back_populates="physio_requests")


class MedicalReport(Base):
    __tablename__ = "medical_reports"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=True)
    date = Column(Date, nullable=False)
    report_type = Column(String(100), nullable=False)
    title = Column(String(300), nullable=True)
    content = Column(Text, nullable=False)
    purpose = Column(String(300), nullable=True)
    signed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="medical_reports")
    consultation = relationship("Consultation", back_populates="medical_reports")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doc_type = Column(String(50), nullable=False)
    title = Column(String(300), nullable=False)
    content_html = Column(Text, nullable=True)
    file_path = Column(String(500), nullable=True)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="documents")


class TreatmentLeaflet(Base):
    __tablename__ = "treatment_leaflets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    category = Column(String(100), nullable=False)
    content_html = Column(Text, nullable=False)
    tags = Column(JSON, default=list)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
