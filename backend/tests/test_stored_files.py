"""Anexos sobrevivem à perda do disco: upload grava no banco e a rota /uploads serve do banco.
Roda isolado: python tests/test_stored_files.py"""
import os, sys, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite://"
for k in ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"):
    os.environ.pop(k, None)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
import database, main
from database import Base

eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(eng)
database.SessionLocal = sessionmaker(bind=eng)   # storage importa SessionLocal na hora de usar
from services.storage import upload_file


def test_arquivo_sobrevive_a_perda_do_disco():
    os.chdir(tempfile.mkdtemp()); os.makedirs("uploads/photos", exist_ok=True)
    url = upload_file(b"%PDF-1.4 conteudo de teste", "abc123.pdf", folder="patient_docs")
    assert url == "/uploads/patient_docs/abc123.pdf"
    shutil.rmtree("uploads")            # o que o Render faz a cada publicação
    os.makedirs("uploads/photos", exist_ok=True)
    c = TestClient(main.app)
    r = c.get(url)
    assert r.status_code == 200 and r.content.startswith(b"%PDF") and r.headers["content-type"] == "application/pdf"


def test_inexistente_e_caminho_malicioso_dao_404():
    c = TestClient(main.app)
    assert c.get("/uploads/patient_docs/nao_existe.pdf").status_code == 404
    assert c.get("/uploads/patient_docs/..%2F..%2Fmain.py").status_code in (404, 422)


if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"): f(); print("OK", k)
