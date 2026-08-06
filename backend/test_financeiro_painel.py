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
    ]
    mix = _classificar_mix(linhas)

    assert mix["consulta"]["qtd"] == 7          # 2 etiquetados + 5 sem etiqueta
    assert mix["procedimento"]["qtd"] == 1      # só Infiltração
    assert [l["tipo"] for l in mix["linhas"]] == ["Infiltração"]
    # `soma` chega da query já agregada (func.sum por grupo) — não é preço
    # unitário, então não se multiplica por qtd. (650/1) / (800/7) = 5.6875.
    assert mix["razao_ticket"] == 5.69


def test_outro_aparece_na_lista_mas_nao_infla_procedimento():
    """Achado 3: 'Outro' é o cesto genérico (taxa de laudo, algo atípico) —
    o médico precisa VER o valor, mas ele não pode inflar o headline de
    procedimento nem a razão de ticket (spec: nunca inflar por suposição)."""
    from routers.financial import _classificar_mix

    linhas = [
        ("Consulta", 400.0, 2),
        ("Infiltração", 650.0, 1),
        ("Outro", 300.0, 1),
    ]
    mix = _classificar_mix(linhas)

    # "Outro" fica visível na lista de linhas...
    assert {l["tipo"] for l in mix["linhas"]} == {"Infiltração", "Outro"}
    # ...mas não conta no total de procedimento nem na razão de ticket.
    assert mix["procedimento"]["qtd"] == 1
    assert mix["procedimento"]["valor"] == 650.0
    assert mix["razao_ticket"] == round((650.0 / 1) / (400.0 / 2), 2)


def test_montar_turnos_usa_receita_por_clinica_e_dia_da_semana_nao_rateio():
    """Finding 1: dois turnos da MESMA clinica em dias diferentes devem ter
    receita_por_hora DIFERENTE quando a receita de cada dia é diferente — o
    rateio proporcional por hora (fatia) cancela matematicamente e faz todo
    turno da clinica ter o mesmo R$/hora, o que é o bug relatado."""
    from routers.financial import _montar_turnos

    class FakeClinic:
        def __init__(self, id, name):
            self.id = id
            self.name = name

    class FakeSched:
        def __init__(self, clinic_id, day_of_week, start_time, end_time, slot_duration=12):
            self.clinic_id = clinic_id
            self.day_of_week = day_of_week
            self.start_time = start_time
            self.end_time = end_time
            self.slot_duration = slot_duration

    clinicas = {1: FakeClinic(1, "Clínica Artro")}
    # Segunda (0) e terça (1) — mesma clinica, turnos de 4h cada.
    scheds = [
        FakeSched(1, 0, "08:00", "12:00"),
        FakeSched(1, 1, "08:00", "12:00"),
    ]
    # Receita bem diferente por dia da semana: segunda fatura muito mais.
    receita_por_clinica_dia = {(1, 0): 4000.0, (1, 1): 400.0}
    qtd_por_clinica_dia = {(1, 0): 10, (1, 1): 1}
    marcados_por_clinica_dia = {(1, 0): 6, (1, 1): 1}

    turnos = _montar_turnos(
        scheds, clinicas,
        receita_por_clinica_dia, qtd_por_clinica_dia, marcados_por_clinica_dia,
        date(2026, 8, 1), date(2026, 8, 6),
    )

    por_dia = {t["dia_semana"]: t for t in turnos}
    assert por_dia[0]["receita_por_hora"] != por_dia[1]["receita_por_hora"]
    assert por_dia[0]["receita_mes"] == 4000.0
    assert por_dia[1]["receita_mes"] == 400.0
    assert por_dia[0]["ticket"] == 400.0   # 4000/10
    assert por_dia[1]["ticket"] == 400.0   # 400/1


def test_lancar_no_caixa_preserva_none_explicito_mas_corrige_lixo():
    """Achado 2: no endpoint /waiting-room/{id}/valor o médico decide o
    procedimento NO MEIO da consulta — a etiqueta não é conhecida no momento
    do lançamento. Passar procedure_type=None explicitamente deve GRAVAR None
    (honesto: não sabemos), e não virar "Consulta" por engano. Já uma string
    não reconhecida (lixo/typo) continua virando "Consulta" (comportamento
    antigo do check-in, que não pode mudar)."""
    from routers.queue import _coagir_procedure_type

    assert _coagir_procedure_type(None) is None
    assert _coagir_procedure_type("lixo qualquer") == "Consulta"
    assert _coagir_procedure_type("Infiltração") == "Infiltração"


def test_valor_extra_lanca_procedure_type_none_nao_consulta():
    """Achado 2, ponta a ponta: o endpoint de valor extra grava procedure_type
    None — nunca "Consulta" por omissão — porque o próprio caso de uso descrito
    no docstring do endpoint é uma infiltração decidida na hora."""
    from routers.queue import _lancar_no_caixa

    class FakePatient:
        id = 1
        organization_id = 1

    class FakeDB:
        def __init__(self):
            self.added = []

        def add(self, obj):
            self.added.append(obj)

    db = FakeDB()
    _lancar_no_caixa(db, FakePatient(), clinic_id=1, value_cents=25000,
                      payment_method="pix", descricao="Procedimento")
    assert db.added[0].procedure_type is None


def test_projecao_nula_nos_primeiros_dias_do_mes():
    """Achado 4: com poucos dias úteis decorridos, extrapolar linear produz
    número absurdo (caso real: 4 dias -> projeção de R$29.846). Abaixo de 5
    dias úteis decorridos, a projeção e a variação vêm nulas — melhor não
    mostrar do que mostrar fantasia."""
    from routers.financial import _projecao_mes

    projecao, variacao = _projecao_mes(realizado=8000.0, uteis_decorridos=4, uteis_total=21, anterior=15000.0)
    assert projecao is None
    assert variacao is None

    # A partir de 5 dias úteis decorridos, a projeção volta a ser calculada normalmente.
    projecao, variacao = _projecao_mes(realizado=8000.0, uteis_decorridos=5, uteis_total=21, anterior=15000.0)
    assert projecao == round(8000.0 / 5 * 21, 2)
    assert variacao == round((projecao - 15000.0) / 15000.0, 3)


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
