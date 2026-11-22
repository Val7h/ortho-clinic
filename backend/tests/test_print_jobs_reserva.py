"""Impressora da clínica, revisão 19/11 itens 6 e 7 (lote 4, 22/11/2026).
- GET /print-jobs/pending RESERVA o pedido para a marca (aba/PC) que pediu; vence em 2 min sem /done.
- Clique duplo no POST barrado NO BANCO (índice único parcial), não só pelo select.
Dados fictícios. Roda isolado: python -m pytest -q --noconftest tests/test_print_jobs_reserva.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
from types import SimpleNamespace
import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import main  # noqa
import routers.entregues as E
import routers.print_jobs as PJ
from database import Base
from models.clinic import Clinic
from models.patient import Patient
from models.documents import MedicalReport

D = datetime.date(2026, 11, 19)
MED = SimpleNamespace(id=1, organization_id=1, role="doctor")
SEC = SimpleNamespace(id=2, organization_id=1, role="secretary")


def _db():
    PJ._tabela_ok = False
    E._tabela_ok = False
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(e)
    return sessionmaker(bind=e)()


def _base(db):
    c = Clinic(name="Clinica Ficticia", city="Cidade", state="PB", organization_id=1)
    p = Patient(name="Paciente Ficticio", organization_id=1)
    db.add_all([c, p]); db.commit()
    r = MedicalReport(patient_id=p.id, title="LAUDO MÉDICO", content="x", report_type="laudo", organization_id=1, date=D)
    db.add(r); db.commit()
    return c, p, r


def _job(db, c, r):
    return PJ.criar_job(PJ.PrintJobIn(kind="laudo", ref_id=r.id, clinic_id=c.id), db, MED)


def _ids(resp):
    return [j["id"] for j in resp["jobs"]]


def test_duas_abas_nao_recebem_o_mesmo_pedido():
    db = _db(); c, p, r = _base(db)
    j = _job(db, c, r)["id"]
    assert _ids(PJ.pendentes(c.id, "aba-A", db, SEC)) == [j]
    assert _ids(PJ.pendentes(c.id, "aba-B", db, SEC)) == []          # reservado para a aba A
    assert _ids(PJ.pendentes(c.id, "aba-A", db, SEC)) == [j]          # a própria aba continua vendo


def test_reserva_vence_em_2_min_sem_done():
    db = _db(); c, p, r = _base(db)
    j = _job(db, c, r)["id"]
    PJ.pendentes(c.id, "aba-A", db, SEC)
    velho = PJ._agora() - datetime.timedelta(minutes=PJ.MINUTOS_RESERVA, seconds=5)
    db.execute(text("update print_jobs set claimed_at=:t where id=:i"), {"t": velho, "i": j}); db.commit()
    assert _ids(PJ.pendentes(c.id, "aba-B", db, SEC)) == [j]
    assert _ids(PJ.pendentes(c.id, "aba-A", db, SEC)) == []           # agora é da aba B


def test_done_tira_da_fila_e_marca_entregue():
    db = _db(); c, p, r = _base(db)
    j = _job(db, c, r)["id"]
    PJ.pendentes(c.id, "aba-A", db, SEC)
    PJ.marcar_impresso(j, db, SEC)
    assert _ids(PJ.pendentes(c.id, "aba-A", db, SEC)) == []
    assert _ids(PJ.pendentes(c.id, "aba-B", db, SEC)) == []
    assert [i["kind"] for i in E.listar(p.id, db, MED)] == ["laudo"]


def test_pagina_antiga_sem_marca_continua_funcionando():
    db = _db(); c, p, r = _base(db)
    j = _job(db, c, r)["id"]
    assert _ids(PJ.pendentes(c.id, None, db, SEC)) == [j]
    assert _ids(PJ.pendentes(c.id, None, db, SEC)) == [j]             # mesma pessoa, mesmo pedido
    assert _ids(PJ.pendentes(c.id, "aba-nova", db, SEC)) == []


def test_clique_duplo_volta_o_mesmo_pedido():
    db = _db(); c, p, r = _base(db)
    a = _job(db, c, r); b = _job(db, c, r)
    assert a["id"] == b["id"] and b["ja_estava_na_fila"] is True
    assert db.execute(text("select count(*) from print_jobs")).scalar() == 1


def test_banco_barra_duplicata_viva():
    db = _db(); c, p, r = _base(db)
    _job(db, c, r)
    try:
        db.execute(text("insert into print_jobs(organization_id,clinic_id,patient_id,kind,ref_id) "
                        "values (1,:c,:p,'laudo',:r)"), {"c": c.id, "p": p.id, "r": r.id})
        db.commit(); assert False, "o índice único devia barrar"
    except IntegrityError:
        db.rollback()


def test_corrida_no_post_cai_no_indice_e_devolve_o_existente(monkeypatch=None):
    db = _db(); c, p, r = _base(db)
    primeiro = _job(db, c, r)["id"]
    # Simula a corrida: o select do 2º clique não viu o 1º (ainda não gravado) e tenta inserir.
    orig = db.execute
    estado = {"vez": 0}

    def execute(stmt, *a, **k):
        if "select id from print_jobs" in str(stmt) and estado["vez"] == 0:
            estado["vez"] = 1
            return orig(text("select null"))
        return orig(stmt, *a, **k)
    db.execute = execute
    try:
        out = _job(db, c, r)
    finally:
        db.execute = orig
    assert out == {"id": primeiro, "ja_estava_na_fila": True}


def test_depois_de_impresso_pode_entrar_de_novo():
    db = _db(); c, p, r = _base(db)
    j = _job(db, c, r)["id"]
    PJ.marcar_impresso(j, db, SEC)
    novo = _job(db, c, r)
    assert novo["id"] != j and novo["ja_estava_na_fila"] is False


def test_vencido_24h_sai_e_deixa_entrar_pedido_novo():
    db = _db(); c, p, r = _base(db)
    j = _job(db, c, r)["id"]
    velho = PJ._agora() - datetime.timedelta(hours=PJ.HORAS_VALIDADE + 1)
    db.execute(text("update print_jobs set created_at=:t where id=:i"), {"t": velho, "i": j}); db.commit()
    assert _ids(PJ.pendentes(c.id, "aba-A", db, SEC)) == []
    novo = _job(db, c, r)
    assert novo["id"] != j and novo["ja_estava_na_fila"] is False


def test_tabela_antiga_ganha_colunas_e_indice_com_duplicatas_resolvidas():
    PJ._tabela_ok = False
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(e)
    db = sessionmaker(bind=e)()
    db.execute(text("""create table print_jobs(id integer primary key autoincrement, organization_id int not null,
        clinic_id int not null, patient_id int not null, kind text not null, ref_id int not null, opcoes text,
        created_at timestamptz not null default CURRENT_TIMESTAMP, printed_at timestamptz, created_by int)"""))
    for _ in range(2):  # duplicata viva da era sem trava no banco
        db.execute(text("insert into print_jobs(organization_id,clinic_id,patient_id,kind,ref_id) values (1,1,1,'laudo',7)"))
    db.commit()
    PJ._garantir_tabela(db)
    vivos = db.execute(text("select id, claimed_at from print_jobs where printed_at is null")).fetchall()
    assert [v[0] for v in vivos] == [1] and vivos[0][1] is None


def test_marca_estranha_e_limpa():
    db = _db(); c, p, r = _base(db)
    j = _job(db, c, r)["id"]
    PJ.pendentes(c.id, "aba A'; drop", db, SEC)
    assert db.execute(text("select claimed_by from print_jobs where id=:i"), {"i": j}).scalar() == "abaAdrop"
