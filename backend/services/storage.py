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


# ── Pasta protegida (app do consultório no celular, 22/11/2026) ──────────────
# Foto de documento pessoal e de carteirinha do plano. Fica SÓ no banco
# (stored_files): nunca no Cloudinary (link público) nem no disco. O link só
# abre com assinatura (HMAC) que vale 2 h e só sai para quem está logado
# (patient_documents.DocumentOut). Outras pastas não mudam em nada.
import hashlib as _hashlib
import hmac as _hmac
import time as _time

PASTA_PRIVADA = "cadastro_privado"
_PREFIXO_PRIVADO = f"/uploads/{PASTA_PRIVADA}/"
VALIDADE_LINK_S = 2 * 3600


def guardar_privado(file_bytes: bytes, filename: str) -> str:
    """Grava a foto só no banco. Se o banco falhar, o erro sobe (nada de cópia em disco)."""
    if not filename or "/" in filename or "\\" in filename or filename in (".", ".."):
        raise ValueError("nome de arquivo inválido")
    _guardar_no_banco(f"{PASTA_PRIVADA}/{filename}", file_bytes)
    return f"{_PREFIXO_PRIVADO}{filename}"


def _chave_privada():
    """Chave derivada do SECRET_KEY. Segredo ausente, fraco ou o padrão de
    desenvolvimento = None (não assina e não aceita nenhum link)."""
    s = os.getenv("SECRET_KEY", "")
    if not s or "dev-secret" in s or len(s) < 32:
        return None
    return _hmac.new(s.encode(), b"orthomedic:cadastro_privado:v1", _hashlib.sha256).digest()


def _assinatura(caminho: str, expira: int, chave: bytes) -> str:
    return _hmac.new(chave, f"{caminho}|{expira}".encode(), _hashlib.sha256).hexdigest()


def assinar_se_privado(url, agora=None):
    """Link da pasta protegida ganha ?e=<expira>&s=<assinatura>. Qualquer outro
    link volta exatamente igual. Em qualquer erro, volta o link original."""
    try:
        if not isinstance(url, str) or not url.startswith(_PREFIXO_PRIVADO) or "?" in url:
            return url
        chave = _chave_privada()
        if chave is None:
            logger.warning("SECRET_KEY de desenvolvimento: link da pasta protegida não assinado")
            return url
        caminho = url[len("/uploads/"):]
        expira = int(agora if agora is not None else _time.time()) + VALIDADE_LINK_S
        return f"{url}?e={expira}&s={_assinatura(caminho, expira, chave)}"
    except Exception:
        logger.exception("Falha ao assinar link protegido")
        return url


def link_privado_valido(caminho: str, e, s, agora=None) -> bool:
    """caminho = 'cadastro_privado/<arquivo>'. Confere assinatura e validade."""
    try:
        chave = _chave_privada()
        if chave is None or not e or not s:
            return False
        expira = int(e)
        t = int(agora if agora is not None else _time.time())
        if expira < t or expira > t + VALIDADE_LINK_S + 60:
            return False
        return _hmac.compare_digest(_assinatura(caminho, expira, chave), str(s))
    except Exception:
        return False
