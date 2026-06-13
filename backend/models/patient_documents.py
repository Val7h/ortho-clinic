"""
Modelos para gerenciamento de documentos do paciente.

Cobre upload de arquivos externos (exames de imagem, laudos recebidos,
encaminhamentos, termos assinados) distintos dos documentos gerados
pelo sistema (receitas, solicitações, laudos emitidos pelo médico).
"""
from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Text,
    ForeignKey, Boolean, BigInteger, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# ── Categorias suportadas ────────────────────────────────────────────────────
DOCUMENT_CATEGORIES = {
    "exam":         "Exame de Imagem",
    "lab":          "Resultado de Laboratório",
    "prescription": "Receita Médica (externa)",
    "referral":     "Encaminhamento",
    "report":       "Laudo / Relatório",
    "consent":      "Termo de Consentimento",
    "other":        "Outro",
}

ALLOWED_MIME_TYPES = {
    # PDFs
    "application/pdf",
    # Imagens
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    # Docs
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

MAX_FILE_SIZE_MB = 25


class PatientDocument(Base):
    """
    Documento vinculado a um paciente.

    Pode ser originado de três formas:
      1. Upload de arquivo (PDF, imagem) — via file_url + mime_type
      2. Foto capturada pela câmera — mime_type image/*
      3. Documento gerado internamente (receita, laudo) referenciado por
         generated_doc_type + generated_doc_id, sem file_url externo.
    """
    __tablename__ = "patient_documents"

    id              = Column(Integer, primary_key=True, index=True)
    patient_id      = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    consultation_id = Column(Integer, ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True, index=True)
    uploaded_by_id  = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Metadados
    title       = Column(String(300), nullable=False)
    category    = Column(String(50), nullable=False, default="other")  # ver DOCUMENT_CATEGORIES
    description = Column(Text, nullable=True)
    date        = Column(Date, nullable=False)                         # data do documento (não do upload)
    tags        = Column(JSON, default=list)

    # Armazenamento
    file_url     = Column(String(1000), nullable=True)   # URL Cloudinary / local /uploads/
    file_name    = Column(String(300), nullable=True)    # nome original do arquivo
    mime_type    = Column(String(100), nullable=True)
    file_size_kb = Column(Integer, nullable=True)        # tamanho em KB

    # Para documentos gerados internamente (receita, solicitação etc.)
    generated_doc_type = Column(String(50), nullable=True)   # "prescription"|"exam_request"|...
    generated_doc_id   = Column(Integer, nullable=True)

    # Assinatura digital capturada por toque
    signature_data_url = Column(Text, nullable=True)   # base64 PNG da assinatura
    signature_at       = Column(DateTime(timezone=True), nullable=True)
    signed_by_name     = Column(String(200), nullable=True)

    # Controle
    is_deleted  = Column(Boolean, default=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    # Relacionamentos
    patient      = relationship("Patient", back_populates="patient_documents")
    shares       = relationship("DocumentShare", back_populates="document", cascade="all, delete-orphan")
    cache_entry  = relationship("DocumentCache", back_populates="document", uselist=False, cascade="all, delete-orphan")


class DocumentShare(Base):
    """
    Registro de compartilhamento de documento com o paciente.
    Permite auditar quem recebeu o quê e por qual canal.
    """
    __tablename__ = "document_shares"

    id          = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("patient_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    channel     = Column(String(20), nullable=False)   # "whatsapp" | "email" | "link"
    recipient   = Column(String(200), nullable=True)   # telefone ou e-mail
    share_token = Column(String(64), nullable=True, unique=True)  # token de link público temporário
    expires_at  = Column(DateTime(timezone=True), nullable=True)
    sent_at     = Column(DateTime(timezone=True), server_default=func.now())
    opened_at   = Column(DateTime(timezone=True), nullable=True)

    document = relationship("PatientDocument", back_populates="shares")


class DocumentCache(Base):
    """
    Cache local de documentos baixados offline.
    O frontend armazena no IndexedDB; este registro serve como
    manifesto server-side para sincronização (opcional).
    """
    __tablename__ = "document_cache"

    id          = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("patient_documents.id", ondelete="CASCADE"), nullable=False, unique=True)
    cached_at   = Column(DateTime(timezone=True), server_default=func.now())
    cache_key   = Column(String(200), nullable=True)   # chave no IndexedDB do cliente

    document = relationship("PatientDocument", back_populates="cache_entry")
