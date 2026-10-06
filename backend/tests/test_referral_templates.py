"""Modelos de encaminhamento: criar, atualizar pelo mesmo nome, isolar por organização,
secretária não cria. Roda isolado: python tests/test_referral_templates.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
from types import SimpleNamespace
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import main  # noqa
from database import Base
from routers.referral_templates import listar, criar, apagar, ReferralTemplateIn

def _db():
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(e); return sessionmaker(bind=e)()
A = SimpleNamespace(id=1, organization_id=1, role="doctor")
B = SimpleNamespace(id=2, organization_id=2, role="doctor")

def test_cria_lista_e_atualiza_pelo_mesmo_nome():
    db = _db()
    t = criar(ReferralTemplateIn(name="Fisio hérnia", content="SOLICITO: FISIOTERAPIA MOTORA", ref_type="fisioterapia", modality="Fisioterapia motora", cid="M51.1"), db, A)
    criar(ReferralTemplateIn(name="Fisio hérnia", content="texto novo", ref_type="fisioterapia"), db, A)
    l = listar(db, A)
    assert len(l) == 1 and l[0].id == t.id and l[0].content == "texto novo"

def test_outra_organizacao_nao_ve_nem_apaga():
    db = _db()
    t = criar(ReferralTemplateIn(name="X", content="y"), db, A)
    assert listar(db, B) == []
    try: apagar(t.id, db, B); assert False
    except HTTPException as e: assert e.status_code == 404
    apagar(t.id, db, A); assert listar(db, A) == []

def test_nome_ou_texto_vazio_e_recusado():
    db = _db()
    for n, c in (("", "x"), ("n", " ")):
        try: criar(ReferralTemplateIn(name=n, content=c), db, A); assert False
        except HTTPException as e: assert e.status_code == 422

if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"): f(); print("OK", k)
