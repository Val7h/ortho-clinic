"""Composição de marca pela tabela ANVISA (17/11/2026). Executar (de backend/): pytest test_composicao_anvisa.py -v"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi.testclient import TestClient

import deps
import main
from models.organization import User
from routers.medicamentos import buscar_composicao


def test_marca_exata_vem_primeiro():
    r = buscar_composicao("Insit")
    assert r[0] == {"marca": "INSIT", "composicao": "pregabalina", "outras": []}


def test_composto_e_dose_digitada():
    r = buscar_composicao("revange 37,5mg")
    assert r[0]["marca"] == "REVANGE" and "tramadol" in r[0]["composicao"] and "paracetamol" in r[0]["composicao"]


def test_inicio_de_palavra_e_poucos_resultados():
    r = buscar_composicao("tormiv")
    assert r and all(x["marca"].startswith("TORMIV") for x in r) and "cetorolaco" in r[0]["composicao"]
    assert len(buscar_composicao("dor")) <= 5
    assert buscar_composicao("xyzfarma") == []
    assert buscar_composicao("12") == []
    assert buscar_composicao("Ketto SL")[0]["composicao"] == "cetorolaco"      # forma que nao faz parte da marca


def test_rota_exige_login_e_responde():
    c = TestClient(main.app)
    assert c.get("/medicamentos/composicao", params={"q": "insit"}).status_code in (401, 403)
    main.app.dependency_overrides[deps.get_current_user] = lambda: User(id=1, organization_id=1, name="Dr", email="d@x.test",
                                                                         password_hash="x", role="doctor", active=True)
    try:
        r = c.get("/medicamentos/composicao", params={"q": "cymbi"})
        assert r.status_code == 200 and r.json()[0]["composicao"] == "duloxetina"
    finally:
        main.app.dependency_overrides.clear()
