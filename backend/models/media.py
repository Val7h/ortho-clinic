from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class ConsultationMedia(Base):
    __tablename__ = "consultation_media"
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)

    id = Column(Integer, primary_key=True, index=True)
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    file_path = Column(String(500), nullable=False)
    media_type = Column(String(50), default="photo")
    # xray | mri | ct | ultrasound | photo | other
    description = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    consultation = relationship("Consultation", back_populates="media")
    patient = relationship("Patient", back_populates="media")
