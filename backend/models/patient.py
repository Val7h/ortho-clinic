from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    birthdate = Column(Date, nullable=True)
    cpf = Column(String(14), unique=True, nullable=True, index=True)
    rg = Column(String(20), nullable=True)
    phone = Column(String(20), nullable=True)
    phone2 = Column(String(20), nullable=True)
    email = Column(String(200), nullable=True)
    gender = Column(String(10), nullable=True)
    civil_status = Column(String(20), nullable=True)
    occupation = Column(String(100), nullable=True)

    # Endereço
    address_street = Column(String(300), nullable=True)
    address_city = Column(String(100), nullable=True)
    address_state = Column(String(2), nullable=True)
    address_zip = Column(String(10), nullable=True)

    # Dados médicos
    blood_type = Column(String(5), nullable=True)
    allergies = Column(Text, nullable=True)
    chronic_conditions = Column(Text, nullable=True)
    current_medications = Column(Text, nullable=True)
    surgeries_history = Column(Text, nullable=True)
    family_history = Column(Text, nullable=True)

    # Convênio
    insurance = Column(String(100), nullable=True)
    insurance_number = Column(String(50), nullable=True)
    insurance_plan = Column(String(100), nullable=True)

    # Contato de emergência
    emergency_contact = Column(String(200), nullable=True)
    emergency_phone = Column(String(20), nullable=True)
    emergency_relation = Column(String(50), nullable=True)

    # Origem / indicação
    referral_source = Column(String(200), nullable=True)
    referring_doctor = Column(String(200), nullable=True)

    # Meta
    photo_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relacionamentos
    consultations = relationship("Consultation", back_populates="patient", cascade="all, delete-orphan")
    prescriptions = relationship("Prescription", back_populates="patient", cascade="all, delete-orphan")
    exam_requests = relationship("ExamRequest", back_populates="patient", cascade="all, delete-orphan")
    physio_requests = relationship("PhysioRequest", back_populates="patient", cascade="all, delete-orphan")
    medical_reports = relationship("MedicalReport", back_populates="patient", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="patient", cascade="all, delete-orphan")
