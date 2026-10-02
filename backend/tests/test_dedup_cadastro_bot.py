"""Cadastro do balcão completa o cadastro que o bot do WhatsApp criou (só nome +
telefone) em vez de duplicar.

Roda isolado (sem o conftest antigo): python tests/test_dedup_cadastro_bot.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from types import SimpleNamespace
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main  # noqa: F401  (registra todas as tabelas, como em produção)
from database import Base
from models.patient import Patient
from routers.patients import create_patient
from schemas.patient import PatientCreate


def _db():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng)()


DOUTOR = SimpleNamespace(id=1, organization_id=1, role="doctor")


def _bot(db, nome="Quitéria da Rocha Cavalcante", fone="5581982429987", cpf=None):
    p = Patient(name=nome, phone=fone, cpf=cpf, organization_id=1, active=True)
    db.add(p); db.commit(); db.refresh(p)
    return p


def test_balcao_completa_cadastro_do_bot():
    db = _db(); bot = _bot(db)
    r = create_patient(PatientCreate(name="QUITERIA DA ROCHA CAVALCANTE", phone="(81) 98242-9987",
                                     birthdate="1970-05-10", insurance="UNIMED"), db, DOUTOR)
    assert r.id == bot.id and r.warning
    assert db.query(Patient).count() == 1
    db.refresh(bot)
    assert str(bot.birthdate) == "1970-05-10" and bot.insurance == "UNIMED"


def test_outra_pessoa_mesmo_telefone_nao_e_juntada():
    db = _db(); _bot(db, nome="Maria da Silva")
    r = create_patient(PatientCreate(name="JOSE DA SILVA", phone="81982429987"), db, DOUTOR)
    assert db.query(Patient).count() == 2 and r.warning is None


def test_cadastro_com_cpf_nao_e_sobrescrito():
    db = _db(); bot = _bot(db, cpf="52998224725")
    r = create_patient(PatientCreate(name="QUITERIA DA ROCHA CAVALCANTE", phone="81982429987"), db, DOUTOR)
    assert r.id != bot.id and db.query(Patient).count() == 2


if __name__ == "__main__":
    for nome, f in list(globals().items()):
        if nome.startswith("test_"):
            f(); print("OK", nome)
