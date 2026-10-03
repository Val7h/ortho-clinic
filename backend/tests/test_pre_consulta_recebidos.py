"""GET /pre-consulta/recebidos: só responde com assinatura HMAC válida e não vencida.
Roda isolado: python tests/test_pre_consulta_recebidos.py"""
import os, sys, time, hmac, hashlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ["FORM_SECRET"] = "segredo-teste"

from datetime import date, datetime, timezone
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main  # noqa: F401
import routers.pre_consulta as pc
from database import Base
from models.anamnesis import Anamnesis
from models.patient import Patient

pc.FORM_SECRET = "segredo-teste"


def _db():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    p = Patient(name="X", organization_id=1, active=True); db.add(p); db.commit()
    db.add(Anamnesis(patient_id=p.id, token="5583999990000-1700000000", status="filled",
                     responses={}, filled_at=datetime(2026, 9, 20, 12, tzinfo=timezone.utc)))
    db.add(Anamnesis(patient_id=p.id, token="5583999990001-1700000001", status="pending", responses={}))
    db.commit()
    return db


def _ass(desde, ate, exp, segredo="segredo-teste"):
    return hmac.new(segredo.encode(), f"recebidos:{desde}:{ate}:{exp}".encode(), hashlib.sha256).hexdigest()


def test_assinatura_valida_devolve_so_preenchidos():
    db = _db(); exp = str(int(time.time() * 1000) + 60000)
    r = pc.formularios_recebidos(date(2026, 9, 1), date(2026, 9, 30), exp, _ass("2026-09-01", "2026-09-30", exp), db)
    assert [x.token for x in r] == ["5583999990000-1700000000"]


def test_assinatura_errada_recusa():
    db = _db(); exp = str(int(time.time() * 1000) + 60000)
    try:
        pc.formularios_recebidos(date(2026, 9, 1), date(2026, 9, 30), exp, _ass("2026-09-01", "2026-09-30", exp, "outro"), db)
        assert False
    except HTTPException as e:
        assert e.status_code == 401


def test_vencida_recusa():
    db = _db(); exp = str(int(time.time() * 1000) - 1)
    try:
        pc.formularios_recebidos(date(2026, 9, 1), date(2026, 9, 30), exp, _ass("2026-09-01", "2026-09-30", exp), db)
        assert False
    except HTTPException as e:
        assert e.status_code == 401


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f(); print("OK", n)
