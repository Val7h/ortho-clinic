"""
Modelos de solicitação de exame, reutilizáveis.

11/08 — antes ficavam SÓ no localStorage do navegador: presos a um computador
e sujeitos a sumir numa limpeza de cache. Agora moram no banco, como já
acontecia com os modelos de receita.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func

from database import Base


class ExamTemplate(Base):
    __tablename__ = "exam_templates"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    name = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
