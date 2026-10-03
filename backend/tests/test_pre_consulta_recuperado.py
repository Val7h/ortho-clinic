"""/pre-consulta/submit em modo recuperado (16 formulários perdidos, 03/10).
Roda isolado: python tests/test_pre_consulta_recuperado.py"""
import os, sys, time, hmac, hashlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from datetime import date
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main  # noqa: F401
import routers.pre_consulta as pc
from database import Base
from models.anamnesis import Anamnesis
from models.clinic import Appointment
from models.patient import Patient

pc.FORM_SECRET = "segredo-teste"


def _db():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    db.add(Patient(name="Fulana", phone="5581999990000", organization_id=1, active=True,
                   allergies="DIPIRONA", insurance="UNIMED", birthdate=date(1960, 1, 1)))
    db.commit()
    return db


def _payload(**kw):
    ag = kw.pop("agendamento_id", "5581999990000-1753000000000")
    exp = str(int(time.time() * 1000) + 60000)
    tok = hmac.new(b"segredo-teste", f"{ag}:{exp}".encode(), hashlib.sha256).hexdigest()
    base = dict(token=tok, exp=exp, agendamento_id=ag, nome="Fulana", telefone="5581999990000",
                unidade="CTO", data_consulta="2026-07-28", alergias="NEGA", profissao="Costureira",
                forma_pagamento="particular", descricao="dor no joelho", recuperado=True,
                preenchido_em="2026-07-27 08:38:13")
    base.update(kw)
    return pc.PreConsultaPayload(**base)


def test_recuperado_nao_sobrescreve_e_nao_cria_agenda():
    db = _db()
    r = pc.submit_pre_consulta(_payload(), db)
    p = db.query(Patient).one()
    assert p.allergies == "DIPIRONA" and p.insurance == "UNIMED"
    assert str(p.birthdate) == "1960-01-01"
    assert p.occupation == "Costureira"
    assert db.query(Appointment).count() == 0 and r.appointment_id is None
    a = db.query(Anamnesis).one()
    assert a.responses["origem"] == "recuperado_pdf"
    assert a.responses["additional_notes"].startswith("RECUPERADO DO PDF")
    assert a.filled_at.strftime("%Y-%m-%d") == "2026-07-27"


def test_recuperado_sem_paciente_nao_cria_cadastro():
    db = _db()
    try:
        pc.submit_pre_consulta(_payload(telefone="5583888887777", agendamento_id="5583888887777-1"), db)
        assert False
    except HTTPException as e:
        assert e.status_code == 404
    assert db.query(Patient).count() == 1 and db.query(Anamnesis).count() == 0


def test_recuperado_idempotente():
    db = _db()
    pc.submit_pre_consulta(_payload(), db)
    pc.submit_pre_consulta(_payload(), db)
    assert db.query(Anamnesis).count() == 1


def test_criar_cadastro_so_com_flag_e_sem_agenda():
    db = _db()
    r = pc.submit_pre_consulta(_payload(telefone="5581777776666", agendamento_id="5581777776666-2",
                                        nome="Ciclana", criar_cadastro_se_nao_existir=True), db)
    assert r.criado is True and r.appointment_id is None
    assert db.query(Patient).count() == 2 and db.query(Appointment).count() == 0
    a = db.query(Anamnesis).filter(Anamnesis.token == "5581777776666-2").one()
    assert a.responses["origem"] == "recuperado_pdf"


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f(); print("OK", n)
