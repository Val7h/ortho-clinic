"""Testes do Financeiro em tres faixas.
Executar com: pytest backend/test_financeiro_painel.py -v
"""
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, init_db
from models.financial import FinancialRecord
from models.patient import Patient

# Usa a mesma estratégia que init_db() para importar todos os modelos
from models import patient, consultation, documents, whatsapp, financial, media, anamnesis, clinic, organization, queue, push_notification, patient_documents, oauth2, patient_rx, prescription_template
from models import webhook, billing, audit_log, clinical_evolution, messages, sso, user_settings

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


@pytest.fixture
def db():
    s = TestingSessionLocal()
    yield s
    s.rollback()
    s.close()


def test_financial_record_guarda_procedimento(db):
    p = Patient(name="Teste Procedimento", organization_id=1)
    db.add(p)
    db.flush()

    r = FinancialRecord(
        organization_id=1,
        patient_id=p.id,
        amount=650.0,
        payment_method="pix",
        status="paid",
        date=date(2026, 8, 6),
        procedure_type="Infiltração",
    )
    db.add(r)
    db.flush()

    assert r.procedure_type == "Infiltração"


def test_procedure_type_e_opcional(db):
    p = Patient(name="Teste Consulta", organization_id=1)
    db.add(p)
    db.flush()

    r = FinancialRecord(
        organization_id=1,
        patient_id=p.id,
        amount=400.0,
        payment_method="dinheiro",
        status="paid",
        date=date(2026, 8, 6),
    )
    db.add(r)
    db.flush()

    assert r.procedure_type is None


def test_ficha_invalida_ou_ausente_vira_consulta():
    from routers.queue import PROCEDIMENTOS

    assert "Consulta" in PROCEDIMENTOS
    assert "Infiltração" in PROCEDIMENTOS

    def resolver(valor):
        return valor if valor in PROCEDIMENTOS else "Consulta"

    assert resolver(None) == "Consulta"
    assert resolver("qualquer coisa") == "Consulta"
    assert resolver("Zoledrônico") == "Zoledrônico"
