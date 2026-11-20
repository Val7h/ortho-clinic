"""Tipo de receita no servidor (19/11/2026): notificação A/B recusada; antibiótico tópico = controle especial;
tramadol/codeína continuam controle especial. Roda: pytest --noconftest tests/test_receita_tipo.py"""
import os, sys, re, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
import main  # noqa
import routers.medicamentos as M

TERMOS = [("clonazepam", "notificacao"), ("morfina", "notificacao"), ("frontal", "notificacao"), ("turno", "notificacao"),
          ("tramadol", "controle_especial"),
          ("codeina", "controle_especial"), ("amoxicilina", "antimicrobiano"), ("dipirona", "simples")]


def _carregar():
    M._CACHE["termos"] = [(re.compile(r"\b" + re.escape(t) + r"\b"), tp) for t, tp in TERMOS]
    M._CACHE["em"] = time.time()


def test_notificacao_vira_notificacao():
    _carregar()
    assert M.tipo_exigido(None, "CLONAZEPAM 2MG 1 CP A NOITE") == "notificacao"
    assert M.tipo_exigido(None, "tramadol 50mg", "morfina 10mg") == "notificacao"


def test_palavra_comum_que_e_marca_nao_bloqueia():
    _carregar()
    # antes desta regra, marca de notificação = 2 vias; continua assim, sem recusar a receita
    assert M.tipo_exigido(None, "APLICAR NA REGIAO FRONTAL 1 CP POR TURNO") == "controle_especial"


def test_controle_e_antimicrobiano_continuam():
    _carregar()
    assert M.tipo_exigido(None, "TRAMADOL 50MG") == "controle_especial"
    assert M.tipo_exigido(None, "Paracetamol + codeína 30mg") == "controle_especial"
    assert M.tipo_exigido(None, "AMOXICILINA 875MG") == "antimicrobiano"
    assert M.tipo_exigido(None, "DIPIRONA 1G") is None


def test_antibiotico_topico_controle_especial():
    _carregar()
    assert M.tipo_exigido(None, "MUPIROCINA 20MG/G ---- 1 CX") == "controle_especial"
    assert M.tipo_exigido(None, "Nebacetin pomada") == "controle_especial"
