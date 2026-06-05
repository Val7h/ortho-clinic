import os, cloudinary, cloudinary.uploader, uuid
from pathlib import Path

CLOUDINARY_CLOUD = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_SEC = os.getenv("CLOUDINARY_API_SECRET", "")

_configured = bool(CLOUDINARY_CLOUD and CLOUDINARY_KEY and CLOUDINARY_SEC)

if _configured:
    cloudinary.config(cloud_name=CLOUDINARY_CLOUD, api_key=CLOUDINARY_KEY, api_secret=CLOUDINARY_SEC, secure=True)


def upload_file(file_bytes, filename, folder="orthoclinic"):
    if _configured:
        pid = Path(filename).stem + "_" + uuid.uuid4().hex[:8]
        r = cloudinary.uploader.upload(file_bytes, folder=folder, public_id=pid, overwrite=True, resource_type="auto")
        return r["secure_url"]
    os.makedirs(f"uploads/{folder}", exist_ok=True)
    path = f"uploads/{folder}/{filename}"
    with open(path, "wb") as f:
        f.write(file_bytes)
    return f"/uploads/{folder}/{filename}"


def is_configured():
    return _configured
