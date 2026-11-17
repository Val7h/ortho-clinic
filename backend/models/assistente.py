"""Assistente ao vivo da coluna "Escriba + IA" (17/11/2026, pedido do Valth).

Conversa curta por paciente e por dia, como um chat: a sessao de atendimento (IA) escreve avisos, dicas
e documentos prontos; o medico pergunta ou pede algo na caixinha. A tela le a cada 5 s.
"""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from database import Base


class AssistenteMensagem(Base):
    __tablename__ = "assistente_mensagens"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    data = Column(Date, nullable=False, index=True)
    autor = Column(String(10), nullable=False)   # ia | medico
    texto = Column(Text, nullable=False)
    user_id = Column(Integer, nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
