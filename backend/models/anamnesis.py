from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import secrets


class Anamnesis(Base):
    __tablename__ = "anamneses"
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    token = Column(String(64), unique=True, index=True, nullable=False)
    responses = Column(JSON, nullable=True)   # filled by patient
    status = Column(String(20), default="pending")  # pending | filled
    expires_at = Column(DateTime(timezone=True), nullable=True)
    filled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="anamneses")
