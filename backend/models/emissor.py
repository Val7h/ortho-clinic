"""Emissor unico de documentos (27/11/2026, P3 do plano aprovado pelo Valth).

Uma linha por ITEM de documento do dia (remedio, exame, fisio, encaminhamento, atestado, justificativa).
A chave e RESERVADA aqui antes de qualquer gerador desenhar o documento; o documento so e gravado com a
reserva (cabecalho X-Emissor-Lote) e marca a linha "pronto" no mesmo commit.

Trava dura: indice unico PARCIAL em (organizacao, paciente, dia, tipo, chave), valendo so para os estados
"reservado" e "pronto". "falhou" libera a chave; "substituido" (troca pedida pelo medico) guarda o historico.
Nada aqui e apagado.
"""
from sqlalchemy import Column, Date, DateTime, Index, Integer, String, Text, text
from sqlalchemy.sql import func

from database import Base

ESTADOS_ATIVOS = ("reservado", "pronto")


class EmissorChave(Base):
    __tablename__ = "emissor_chaves"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    patient_id = Column(Integer, nullable=False, index=True)
    dia = Column(Date, nullable=False)                      # data do Brasil (tzutil.today_br) no servidor
    tipo = Column(String(20), nullable=False)               # receita | exame | fisio | encaminhamento | atestado | justificativa
    chave = Column(String(200), nullable=False)
    texto = Column(Text, nullable=True)                     # o item como foi pedido (para a regua por significado)
    conteudo_hash = Column(String(64), nullable=True)       # sha256 do conteudo do lote (nunca o texto em claro)
    lote = Column(String(36), nullable=False, index=True)
    token = Column(String(64), nullable=False)
    estado = Column(String(12), nullable=False, default="reservado")   # reservado | pronto | falhou | substituido
    dono = Column(String(20), nullable=True)                # sessao | atendente | escriba | tela | ponte
    origem = Column(String(120), nullable=True)             # pedido/botao de origem (ex.: "pedido:42", "sugestao:7")
    formato = Column(String(12), nullable=True)             # guia | documento
    vence_em = Column(DateTime(timezone=True), nullable=True)
    doc_kind = Column(String(20), nullable=True)            # receita | exame | laudo | encaminhamento | atestado | guia
    doc_id = Column(Integer, nullable=True)
    substituido_por = Column(String(36), nullable=True)     # lote que substituiu esta linha (troca pedida)
    feito_em = Column(DateTime(timezone=True), nullable=True)   # quando o documento ficou pronto (hora do "ja existe")
    tentativas = Column(Integer, nullable=False, default=1)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index(
            "ux_emissor_chave_ativa", "organization_id", "patient_id", "dia", "tipo", "chave", unique=True,
            postgresql_where=text("estado IN ('reservado', 'pronto')"),
            sqlite_where=text("estado IN ('reservado', 'pronto')"),
        ),
        Index("ix_emissor_paciente_dia", "organization_id", "patient_id", "dia"),
    )
