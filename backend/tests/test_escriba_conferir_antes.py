"""Escriba, "Tudo de hoje", revisão 19/11 item 1 (lote 4, 22/11/2026).
- Padrão (configuração desligada): abrir gera TODOS os pendentes, como sempre.
- "Conferir antes de gerar" é POR MÉDICO e começa desligada.
- Ligada: sem lista de marcados não gera nada; com a lista, só os marcados viram pedido.
Dados fictícios. Roda isolado: python -m pytest -q --noconftest tests/test_escriba_conferir_antes.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
from types import SimpleNamespace
import datetime
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import main  # noqa
import routers.escriba as ES
from database import Base
from models.escriba import EscribaPedido, EscribaSessao, EscribaSugestao
from models.patient import Patient
from models.queue import WaitingRoomEntry

MED = SimpleNamespace(id=1, organization_id=1, role="doctor")
MED2 = SimpleNamespace(id=2, organization_id=1, role="doctor")


def _db():
    ES._config_ok = False
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(e)
    return sessionmaker(bind=e)()


def _base(db):
    p = Patient(name="Paciente Ficticio", organization_id=1, insurance="Particular")
    db.add(p); db.commit()
    e = WaitingRoomEntry(patient_id=p.id, entry_date=datetime.date(2026, 11, 22), status="attending")
    db.add(e); db.commit()
    s = EscribaSessao(organization_id=1, entry_id=e.id, patient_id=p.id, estado="gravando")
    db.add(s); db.commit()
    sugs = []
    for i, (tipo, conf, dados) in enumerate([("receita", True, {}), ("exame", False, {}),
                                              ("encaminhamento", True, {}), ("atestado", True, {})]):
        x = EscribaSugestao(organization_id=1, sessao_id=s.id, entry_id=e.id, patient_id=p.id, chave=f"k{i}",
                            tipo=tipo, rotulo=tipo.title(), frase="frase ficticia", conferida=conf,
                            dados=json.dumps(dados), estado="nova")
        db.add(x); sugs.append(x)
    db.commit()
    return e, sugs


def _pedidos(db):
    return sorted(p.sugestao_id for p in db.query(EscribaPedido).filter(EscribaPedido.tipo == "gerar_documento"))


def test_padrao_continua_gerando_todos_os_pendentes():
    db = _db(); e, sugs = _base(db)
    assert ES.ler_config(db, MED) == {"conferir_antes_de_gerar": False}
    r = ES.gerar_pendentes(e.id, None, db, MED)
    # atestado sem os dias ditos fica de fora (regra de sempre)
    assert r["novos"] == 3 and _pedidos(db) == sorted(x.id for x in sugs[:3])


def test_ligada_sem_lista_nao_gera_nada_e_mostra_a_lista():
    db = _db(); e, sugs = _base(db)
    ES.salvar_config(ES.ConfigEscribaIn(conferir_antes_de_gerar=True), db, MED)
    r = ES.gerar_pendentes(e.id, None, db, MED)
    assert r["novos"] == 0 and r["conferir_antes_de_gerar"] is True and _pedidos(db) == []
    itens = {i["sugestao_id"]: i for i in r["itens"]}
    assert [itens[x.id]["pode_gerar"] for x in sugs] == [True, True, True, False]
    assert [itens[x.id]["conferida"] for x in sugs] == [True, False, True, True]
    # o estado (GET) também traz a lista, sem gerar nada
    assert ES.gerar_pendentes_estado(e.id, db, MED)["itens"][0]["pode_gerar"] is True and _pedidos(db) == []


def test_ligada_gera_so_os_marcados():
    db = _db(); e, sugs = _base(db)
    ES.salvar_config(ES.ConfigEscribaIn(conferir_antes_de_gerar=True), db, MED)
    r = ES.gerar_pendentes(e.id, ES.GerarPendentesIn(sugestao_ids=[sugs[0].id, sugs[2].id, sugs[3].id]), db, MED)
    assert r["novos"] == 2 and _pedidos(db) == [sugs[0].id, sugs[2].id]   # atestado sem dias continua de fora
    # repetir não duplica
    ES.gerar_pendentes(e.id, ES.GerarPendentesIn(sugestao_ids=[sugs[0].id]), db, MED)
    assert _pedidos(db) == [sugs[0].id, sugs[2].id]


def test_lista_vazia_nao_gera_nada():
    db = _db(); e, sugs = _base(db)
    r = ES.gerar_pendentes(e.id, ES.GerarPendentesIn(sugestao_ids=[]), db, MED)
    assert r["novos"] == 0 and _pedidos(db) == []


def test_configuracao_e_por_medico():
    db = _db(); e, sugs = _base(db)
    ES.salvar_config(ES.ConfigEscribaIn(conferir_antes_de_gerar=True), db, MED)
    assert ES.ler_config(db, MED2) == {"conferir_antes_de_gerar": False}
    assert ES.gerar_pendentes(e.id, None, db, MED2)["novos"] == 3
    ES.salvar_config(ES.ConfigEscribaIn(conferir_antes_de_gerar=False), db, MED)
    assert ES.ler_config(db, MED) == {"conferir_antes_de_gerar": False}


def test_rota_aceita_post_sem_corpo_como_a_tela_antiga():
    from fastapi.testclient import TestClient
    from database import get_db
    from deps import require_doctor
    db = _db(); e, sugs = _base(db)
    main.app.dependency_overrides[get_db] = lambda: db
    main.app.dependency_overrides[require_doctor] = lambda: MED
    try:
        c = TestClient(main.app)
        r = c.post(f"/escriba/sugestoes/entrada/{e.id}/gerar-pendentes")
        assert r.status_code == 200 and r.json()["novos"] == 3
        assert c.get("/escriba/config").json() == {"conferir_antes_de_gerar": False}
    finally:
        main.app.dependency_overrides.clear()
