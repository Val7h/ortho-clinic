"""Pré-consulta não grava na ficha de OUTRA pessoa (19/11/2026). Roda: pytest --noconftest tests/test_pre_consulta_casamento.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
from types import SimpleNamespace
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import main  # noqa
from database import Base
from models.patient import Patient
from routers.pre_consulta import _achar_paciente


def _db():
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(e)
    db = sessionmaker(bind=e)()
    db.add_all([
        Patient(name="Maria Ficticia Souza", cpf="123.456.789-01", phone="5583999990000", organization_id=1, active=True),
        Patient(name="Joao Ficticio Lima", cpf="98765432100", phone="83988887777", organization_id=1, active=True),
    ])
    db.commit()
    return db


ESC = lambda q: q.filter(Patient.active == True)  # noqa: E731
D = lambda **k: SimpleNamespace(**{"cpf": None, "telefone": None, "nome": "", **k})  # noqa: E731


def test_cpf_inteiro_formatado_ou_nao_acha():
    db = _db()
    assert _achar_paciente(db, D(cpf="12345678901", nome="X"), ESC).name.startswith("Maria")
    assert _achar_paciente(db, D(cpf="987.654.321-00", nome="X"), ESC).name.startswith("Joao")


def test_pedaco_de_cpf_nao_acha():
    db = _db()
    assert _achar_paciente(db, D(cpf="1", nome="Ana"), ESC) is None
    assert _achar_paciente(db, D(cpf="123456", nome="Ana"), ESC) is None


def test_mae_pelo_filho_com_o_celular_dela_nao_cai_na_ficha_dela():
    db = _db()
    assert _achar_paciente(db, D(telefone="+55 83 99999-0000", nome="Pedrinho Souza"), ESC) is None


def test_mesmo_telefone_e_mesmo_primeiro_nome_acha():
    db = _db()
    p = _achar_paciente(db, D(telefone="(83) 99999-0000", nome="maria souza"), ESC)
    assert p is not None and p.name.startswith("Maria")


def test_mesmo_primeiro_nome_mas_cpf_diferente_nao_acha():
    db = _db()
    assert _achar_paciente(db, D(cpf="11122233344", telefone="83999990000", nome="Maria Eduarda"), ESC) is None


def test_telefone_com_mascara_na_ficha():
    db = _db()
    db.add(Patient(name="Ana Ficticia", phone="(83) 97777-6666", organization_id=1, active=True)); db.commit()
    assert _achar_paciente(db, D(telefone="5583977776666", nome="Ana"), ESC).name.startswith("Ana")


def test_telefone_curto_nao_acha():
    db = _db()
    assert _achar_paciente(db, D(telefone="0000", nome="Maria"), ESC) is None
