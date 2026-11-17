"""17/11/2026: secretaria da baixa (procedimento/pericia) sem o medico abrir a consulta."""
from test_escriba import ambiente, MEDICO, SECRETARIA  # noqa: F401
from models.queue import WaitingRoomEntry


def _por_status(Sessao, eid, status):
    db = Sessao(); e = db.get(WaitingRoomEntry, eid); e.status = status; e.attended_at = None; db.commit(); db.close()


def test_secretaria_da_baixa_em_quem_aguarda(ambiente):
    c, S, pid, eid = ambiente
    _por_status(S, eid, "waiting")
    r = c.post(f"/api/clinic/waiting-room/{eid}/baixa", headers=SECRETARIA)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "attended"
    db = S(); e = db.get(WaitingRoomEntry, eid)
    assert e.status == "attended" and e.attended_at is not None and "baixa dada por" in (e.notes or "")
    db.close()


def test_nao_da_baixa_em_consulta_aberta(ambiente):
    c, S, pid, eid = ambiente  # a entrada nasce "attending"
    r = c.post(f"/api/clinic/waiting-room/{eid}/baixa", headers=SECRETARIA)
    assert r.status_code == 409


def test_secretaria_continua_sem_mudar_status_clinico(ambiente):
    c, S, pid, eid = ambiente
    _por_status(S, eid, "waiting")
    r = c.patch(f"/api/clinic/waiting-room/{eid}/status", json={"status": "attending"}, headers=SECRETARIA)
    assert r.status_code == 403
