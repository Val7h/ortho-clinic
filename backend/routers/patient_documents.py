"""
Router: gerenciamento de documentos do paciente — Sprint 6 / Day 7.

Endpoints:
  GET    /patients/{id}/documents                 — listar (com filtro de categoria)
  POST   /patients/{id}/documents/upload          — upload de arquivo (PDF/imagem)
  POST   /patients/{id}/documents/camera          — foto capturada pela câmera
  POST   /patients/{id}/documents/link-generated  — vincula doc gerado pelo sistema
  GET    /patients/{id}/documents/{doc_id}        — detalhe
  PATCH  /patients/{id}/documents/{doc_id}        — editar título/categoria/tags
  DELETE /patients/{id}/documents/{doc_id}        — soft-delete
  POST   /patients/{id}/documents/{doc_id}/sign   — capturar assinatura digital
  POST   /patients/{id}/documents/{doc_id}/share  — compartilhar (WhatsApp / e-mail / link)
  GET    /documents/share/{token}                 — acesso público por token (sem auth)
  GET    /patients/{id}/documents/{doc_id}/pdf    — baixar/gerar PDF para viewer
"""
import os
import uuid
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File,
    Form, Query, BackgroundTasks
)
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from database import get_db
from deps import require_doctor, get_current_user
from models.patient import Patient
from models.patient_documents import (
    PatientDocument, DocumentShare, DocumentCache,
    DOCUMENT_CATEGORIES, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_MB
)
from models.organization import User
from services.storage import upload_file


# ── Schemas ──────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: int
    patient_id: int
    consultation_id: Optional[int]
    title: str
    category: str
    category_label: str
    description: Optional[str]
    date: str
    tags: List[str]
    file_url: Optional[str]
    file_name: Optional[str]
    mime_type: Optional[str]
    file_size_kb: Optional[int]
    generated_doc_type: Optional[str]
    generated_doc_id: Optional[int]
    has_signature: bool
    signature_at: Optional[str]
    signed_by_name: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_ext(cls, doc: PatientDocument) -> "DocumentOut":
        return cls(
            id=doc.id,
            patient_id=doc.patient_id,
            consultation_id=doc.consultation_id,
            title=doc.title,
            category=doc.category,
            category_label=DOCUMENT_CATEGORIES.get(doc.category, doc.category),
            description=doc.description,
            date=str(doc.date),
            tags=doc.tags or [],
            file_url=doc.file_url,
            file_name=doc.file_name,
            mime_type=doc.mime_type,
            file_size_kb=doc.file_size_kb,
            generated_doc_type=doc.generated_doc_type,
            generated_doc_id=doc.generated_doc_id,
            has_signature=bool(doc.signature_data_url),
            signature_at=doc.signature_at.isoformat() if doc.signature_at else None,
            signed_by_name=doc.signed_by_name,
            created_at=doc.created_at.isoformat() if doc.created_at else "",
        )


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None

    @field_validator("category")
    @classmethod
    def valid_category(cls, v):
        if v and v not in DOCUMENT_CATEGORIES:
            raise ValueError(f"Categoria inválida. Use: {list(DOCUMENT_CATEGORIES.keys())}")
        return v


class SignaturePayload(BaseModel):
    """
    Payload para captura de assinatura por toque.
    signature_data_url: string base64 PNG gerada pelo canvas frontend.
    signed_by_name: nome legível do signatário (paciente ou responsável).
    """
    signature_data_url: str   # "data:image/png;base64,..."
    signed_by_name: str


class ShareRequest(BaseModel):
    channel: str             # "whatsapp" | "email" | "link"
    recipient: Optional[str] = None   # telefone / e-mail
    expires_hours: int = 72           # validade do link


class ShareOut(BaseModel):
    channel: str
    recipient: Optional[str]
    share_url: Optional[str]
    expires_at: Optional[str]
    message: str


class LinkGeneratedDocRequest(BaseModel):
    title: str
    category: str
    date: str
    generated_doc_type: str   # "prescription" | "exam_request" | "physio_request" | "medical_report"
    generated_doc_id: int
    consultation_id: Optional[int] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = []


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_patient_or_404(patient_id: int, db: Session) -> Patient:
    p = db.query(Patient).filter(Patient.id == patient_id, Patient.active == True).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    return p


def _get_doc_or_404(doc_id: int, patient_id: int, db: Session) -> PatientDocument:
    doc = db.query(PatientDocument).filter(
        PatientDocument.id == doc_id,
        PatientDocument.patient_id == patient_id,
        PatientDocument.is_deleted == False,
    ).first()
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    return doc


def _validate_upload(file: UploadFile, content: bytes):
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            415,
            f"Tipo de arquivo não permitido: {file.content_type}. "
            f"Permitidos: PDF, JPEG, PNG, WEBP, HEIC, DOCX"
        )
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            413,
            f"Arquivo muito grande ({size_mb:.1f} MB). Máximo: {MAX_FILE_SIZE_MB} MB"
        )


def _build_share_url(token: str, base_url: str) -> str:
    return f"{base_url}/documentos/publico/{token}"


BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")
WHATSAPP_SHARE_BASE = os.getenv("WHATSAPP_API_URL", "")


# ── Roteadores ───────────────────────────────────────────────────────────────

router = APIRouter(
    prefix="/patients/{patient_id}/documents",
    tags=["Patient Documents"],
)

# Rota pública para compartilhamento — sem prefixo de paciente
public_router = APIRouter(tags=["Document Share"])


# ── LISTAGEM ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[DocumentOut])
def list_documents(
    patient_id: int,
    category: Optional[str] = Query(None, description="Filtrar por categoria"),
    q: Optional[str] = Query(None, description="Busca no título/descrição"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_patient_or_404(patient_id, db)

    query = db.query(PatientDocument).filter(
        PatientDocument.patient_id == patient_id,
        PatientDocument.is_deleted == False,
    )

    if category:
        if category not in DOCUMENT_CATEGORIES:
            raise HTTPException(400, f"Categoria inválida: {category}")
        query = query.filter(PatientDocument.category == category)

    if q:
        like = f"%{q}%"
        query = query.filter(
            PatientDocument.title.ilike(like) |
            PatientDocument.description.ilike(like)
        )

    docs = query.order_by(PatientDocument.date.desc(), PatientDocument.created_at.desc())\
                .offset(offset).limit(limit).all()

    return [DocumentOut.from_orm_ext(d) for d in docs]


@router.get("/categories")
def list_categories():
    """Retorna categorias disponíveis."""
    return [{"value": k, "label": v} for k, v in DOCUMENT_CATEGORIES.items()]


# ── UPLOAD DE ARQUIVO ─────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    patient_id: int,
    title: str = Form(...),
    category: str = Form("other"),
    date: str = Form(...),
    description: str = Form(""),
    tags: str = Form("[]"),       # JSON string: '["tag1","tag2"]'
    consultation_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """
    Upload de arquivo (PDF, imagem de exame, etc.).
    Suporta arquivos de até 25 MB.
    """
    _get_patient_or_404(patient_id, db)

    if category not in DOCUMENT_CATEGORIES:
        raise HTTPException(400, f"Categoria inválida: {category}")

    content = await file.read()
    _validate_upload(file, content)

    # Faz upload para Cloudinary ou storage local
    ext = os.path.splitext(file.filename or "doc.pdf")[1].lower() or ".pdf"
    fname = f"{uuid.uuid4().hex}{ext}"
    file_url = upload_file(content, fname, folder="patient_docs")

    import json as _json
    try:
        tag_list = _json.loads(tags)
    except Exception:
        tag_list = []

    from datetime import date as _date
    doc = PatientDocument(
        patient_id=patient_id,
        consultation_id=consultation_id,
        uploaded_by_id=current_user.id,
        title=title,
        category=category,
        description=description or None,
        date=_date.fromisoformat(date),
        tags=tag_list,
        file_url=file_url,
        file_name=file.filename,
        mime_type=file.content_type,
        file_size_kb=len(content) // 1024,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return DocumentOut.from_orm_ext(doc)


# ── FOTO DE CÂMERA ────────────────────────────────────────────────────────────

@router.post("/camera", response_model=DocumentOut, status_code=201)
async def upload_camera_photo(
    patient_id: int,
    title: str = Form(...),
    category: str = Form("exam"),
    date: str = Form(...),
    description: str = Form(""),
    consultation_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """
    Foto capturada pela câmera do dispositivo móvel.
    Aceita JPEG/PNG/WEBP/HEIC.
    Internamente idêntico ao /upload mas semântica diferente no frontend
    (aciona o input[capture='environment']).
    """
    _get_patient_or_404(patient_id, db)

    content = await file.read()
    _validate_upload(file, content)

    # Imagens de câmera sempre vão para subpasta dedicada
    ext = os.path.splitext(file.filename or "foto.jpg")[1].lower() or ".jpg"
    fname = f"cam_{uuid.uuid4().hex}{ext}"
    file_url = upload_file(content, fname, folder="patient_photos")

    from datetime import date as _date
    doc = PatientDocument(
        patient_id=patient_id,
        consultation_id=consultation_id,
        uploaded_by_id=current_user.id,
        title=title,
        category=category,
        description=description or None,
        date=_date.fromisoformat(date),
        tags=["câmera"],
        file_url=file_url,
        file_name=file.filename or fname,
        mime_type=file.content_type,
        file_size_kb=len(content) // 1024,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return DocumentOut.from_orm_ext(doc)


# ── VINCULAR DOC GERADO PELO SISTEMA ─────────────────────────────────────────

@router.post("/link-generated", response_model=DocumentOut, status_code=201)
def link_generated_document(
    patient_id: int,
    data: LinkGeneratedDocRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """
    Vincula um documento gerado internamente (receita, solicitação de exame,
    laudo, encaminhamento de fisio) ao gerenciador de documentos do paciente.
    Permite que o PDF gerado apareça unificado na galeria de documentos.
    """
    _get_patient_or_404(patient_id, db)

    from datetime import date as _date
    doc = PatientDocument(
        patient_id=patient_id,
        consultation_id=data.consultation_id,
        uploaded_by_id=current_user.id,
        title=data.title,
        category=data.category,
        description=data.description,
        date=_date.fromisoformat(data.date),
        tags=data.tags or [],
        generated_doc_type=data.generated_doc_type,
        generated_doc_id=data.generated_doc_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return DocumentOut.from_orm_ext(doc)


# ── DETALHE / ATUALIZAR / DELETAR ────────────────────────────────────────────

@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(
    patient_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc_or_404(doc_id, patient_id, db)
    return DocumentOut.from_orm_ext(doc)


@router.patch("/{doc_id}", response_model=DocumentOut)
def update_document(
    patient_id: int,
    doc_id: int,
    data: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    doc = _get_doc_or_404(doc_id, patient_id, db)
    if data.title is not None:
        doc.title = data.title
    if data.category is not None:
        doc.category = data.category
    if data.description is not None:
        doc.description = data.description
    if data.tags is not None:
        doc.tags = data.tags
    db.commit()
    db.refresh(doc)
    return DocumentOut.from_orm_ext(doc)


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    patient_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    doc = _get_doc_or_404(doc_id, patient_id, db)
    doc.is_deleted = True
    db.commit()


# ── ASSINATURA DIGITAL ────────────────────────────────────────────────────────

@router.post("/{doc_id}/sign", response_model=DocumentOut)
def capture_signature(
    patient_id: int,
    doc_id: int,
    payload: SignaturePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """
    Salva a assinatura digital capturada por toque (canvas PNG base64).
    Registra data/hora e nome do signatário para fins de auditoria.

    A imagem base64 fica armazenada no banco. Para conformidade legal mais
    robusta, integrar com ClickSign (já existe clicksign_service.py).
    """
    doc = _get_doc_or_404(doc_id, patient_id, db)

    if not payload.signature_data_url.startswith("data:image/"):
        raise HTTPException(400, "signature_data_url deve ser uma imagem base64 válida (data:image/...)")

    doc.signature_data_url = payload.signature_data_url
    doc.signature_at = datetime.now(timezone.utc)
    doc.signed_by_name = payload.signed_by_name
    db.commit()
    db.refresh(doc)
    return DocumentOut.from_orm_ext(doc)


# ── COMPARTILHAMENTO ──────────────────────────────────────────────────────────

@router.post("/{doc_id}/share", response_model=ShareOut)
def share_document(
    patient_id: int,
    doc_id: int,
    req: ShareRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """
    Compartilha documento com o paciente via:
      - "whatsapp": envia link via Evolution API (se configurado)
      - "email": envia e-mail (integrar com serviço de e-mail)
      - "link": retorna token de acesso temporário
    """
    doc = _get_doc_or_404(doc_id, patient_id, db)

    if req.channel not in ("whatsapp", "email", "link"):
        raise HTTPException(400, "Canal inválido. Use: whatsapp, email, link")

    # Gera token de compartilhamento
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=req.expires_hours)

    share = DocumentShare(
        document_id=doc.id,
        channel=req.channel,
        recipient=req.recipient,
        share_token=token,
        expires_at=expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    share_url = _build_share_url(token, BASE_URL)

    # Despacha envio em background (não bloqueia resposta)
    if req.channel == "whatsapp" and req.recipient:
        background_tasks.add_task(
            _send_whatsapp_share,
            phone=req.recipient,
            doc_title=doc.title,
            share_url=share_url,
        )
        message = f"Link enviado via WhatsApp para {req.recipient}"
    elif req.channel == "email" and req.recipient:
        background_tasks.add_task(
            _send_email_share,
            email=req.recipient,
            doc_title=doc.title,
            share_url=share_url,
        )
        message = f"Link enviado por e-mail para {req.recipient}"
    else:
        message = "Link de compartilhamento gerado"

    return ShareOut(
        channel=req.channel,
        recipient=req.recipient,
        share_url=share_url,
        expires_at=expires_at.isoformat(),
        message=message,
    )


# ── ACESSO PÚBLICO POR TOKEN ──────────────────────────────────────────────────

@public_router.get("/documentos/publico/{token}")
def access_shared_document(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Acesso público a um documento compartilhado via link temporário.
    Não requer autenticação. Marca opened_at no primeiro acesso.
    """
    share = db.query(DocumentShare).filter(
        DocumentShare.share_token == token,
    ).first()

    if not share:
        raise HTTPException(404, "Link inválido ou expirado")

    now = datetime.now(timezone.utc)
    if share.expires_at and share.expires_at < now:
        raise HTTPException(410, "Link expirado")

    # Marca primeiro acesso
    if not share.opened_at:
        share.opened_at = now
        db.commit()

    doc = db.query(PatientDocument).filter(
        PatientDocument.id == share.document_id,
        PatientDocument.is_deleted == False,
    ).first()

    if not doc:
        raise HTTPException(404, "Documento não encontrado")

    return {
        "title": doc.title,
        "category": DOCUMENT_CATEGORIES.get(doc.category, doc.category),
        "date": str(doc.date),
        "file_url": doc.file_url,
        "mime_type": doc.mime_type,
        "expires_at": share.expires_at.isoformat() if share.expires_at else None,
    }


# ── DOWNLOAD / PDF VIEWER ─────────────────────────────────────────────────────

@router.get("/{doc_id}/pdf")
def get_document_pdf(
    patient_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Para documentos com file_url: redireciona (302) para a URL de armazenamento.
    Para documentos gerados internamente: retorna URL do endpoint de geração de PDF.

    O viewer nativo no frontend usa esta URL para renderizar o PDF in-app.
    """
    doc = _get_doc_or_404(doc_id, patient_id, db)

    if doc.file_url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(doc.file_url, status_code=302)

    if doc.generated_doc_type and doc.generated_doc_id:
        # Mapeia para endpoint de geração de PDF existente
        pdf_endpoints = {
            "prescription":   f"/patients/{patient_id}/prescriptions/{doc.generated_doc_id}/pdf",
            "exam_request":   f"/patients/{patient_id}/exams/{doc.generated_doc_id}/pdf",
            "physio_request": f"/patients/{patient_id}/physio/{doc.generated_doc_id}/pdf",
            "medical_report": f"/patients/{patient_id}/reports/{doc.generated_doc_id}/pdf",
        }
        endpoint = pdf_endpoints.get(doc.generated_doc_type)
        if endpoint:
            from fastapi.responses import RedirectResponse
            return RedirectResponse(endpoint, status_code=302)

    raise HTTPException(404, "Este documento não possui arquivo associado")


# ── BACKGROUND TASKS ──────────────────────────────────────────────────────────

def _send_whatsapp_share(phone: str, doc_title: str, share_url: str):
    """
    Envia mensagem WhatsApp via Evolution API com link do documento.
    Usa a mesma infraestrutura de whatsapp.py.
    """
    try:
        import httpx
        wa_url = os.getenv("EVOLUTION_API_URL", "")
        wa_key = os.getenv("EVOLUTION_API_KEY", "")
        instance = os.getenv("WHATSAPP_INSTANCE", "ortho")

        if not wa_url or not wa_key:
            print(f"[DocumentShare] WhatsApp não configurado — link: {share_url}")
            return

        # Normaliza telefone
        phone_clean = "".join(filter(str.isdigit, phone))
        if not phone_clean.startswith("55"):
            phone_clean = "55" + phone_clean

        message = (
            f"Olá! Seu documento *{doc_title}* está disponível para visualização:\n\n"
            f"{share_url}\n\n"
            f"_Link válido por 72 horas. OrthoClinic._"
        )

        httpx.post(
            f"{wa_url}/message/sendText/{instance}",
            headers={"apikey": wa_key},
            json={"number": phone_clean, "text": message},
            timeout=10,
        )
    except Exception as e:
        print(f"[DocumentShare] Erro ao enviar WhatsApp: {e}")


def _send_email_share(email: str, doc_title: str, share_url: str):
    """
    Placeholder para envio de e-mail.
    Integrar com SendGrid/SMTP quando configurado.
    """
    print(f"[DocumentShare] E-mail para {email}: {doc_title} — {share_url}")
