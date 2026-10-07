import os, cloudinary, cloudinary.uploader, uuid, logging, mimetypes
from pathlib import Path

logger = logging.getLogger("orthoclinic.storage")

CLOUDINARY_CLOUD = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_SEC = os.getenv("CLOUDINARY_API_SECRET", "")

_configured = bool(CLOUDINARY_CLOUD and CLOUDINARY_KEY and CLOUDINARY_SEC)

if _configured:
    cloudinary.config(cloud_name=CLOUDINARY_CLOUD, api_key=CLOUDINARY_KEY, api_secret=CLOUDINARY_SEC, secure=True)


def _guardar_no_banco(public_path: str, file_bytes: bytes) -> None:
    """Cópia durável: o disco do Render é apagado a cada publicação (07/10)."""
    from database import SessionLocal
    from models.stored_file import StoredFile

    mime = mimetypes.guess_type(public_path)[0] or "application/octet-stream"
    db = SessionLocal()
    try:
        existente = db.query(StoredFile).filter(StoredFile.path == public_path).first()
        if existente:
            existente.content = file_bytes
            existente.mime_type = mime
            existente.size_bytes = len(file_bytes)
        else:
            db.add(StoredFile(path=public_path, content=file_bytes, mime_type=mime, size_bytes=len(file_bytes)))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ler_do_banco(public_path: str):
    """Devolve (bytes, mime) ou None. public_path sem a barra inicial."""
    from database import SessionLocal
    from models.stored_file import StoredFile

    db = SessionLocal()
    try:
        f = db.query(StoredFile).filter(StoredFile.path == public_path).first()
        return (bytes(f.content), f.mime_type or "application/octet-stream") if f else None
    finally:
        db.close()


def upload_file(file_bytes, filename, folder="orthoclinic"):
    if _configured:
        pid = Path(filename).stem + "_" + uuid.uuid4().hex[:8]
        r = cloudinary.uploader.upload(file_bytes, folder=folder, public_id=pid, overwrite=True, resource_type="auto")
        return r["secure_url"]
    os.makedirs(f"uploads/{folder}", exist_ok=True)
    path = f"uploads/{folder}/{filename}"
    with open(path, "wb") as f:
        f.write(file_bytes)
    try:
        _guardar_no_banco(f"{folder}/{filename}", file_bytes)
    except Exception:
        # o arquivo continua no disco; só não sobrevive a uma publicação
        logger.exception("Não consegui guardar %s no banco", path)
    return f"/uploads/{folder}/{filename}"


def is_configured():
    return _configured
