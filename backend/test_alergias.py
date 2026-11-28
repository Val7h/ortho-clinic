"""Alergia citada na consulta x campo Alergias da ficha (27/11/2026, Valth; revisao 28/11).
Executar (de backend/): pytest test_alergias.py -v
Banco SQLite em memoria; dados inventados; sem IA.
"""
import pytest

from test_escriba import ambiente, MEDICO, PONTE, _ligar  # noqa: F401  (fixture reaproveitada)

from models.clinical_evolution import AlergiaIgnorada, ClinicalEvolution
from models.organization import Organization, User
from models.patient import Patient
from services.alergias import extrair, faltando, ja_na_ficha, mesclar
from tzutil import today_br


# ── extrair (codigo puro) ──────────────────────────────────────────────────────
def test_extrai_formas_comuns():
    assert extrair("* alergia plasil") == ["PLASIL"]
    assert extrair("Alergia: PLASIL (metoclopramida).") == ["PLASIL"]
    assert extrair("alérgico à dipirona e penicilina") == ["DIPIRONA", "PENICILINA"]
    assert extrair("Refere alergia a sulfa desde criança") == ["SULFA"]
    assert extrair("alergia medicamentosa: AAS") == ["AAS"]
    assert extrair("HD: hérnia discal. Alergia a látex, refere coceira") == ["LÁTEX"]
    assert extrair("Paciente informa que é alérgico a iodo") == ["IODO"]
    assert extrair("Nega HAS, DM. Alergia a sulfa.") == ["SULFA"]


def test_nao_extrai_negacao_nem_pergunta():
    assert extrair("Nega alergias.") == []
    assert extrair("sem alergia medicamentosa") == []
    assert extrair("não tem alergia a nada") == []
    assert extrair("alergia a dipirona?") == []
    assert extrair("Retorno em 15 dias. Fisioterapia motora.") == []


# ALTA 1: negacao DEPOIS do gatilho (cada frase da revisao)
@pytest.mark.parametrize("frase", [
    "Alergias: nega",
    "* alergia nega",
    "Alergias: não",
    "Alergia: NKDA",
    "Alergias: nenhuma referida",
    "Alergias: desconhece",
    "Alergias: sem alergias",
    "Alergias: nega alergias medicamentosas",
    "Perguntado sobre alergia, nega.",
    "Alergia a dipirona negada",
    "Alergias - NDN",
    "Alergia medicamentosa: nega",
])
def test_negacao_depois_do_gatilho(frase):
    assert extrair(frase) == []


# ALTA 2: falsos positivos (historia familiar, doenca alergica, suspeita, investigacao)
@pytest.mark.parametrize("frase", [
    "Mãe tem alergia a penicilina",
    "pai alérgico a dipirona",
    "rinite alérgica controlada",
    "dermatite alérgica no antebraço",
    "teste alérgico negativo",
    "Reação alérgica após uso de diclofenaco",
    "Investigar alergia ao contraste",
    "Suspeita de alergia a AINE",
    "alergia a medicamentos como dipirona",
    "alergia respiratória",
    "Prescrito antialérgico.",
])
def test_falsos_positivos_nao_extraem(frase):
    assert extrair(frase) == []


def test_corta_trecho_em_traco_e_nega():
    assert extrair("alergia: dipirona - nega outras") == ["DIPIRONA"]


# MEDIA 8: falsos negativos
def test_barra_separa_itens():
    assert extrair("Alergia: dipirona / plasil") == ["DIPIRONA", "PLASIL"]


def test_aceita_erro_de_digitacao_alegia():
    assert extrair("alegia a dipirona") == ["DIPIRONA"]


def test_intolerancia_e_reacao_a():
    # 28/11 (revisao): "intolerancia a" saiu do gatilho (ortopedia: exercicio, carga, marcha)
    assert extrair("Intolerância ao exercício") == []
    assert extrair("intolerância à marcha prolongada") == []
    assert extrair("reação a dipirona") == ["DIPIRONA"]
    assert extrair("boa reação ao tratamento") == []


# ── ficha: palavra inteira e nome todo (MEDIA 7) ───────────────────────────────
def test_sulfato_ferroso_nao_esconde_sulfa():
    assert not ja_na_ficha("SULFA", "sulfato ferroso em uso")
    assert faltando("alergia a sulfa", "sulfato ferroso em uso") == ["SULFA"]


def test_faltando_ignora_o_que_ja_esta_na_ficha():
    assert faltando("alergia a plasil e dipirona", "PLASIL (metoclopramida)") == ["DIPIRONA"]
    assert faltando("alergia a plasil", "plasil") == []
    assert faltando("alergia a plasil", "") == ["PLASIL"]


def test_mesclar_nao_apaga_nem_repete():
    assert mesclar("PLASIL (metoclopramida)", ["PLASIL", "DIPIRONA"]) == "PLASIL (metoclopramida); DIPIRONA"
    assert mesclar("", ["DIPIRONA", "dipirona"]) == "DIPIRONA"
    assert mesclar("Dipirona", []) == "Dipirona"
    assert mesclar("Sem alergias conhecidas", ["SULFA"]) == "SULFA"   # ficha que so negava


# ── ALTA 3: o resumo do Escriba / bot NUNCA grava na ficha ─────────────────────
def _ficha(S, pid):
    s = S()
    try:
        return s.query(Patient).filter(Patient.id == pid).first().allergies
    finally:
        s.close()


def test_resumo_da_sessao_nao_grava_na_ficha(ambiente):
    c, S, pid, _eid = ambiente
    s = S(); s.query(Patient).filter(Patient.id == pid).update({"allergies": "Dipirona"}); s.commit(); s.close()
    r = c.put(f"/patients/{pid}/escriba-resumo", headers=MEDICO, json={
        "entry_date": str(today_br()), "linhas": ["Alergia: PLASIL (metoclopramida)."], "faltas": []})
    assert r.status_code == 200, r.text
    assert _ficha(S, pid) == "Dipirona"


def test_resumo_automatico_da_ponte_nao_grava_na_ficha(ambiente):
    c, S, pid, eid = ambiente
    s = _ligar(c, pid, eid)
    r = c.put(f"/escriba/ponte/sessoes/{s['id']}/resumo", headers=PONTE,
              json={"linhas": ["Paciente alérgico a penicilina."], "faltas": []})
    assert r.status_code == 200, r.text
    assert not _ficha(S, pid)


def test_resumo_vira_sugestao_no_finalizar(ambiente):
    c, S, pid, eid = ambiente
    c.put(f"/patients/{pid}/escriba-resumo", headers=MEDICO, json={
        "entry_date": str(today_br()), "linhas": ["Alergia a penicilina."], "faltas": []})
    r = _finalizar(c, eid)
    assert r.status_code == 409 and r.json()["detail"]["alergias"] == ["PENICILINA"]


# ── MEDIA 6: PUT do resumo confere a organizacao ───────────────────────────────
def test_put_resumo_de_outra_organizacao_da_404(ambiente):
    c, S, pid, _eid = ambiente
    s = S()
    s.add(Organization(id=2, name="Outra Org"))
    s.add(User(id=20, organization_id=2, name="Dr Outro", email="outro@x.test", password_hash="x", role="doctor", active=True))
    s.commit(); s.close()
    r = c.put(f"/patients/{pid}/escriba-resumo", headers={"X-Teste-Usuario": "20"}, json={
        "entry_date": str(today_br()), "linhas": ["x"], "faltas": []})
    assert r.status_code == 404


# ── trava no Finalizar ─────────────────────────────────────────────────────────
def _anamnese(S, pid, texto):
    s = S(); s.add(ClinicalEvolution(patient_id=pid, entry_date=today_br(), content=texto)); s.commit(); s.close()


def _finalizar(c, eid, acao=None, itens=None):
    body = {"status": "attended"}
    if acao:
        body["alergias_acao"] = acao
    if itens is not None:
        body["alergias_itens"] = itens
    return c.patch(f"/api/clinic/waiting-room/{eid}/status", json=body, headers=MEDICO)


def _voltar_para_atendimento(c, eid):
    assert c.patch(f"/api/clinic/waiting-room/{eid}/status", json={"status": "attending"}, headers=MEDICO).status_code == 200


def test_finalizar_bloqueia_alergia_fora_da_ficha(ambiente):
    c, S, pid, eid = ambiente
    _anamnese(S, pid, "DOR NAS PERNAS\n* alergia plasil\n* rnm lombar")
    r = _finalizar(c, eid)
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert d["codigo"] == "ALERGIA_PENDENTE" and d["alergias"] == ["PLASIL"] and "PLASIL" in d["msg"]
    s = S()
    from models.queue import WaitingRoomEntry
    assert s.query(WaitingRoomEntry).get(eid).status == "attending"   # NAO finalizou
    s.close()


def test_finalizar_com_adicionar_grava_e_finaliza(ambiente):
    c, S, pid, eid = ambiente
    _anamnese(S, pid, "* alergia plasil")
    r = _finalizar(c, eid, "adicionar", ["PLASIL"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "attended"
    assert _ficha(S, pid) == "PLASIL"


def test_adicionar_grava_so_os_itens_mostrados(ambiente):
    c, S, pid, eid = ambiente
    _anamnese(S, pid, "* alergia plasil")
    _anamnese(S, pid, "alergia a sulfa")   # escrito depois da pergunta
    r = _finalizar(c, eid, "adicionar", ["PLASIL"])
    assert r.status_code == 409 and r.json()["detail"]["alergias"] == ["SULFA"]
    assert not _ficha(S, pid)   # nada gravado: a tela pergunta de novo


def test_ignorar_fica_guardado_e_nao_pergunta_de_novo(ambiente):
    c, S, pid, eid = ambiente
    _anamnese(S, pid, "* alergia plasil")
    r = _finalizar(c, eid, "ignorar", ["PLASIL"])
    assert r.status_code == 200, r.text
    assert not _ficha(S, pid)
    s = S()
    assert [x.item for x in s.query(AlergiaIgnorada).filter(AlergiaIgnorada.patient_id == pid)] == ["plasil"]
    s.close()
    # re-finalizar (BAIXA 10): o item ignorado nao volta
    _voltar_para_atendimento(c, eid)
    assert _finalizar(c, eid).status_code == 200


def test_finalizar_livre_quando_alergia_ja_esta_na_ficha(ambiente):
    c, S, pid, eid = ambiente
    s = S(); s.query(Patient).filter(Patient.id == pid).update({"allergies": "PLASIL (metoclopramida)"}); s.commit(); s.close()
    _anamnese(S, pid, "* alergia plasil")
    assert _finalizar(c, eid).status_code == 200


def test_finalizar_livre_sem_alergia_na_consulta(ambiente):
    c, S, pid, eid = ambiente
    _anamnese(S, pid, "Lombalgia. Nega alergias. Retorno 15 dias.")
    assert _finalizar(c, eid).status_code == 200


def test_suspender_nao_passa_pela_trava(ambiente):
    c, S, pid, eid = ambiente
    _anamnese(S, pid, "* alergia plasil")
    r = c.patch(f"/api/clinic/waiting-room/{eid}/status", json={"status": "suspended"}, headers=MEDICO)
    assert r.status_code == 200, r.text


# MEDIA 5: erro inesperado na conferencia nao impede finalizar
def test_erro_inesperado_na_conferencia_deixa_finalizar(ambiente, monkeypatch):
    c, S, pid, eid = ambiente
    _anamnese(S, pid, "* alergia plasil")
    import services.alergias as mod

    def quebra(*a, **k):
        raise RuntimeError("falha inventada")
    monkeypatch.setattr(mod, "sugestoes", quebra)
    r = _finalizar(c, eid)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "attended"


def test_ficha_nega_alergias_medicamentosas_e_trocada():
    from services.alergias import _FICHA_SO_NEGA, _norm
    assert _FICHA_SO_NEGA.fullmatch(_norm("Nega alergias medicamentosas"))


# ── lista separada por virgula (28/11): cada item passa pelo portao; a lista para no primeiro que falha ──
@pytest.mark.parametrize("frase,esperado", [
    ("Alérgica a Dipirona, AAS e Buscopan", ["DIPIRONA", "AAS", "BUSCOPAN"]),
    ("alergia a dipirona, iodo, frutos do mar", ["DIPIRONA", "IODO", "FRUTOS DO MAR"]),
    ("alergia a dipirona, sulfa e contraste iodado", ["DIPIRONA", "SULFA", "CONTRASTE IODADO"]),
    ("Alergia a dipirona, penicilina. Nega outras.", ["DIPIRONA", "PENICILINA"]),
    ("alergia a dipirona, aas - nega outras", ["DIPIRONA", "AAS"]),
    ("alergia a dipirona, aas desde criança", ["DIPIRONA", "AAS"]),
])
def test_lista_com_virgula(frase, esperado):
    assert extrair(frase) == esperado


@pytest.mark.parametrize("frase,esperado", [
    ("alergia a penicilina, controlada", ["PENICILINA"]),
    ("Alergia a látex, refere coceira", ["LÁTEX"]),
    ("alergia: dipirona, nega outras", ["DIPIRONA"]),
    ("alergia a dipirona, dor lombar há 3 meses", ["DIPIRONA"]),
    ("alergia a dipirona, HAS, DM", ["DIPIRONA"]),
    ("alergia a plasil, em uso de losartana", ["PLASIL"]),
    ("alergia a medicamentos como dipirona, aas", []),
])
def test_lista_para_no_primeiro_item_que_falha(frase, esperado):
    assert extrair(frase) == esperado
