from sqlalchemy import Column, Integer, Text, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class ClinicalEvolution(Base):
    __tablename__ = "clinical_evolutions"
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
