"""WhatsApp, volume (revisão 19/11, item 6). Sem rede: o envio é simulado.
- parabéns: teto de 20 por dia e 20 a 40 s entre envios; quem não cabe fica para trás (log);
- lembrete: "failed" tenta no máximo 2 vezes no total; "incerto" (timeout depois do pedido) não repete;
- POST /whatsapp/send exige médico.
Roda: pytest -q --noconftest tests/test_whatsapp_volume.py"""
import os, sys, logging
from datetime import date, datetime, timedelta, timezone
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite://"
import pytest
import httpx
from types import SimpleNamespace
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import main
import database
from database import Base, get_db
from deps import get_current_user
from models.patient import Patient
from models.whatsapp import WhatsAppMessage
from models.procedure_reminder import ProcedureReminder
import services.whatsapp as W
import services.birthday_task as B
import services.reminder_task as R

BRT = timezone(timedelta(hours=-3))


@pytest.fixture
def ambiente(monkeypatch):
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    S = sessionmaker(bind=eng, autocommit=False, autoflush=False)
    monkeypatch.setattr(database, "SessionLocal", S)
    monkeypatch.setattr(W, "is_demo", lambda: False)
    envios, pausas = [], []
    resposta = {"r": {"sent": True, "demo": False}}

    def enviar(phone, text, instance=None):
        envios.append(phone)
        return dict(resposta["r"])

    monkeypatch.setattr(W, "send_whatsapp", enviar)
    monkeypatch.setattr(B, "_dormir", lambda s: pausas.append(s))
    return SimpleNamespace(S=S, envios=envios, pausas=pausas, resposta=resposta)


def _aniversariantes(S, n):
    hoje = datetime.now(BRT).date()
    db = S()
    for i in range(n):
        db.add(Patient(name=f"Teste {i}", birthdate=date(1980, hoje.month, hoje.day),  # 1980 é bissexto
                       phone=f"8399900{i:04d}", active=True, organization_id=1))
    db.commit(); db.close()


def test_parabens_teto_20_e_intervalo(ambiente, caplog):
    _aniversariantes(ambiente.S, 25)
    with caplog.at_level(logging.WARNING, logger="orthoclinic.birthday"):
        B._send_todays_birthdays()
    assert len(ambiente.envios) == 20
    assert len(ambiente.pausas) == 19
    assert all(20 <= s <= 40 for s in ambiente.pausas)
    assert "5 ficaram sem envio hoje" in caplog.text
    # novo ciclo no mesmo dia: teto já atingido, nada sai
    B._send_todays_birthdays()
    assert len(ambiente.envios) == 20


def test_parabens_falha_tenta_no_maximo_2_no_dia(ambiente):
    _aniversariantes(ambiente.S, 1)
    ambiente.resposta["r"] = {"sent": False, "demo": False, "error": "HTTP 500"}
    for _ in range(4):
        B._send_todays_birthdays()
    assert len(ambiente.envios) == 2


def test_parabens_incerto_nao_repete(ambiente):
    _aniversariantes(ambiente.S, 1)
    ambiente.resposta["r"] = {"sent": False, "demo": False, "incerto": True}
    for _ in range(3):
        B._send_todays_birthdays()
    assert len(ambiente.envios) == 1
    db = ambiente.S()
    assert db.query(WhatsAppMessage).one().status == "incerto"
    db.close()


def _lembrete(S):
    hoje = datetime.now(BRT).date()
    db = S()
    p = Patient(name="Teste Lembrete", phone="83999000001", active=True, organization_id=1)
    db.add(p); db.commit()
    db.add(ProcedureReminder(patient_id=p.id, procedure="Viscossuplementação",
                             applied_on=hoje - timedelta(days=170), interval_months=6, status="pending"))
    db.commit(); db.close()


def test_lembrete_failed_no_maximo_2_vezes(ambiente):
    _lembrete(ambiente.S)
    ambiente.resposta["r"] = {"sent": False, "demo": False, "error": "HTTP 500"}
    for _ in range(5):
        R._enviar_lembretes_devidos()
    assert len(ambiente.envios) == 2


def test_lembrete_incerto_nao_repete(ambiente):
    _lembrete(ambiente.S)
    ambiente.resposta["r"] = {"sent": False, "demo": False, "incerto": True}
    for _ in range(3):
        R._enviar_lembretes_devidos()
    assert len(ambiente.envios) == 1


def test_lembrete_enviado_nao_repete(ambiente):
    _lembrete(ambiente.S)
    for _ in range(3):
        R._enviar_lembretes_devidos()
    assert len(ambiente.envios) == 1


def test_send_whatsapp_timeout_de_leitura_e_incerto(monkeypatch):
    monkeypatch.setattr(W, "is_demo", lambda: False)
    monkeypatch.setattr(W, "connection_state", lambda inst: {"conectado": True, "estado": "open"})
    monkeypatch.setattr(W, "numero_tem_whatsapp", lambda ph, inst: True)

    def lento(*a, **k):
        raise httpx.ReadTimeout("lento")
    monkeypatch.setattr(W.httpx, "post", lento)
    r = W.send_whatsapp("83999000001", "oi")
    assert r.get("incerto") and W.status_envio(r) == "incerto"

    def escrita_lenta(*a, **k):
        raise httpx.WriteTimeout("parcial")
    monkeypatch.setattr(W.httpx, "post", escrita_lenta)
    r = W.send_whatsapp("83999000001", "oi")
    assert W.status_envio(r) == "failed"   # pedido não foi inteiro: tenta de novo

    def sem_conexao(*a, **k):
        raise httpx.ConnectTimeout("fora")
    monkeypatch.setattr(W.httpx, "post", sem_conexao)
    r = W.send_whatsapp("83999000001", "oi")
    assert W.status_envio(r) == "failed"


def test_rota_send_exige_medico():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    S = sessionmaker(bind=eng)

    def db_teste():
        db = S()
        try:
            yield db
        finally:
            db.close()
    main.app.dependency_overrides[get_db] = db_teste
    try:
        main.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id=2, role="secretary", organization_id=1, is_active=True)
        c = TestClient(main.app)
        r = c.post("/whatsapp/send", json={"patient_id": 1, "message_type": "custom", "custom_text": "x"})
        assert r.status_code == 403
        assert "médico" in r.json()["detail"].lower()
        # modelo pronto (sem texto livre): secretária passa da trava (404 = paciente não existe)
        r = c.post("/whatsapp/send", json={"patient_id": 999, "message_type": "return_reminder"})
        assert r.status_code == 404
        r = c.post("/whatsapp/send", json={"patient_id": 999, "message_type": "post_consultation", "custom_text": "  "})
        assert r.status_code == 404
        # data que não é data: secretária leva 422; data de verdade passa
        r = c.post("/whatsapp/send", json={"patient_id": 999, "message_type": "return_reminder",
                                            "appointment_date": "amanhã, e traga o dinheiro"})
        assert r.status_code == 422
        r = c.post("/whatsapp/send", json={"patient_id": 999, "message_type": "return_reminder",
                                            "consultation_date": "31/02/2026"})
        assert r.status_code == 422
        for d in ("25/12/2026", "2026-12-25", "25/12"):
            r = c.post("/whatsapp/send", json={"patient_id": 999, "message_type": "return_reminder",
                                                "appointment_date": d})
            assert r.status_code == 404, d
        main.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id=1, role="doctor", organization_id=1, is_active=True)
        r = c.post("/whatsapp/send", json={"patient_id": 999, "message_type": "custom", "custom_text": "x"})
        assert r.status_code == 404   # passou da trava de médico; paciente não existe
        r = c.post("/whatsapp/send", json={"patient_id": 999, "message_type": "return_reminder",
                                            "appointment_date": "qualquer coisa"})
        assert r.status_code == 404   # médico pode tudo
    finally:
        main.app.dependency_overrides.clear()


def test_render_template_texto_livre_so_espacos():
    import routers.whatsapp as RW
    assert RW._render_template("birthday", "Fulano Teste", None, "   ") == RW._render_template("birthday", "Fulano Teste")
    assert RW._render_template("birthday", "Fulano Teste", None, "  oi {nome}  ") == "oi Fulano Teste"
