"""Testes da trava de gasto da Anthropic — sem chamar a API."""
import os

import pytest

from services.ia_limits import (
    AnthropicBloqueado,
    permitir,
    registrar_falha,
    registrar_uso,
    reset_para_teste,
)


@pytest.fixture(autouse=True)
def limpar(monkeypatch):
    reset_para_teste()
    for k in list(os.environ):
        if k.startswith("IA_"):
            monkeypatch.delenv(k, raising=False)
    yield
    reset_para_teste()


def test_kill_switch(monkeypatch):
    monkeypatch.setenv("IA_KILL_SWITCH", "1")
    with pytest.raises(AnthropicBloqueado) as e:
        permitir("chat", "s1", "oi")
    assert e.value.http == 503


def test_teto_por_sessao(monkeypatch):
    monkeypatch.setenv("IA_MAX_CALLS_PER_SESSION", "2")
    permitir("chat", "s1", "a")
    permitir("chat", "s1", "b")
    with pytest.raises(AnthropicBloqueado):
        permitir("chat", "s1", "c")
    # outra sessao segue liberada
    permitir("chat", "s2", "d")


def test_teto_por_hora(monkeypatch):
    monkeypatch.setenv("IA_MAX_CALLS_PER_HOUR", "3")
    monkeypatch.setenv("IA_MAX_CALLS_PER_SESSION", "99")
    permitir("chat", "a", "1")
    permitir("chat", "b", "2")
    permitir("chat", "c", "3")
    with pytest.raises(AnthropicBloqueado) as e:
        permitir("chat", "d", "4")
    assert "hora" in str(e.value)


def test_dedupe_do_mesmo_pedido():
    permitir("chat", "s1", "mesmo texto")
    with pytest.raises(AnthropicBloqueado) as e:
        permitir("chat", "s1", "mesmo texto")
    assert e.value.http == 429


def test_prompt_grande_demais(monkeypatch):
    monkeypatch.setenv("IA_MAX_INPUT_CHARS", "10")
    with pytest.raises(AnthropicBloqueado) as e:
        permitir("chat", "s1", "x" * 20)
    assert e.value.http == 413


def test_teto_de_tokens(monkeypatch):
    monkeypatch.setenv("IA_MAX_TOKENS_PER_DAY", "100")
    monkeypatch.setenv("IA_MAX_CALLS_PER_SESSION", "99")
    registrar_uso("chat", "claude-haiku-4-5", 80, 30)
    with pytest.raises(AnthropicBloqueado):
        permitir("chat", "s1", "depois do teto")


def test_circuito_abre_apos_falhas(monkeypatch):
    monkeypatch.setenv("IA_CIRCUIT_FAILURES", "3")
    monkeypatch.setenv("IA_CIRCUIT_SECONDS", "60")
    monkeypatch.setenv("IA_MAX_CALLS_PER_SESSION", "99")
    registrar_falha("chat", "timeout")
    registrar_falha("chat", "timeout")
    registrar_falha("chat", "timeout")
    with pytest.raises(AnthropicBloqueado) as e:
        permitir("chat", "s1", "depois")
    assert e.value.http == 503


def test_dedupe_olha_o_pedido_inteiro():
    # historico longo de chat: o comeco igual nao pode barrar a pergunta nova
    base = "x" * 5000
    permitir("chat", "s1", base + "pergunta 1")
    permitir("chat", "s1", base + "pergunta 2")


def test_padroes_nao_barram_dia_normal():
    # 120 chamadas numa sessao (dia cheio de consultas) passam com os padroes
    for i in range(120):
        permitir("ler_foto", "foto", f"img{i}")
