"""Lote 3 da revisão de 19/11 (22/11/2026): tipo de receita só simples/controle_especial/antimicrobiano;
link público com teto de 72 h, validade real no WhatsApp e token fora do log; foto da consulta só do
paciente da consulta; /pdf de documento gerado devolve erro claro. Sem rede, banco em memória.
Roda: pytest -q --noconftest tests/test_lote3_receita_documentos.py"""
import os, sys, io, asyncio, datetime
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
from types import SimpleNamespace
from unittest import mock
from fastapi import HTTPException, BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import main  # noqa
from database import Base
from models.patient import Patient
from models.consultation import Consultation
from models.patient_documents import PatientDocument, DocumentShare
import routers.patient_prescriptions as RX
import routers.patient_documents as PD
import routers.media as MD

D = datetime.date(2026, 11, 22)
MED = SimpleNamespace(id=1, organization_id=1, role="doctor")


def _db():
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(e)
    return sessionmaker(bind=e)()


def _paciente(db, nome="Paciente Ficticio"):
    p = Patient(name=nome, organization_id=1); db.add(p); db.commit()
    return p


# ── Receita: tipo ───────────────────────────────────────────────────────────

def _rx(db, pid, tipo, texto="DIPIRONA 1G"):
    with mock.patch("routers.medicamentos.tipo_exigido", return_value=None):
        return RX.create_prescription(pid, RX.PatientRxCreate(date=str(D), prescription_type=tipo,
                                                              instructions=texto), db, MED)


def test_tipos_validos_gravam():
    db = _db(); p = _paciente(db)
    for i, t in enumerate(("simples", "controle_especial", "antimicrobiano")):
        assert _rx(db, p.id, t, f"REMEDIO {i}").prescription_type == t


def test_vazio_continua_simples():
    db = _db(); p = _paciente(db)
    assert _rx(db, p.id, "", "A").prescription_type == "simples"
    assert _rx(db, p.id, None, "B").prescription_type == "simples"


def test_tipo_invalido_422():
    db = _db(); p = _paciente(db)
    for t in ("controlado", "Simples", "notificacao_ab", "simples ", "antibiotico"):
        try:
            _rx(db, p.id, t); assert False, t
        except HTTPException as e:
            assert e.status_code == 422, t
    assert db.query(RX.PatientRx).count() == 0


def test_servidor_sobe_simples_para_controle():
    db = _db(); p = _paciente(db)
    with mock.patch("routers.medicamentos.tipo_exigido", return_value="controle_especial"):
        r = RX.create_prescription(p.id, RX.PatientRxCreate(date=str(D), prescription_type="simples",
                                                            instructions="TRAMADOL 50MG"), db, MED)
    assert r.prescription_type == "controle_especial"   # é este que a tela usa para imprimir


# ── Link público ────────────────────────────────────────────────────────────

def test_teto_72h():
    assert PD._horas_do_link(72) == 72
    assert PD._horas_do_link(24) == 24
    assert PD._horas_do_link(10000) == 72
    assert PD._horas_do_link(0) == 1
    assert PD._horas_do_link(-5) == 1
    assert PD._horas_do_link(None) == 72


def _doc(db, pid, **kw):
    d = PatientDocument(patient_id=pid, title="Exame ficticio", category="exam", date=D, **kw)
    db.add(d); db.commit()
    return d


def test_share_respeita_teto_e_whatsapp_recebe_horas():
    db = _db(); p = _paciente(db); d = _doc(db, p.id, file_url="/uploads/x/a.pdf")
    bt = BackgroundTasks()
    antes = datetime.datetime.now(datetime.timezone.utc)
    out = PD.share_document(p.id, d.id, PD.ShareRequest(channel="whatsapp", recipient="83900000000",
                                                         expires_hours=1000), bt, db, MED)
    exp = datetime.datetime.fromisoformat(out.expires_at)
    assert exp - antes <= datetime.timedelta(hours=72, minutes=1)
    assert bt.tasks and bt.tasks[0].kwargs["horas"] == 72

    bt = BackgroundTasks()
    PD.share_document(p.id, d.id, PD.ShareRequest(channel="whatsapp", recipient="83900000000",
                                                  expires_hours=24), bt, db, MED)
    assert bt.tasks[0].kwargs["horas"] == 24


def test_mensagem_diz_validade_real_e_token_fora_do_log(capsys):
    url = "https://exemplo.invalid/documentos/publico/TOKENSECRETO123"
    enviado = {}

    def falso_post(u, headers=None, json=None, timeout=None):
        enviado["texto"] = json["text"]

    with mock.patch.dict(os.environ, {"EVOLUTION_API_URL": "http://evolution.invalid", "EVOLUTION_API_KEY": "x"}), \
            mock.patch("httpx.post", side_effect=falso_post):
        PD._send_whatsapp_share("83900000000", "Exame", url, horas=24)
    assert "válido por 24 horas" in enviado["texto"] and "72" not in enviado["texto"]

    with mock.patch.dict(os.environ, {"EVOLUTION_API_URL": "", "EVOLUTION_API_KEY": ""}):
        PD._send_whatsapp_share("83900000000", "Exame", url, horas=24)
    with mock.patch.dict(os.environ, {"EVOLUTION_API_URL": "http://evolution.invalid", "EVOLUTION_API_KEY": "x"}), \
            mock.patch("httpx.post", side_effect=RuntimeError(url)):
        PD._send_whatsapp_share("83900000000", "Exame", url, horas=24)
    PD._send_email_share("a@b.invalid", "Exame", url)
    saida = capsys.readouterr()
    assert "TOKENSECRETO123" not in saida.out + saida.err


# ── /pdf de documento gerado ────────────────────────────────────────────────

def test_pdf_documento_gerado_erro_claro():
    db = _db(); p = _paciente(db)
    d = _doc(db, p.id, generated_doc_type="prescription", generated_doc_id=5)
    try:
        PD.get_document_pdf(p.id, d.id, db, MED); assert False
    except HTTPException as e:
        assert e.status_code == 404 and "aba Receita" in e.detail


def test_pdf_com_arquivo_continua_redirecionando():
    db = _db(); p = _paciente(db); d = _doc(db, p.id, file_url="/uploads/x/a.pdf")
    r = PD.get_document_pdf(p.id, d.id, db, MED)
    assert r.status_code == 302 and r.headers["location"] == "/uploads/x/a.pdf"


# ── Foto da consulta ────────────────────────────────────────────────────────

class _Arq:
    filename = "foto.jpg"

    async def read(self):
        return b"\xff\xd8\xff fake"


def test_media_paciente_diferente_da_consulta_422():
    db = _db(); p1 = _paciente(db, "Ficticio Um"); p2 = _paciente(db, "Ficticio Dois")
    c = Consultation(patient_id=p1.id, date=datetime.datetime(2026, 11, 22, 9, 0)); db.add(c); db.commit()
    with mock.patch.object(MD, "upload_file", return_value="/uploads/consultations/x.jpg") as up:
        try:
            asyncio.run(MD.upload_media(c.id, p2.id, "photo", "", _Arq(), db)); assert False
        except HTTPException as e:
            assert e.status_code == 422
        assert not up.called
        m = asyncio.run(MD.upload_media(c.id, p1.id, "photo", "", _Arq(), db))
        assert m.patient_id == p1.id
