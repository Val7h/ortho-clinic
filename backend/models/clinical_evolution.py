from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, UniqueConstraint
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


# 16/11/2026 (Valth): o resumo do ESCRIBA (IA) fica SEPARADO do texto do medico,
# numa coluna lilas ao lado da anamnese. Um registro por paciente por dia.
class EscribaResumo(Base):
    __tablename__ = "escriba_resumos"
    __table_args__ = (UniqueConstraint("patient_id", "entry_date", name="uq_escriba_resumo_dia"),)
    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False)
    linhas = Column(Text, nullable=False, default="[]")   # JSON: frases curtas do resumo
    faltas = Column(Text, nullable=False, default="[]")   # JSON: falado e nao escrito
    # 17/11: 'sessao' (PUT da sessao Claude) ou 'auto' (ponte do PC, a cada rascunho). Auto nao cobre sessao.
    fonte = Column(String(10), nullable=True, default="sessao")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
