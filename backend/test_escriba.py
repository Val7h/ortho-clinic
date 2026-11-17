"""Rotas do Escriba integrado (fatia 1, 17/11/2026).
Executar (de backend/): pytest test_escriba.py -v
Banco SQLite em memoria; nada sai deste PC.
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ["ESCRIBA_PONTE_TOKEN"] = "chave-de-teste-da-ponte-com-mais-de-24"
os.environ["ESCRIBA_PONTE_ORG_ID"] = "1"

import pytest
from fastapi import Depends, Header
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
import deps
from database import Base, get_db
from models.escriba import EscribaPedaco, EscribaSessao
from models.organization import Organization, User
from models.patient import Patient
from models.queue import WaitingRoomEntry
from tzutil import today_br

PONTE = {"X-Escriba-Ponte": os.environ["ESCRIBA_PONTE_TOKEN"]}


@pytest.fixture
def ambiente():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    Sessao = sessionmaker(bind=eng)
    db = Sessao()
    db.add(Organization(id=1, name="Org Teste"))
    db.add(User(id=10, organization_id=1, name="Dr Teste", email="dr@x.test", password_hash="x", role="doctor", active=True))
    db.add(User(id=11, organization_id=1, name="Sec Teste", email="sec@x.test", password_hash="x", role="secretary", active=True))
    p = Patient(name="Paciente Inventado", organization_id=1, active=True)
    db.add(p)
    db.commit()
    e = WaitingRoomEntry(patient_id=p.id, position=1, entry_date=today_br(), status="attending",
                         called_at=datetime.now(timezone.utc), active_seconds=0)
    db.add(e)
    db.commit()

    def get_db_teste():
        s = Sessao()
        try:
            yield s
        finally:
            s.close()

    def usuario_teste(x_teste_usuario: str = Header("10"), db=Depends(get_db_teste)):
        return db.query(User).filter(User.id == int(x_teste_usuario)).first()

    main.app.dependency_overrides[get_db] = get_db_teste
    main.app.dependency_overrides[deps.get_current_user] = usuario_teste
    c = TestClient(main.app)
    yield c, Sessao, p.id, e.id
    main.app.dependency_overrides.clear()


MEDICO = {"X-Teste-Usuario": "10"}
SECRETARIA = {"X-Teste-Usuario": "11"}


def _ligar(c, pid, eid, aparelho="pc-1", tipo="pc"):
    assert c.post("/escriba/consentimento", json={"patient_id": pid, "entry_id": eid}, headers=MEDICO).status_code == 200
    r = c.post("/escriba/sessoes", json={"entry_id": eid, "aparelho": aparelho, "tipo": tipo}, headers=MEDICO)
    assert r.status_code == 200, r.text
    return r.json()


def test_sem_aviso_nao_grava(ambiente):
    c, _S, pid, eid = ambiente
    r = c.post("/escriba/sessoes", json={"entry_id": eid, "aparelho": "pc-1"}, headers=MEDICO)
    assert r.status_code == 409


def test_repetir_sessao_nao_duplica(ambiente):
    c, S, pid, eid = ambiente
    a = _ligar(c, pid, eid)
    b = _ligar(c, pid, eid)
    assert a["id"] == b["id"]
    db = S()
    assert db.query(EscribaSessao).count() == 1
    # aviso registrado uma vez so
    from models.escriba import EscribaConsentimento
    assert db.query(EscribaConsentimento).count() == 1


def test_repetir_pedaco_nao_duplica(ambiente):
    c, S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    url = f"/escriba/sessoes/{s['id']}/pedacos?aparelho=pc-1&seq=0&ext=webm&t_ms=1"
    r1 = c.post(url, content=b"audio-falso-1", headers=MEDICO)
    r2 = c.post(url, content=b"audio-falso-1", headers=MEDICO)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"] and r1.json()["novo"] and not r2.json()["novo"]
    assert S().query(EscribaPedaco).count() == 1


def test_confirmacao_apaga_audio(ambiente):
    c, S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    c.post(f"/escriba/sessoes/{s['id']}/pedacos?aparelho=pc-1&seq=0&ext=webm", content=b"abc", headers=MEDICO)
    pend = c.get("/escriba/ponte/pendentes", headers=PONTE).json()
    assert len(pend["pedacos"]) == 1 and pend["sessoes"][0]["nome"] == "Paciente Inventado"
    pid_ped = pend["pedacos"][0]["id"]
    assert c.get(f"/escriba/ponte/pedacos/{pid_ped}/audio", headers=PONTE).content == b"abc"
    assert c.post(f"/escriba/ponte/pedacos/{pid_ped}/recebido", headers=PONTE).status_code == 200
    assert c.post(f"/escriba/ponte/pedacos/{pid_ped}/recebido", headers=PONTE).status_code == 200  # repetir nao faz mal
    db = S()
    p = db.query(EscribaPedaco).first()
    assert p.audio is None and p.confirmado_em is not None
    assert c.get(f"/escriba/ponte/pedacos/{pid_ped}/audio", headers=PONTE).status_code == 410
    assert c.get("/escriba/ponte/pendentes", headers=PONTE).json()["pedacos"] == []


def test_secretaria_recebe_403(ambiente):
    c, _S, pid, eid = ambiente
    assert c.get("/escriba/atendimento-atual", headers=SECRETARIA).status_code == 403
    assert c.post("/escriba/consentimento", json={"patient_id": pid}, headers=SECRETARIA).status_code == 403
    assert c.post("/escriba/sessoes", json={"entry_id": eid, "aparelho": "x"}, headers=SECRETARIA).status_code == 403
    assert c.post("/escriba/sessoes/1/pedacos?aparelho=x&seq=0", content=b"a", headers=SECRETARIA).status_code == 403


def test_ponte_sem_chave_recusa(ambiente):
    c, *_ = ambiente
    assert c.get("/escriba/ponte/pendentes").status_code == 401
    assert c.get("/escriba/ponte/pendentes", headers={"X-Escriba-Ponte": "errada"}).status_code == 401


def test_suspender_pausa_finalizar_para_e_nunca_liga(ambiente):
    c, S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    assert c.patch(f"/api/clinic/waiting-room/{eid}/status", json={"status": "suspended"}, headers=MEDICO).status_code == 200
    r = c.post(f"/escriba/sessoes/{s['id']}/sinal", json={"aparelho": "pc-1"}, headers=MEDICO).json()
    assert r["estado"] == "pausada"
    # Continuar no PC NAO liga a gravacao sozinha no servidor: segue pausada ate um clique no aparelho
    assert c.patch(f"/api/clinic/waiting-room/{eid}/status", json={"status": "attending"}, headers=MEDICO).status_code == 200
    r = c.post(f"/escriba/sessoes/{s['id']}/sinal", json={"aparelho": "pc-1"}, headers=MEDICO).json()
    assert r["estado"] == "pausada"
    assert c.patch(f"/api/clinic/waiting-room/{eid}/status", json={"status": "attended"}, headers=MEDICO).status_code == 200
    r = c.post(f"/escriba/sessoes/{s['id']}/sinal", json={"aparelho": "pc-1"}, headers=MEDICO).json()
    assert r["estado"] == "parada"


def test_celular_assume_e_pc_fica_sabendo(ambiente):
    c, _S, pid, eid = ambiente
    s = _ligar(c, pid, eid, "pc-1", "pc")
    s2 = _ligar(c, pid, eid, "cel-1", "celular")
    assert s2["id"] == s["id"] and s2["ativo"]
    r = c.post(f"/escriba/sessoes/{s['id']}/sinal", json={"aparelho": "pc-1"}, headers=MEDICO).json()
    assert r["ativo"] is False and r["aparelho_tipo"] == "celular"
    atual = c.get("/escriba/atendimento-atual", headers=MEDICO).json()
    assert atual["entry"]["id"] == eid and atual["consentimento"] is True
