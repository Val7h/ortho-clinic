"""
Modelos de encaminhamento do médico (fisioterapia, especialidade etc.).

06/10 (Valth): na aba Encaminhamentos só existiam modelos fixos do sistema; um
texto que ele mesmo montou (fisioterapia motora p/ hérnia discal lombar) não
tinha como ser salvo para a próxima vez. Agora moram no banco, como os de
receita e de exame.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func

from database import Base


class ReferralTemplate(Base):
    __tablename__ = "referral_templates"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    name = Column(String(200), nullable=False)
    ref_type = Column(String(40), nullable=False, default="fisioterapia")  # fisioterapia | especialidade | colega | outro
    modality = Column(String(200), nullable=True)   # ex.: "Fisioterapia motora" ou a especialidade
    cid = Column(String(300), nullable=True)
    content = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
