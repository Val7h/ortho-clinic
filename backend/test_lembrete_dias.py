"""17/11/2026: lembrete de procedimento com prazo em DIAS ou meses."""
from datetime import date
from types import SimpleNamespace as NS
from routers.procedure_reminders import vencimento, prazo_em_dias
from services.reminder_task import toque_devido
from test_escriba import ambiente, MEDICO  # noqa: F401


def test_vencimento_dias_e_meses():
    assert vencimento(NS(applied_on=date(2026, 11, 17), interval_months=0, interval_days=45)) == date(2027, 1, 1)
    assert vencimento(NS(applied_on=date(2026, 11, 17), interval_months=6, interval_days=None)) == date(2027, 5, 17)


def test_toques_prazo_longo_continua_igual():
    assert toque_devido(30, 365) == 30 and toque_devido(7, 365) == 7 and toque_devido(40, 365) is None


def test_prazo_curto_sem_aviso_de_um_mes():
    assert toque_devido(20, 30) is None      # prazo de 30 dias: sem o aviso de 1 mes
    assert toque_devido(7, 30) == 7


def test_prazo_ate_7_dias_so_na_vespera():
    assert toque_devido(5, 7) is None and toque_devido(1, 7) == 7


def test_rota_cria_em_dias(ambiente):
    c, S, pid, eid = ambiente
    r = c.post("/procedure-reminders", json={"patient_id": pid, "procedure": "Infiltração", "interval_days": 45}, headers=MEDICO)
    assert r.status_code == 201, r.text
    j = r.json(); assert j["interval_days"] == 45 and prazo_em_dias(NS(applied_on=date.fromisoformat(j["applied_on"]), interval_months=0, interval_days=45)) == 45
    r2 = c.post("/procedure-reminders", json={"patient_id": pid, "procedure": "Visco", "interval_months": 6}, headers=MEDICO)
    assert r2.status_code == 201 and r2.json()["interval_days"] is None
