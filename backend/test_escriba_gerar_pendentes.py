"""'Tudo de hoje' gera os documentos de TODOS os botoes do Escriba (pedido do Valth, 17/11/2026 02h10).
Executar (de backend/): pytest test_escriba_gerar_pendentes.py -v
Banco SQLite em memoria; dados inventados.
"""
from test_escriba import ambiente, MEDICO, SECRETARIA, PONTE, _ligar  # noqa: F401  (fixture reaproveitada)
from test_escriba_fatia3 import EXAME, FISIO, RX, _mandar, _lista, _convenio

import routers.escriba as R
from models.patient import Patient

PROC = {"chave": "procedimento:infiltracao", "tipo": "procedimento", "rotulo": "Infiltracao jd", "frase": "vou infiltrar",
        "conferida": True, "dados": {"texto": "INFILTRACAO DO JOELHO DIREITO"}}
ATEST_SEM_DIAS = {"chave": "atestado", "tipo": "atestado", "rotulo": "Atestado", "frase": "vou dar atestado",
                  "conferida": True, "dados": {"texto": "atestado", "dias": None}}
ENC = {"chave": "encaminhamento:reumato", "tipo": "encaminhamento", "rotulo": "Enc. reumato", "frase": "vou encaminhar",
       "conferida": True, "dados": {"texto": "Reumatologia"}}


def _gerar(c, eid, h=MEDICO):
    return c.post(f"/escriba/sugestoes/entrada/{eid}/gerar-pendentes", headers=h)


def test_cria_um_pedido_por_sugestao_e_nao_duplica(ambiente):
    c, _S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    _mandar(c, s["id"], [EXAME, FISIO, RX, PROC, ATEST_SEM_DIAS, ENC])
    lst = _lista(c, eid)["sugestoes"]
    # o medico ja fez a receita pelo botao e descartou o encaminhamento
    rx = next(x for x in lst if x["tipo"] == "receita")
    enc = next(x for x in lst if x["tipo"] == "encaminhamento")
    c.post(f"/escriba/sugestoes/{rx['id']}/estado", json={"estado": "feita", "sem_mudanca": True}, headers=MEDICO)
    c.post(f"/escriba/sugestoes/{enc['id']}/estado", json={"estado": "descartada"}, headers=MEDICO)
    r = _gerar(c, eid)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["novos"] == 2 and j["gerando"] == 2 and j["terminado"] is False      # exame + fisio
    assert j["feitos"] == 1 and j["pulados"] == 2                                   # receita feita; proc e atestado sem dias
    pulados = {x["tipo"]: x["pulada"] for x in j["itens"] if x["pulada"]}
    assert "aba" in pulados["procedimento"] and "dias" in pulados["atestado"]
    assert all(x["tipo"] != "encaminhamento" for x in j["itens"])                  # descartada nao aparece
    # abrir de novo nao duplica
    assert _gerar(c, eid).json()["novos"] == 0
    peds = c.get("/escriba/ponte/pedidos", headers=PONTE).json()
    assert sorted(p["tipo"] for p in peds) == ["gerar_documento", "gerar_documento"]
    d = next(p for p in peds if p["dados"]["tipo"] == "exame")["dados"]
    assert d["dados"]["itens"] == ["RESSONANCIA DO JOELHO DIREITO SEM CONTRASTE"] and d["particular"] is True
    assert d["data"] and "sugestao_id" in d


def test_resultado_marca_feita_com_documento_e_terminado(ambiente):
    c, _S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    _mandar(c, s["id"], [EXAME, RX])
    _gerar(c, eid)
    peds = c.get("/escriba/ponte/pedidos", headers=PONTE).json()
    assert R._pc_vivo(1) is True                        # a ponte acabou de buscar
    g = c.get(f"/escriba/sugestoes/entrada/{eid}/gerar-pendentes", headers=MEDICO).json()
    assert g["pc_vivo"] is True and g["terminado"] is False
    ex = next(p for p in peds if p["dados"]["tipo"] == "exame")
    rx = next(p for p in peds if p["dados"]["tipo"] == "receita")
    for p in (ex, rx):
        assert c.post(f"/escriba/ponte/pedidos/{p['id']}/pegar", headers=PONTE).status_code == 200
    c.post(f"/escriba/ponte/pedidos/{ex['id']}/resultado", headers=PONTE,
           json={"ok": True, "texto": "pedido 55", "documentos": [{"kind": "exame", "id": 55}]})
    c.post(f"/escriba/ponte/pedidos/{rx['id']}/resultado", headers=PONTE,
           json={"ok": False, "texto": "site fora"})
    g = c.get(f"/escriba/sugestoes/entrada/{eid}/gerar-pendentes", headers=MEDICO).json()
    assert g["terminado"] is True and g["feitos"] == 1 and g["falhas"] == 1
    it = next(x for x in g["itens"] if x["tipo"] == "exame")
    assert it["estado"] == "feita" and it["pedido"]["documentos"] == [{"kind": "exame", "id": 55, "ja_existia": False}]
    # o botao da coluna mostra feita
    assert next(x for x in _lista(c, eid)["sugestoes"] if x["tipo"] == "exame")["estado"] == "feita"
    # falha passageira: abrir de novo tenta outra vez (so a receita)
    j = _gerar(c, eid).json()
    assert j["novos"] == 1 and j["gerando"] == 1


def test_falha_por_falta_de_dado_nao_repete(ambiente):
    c, _S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    _mandar(c, s["id"], [{**FISIO, "dados": {"diagnostico": ""}}])
    _gerar(c, eid)
    p = c.get("/escriba/ponte/pedidos", headers=PONTE).json()[0]
    c.post(f"/escriba/ponte/pedidos/{p['id']}/pegar", headers=PONTE)
    c.post(f"/escriba/ponte/pedidos/{p['id']}/resultado", headers=PONTE,
           json={"ok": False, "texto": "NAO GERA: falta a indicacao clinica (HD)"})
    j = _gerar(c, eid).json()
    assert j["novos"] == 0 and j["falhas"] == 1 and j["terminado"] is True
    assert j["itens"][0]["pedido"]["resultado"].startswith("NAO GERA")


def test_guia_do_botao_conta_como_pedido(ambiente):
    c, S, pid, eid = ambiente
    _convenio(S, pid, "UNIMED CARUARU")
    s = _ligar(c, pid, eid)
    _mandar(c, s["id"], [EXAME])
    ex = _lista(c, eid)["sugestoes"][0]
    assert c.post(f"/escriba/sugestoes/{ex['id']}/guia", headers=MEDICO).status_code == 200
    j = _gerar(c, eid).json()
    assert j["novos"] == 0 and j["gerando"] == 1          # a guia do botao ja esta a caminho: nao gera outra


def test_secretaria_e_outra_org(ambiente):
    c, _S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    _mandar(c, s["id"], [EXAME])
    assert _gerar(c, eid, SECRETARIA).status_code == 403
    assert c.get(f"/escriba/sugestoes/entrada/{eid}/gerar-pendentes", headers=SECRETARIA).status_code == 403
    assert _gerar(c, 99999).status_code == 404
    # sem Escriba nesta consulta: responde vazio e terminado
    assert c.post("/escriba/ponte/pedidos/1/resultado", json={"ok": True}).status_code == 401


# ── 17/11 02h35: avisos e respostas do Assistente ao vivo pela ponte ──

def test_ponte_ficha_e_assistente(ambiente):
    c, S, pid, eid = ambiente
    db = S()
    db.query(Patient).filter(Patient.id == pid).update({"allergies": "Dipirona", "current_medications": "Xarelto 20 mg"})
    db.commit()
    s = _ligar(c, pid, eid)
    f = c.get(f"/escriba/ponte/sessoes/{s['id']}/ficha", headers=PONTE)
    assert f.status_code == 200 and f.json()["allergies"] == "Dipirona" and "Xarelto" in f.json()["current_medications"]
    assert c.get(f"/escriba/ponte/sessoes/{s['id']}/ficha").status_code == 401
    url = f"/escriba/ponte/sessoes/{s['id']}/assistente"
    assert c.post(url, json={"texto": "⚠️ ALERGIA (cadastro): Dipirona."}, headers=PONTE).json()["gravado"] is True
    assert c.post(url, json={"texto": "⚠️ ALERGIA (cadastro): Dipirona."}, headers=PONTE).json()["gravado"] is False
    c.post(f"/patients/{pid}/assistente", json={"texto": "dose de pregabalina?"}, headers=MEDICO)
    msgs = c.get(url, headers=PONTE).json()
    assert [m["autor"] for m in msgs] == ["ia", "medico"]
    tela = c.get(f"/patients/{pid}/assistente", headers=MEDICO).json()
    assert tela[0]["texto"].startswith("⚠️ ALERGIA")
    assert c.post(url, json={"texto": "x"}).status_code == 401
    # pergunta falada: 'medico' so com o prefixo do microfone
    assert c.post(url, json={"texto": "qual a dose?", "autor": "medico"}, headers=PONTE).status_code == 422
    r = c.post(url, json={"texto": "🎙️ qual a dose de pregabalina?", "autor": "medico"}, headers=PONTE).json()
    assert r["gravado"] is True and c.get(url, headers=PONTE).json()[-1]["autor"] == "medico"
