"""Documento entregue = versão oficial: depois de marcado, apagar devolve 409 (19/11/2026).
Roda isolado: python tests/test_entregues.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
from types import SimpleNamespace
import datetime
D = datetime.date(2026, 11, 19)
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import main  # noqa
import routers.entregues as E
from database import Base
from models.patient import Patient
from models.documents import MedicalReport, ExamRequest
from models.patient_rx import PatientRx
from routers.documents import delete_report, delete_exam
from routers.patient_prescriptions import delete_prescription


def _db():
    E._tabela_ok = False
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(e)
    return sessionmaker(bind=e)()


MED = SimpleNamespace(id=1, organization_id=1, role="doctor")
OUTRA = SimpleNamespace(id=9, organization_id=2, role="doctor")


def _base(db):
    p = Patient(name="Paciente Ficticio", organization_id=1); db.add(p); db.commit()
    r = MedicalReport(patient_id=p.id, title="LAUDO MÉDICO", content="x", report_type="laudo", organization_id=1, date=D)
    x = ExamRequest(patient_id=p.id, free_text="RNM", organization_id=1, date=D)
    rx = PatientRx(patient_id=p.id, prescription_type="simples", medications=[], organization_id=1, date=D)
    db.add_all([r, x, rx]); db.commit()
    return p, r, x, rx


def _409(f, *a):
    try:
        f(*a); assert False, "devia bloquear"
    except HTTPException as e:
        assert e.status_code == 409 and "documento novo" in e.detail


def test_nao_entregue_apaga_normal():
    db = _db(); p, r, x, rx = _base(db)
    delete_report(p.id, r.id, db, MED)
    assert db.query(MedicalReport).count() == 0


def test_entregue_nao_apaga_laudo_exame_receita():
    db = _db(); p, r, x, rx = _base(db)
    E.marcar_varios(p.id, E.MarcarIn(itens=[E.ItemEntregue(kind="laudo", ref_id=r.id),
                                           E.ItemEntregue(kind="exame", ref_id=x.id),
                                           E.ItemEntregue(kind="receita", ref_id=rx.id)], origem="tudo de hoje"), db, MED)
    _409(delete_report, p.id, r.id, db, MED)
    _409(delete_exam, p.id, x.id, db, MED)
    _409(delete_prescription, p.id, rx.id, db, MED)
    assert db.query(MedicalReport).count() == 1
    assert {(i["kind"], i["origem"]) for i in E.listar(p.id, db, MED)} >= {("laudo", "tudo de hoje")}


def test_marcar_duas_vezes_mantem_a_primeira():
    db = _db(); p, r, *_ = _base(db)
    E.marcar_varios(p.id, E.MarcarIn(itens=[E.ItemEntregue(kind="laudo", ref_id=r.id)], origem="impressora"), db, MED)
    E.marcar_varios(p.id, E.MarcarIn(itens=[E.ItemEntregue(kind="laudo", ref_id=r.id)], origem="outra"), db, MED)
    l = E.listar(p.id, db, MED)
    assert len(l) == 1 and l[0]["origem"] == "impressora"


def test_desmarcar_libera_e_outra_conta_nao_ve():
    db = _db(); p, r, *_ = _base(db)
    E.marcar_varios(p.id, E.MarcarIn(itens=[E.ItemEntregue(kind="laudo", ref_id=r.id)]), db, MED)
    try:
        E.listar(p.id, db, OUTRA); assert False
    except HTTPException as e:
        assert e.status_code == 404
    E.desmarcar(p.id, "laudo", r.id, db, MED)
    delete_report(p.id, r.id, db, MED)


def test_nao_marca_documento_de_outro_paciente():
    db = _db(); p, r, *_ = _base(db)
    p2 = Patient(name="Outro Ficticio", organization_id=1); db.add(p2); db.commit()
    out = E.marcar_varios(p2.id, E.MarcarIn(itens=[E.ItemEntregue(kind="laudo", ref_id=r.id)]), db, MED)
    assert out["marcados"] == 0
    delete_report(p.id, r.id, db, MED)


if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            f(); print("OK", k)
