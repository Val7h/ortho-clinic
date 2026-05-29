from sqlalchemy import Column, Integer, String, Boolean, Date, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Clinic(Base):
    __tablename__ = "clinics"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    city = Column(String(100))
    state = Column(String(2))
    address = Column(String(200), nullable=True)
    color = Column(String(20), default="#0F2D5E")
    slug = Column(String(50), unique=True, index=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    schedules = relationship("ClinicSchedule", back_populates="clinic", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="clinic", cascade="all, delete-orphan")


class ClinicSchedule(Base):
    __tablename__ = "clinic_schedules"

    id = Column(Integer, primary_key=True, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=False)
    day_of_week = Column(Integer)   # 0=Seg 1=Ter 2=Qua 3=Qui 4=Sex 5=Sáb 6=Dom
    start_time = Column(String(5))  # "08:00"
    end_time = Column(String(5))    # "12:00"
    schedule_type = Column(String(20), default="walk_in")  # appointment | walk_in
    slot_duration = Column(Integer, default=12)  # minutos
    active = Column(Boolean, default=True)

    clinic = relationship("Clinic", back_populates="schedules")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=False)
    date = Column(Date, nullable=False)
    start_time = Column(String(5))   # "15:00"
    end_time = Column(String(5))     # "15:12"
    patient_name = Column(String(200), nullable=False)
    patient_phone = Column(String(20), nullable=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    reason = Column(String(300), nullable=True)
    status = Column(String(20), default="pending")
    # pending | confirmed | cancelled | completed | blocked
    queue_number = Column(Integer, nullable=True)   # para ordem de chegada
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    clinic = relationship("Clinic", back_populates="appointments")
