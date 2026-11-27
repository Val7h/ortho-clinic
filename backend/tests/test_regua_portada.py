"""Regua unica (E3, 23/11/2026): "este documento ja existe hoje?". Casos do dia 23/11, sem dado de paciente.
27/11/2026 (emissor, P2): os testes da regua do PC (escriba-clinica/testes/test_regua.py) portados para a copia do
servidor (services/regua.py). Ficaram de fora so os que testam modulos do PC (sugestoes.py e ortho_documento.py),
que nao existem neste repositorio.
Rodar (de backend/): python -m pytest -q --noconftest tests/test_regua_portada.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from services import regua as G  # noqa: E402

HOJE = "2026-11-23"


# ---------------- exames ----------------
def test_lombar_e_lombossacra_sao_o_mesmo_exame():
    assert G.mesmo_exame("TOMOGRAFIA DA COLUNA LOMBAR", "TOMOGRAFIA COMPUTADORIZADA DA COLUNA LOMBOSSACRA")
    assert G.mesmo_exame("TC COLUNA L1-S1", "TOMOGRAFIA COMPUTADORIZADA DA COLUNA LOMBAR SEM CONTRASTE")
    assert G.mesmo_exame("RNM DA COLUNA LOMBOSSACRA", "RESSONÂNCIA MAGNÉTICA DA COLUNA LOMBAR")
    assert G.mesmo_exame("RM COLUNA DORSAL", "RESSONANCIA DA COLUNA TORACICA")


def test_rnm_e_tc_da_mesma_regiao_nao_sao_duplicacao():
    assert not G.mesmo_exame("RESSONÂNCIA MAGNÉTICA DA COLUNA LOMBOSSACRA", "TOMOGRAFIA COMPUTADORIZADA DA COLUNA LOMBOSSACRA")
    assert not G.mesmo_exame("RNM DO JOELHO DIREITO", "TC DO JOELHO DIREITO")


def test_segmentos_diferentes_da_coluna_nao_casam():
    assert not G.mesmo_exame("RNM DA COLUNA CERVICAL", "RNM DA COLUNA LOMBAR")
    assert not G.mesmo_exame("RNM DA COLUNA TORACICA", "RNM DA COLUNA LOMBOSSACRA")


def test_lado():
    assert G.mesmo_exame("TOMOGRAFIA COMPUTADORIZADA DO JOELHO DIREITO SEM CONTRASTE", "TOMOGRAFIA DOS JOELHOS SEM CONTRASTE")
    assert G.mesmo_exame("RNM JJ", "RNM DO JOELHO ESQUERDO")
    assert G.mesmo_exame("USG DO OMBRO DIREITO", "ULTRASSONOGRAFIA DO OMBRO DIREITO")
    assert not G.mesmo_exame("RNM DO JOELHO DIREITO", "RNM DO JOELHO ESQUERDO")
    assert not G.mesmo_exame("RX DO PE DIREITO", "RX DO TORNOZELO DIREITO")
    assert G.lados("RNM JOELHOS") == {"D", "E"} and G.lados("joelho bilateral") == {"D", "E"}


def test_laboratorio_e_procedimento():
    assert G.mesmo_exame("HEMOGRAMA COMPLETO", "HEMOGRAMA")
    assert not G.mesmo_exame("VITAMINA D", "VITAMINA B12")
    assert not G.mesmo_exame("VISCOSSUPLEMENTACAO JOELHO DIREITO", "BLOQUEIO DOS NERVOS GENICULARES JOELHO DIREITO")
    assert G.mesmo_exame("ENMG DOS MEMBROS INFERIORES", "ELETRONEUROMIOGRAFIA DOS MEMBROS INFERIORES")
    assert G.classe("DENSITOMETRIA OSSEA") == "Densitometria" and G.classe("FISIOTERAPIA MOTORA") == "Fisioterapia"


def test_caso_tc_depois_da_tc_ja_feita():
    """23/11: a TC lombar + joelhos ja estava feita (lombossacra) e a Escriba fez outra (lombar)."""
    exams = [
        {"id": 101, "date": HOJE, "created_at": "2026-11-23T12:39:44+00:00",
         "free_text": "SOLICITO: \n\n\nRESSONÂNCIA MAGNÉTICA DA COLUNA LOMBOSSACRA\nRESSONÂNCIA MAGNÉTICA DO JOELHO DIREITO\n"
                      "RESSONÂNCIA MAGNÉTICA DO JOELHO ESQUERDO\n\nHD: DOR LOMBAR E GONARTROSE BILATERAL (M54.5 / M17.0)"},
        {"id": 102, "date": HOJE, "created_at": "2026-11-23T12:40:26+00:00",
         "free_text": "SOLICITO: \n\n\nTOMOGRAFIA COMPUTADORIZADA DA COLUNA LOMBOSSACRA\nTOMOGRAFIA COMPUTADORIZADA DO JOELHO DIREITO\n"
                      "TOMOGRAFIA COMPUTADORIZADA DO JOELHO ESQUERDO\n\nHD: DOR LOMBAR\n\n(Solicitado em guia SP/SADT — ver aba Documentos)"},
    ]
    for item in ("TOMOGRAFIA COMPUTADORIZADA DA COLUNA LOMBAR SEM CONTRASTE", "TOMOGRAFIA DA COLUNA LOMBAR",
                 "TOMOGRAFIA COMPUTADORIZADA DO JOELHO DIREITO SEM CONTRASTE", "TOMOGRAFIA DOS JOELHOS SEM CONTRASTE"):
        achou = G.exame_ja_feito(item, exams, HOJE)
        assert achou and achou[0]["id"] == 102, item
    assert G.exame_ja_feito("RX DA COLUNA LOMBAR", exams, HOJE) is None
    # so com a RNM feita, a TC e legitima
    assert G.exame_ja_feito("TOMOGRAFIA DA COLUNA LOMBAR", exams[:1], HOJE) is None
    # o HD ("DOR LOMBAR ... BILATERAL") nao e item
    assert all(not l.upper().startswith("HD") for l in G.itens_do_pedido(exams[0]["free_text"]))
    doc, linha = G.exame_ja_feito("TC LOMBAR", exams, HOJE)
    assert G.aviso("exame", doc, linha).endswith("feito as 09:40")


def test_outro_dia_nao_conta():
    exams = [{"id": 1, "date": "2026-11-20", "free_text": "TOMOGRAFIA DA COLUNA LOMBAR"}]
    assert G.exame_ja_feito("TOMOGRAFIA DA COLUNA LOMBAR", exams, HOJE) is None


# ---------------- remedios ----------------
def test_leva_levo_levofloxacino_uma_chave_so():
    assert G.chave_remedio("leva") == G.chave_remedio("LEVO 500MG") == G.chave_remedio("LEVOFLOXACINO 500MG") == "levofloxacino"
    assert G.chave_remedio("LEVOFLOXACINA 750MG") == "levofloxacino"


def test_marca_pela_tabela():
    assert G.principios("CIBEX 200MG") == {"celecoxibe"}
    assert G.principios("INSIT 50MG") == {"pregabalina"}
    assert G.principios("CYMBI 30MG") == {"duloxetina"}
    assert G.principios("GLIFAGE 850MG") == {"metformina"}
    assert G.principios("LUSANDA 5MG") == {"buprenorfina"}


def test_nome_desconhecido_nao_e_adivinhado():
    assert G.chave_remedio("BARCERO") == "barcero"
    assert G.chave_remedio("PREGABALINA 75MG") == "pregabalina"


def test_mesmo_remedio():
    assert G.mesmo_remedio("CIBEX 200MG", "CELECOXIBE 200MG")
    assert G.mesmo_remedio("INSIT 75MG", "PREGABALINA 75MG")
    assert not G.mesmo_remedio("PREGABALINA 75MG", "DULOXETINA 30MG")
    # formula manipulada: a mesma se divide 2+ principios (caso de 23/11)
    assert G.mesmo_remedio("DEFLAZACORTE 3MG + PREGABALINA 75MG + DULOXETINA 30MG + CICLOBENZAPRINA 5MG + TRAMADOL 50MG",
                           "CICLOBENZAPRINA 5MG + PREGABALINA 75MG + DULOXETINA 30MG + TRAMADOL 50MG")


def test_caso_formula_ja_receitada():
    rx = [{"id": 201, "date": HOJE, "created_at": "2026-11-23T14:03:52+00:00",
           "instructions": "USO ORAL\n\nCICLOBENZAPRINA 5MG + PREGABALINA 75MG + DULOXETINA 30MG + TRAMADOL 50MG"
                           "----------------------------- 120 CP\n\nTOMAR 1 CP DE 12 EM 12H.\n\n"}]
    achou = G.remedio_ja_receitado("DEFLAZACORTE 3MG + PREGABALINA 75MG + DULOXETINA 30MG + CICLOBENZAPRINA 5MG + TRAMADOL 50MG",
                                   rx, HOJE)
    assert achou and achou[0]["id"] == 201
    assert G.aviso("receita", achou[0], achou[1]).endswith("feito as 11:03")
    assert G.remedio_ja_receitado("CIBEX 200MG", rx, HOJE) is None


def test_receita_com_marcas():
    rx = [{"id": 202, "date": HOJE, "instructions": "USO ORAL\n\nCIBEX 200MG ------------ 1CX\n\nTOMAR 1 CP DE 12 EM 12H.\n\n"
                                                     "INSIT 50MG ------------ 1CX\n\nTOMAR 1 CP A NOITE."}]
    assert G.remedio_ja_receitado("celecoxibe", rx, HOJE)
    assert G.remedio_ja_receitado("PREGABALINA 50MG", rx, HOJE)
    assert G.remedio_ja_receitado("levofloxacino", rx, HOJE) is None


# ---------------- revisao independente da E3 (23/11) ----------------
def test_sacroiliaca_e_regiao_propria():
    assert not G.mesmo_exame("RNM DAS SACROILIACAS", "RNM DA COLUNA LOMBAR")
    assert not G.mesmo_exame("RESSONANCIA DAS ARTICULACOES SACROILÍACAS", "RNM DA COLUNA LOMBOSSACRA")
    assert G.mesmo_exame("RNM SACROILIACAS", "RESSONANCIA DAS ARTICULACOES SACRO-ILIACAS")


def test_d_e_dir_esq_sozinhos_sao_lado():
    assert not G.mesmo_exame("RX OMBRO D", "RX OMBRO E")
    assert not G.mesmo_exame("RX OMBRO DIR", "RX OMBRO ESQ")
    assert G.mesmo_exame("RX OMBRO D", "RX DO OMBRO DIREITO")
    assert G.lados("RNM DO OMBRO E DO COTOVELO") == frozenset()      # "E" no meio = conjuncao
    assert G.lados("RNM JOELHO E SEM CONTRASTE") == {"E"}


def test_sal_sai_antes_do_principio():
    assert G.principios("CLORIDRATO DE TRAMADOL 50MG") == {"tramadol"}
    assert G.mesmo_remedio("CLORIDRATO DE CICLOBENZAPRINA 5MG", "MIOSAN 5MG")
    assert G.principios("DICLOFENACO SODICO 50MG") == {"diclofenaco"}


def test_enmg_inferiores_nao_e_superiores():
    assert not G.mesmo_exame("ENMG DOS MEMBROS INFERIORES", "ENMG DOS MEMBROS SUPERIORES")
    assert not G.mesmo_exame("ENMG MMII", "ENMG MMSS")
    assert G.mesmo_exame("ENMG MMII", "ELETRONEUROMIOGRAFIA DOS MEMBROS INFERIORES")


def test_regiao_nao_dita_nao_barra():
    assert not G.mesmo_exame("FISIOTERAPIA", "FISIOTERAPIA MOTORA PARA JOELHO DIREITO")
    assert not G.mesmo_exame("FISIOTERAPIA MOTORA", "FISIOTERAPIA")
    assert not G.mesmo_exame("FISIOTERAPIA PARA OMBRO", "FISIOTERAPIA PARA JOELHO")
    assert G.mesmo_exame("ELETROCARDIOGRAMA", "ECG")              # exame sem regiao por natureza


def test_coluna_total_nao_e_lombar():
    assert not G.mesmo_exame("RX DA COLUNA TOTAL", "RX DA COLUNA LOMBAR")
    assert not G.mesmo_exame("RX PANORAMICA DA COLUNA", "RX DA COLUNA")
    assert G.mesmo_exame("RX COLUNA TOTAL", "RADIOGRAFIA DA COLUNA TOTAL")


def test_linha_sem_traco_nem_dose_nao_e_remedio():
    assert G.remedios_da_receita("Gelo local\nRepouso relativo\nDIPIRONA 1G\nTOMAR 1 CP SE DOR") == ["DIPIRONA 1G"]
    assert G.remedios_da_receita("Celecoxibe\nGelo local") == ["Celecoxibe"]   # a tabela conhece


def test_dipirona_depois_de_celecoxibe_nao_e_igual():
    rx = [{"id": 1, "date": HOJE, "instructions": "USO ORAL\n\nCELECOXIBE 200MG ---- 1CX\n\nTOMAR 1 CP"}]
    assert G.remedio_ja_receitado("DIPIRONA 1G", rx, HOJE) is None
