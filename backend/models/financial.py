from sqlalchemy import Column, Integer, String, Date, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class FinancialRecord(Base):
    __tablename__ = "financial_records"
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=True)
    amount = Column(Float, nullable=False)
    payment_method = Column(String(50), nullable=False)
    # pix | dinheiro | cartao_credito | cartao_debito | cheque | cortesia
    status = Column(String(20), default="paid")
    # paid | pending | cancelled
    description = Column(String(300), nullable=True)
    # Clínica onde o pagamento aconteceu (dashboard v2, 02/08) — preenchida a
    # partir de agora; histórico antigo fica NULL (proxy = sala de espera)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=True, index=True)
    date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="financial_records")
    consultation = relationship("Consultation", back_populates="financial_records")
