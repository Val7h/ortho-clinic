from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import os, uuid
from database import get_db
from models.media import ConsultationMedia
from deps import require_doctor
from services.storage import upload_file

router = APIRouter(prefix="/consultations/{consultation_id}/media", tags=["Media"], dependencies=[Depends(require_doctor)])


class MediaOut(BaseModel):
    id: int
    consultation_id: int
    patient_id: int
    file_path: str
    media_type: str
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


MEDIA_DIR = "uploads/media"
os.makedirs(MEDIA_DIR, exist_ok=True)


@router.get("", response_model=List[MediaOut])
def list_media(consultation_id: int, db: Session = Depends(get_db)):
    return (
        db.query(ConsultationMedia)
        .filter(ConsultationMedia.consultation_id == consultation_id)
        .order_by(ConsultationMedia.created_at)
        .all()
    )


@router.post("", response_model=MediaOut, status_code=201)
async def upload_media(
    consultation_id: int,
    patient_id: int = Form(...),
    media_type: str = Form("photo"),
    description: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "file.jpg")[1].lower() or ".jpg"
    fname = str(uuid.uuid4()) + ext
    content = await file.read()
    file_url = upload_file(content, fname, folder="consultations")

    media = ConsultationMedia(
        consultation_id=consultation_id,
        patient_id=patient_id,
        file_path=file_url,
        media_type=media_type,
        description=description or None,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


@router.delete("/{media_id}", status_code=204)
def delete_media(consultation_id: int, media_id: int, db: Session = Depends(get_db)):
    m = db.query(ConsultationMedia).filter(
        ConsultationMedia.id == media_id,
        ConsultationMedia.consultation_id == consultation_id,
    ).first()
    if not m:
        raise HTTPException(404, "Mídia não encontrada")
    # Remove file
    try:
        full = m.file_path.lstrip("/")
        if os.path.exists(full):
            os.remove(full)
    except Exception:
        pass
    db.delete(m)
    db.commit()
