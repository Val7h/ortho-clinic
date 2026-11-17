"""Fatia 3 do Escriba (17/11/2026): sugestoes (botoes), guia pelo PC, metrica, resumo automatico e assistente.
Executar (de backend/): pytest test_escriba_fatia3.py test_escriba.py -v
Banco SQLite em memoria; dados inventados.
"""
from test_escriba import ambiente, MEDICO, SECRETARIA, PONTE, _ligar  # noqa: F401  (fixture reaproveitada)

from models.patient import Patient
from tzutil import today_br

EXAME = {"chave": "exame:ressonancia", "tipo": "exame", "rotulo": "RNM jd", "frase": "vou pedir ressonancia do joelho direito",
         "conferida": True, "dados": {"itens": ["RESSONANCIA DO JOELHO DIREITO SEM CONTRASTE"], "hd": "DOR NO JOELHO DIREITO",
                                      "classe": "Ressonância", "justificativa": "Dor ha 3 meses."}}
FISIO = {"chave": "fisio", "tipo": "fisio", "rotulo": "Fisio 10", "frase": "fisioterapia dez sessoes", "conferida": True,
         "dados": {"sessoes": 10, "diagnostico": "DOR NO JOELHO DIREITO"}}
RX = {"chave": "receita:coxeto", "tipo": "receita", "rotulo": "Coxeto 90", "frase": "vou passar coxeto 90", "conferida": False,
      "dados": {"texto": "USO ORAL\nCOXETO 90 MG", "tipo": "simples"}}


def _mandar(c, sid, itens, completo=True):
    r = c.post(f"/escriba/ponte/sessoes/{sid}/sugestoes", json={"sugestoes": itens, "completo": completo}, headers=PONTE)
    assert r.status_code == 200, r.text
    return r.json()


def _lista(c, eid):
    r = c.get(f"/escriba/sugestoes/entrada/{eid}", headers=MEDICO)
    assert r.status_code == 200, r.text
    return r.json()


def _convenio(S, pid, nome):
    db = S()
    db.query(Patient).filter(Patient.id == pid).update({"insurance": nome})
    db.commit()


def test_repetir_frase_nao_duplica_e_sumiu(ambiente):
    c, _S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    assert _mandar(c, s["id"], [EXAME, FISIO, RX])["novas"] == 3
    assert _mandar(c, s["id"], [EXAME, FISIO, RX])["novas"] == 0     # mesma fala de novo: nada novo
    lst = _lista(c, eid)["sugestoes"]
    assert [x["chave"] for x in lst] == ["exame:ressonancia", "fisio", "receita:coxeto"]
    assert lst[2]["conferida"] is False and lst[0]["dados"]["itens"][0].startswith("RESSONANCIA")
    # rascunho novo sem a receita: ela some da coluna
    assert _mandar(c, s["id"], [EXAME, FISIO])["sumiram"] == 1
    assert [x["chave"] for x in _lista(c, eid)["sugestoes"]] == ["exame:ressonancia", "fisio"]
    # volta a aparecer quando o rascunho traz de novo
    _mandar(c, s["id"], [EXAME, FISIO, RX])
    assert len(_lista(c, eid)["sugestoes"]) == 3


def test_decisao_do_medico_nao_e_desfeita_pela_ponte(ambiente):
    c, _S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    _mandar(c, s["id"], [EXAME, RX])
    ex, rx = _lista(c, eid)["sugestoes"]
    assert c.post(f"/escriba/sugestoes/{ex['id']}/estado", json={"estado": "aberta"}, headers=MEDICO).json()["estado"] == "aberta"
    r = c.post(f"/escriba/sugestoes/{ex['id']}/estado", json={"estado": "feita", "sem_mudanca": True}, headers=MEDICO).json()
    assert r["estado"] == "feita"
    assert c.post(f"/escriba/sugestoes/{rx['id']}/estado", json={"estado": "descartada"}, headers=MEDICO).json()["estado"] == "descartada"
    # a ponte manda de novo com outro texto e sem a receita: feita e descartada ficam como estao
    _mandar(c, s["id"], [{**EXAME, "rotulo": "RNM jd (novo)"}])
    ex2, rx2 = _lista(c, eid)["sugestoes"]
    assert ex2["estado"] == "feita" and ex2["rotulo"] == "RNM jd"
    assert rx2["estado"] == "descartada"
    # feita nao volta a aberta; descartada pode ser desfeita
    assert c.post(f"/escriba/sugestoes/{ex['id']}/estado", json={"estado": "aberta"}, headers=MEDICO).json()["estado"] == "feita"
    assert c.post(f"/escriba/sugestoes/{rx['id']}/estado", json={"estado": "nova"}, headers=MEDICO).json()["estado"] == "nova"
    m = c.get("/escriba/metrica", headers=MEDICO).json()
    assert m[0]["total"] == 2 and m[0]["sem_mudar"] == 1 and m[0]["descartadas"] == 0


def test_secretaria_e_ponte_sem_chave(ambiente):
    c, _S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    assert c.post(f"/escriba/ponte/sessoes/{s['id']}/sugestoes", json={"sugestoes": [EXAME]}).status_code == 401
    _mandar(c, s["id"], [EXAME])
    assert c.get(f"/escriba/sugestoes/entrada/{eid}", headers=SECRETARIA).status_code == 403
    sid_sug = _lista(c, eid)["sugestoes"][0]["id"]
    assert c.post(f"/escriba/sugestoes/{sid_sug}/estado", json={"estado": "feita"}, headers=SECRETARIA).status_code == 403
    assert c.post(f"/escriba/sugestoes/{sid_sug}/guia", headers=SECRETARIA).status_code == 403
    assert c.get("/escriba/ponte/pedidos").status_code == 401


def test_guia_particular_recusa_convenio_cria_pedido_unico(ambiente):
    c, S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    _mandar(c, s["id"], [EXAME, {**FISIO, "dados": {"diagnostico": "DOR"}}])
    ex, fi = _lista(c, eid)["sugestoes"]
    assert c.post(f"/escriba/sugestoes/{ex['id']}/guia", headers=MEDICO).status_code == 422   # particular
    _convenio(S, pid, "UNIMED CARUARU")
    assert _lista(c, eid)["particular"] is False
    a = c.post(f"/escriba/sugestoes/{ex['id']}/guia", headers=MEDICO)
    b = c.post(f"/escriba/sugestoes/{ex['id']}/guia", headers=MEDICO)
    assert a.status_code == b.status_code == 200 and a.json()["id"] == b.json()["id"]      # nao duplica
    # fisio sem numero de sessoes dito: nao inventa quantidade
    r = c.post(f"/escriba/sugestoes/{fi['id']}/guia", headers=MEDICO)
    assert r.status_code == 422 and "sessões" in r.json()["detail"]
    pend = c.get("/escriba/ponte/pedidos", headers=PONTE).json()
    assert len(pend) == 1
    d = pend[0]["dados"]
    assert d["itens"] == ["RESSONANCIA DO JOELHO DIREITO SEM CONTRASTE|1"] and d["indicacao"] == "DOR NO JOELHO DIREITO"
    assert d["justificativa"] == "Dor ha 3 meses."   # RNM leva a justificativa junto
    pid_ped = pend[0]["id"]
    assert c.post(f"/escriba/ponte/pedidos/{pid_ped}/pegar", headers=PONTE).status_code == 200
    assert c.post(f"/escriba/ponte/pedidos/{pid_ped}/pegar", headers=PONTE).status_code == 409   # so um PC executa
    assert c.get("/escriba/ponte/pedidos", headers=PONTE).json() == []
    r = c.post(f"/escriba/ponte/pedidos/{pid_ped}/resultado", json={"ok": True, "texto": "SIMULADO"}, headers=PONTE).json()
    assert r["estado"] == "feito"
    assert _lista(c, eid)["sugestoes"][0]["pedido"]["estado"] == "feito"


def test_resumo_automatico_e_o_da_sessao_convivem(ambiente):
    """17/11 tarde: antes a ponte recusava 'auto' o dia inteiro depois que a sessao gravava. Agora os dois ficam."""
    c, S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    url = f"/escriba/ponte/sessoes/{s['id']}/resumo"
    corpo = {"linhas": ["dor jd", "cd: rnm jd"], "faltas": ["tempo da dor"]}
    assert c.put(url, json=corpo, headers=PONTE).json() == {"gravado": True}
    assert c.put(url, json=corpo, headers=PONTE).json()["motivo"] == "igual"     # sem mudanca, nao regrava
    hoje = today_br().isoformat()
    r = c.get(f"/patients/{pid}/escriba-resumo", params={"data": hoje}, headers=MEDICO).json()
    assert r["linhas"] == ["dor jd", "cd: rnm jd"] and r["fonte"] == "auto" and r["linhas_sessao"] is None
    # a sessao grava a dela (PUT do medico, como o consulta.escriba()); o automatico continua na tela
    assert c.put(f"/patients/{pid}/escriba-resumo", json={"entry_date": hoje, "linhas": ["da sessao"], "faltas": ["f1"]},
                 headers=MEDICO).status_code == 200
    r = c.get(f"/patients/{pid}/escriba-resumo", params={"data": hoje}, headers=MEDICO).json()
    assert r["linhas"] == ["dor jd", "cd: rnm jd"] and r["fonte"] == "auto"
    assert r["linhas_sessao"] == ["da sessao"] and r["faltas_sessao"] == ["f1"] and r["sessao_em"]
    # o automatico segue gravando (nao trava mais) e nao apaga o da sessao
    assert c.put(url, json={"linhas": ["outra"], "faltas": []}, headers=PONTE).json() == {"gravado": True}
    r = c.get(f"/patients/{pid}/escriba-resumo", params={"data": hoje}, headers=MEDICO).json()
    assert r["linhas"] == ["outra"] and r["linhas_sessao"] == ["da sessao"]
    lst = c.get(f"/patients/{pid}/escriba-resumos", headers=MEDICO).json()
    assert lst[0]["linhas"] == ["outra"] and lst[0]["linhas_sessao"] == ["da sessao"]
    assert c.put(url, json=corpo).status_code == 401


def test_resumo_so_da_sessao_e_linha_antiga(ambiente):
    """Sem automatico no dia, 'linhas' mostra a da sessao. Linha antiga (fonte 'sessao', sem linhas_sessao):
    o automatico guarda a da sessao antes de ocupar 'linhas'."""
    from models.clinical_evolution import EscribaResumo
    c, S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    hoje = today_br().isoformat()
    c.put(f"/patients/{pid}/escriba-resumo", json={"entry_date": hoje, "linhas": ["so sessao"]}, headers=MEDICO)
    r = c.get(f"/patients/{pid}/escriba-resumo", params={"data": hoje}, headers=MEDICO).json()
    assert r["linhas"] == ["so sessao"] and r["fonte"] == "sessao" and r["linhas_sessao"] == ["so sessao"]
    db = S()
    db.query(EscribaResumo).filter(EscribaResumo.patient_id == pid).update({"linhas_sessao": None, "faltas_sessao": None})
    db.commit()
    r = c.get(f"/patients/{pid}/escriba-resumo", params={"data": hoje}, headers=MEDICO).json()
    assert r["linhas_sessao"] == ["so sessao"]                                    # linha antiga lida como da sessao
    assert c.put(f"/escriba/ponte/sessoes/{s['id']}/resumo", json={"linhas": ["auto"], "faltas": []},
                 headers=PONTE).json() == {"gravado": True}
    r = c.get(f"/patients/{pid}/escriba-resumo", params={"data": hoje}, headers=MEDICO).json()
    assert r["linhas"] == ["auto"] and r["fonte"] == "auto" and r["linhas_sessao"] == ["so sessao"]


def test_anamnese_hoje_so_texto_do_medico(ambiente):
    c, S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    from models.clinical_evolution import ClinicalEvolution
    db = S()
    db.add(ClinicalEvolution(patient_id=pid, entry_date=today_br(), organization_id=1,
                             content="dor no joelho direito ha 2 meses\n\n[ESCRIBA IA – conferir]\nQP: dor\nCD: rnm"))
    db.commit()
    r = c.get(f"/escriba/ponte/sessoes/{s['id']}/anamnese-hoje", headers=PONTE).json()
    assert r["texto"].strip() == "dor no joelho direito ha 2 meses"


def test_assistente_chat(ambiente):
    c, _S, pid, _eid = ambiente
    assert c.get(f"/patients/{pid}/assistente", headers=MEDICO).json() == []
    a = c.post(f"/patients/{pid}/assistente", json={"texto": "tem alergia?"}, headers=MEDICO).json()
    assert a["autor"] == "medico"
    b = c.post(f"/patients/{pid}/assistente", json={"texto": "\U0001F7E9 receita pronta", "autor": "ia"}, headers=MEDICO).json()
    lst = c.get(f"/patients/{pid}/assistente", headers=MEDICO).json()
    assert [m["autor"] for m in lst] == ["medico", "ia"] and lst[1]["texto"] == "\U0001F7E9 receita pronta"
    assert c.get(f"/patients/{pid}/assistente", params={"apos": a["id"]}, headers=MEDICO).json()[0]["id"] == b["id"]
    assert c.post(f"/patients/{pid}/assistente", json={"texto": " "}, headers=MEDICO).status_code == 422
    assert c.post(f"/patients/{pid}/assistente", json={"texto": "x", "autor": "outro"}, headers=MEDICO).status_code == 422
    assert c.get(f"/patients/{pid}/assistente", headers=SECRETARIA).status_code == 403
    assert c.get("/patients/999999/assistente", headers=MEDICO).status_code == 404
