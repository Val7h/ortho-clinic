"""
Arquivos enviados (anexos, fotos), guardados NO BANCO.

07/10/2026 (Valth): o disco do Render é apagado a cada publicação/reinício, e
laudos, ressonâncias e fotos anexados ao prontuário sumiam ("Not Found") — foi
preciso restaurar 10 anexos à mão depois de cada publicação. Sem Cloudinary
configurado, o arquivo agora também fica aqui (bytea), e a rota /uploads/...
serve a partir do banco.
"""
from sqlalchemy import Column, String, LargeBinary, Integer, DateTime
from sqlalchemy.sql import func

from database import Base


class StoredFile(Base):
    __tablename__ = "stored_files"

    # caminho público sem a barra inicial, ex.: "patient_docs/ab12cd.pdf"
    path = Column(String(400), primary_key=True)
    content = Column(LargeBinary, nullable=False)
    mime_type = Column(String(120), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
