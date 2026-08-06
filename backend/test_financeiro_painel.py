"""Testes do Financeiro em tres faixas.
Executar com: pytest backend/test_financeiro_painel.py -v
"""
from datetime import date, timedelta

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


def test_periodo_pela_hora_de_inicio():
    from routers.financial import _periodo

    assert _periodo("08:00") == "manhã"
    assert _periodo("12:59") == "manhã"
    assert _periodo("13:00") == "tarde"
    assert _periodo("14:30") == "tarde"


def test_horas_do_turno_conta_ocorrencias_do_dia_da_semana():
    from routers.financial import _horas_do_turno

    class FakeSched:
        day_of_week = 3      # quinta
        start_time = "14:00"
        end_time = "18:00"   # 4 horas

    # 01/08/2026 a 06/08/2026: quintas em 06/08 apenas -> 4h
    assert _horas_do_turno(FakeSched(), date(2026, 8, 1), date(2026, 8, 6)) == 4.0

    # 01/08/2026 a 31/08/2026: quintas em 06, 13, 20, 27 -> 16h
    assert _horas_do_turno(FakeSched(), date(2026, 8, 1), date(2026, 8, 31)) == 16.0


def test_horas_do_turno_com_horario_invalido_devolve_zero():
    from routers.financial import _horas_do_turno

    class FakeSched:
        day_of_week = 0
        start_time = None
        end_time = "12:00"

    assert _horas_do_turno(FakeSched(), date(2026, 8, 1), date(2026, 8, 31)) == 0.0


def test_registro_sem_etiqueta_nunca_conta_como_procedimento():
    from routers.financial import _classificar_mix

    linhas = [
        ("Consulta", 400.0, 2),
        (None, 400.0, 5),
        ("Infiltração", 650.0, 1),
        ("Outro", 300.0, 1),
    ]
    mix = _classificar_mix(linhas)

    assert mix["consulta"]["qtd"] == 7          # 2 etiquetados + 5 sem etiqueta
    assert mix["procedimento"]["qtd"] == 2      # Infiltração + Outro
    assert [l["tipo"] for l in mix["linhas"]] == ["Infiltração", "Outro"]
    # `soma` chega da query já agregada (func.sum por grupo) — não é preço
    # unitário, então não se multiplica por qtd. (950/2) / (800/7) = 4.16.
    assert mix["razao_ticket"] == 4.16


def test_secretaria_nao_ve_o_painel():
    from fastapi.testclient import TestClient
    from database import get_db
    from deps import get_current_user
    from main import app
    from models.organization import User

    class FakeSecretaria:
        id = 99
        role = "secretary"
        organization_id = 1

    app.dependency_overrides[get_current_user] = lambda: FakeSecretaria()
    app.dependency_overrides[get_db] = lambda: TestingSessionLocal()
    try:
        resposta = TestClient(app).get("/financial/painel")
        assert resposta.status_code == 403
    finally:
        app.dependency_overrides.clear()
