"""
Lembrete de repetição de procedimento (11/08).

Viscossuplementação, ácido zoledrônico e afins têm data certa para repetir.
Quem não é chamado não volta — e some o paciente e o procedimento junto.

Guarda o INTERVALO, não a data do aviso: assim "12 meses" e "6 meses" saem da
mesma regra (avisar 1 mês antes de vencer, e de novo faltando 1 semana).
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from database import Base


class ProcedureReminder(Base):
    __tablename__ = "procedure_reminders"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)

    procedure = Column(String(120), nullable=False)      # "Viscossuplementação", "Ácido zoledrônico"...
    applied_on = Column(Date, nullable=False)            # quando foi aplicado
    interval_months = Column(Integer, nullable=False)    # de quanto em quanto tempo repete

    # pending = ainda vai ser chamado · done = remarcado/aplicado · cancelled = não repetir
    status = Column(String(20), nullable=False, default="pending", index=True)
    notes = Column(Text, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
