"""Escriba integrado ao OrthoMedic (fatia 1, 17/11/2026).

O medico grava a consulta pela propria tela do OrthoMedic (PC, celular ou iPad).
Os pedacos de audio ficam aqui so ate o PC do Escriba buscar e transcrever;
depois o audio e apagado (a coluna `audio` volta a NULL).

- EscribaSessao: uma por atendimento (entrada da sala de espera).
- EscribaPedaco: pedaco de ~10 s. Repetir o envio nao duplica.
- EscribaConsentimento: o aviso CFM, uma vez por paciente.
"""
from sqlalchemy import (Column, Integer, String, DateTime, ForeignKey, LargeBinary, UniqueConstraint, BigInteger, Text, Boolean)
from sqlalchemy.sql import func

from database import Base


class EscribaSessao(Base):
    __tablename__ = "escriba_sessoes"
    __table_args__ = (UniqueConstraint("entry_id", name="uq_escriba_sessao_entrada"),)

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    entry_id = Column(Integer, ForeignKey("waiting_room_entries.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    doctor_user_id = Column(Integer, nullable=True)
    # gravando | pausada | parada
    estado = Column(String(20), nullable=False, default="gravando")
    # Aparelho que grava agora (id aleatorio guardado no navegador) e o tipo: pc | celular | ipad
    aparelho_ativo = Column(String(64), nullable=True)
    aparelho_tipo = Column(String(20), nullable=True)
    ultimo_sinal = Column(DateTime(timezone=True), nullable=True)
    criada_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizada_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    finalizada_em = Column(DateTime(timezone=True), nullable=True)


class EscribaPedaco(Base):
    __tablename__ = "escriba_pedacos"
    __table_args__ = (UniqueConstraint("sessao_id", "aparelho", "seq", name="uq_escriba_pedaco"),)

    id = Column(Integer, primary_key=True, index=True)
    sessao_id = Column(Integer, ForeignKey("escriba_sessoes.id"), nullable=False, index=True)
    aparelho = Column(String(64), nullable=False)
    seq = Column(Integer, nullable=False)
    ext = Column(String(8), nullable=False, default="webm")
    tamanho = Column(Integer, nullable=False, default=0)
    # Hora em que o pedaco terminou de gravar, no relogio do aparelho (ms desde 1970).
    t_ms = Column(BigInteger, nullable=True)
    audio = Column(LargeBinary, nullable=True)  # NULL depois que o PC confirma
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    confirmado_em = Column(DateTime(timezone=True), nullable=True)


class EscribaConsentimento(Base):
    __tablename__ = "escriba_consentimentos"
    __table_args__ = (UniqueConstraint("organization_id", "patient_id", name="uq_escriba_consent_paciente"),)

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    entry_id = Column(Integer, nullable=True)
    doctor_user_id = Column(Integer, nullable=True)
    texto_versao = Column(String(40), nullable=False, default="v1-2026-11-17")
    criado_em = Column(DateTime(timezone=True), server_default=func.now())


# ─────────── fatia 3 (17/11/2026): botoes "Voce disse que vai fazer" ───────────

class EscribaSugestao(Base):
    """Um botao da coluna: 1 por classe de exame, fisio, 1 por receita, encaminhamento, atestado, procedimento.
    A ponte do PC grava e atualiza pela chave estavel (repetir a frase nao duplica).
    Estados: nova | aberta | feita | descartada | sumiu (o rascunho novo nao trouxe mais)."""
    __tablename__ = "escriba_sugestoes"
    __table_args__ = (UniqueConstraint("sessao_id", "chave", name="uq_escriba_sugestao_chave"),)

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    sessao_id = Column(Integer, ForeignKey("escriba_sessoes.id"), nullable=False, index=True)
    entry_id = Column(Integer, nullable=False, index=True)
    patient_id = Column(Integer, nullable=False, index=True)
    chave = Column(String(120), nullable=False)
    # exame | fisio | receita | encaminhamento | atestado | procedimento
    tipo = Column(String(20), nullable=False)
    rotulo = Column(String(60), nullable=False)
    frase = Column(Text, nullable=True)          # o que foi dito, como saiu da transcricao
    conferida = Column(Boolean, nullable=False, default=False)  # a frase existe na transcricao
    dados = Column(Text, nullable=True)          # JSON: o que preenche a aba
    estado = Column(String(20), nullable=False, default="nova")
    # metrica: ao salvar o documento, o texto ficou igual ao sugerido? (True = usado sem mudar)
    sem_mudanca = Column(Boolean, nullable=True)
    criada_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizada_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    feita_em = Column(DateTime(timezone=True), nullable=True)


class EscribaPedido(Base):
    """Pedido do site para o PC executar (ex.: 'Gerar guia oficial (PC)').
    O PC busca para fora, pega (pendente -> pego), executa e devolve (feito | falhou)."""
    __tablename__ = "escriba_pedidos"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, default=1, index=True)
    patient_id = Column(Integer, nullable=False, index=True)
    entry_id = Column(Integer, nullable=True)
    sugestao_id = Column(Integer, nullable=True, index=True)
    tipo = Column(String(20), nullable=False, default="guia")
    dados = Column(Text, nullable=True)          # JSON com o que o PC precisa
    estado = Column(String(20), nullable=False, default="pendente")  # pendente | pego | feito | falhou
    resultado = Column(Text, nullable=True)
    doctor_user_id = Column(Integer, nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    pego_em = Column(DateTime(timezone=True), nullable=True)
    feito_em = Column(DateTime(timezone=True), nullable=True)
