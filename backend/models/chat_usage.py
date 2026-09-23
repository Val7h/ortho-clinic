"""
Registro de uso do chat da "secretária" (IA) dentro do sistema.

23/09 (Valth): "tem como estimar quanto eu gastei hoje conversando com a
secretária?" — o endpoint de chat nunca guardou nada sobre tokens gastos,
só repassava a pergunta pra Anthropic e devolvia a resposta. Sem log
nenhum, a única fonte de verdade era o Console da Anthropic (fora do
sistema). Esta tabela guarda, por chamada, quantos tokens de entrada/saída
foram usados — o suficiente pra estimar o custo em R$ sem precisar abrir
o Console toda vez.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class ChatUsage(Base):
    __tablename__ = "chat_usage"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    model           = Column(String(60), nullable=False)
    input_tokens    = Column(Integer, nullable=False, default=0)
    output_tokens   = Column(Integer, nullable=False, default=0)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)
