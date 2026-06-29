"""
Templates de prescrição reutilizáveis.
Permite salvar e carregar receitas frequentes (ex: Nimesulida + Dipirona).
"""
from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class PrescriptionTemplate(Base):
    __tablename__ = "prescription_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    prescription_type = Column(String(30), default="simples")  # simples | especial_azul | especial_amarelo
    medications = Column(JSON, nullable=True)   # lista de {name, dose, route, frequency, duration, instructions}
    instructions = Column(Text, nullable=True)  # orientações gerais do template
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
