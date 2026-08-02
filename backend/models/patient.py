from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Boolean, ForeignKey, JSON, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
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
    alergias = Column(Text, nullable=True)  # Campo duplicado em PT-BR
    chronic_conditions = Column(Text, nullable=True)
    # CIDs fixos do paciente (lembretes de oferta por diagnostico — 02/08)
    cids = Column(JSON, default=list)
    current_medications = Column(Text, nullable=True)
    medicacoes_uso_continuo = Column(JSON, nullable=True)  # Lista estruturada de medicações
    surgeries_history = Column(Text, nullable=True)
    family_history = Column(Text, nullable=True)
    contraindicacoes = Column(Text, nullable=True)

    # Vitais
    peso_kg = Column(Numeric(5, 2), nullable=True)
    altura_cm = Column(Numeric(5, 2), nullable=True)

    # Comorbidades estruturadas
    comorbidades = Column(JSON, nullable=True)  # {"diabetes": true, "hipertensao": false, ...}

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
    whatsapp_messages = relationship("WhatsAppMessage", back_populates="patient", cascade="all, delete-orphan")
    financial_records = relationship("FinancialRecord", back_populates="patient", cascade="all, delete-orphan")
    media = relationship("ConsultationMedia", back_populates="patient", cascade="all, delete-orphan")
    anamneses = relationship("Anamnesis", back_populates="patient", cascade="all, delete-orphan")
    patient_documents = relationship("PatientDocument", back_populates="patient", cascade="all, delete-orphan")
