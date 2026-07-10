from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class WhatsAppMessage(Base):
    __tablename__ = "whatsapp_messages"
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    phone = Column(String(20), nullable=True)
    message_type = Column(String(50), nullable=False)
    # birthday | return_reminder | post_consultation | semestral | anual | custom
    message_text = Column(Text, nullable=False)
    status = Column(String(20), default="demo")
    # demo | sent | failed | pending
    demo = Column(Boolean, default=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="whatsapp_messages")
