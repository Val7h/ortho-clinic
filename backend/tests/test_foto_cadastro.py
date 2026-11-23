"""Foto de documento pessoal e carteirinha pelo celular (22/11/2026).
Pasta protegida: só no banco, link assinado de 2 h. Roda: pytest -q --noconftest tests/test_foto_cadastro.py"""
import os, sys, io, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "teste-chave-forte-0123456789-abcdefghijklmnop"
for k in ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"):
    os.environ.pop(k, None)
from types import SimpleNamespace
from unittest import mock
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
import database, main
from database import Base, get_db
from deps import get_current_user
from models.patient import Patient
from models.patient_documents import PatientDocument
from models.stored_file import StoredFile
import services.storage as S
from routers.patient_documents import DocumentOut
from routers.envio_documentos import _bytes_do_documento

eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(eng)
Sess = sessionmaker(bind=eng)

SECRETARIA = SimpleNamespace(id=7, organization_id=1, role="secretary", active=True)
USUARIO = {"u": SECRETARIA}


def _get_db():
    db = Sess()
    try:
        yield db
    finally:
        db.close()


def _cliente():
    database.SessionLocal = Sess          # storage abre a sessão na hora de usar
    main.app.dependency_overrides[get_db] = _get_db
    main.app.dependency_overrides[get_current_user] = lambda: USUARIO["u"]
    return TestClient(main.app)


def _paciente(org=1):
    db = Sess()
    p = Patient(name="PACIENTE FICTICIO TESTE", organization_id=org)
    db.add(p); db.commit(); pid = p.id; db.close()
    return pid


def _jpeg_com_exif(cor=(200, 30, 30)):
    im = Image.new("RGB", (300, 100), cor)
    ex = Image.Exif()
    ex[0x010F] = "MarcaDoCelular"     # Make
    ex[0x0112] = 6                    # Orientation: girar 90
    b = io.BytesIO(); im.save(b, format="JPEG", exif=ex.tobytes()); return b.getvalue()


def _enviar(c, pid, dados, cat="identity", nome="foto.jpg", tipo="image/jpeg"):
    return c.post(f"/patients/{pid}/documents/foto-cadastro", data={"category": cat},
                  files={"file": (nome, dados, tipo)})


def test_secretaria_envia_201_sem_exif_e_so_no_banco():
    c = _cliente(); pid = _paciente()
    r = _enviar(c, pid, _jpeg_com_exif())
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["category"] == "identity" and j["file_url"].startswith("/uploads/cadastro_privado/")
    assert "?e=" in j["file_url"] and "&s=" in j["file_url"]
    db = Sess()
    doc = db.query(PatientDocument).get(j["id"])
    assert doc.file_url.startswith("/uploads/cadastro_privado/") and "?" not in doc.file_url  # gravado sem assinatura
    assert doc.uploaded_by_id == 7 and doc.organization_id == 1
    guardado = db.query(StoredFile).filter(StoredFile.path == doc.file_url[len("/uploads/"):]).first()
    db.close()
    assert guardado is not None
    im = Image.open(io.BytesIO(bytes(guardado.content)))
    assert im.format == "JPEG" and len(im.getexif()) == 0
    assert im.size == (100, 300)          # girou pela orientação e tirou o EXIF
    assert not os.path.exists(os.path.join("uploads", "cadastro_privado", os.path.basename(doc.file_url)))


def test_carteirinha_e_png_aceitos_e_lado_maior_2000():
    c = _cliente(); pid = _paciente()
    b = io.BytesIO(); Image.new("RGBA", (4000, 1000), (0, 0, 0, 0)).save(b, format="PNG")
    r = _enviar(c, pid, b.getvalue(), cat="insurance_card", nome="c.png", tipo="image/png")
    assert r.status_code == 201, r.text
    db = Sess(); doc = db.query(PatientDocument).get(r.json()["id"])
    f = db.query(StoredFile).filter(StoredFile.path == doc.file_url[len("/uploads/"):]).first(); db.close()
    assert max(Image.open(io.BytesIO(bytes(f.content))).size) == 2000


def test_outra_categoria_422():
    c = _cliente(); pid = _paciente()
    for cat in ("exam", "photo", "consent"):
        assert _enviar(c, pid, _jpeg_com_exif(), cat=cat).status_code == 422


def test_outros_documentos_entra_na_pasta_protegida():
    # 22/11 (Valth): botao "Outros documentos" do app; secretaria tambem envia.
    c = _cliente(); pid = _paciente()
    r = _enviar(c, pid, _jpeg_com_exif(), cat="other")
    assert r.status_code == 201
    j = r.json()
    assert j["category"] == "other" and j["title"] == "Outro documento (celular)"
    assert j["file_url"].startswith("/uploads/cadastro_privado/") and "s=" in j["file_url"]


def test_paciente_de_outra_conta_404():
    c = _cliente(); pid = _paciente(org=2)
    assert _enviar(c, pid, _jpeg_com_exif()).status_code == 404


def test_html_com_nome_jpg_422():
    c = _cliente(); pid = _paciente()
    r = _enviar(c, pid, b"<html><script>alert(1)</script></html>", nome="foto.jpg")
    assert r.status_code == 422


def test_maior_que_6mb_422():
    c = _cliente(); pid = _paciente()
    assert _enviar(c, pid, b"\xff\xd8\xff" + b"0" * (6 * 1024 * 1024)).status_code == 422


def test_mesma_foto_devolve_o_mesmo_documento():
    c = _cliente(); pid = _paciente()
    dados = _jpeg_com_exif(cor=(10, 120, 10))
    r1 = _enviar(c, pid, dados); r2 = _enviar(c, pid, dados)
    assert r1.status_code == 201 and r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    db = Sess()
    n = db.query(PatientDocument).filter(PatientDocument.patient_id == pid).count(); db.close()
    assert n == 1


def test_link_sem_assinatura_vencido_ou_adulterado_404_e_assinado_200():
    c = _cliente(); pid = _paciente()
    url = _enviar(c, pid, _jpeg_com_exif(cor=(1, 2, 3))).json()["file_url"]
    base = url.split("?")[0]
    r = c.get(url)
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert r.headers["cache-control"] == "private, no-store"
    assert c.get(base).status_code == 404
    assert c.get(url[:-1] + ("0" if url[-1] != "0" else "1")).status_code == 404
    vencido = S.assinar_se_privado(base, agora=time.time() - 3 * 3600)
    assert c.get(vencido).status_code == 404
    # assinatura de um arquivo não abre outro
    outro = _enviar(c, pid, _jpeg_com_exif(cor=(9, 9, 9))).json()["file_url"].split("?")[0]
    assert c.get(outro + "?" + url.split("?")[1]).status_code == 404


def test_segredo_de_desenvolvimento_nao_assina_nem_abre():
    c = _cliente(); pid = _paciente()
    url = _enviar(c, pid, _jpeg_com_exif(cor=(50, 50, 50))).json()["file_url"]
    with mock.patch.dict(os.environ, {"SECRET_KEY": "dev-secret-change-in-production-32chars"}):
        assert S.assinar_se_privado(url.split("?")[0]) == url.split("?")[0]
        assert c.get(url).status_code == 404


def test_documento_comum_tem_file_url_identico_ao_de_hoje():
    for u in ("/uploads/patient_docs/abc.pdf", "https://res.cloudinary.com/x/image/upload/v1/a.jpg",
              "/uploads/exames/x.png", None, "", "/uploads/cadastro_privado_falso/a.jpg"):
        doc = PatientDocument(id=1, patient_id=1, title="t", category="exam", date=__import__("datetime").date(2026, 11, 22),
                              tags=[], file_url=u)
        assert DocumentOut.from_orm_ext(doc).file_url == u
    assert S.assinar_se_privado(12345) == 12345
    # erro na assinatura devolve o link original
    with mock.patch.object(S, "_chave_privada", side_effect=RuntimeError("x")):
        assert S.assinar_se_privado("/uploads/cadastro_privado/a.jpg") == "/uploads/cadastro_privado/a.jpg"


def test_lista_e_pdf_assinam_so_a_pasta_protegida():
    c = _cliente(); pid = _paciente()
    db = Sess()
    comum = PatientDocument(patient_id=pid, title="RNM", category="exam", organization_id=1,
                            date=__import__("datetime").date(2026, 11, 22), tags=[], file_url="/uploads/patient_docs/rnm.pdf")
    db.add(comum); db.commit(); cid = comum.id; db.close()
    pid_doc = _enviar(c, pid, _jpeg_com_exif(cor=(77, 1, 1))).json()["id"]
    lista = {d["id"]: d["file_url"] for d in c.get(f"/patients/{pid}/documents").json()}
    assert lista[cid] == "/uploads/patient_docs/rnm.pdf"
    assert "&s=" in lista[pid_doc]
    r = c.get(f"/patients/{pid}/documents/{pid_doc}/pdf", follow_redirects=False)
    assert r.status_code == 302 and "&s=" in r.headers["location"]
    r = c.get(f"/patients/{pid}/documents/{cid}/pdf", follow_redirects=False)
    assert r.headers["location"] == "/uploads/patient_docs/rnm.pdf"


def test_envio_whatsapp_le_a_foto_protegida():
    c = _cliente(); pid = _paciente()
    j = _enviar(c, pid, _jpeg_com_exif(cor=(3, 3, 3))).json()
    db = Sess(); doc = db.query(PatientDocument).get(j["id"]); db.close()
    b = _bytes_do_documento(doc)
    assert b and b[:3] == b"\xff\xd8\xff"


def test_guardar_privado_erro_sobe_e_nao_grava_em_disco():
    with mock.patch.object(S, "_guardar_no_banco", side_effect=RuntimeError("banco fora")):
        try:
            S.guardar_privado(b"x", "a.jpg"); assert False, "devia subir o erro"
        except RuntimeError:
            pass
    assert not os.path.exists(os.path.join("uploads", "cadastro_privado", "a.jpg"))


# ── Revisão independente (22/11) ─────────────────────────────────────────────
MEDICO = SimpleNamespace(id=3, organization_id=1, role="doctor", active=True)


def test_documento_pessoal_e_carteirinha_nao_saem_por_link_publico():
    c = _cliente(); pid = _paciente()
    doc_id = _enviar(c, pid, _jpeg_com_exif(cor=(120, 5, 5))).json()["id"]
    USUARIO["u"] = MEDICO
    try:
        r = c.post(f"/patients/{pid}/documents/{doc_id}/share", json={"channel": "link"})
        assert r.status_code == 404
        # link criado antes da trava (ou por fora) também não abre
        from models.patient_documents import DocumentShare
        import datetime as _dt
        db = Sess()
        db.add(DocumentShare(document_id=doc_id, channel="link", share_token="tok-privado-teste", expires_at=None))  # sqlite perde o fuso; sem validade
        comum = PatientDocument(patient_id=pid, title="RNM", category="exam", organization_id=1,
                                date=_dt.date(2026, 11, 22), tags=[], file_url="/uploads/patient_docs/rnm2.pdf")
        db.add(comum); db.commit(); cid = comum.id; db.close()
        assert c.get("/documentos/publico/tok-privado-teste").status_code == 404
        # documento comum continua compartilhando igual
        r = c.post(f"/patients/{pid}/documents/{cid}/share", json={"channel": "link"})
        assert r.status_code == 200
        token = r.json()["share_url"].rsplit("/", 1)[1]
        db = Sess(); s = db.query(DocumentShare).filter(DocumentShare.share_token == token).first()
        s.expires_at = None; db.commit(); db.close()      # sqlite perde o fuso da validade
        j = c.get(f"/documentos/publico/{token}").json()
        assert j["file_url"] == "/uploads/patient_docs/rnm2.pdf"
    finally:
        USUARIO["u"] = SECRETARIA


def _paciente_cpf(cpf, org=1, nome="PACIENTE FICTICIO CPF"):
    db = Sess()
    p = Patient(name=nome, organization_id=org, cpf=cpf)
    db.add(p); db.commit(); pid = p.id; db.close()
    return pid


def test_put_cpf_de_outro_paciente_da_conta_409():
    c = _cliente()
    _paciente_cpf("390.533.447-05", nome="DONO FICTICIO DO CPF")
    pid = _paciente_cpf(None)
    r = c.put(f"/patients/{pid}", json={"cpf": "39053344705"})
    assert r.status_code == 409 and "outro paciente" in r.json()["detail"]
    db = Sess(); assert db.query(Patient).get(pid).cpf is None; db.close()


def test_put_sem_mudar_o_cpf_nao_e_afetado():
    c = _cliente()
    _paciente_cpf("86288366757", nome="GEMEO FICTICIO")   # duplicado legado já existente
    pid = _paciente_cpf("862.883.667-57")
    # salva outro campo, com o mesmo CPF (com ou sem máscara) ou sem mandar CPF
    assert c.put(f"/patients/{pid}", json={"cpf": "862.883.667-57", "phone": "83999990000"}).status_code == 200
    assert c.put(f"/patients/{pid}", json={"insurance": "Particular"}).status_code == 200


def test_put_cpf_igual_em_outra_conta_passa():
    c = _cliente()
    _paciente_cpf("71428793860", org=2)
    pid = _paciente_cpf(None)
    assert c.put(f"/patients/{pid}", json={"cpf": "71428793860"}).status_code == 200
