"""E1 (23/11/2026): a Escriba da CLINICA nao grava pericia.
Motivo/observacao da entrada da sala de espera, ou do agendamento do dia, com a PALAVRA pericia
(sem maiuscula nem acento) => 409 "Perícia: Escriba da clínica desligada" ao abrir a sessao e ao
receber pedaco. Dados ficticios. Roda isolado:
python -m pytest -q --noconftest tests/test_escriba_trava_pericia.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
import asyncio
import datetime
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import main  # noqa
import routers.escriba as ES
from database import Base
from models.clinic import Appointment, Clinic
from models.escriba import EscribaConsentimento, EscribaPedaco, EscribaSessao
from models.patient import Patient
from models.queue import WaitingRoomEntry

MED = SimpleNamespace(id=1, organization_id=1, role="doctor")
DIA = datetime.date(2026, 11, 23)


@pytest.mark.parametrize("txt", ["Consulta Nova PERICIA", "perícia", "Perícias JT", "PERÍCIA do trabalho",
                                 "consulta / pericia", "(Pericia)", "pericia-jt"])
def test_palavra_pericia_trava(txt):
    assert ES.eh_pericia(txt)


@pytest.mark.parametrize("txt", ["experiência", "Experiencia de dor", "pericárdio", "pericardite", "periciando",
                                 "pericial", "imperícia", "Consulta Nova", "", None, "Retorno pós-op"])
def test_nao_trava(txt):
    assert not ES.eh_pericia(txt)


def _db():
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(e)
    return sessionmaker(bind=e)()


def _base(db, reason=None, notes=None):
    p = Patient(name="Paciente Ficticio", organization_id=1)
    db.add(p); db.commit()
    e = WaitingRoomEntry(patient_id=p.id, entry_date=DIA, status="attending", reason=reason, notes=notes)
    db.add(e)
    db.add(EscribaConsentimento(organization_id=1, patient_id=p.id, doctor_user_id=1, texto_versao="t"))
    db.commit()
    return e, p


class _Req:
    def __init__(self, corpo): self.corpo = corpo
    async def body(self): return self.corpo


def _pedaco(db, sid, seq=0):
    return asyncio.run(ES.receber_pedaco(sid, _Req(b"x" * 10), aparelho="ap1", seq=seq, ext="webm", t_ms=None, db=db, u=MED))


def test_ligar_recusa_pericia_no_motivo():
    db = _db(); e, _ = _base(db, reason="Consulta Nova PERICIA")
    with pytest.raises(HTTPException) as x:
        ES.ligar_sessao(ES.SessaoIn(entry_id=e.id, aparelho="ap1"), db, MED)
    assert x.value.status_code == 409 and x.value.detail == "Perícia: Escriba da clínica desligada"
    assert db.query(EscribaSessao).count() == 0


def test_ligar_recusa_pericia_na_observacao():
    db = _db(); e, _ = _base(db, reason="Consulta", notes="é perícia trabalhista")
    with pytest.raises(HTTPException) as x:
        ES.ligar_sessao(ES.SessaoIn(entry_id=e.id, aparelho="ap1"), db, MED)
    assert x.value.status_code == 409


def test_ligar_recusa_pericia_no_agendamento_do_dia():
    db = _db(); e, p = _base(db, reason="Consulta")
    c = Clinic(name="Clinica Ficticia"); db.add(c); db.commit()
    db.add(Appointment(clinic_id=c.id, date=DIA, patient_name="x", patient_id=p.id, reason="PERÍCIA", status="arrived"))
    db.commit()
    with pytest.raises(HTTPException) as x:
        ES.ligar_sessao(ES.SessaoIn(entry_id=e.id, aparelho="ap1"), db, MED)
    assert x.value.status_code == 409


def test_agendamento_cancelado_ou_de_outro_dia_nao_trava():
    db = _db(); e, p = _base(db, reason="Consulta")
    c = Clinic(name="Clinica Ficticia"); db.add(c); db.commit()
    db.add(Appointment(clinic_id=c.id, date=DIA, patient_name="x", patient_id=p.id, reason="pericia", status="cancelled"))
    db.add(Appointment(clinic_id=c.id, date=DIA - datetime.timedelta(days=1), patient_name="x", patient_id=p.id,
                       reason="pericia", status="completed"))
    db.commit()
    r = ES.ligar_sessao(ES.SessaoIn(entry_id=e.id, aparelho="ap1"), db, MED)
    assert r["estado"] == "gravando" and r["pericia"] is False


def test_consulta_comum_grava_e_recebe_pedaco():
    db = _db(); e, _ = _base(db, reason="Experiência de dor no pericárdio")
    r = ES.ligar_sessao(ES.SessaoIn(entry_id=e.id, aparelho="ap1"), db, MED)
    assert r["estado"] == "gravando"
    assert _pedaco(db, r["id"])["novo"] is True


def test_virou_pericia_no_meio_recusa_pedaco_e_para_no_sinal():
    db = _db(); e, _ = _base(db, reason="Consulta")
    r = ES.ligar_sessao(ES.SessaoIn(entry_id=e.id, aparelho="ap1"), db, MED)
    e.notes = "Pericia"; db.commit()
    with pytest.raises(HTTPException) as x:
        _pedaco(db, r["id"])
    assert x.value.status_code == 409 and x.value.detail == ES.PERICIA_MSG
    assert db.query(EscribaPedaco).count() == 0
    s = ES.sinal(r["id"], ES.SinalIn(aparelho="ap1", gravando=True), db, MED)
    assert s["estado"] == "parada" and s["pericia"] is True


def test_ponte_recebe_marca_pericia(monkeypatch):
    db = _db(); e, _ = _base(db, reason="Consulta")
    r = ES.ligar_sessao(ES.SessaoIn(entry_id=e.id, aparelho="ap1"), db, MED)
    e.reason = "perícia JT"; db.commit()
    out = ES.ponte_pendentes(0, 14, 100, db, 1)
    assert [x["pericia"] for x in out["sessoes"] if x["id"] == r["id"]] == [True]
