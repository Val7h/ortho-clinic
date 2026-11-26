"""Trava de gasto da API Anthropic (nov/2026).

Todas as rotas que chamam a Anthropic passam por aqui ANTES do httpx.
Corta: chave desligada (kill switch), teto por hora/dia, teto por sessao,
prompt grande demais, circuito aberto apos falhas repetidas, e pedido repetido
em poucos segundos.

No Render starter ha 1 worker: o contador em memoria basta. Se subir mais de
uma instancia, estes tetos passam a ser por instancia (ainda assim cortam um loop).

Variaveis (todas opcionais):
  IA_KILL_SWITCH=1          recusa tudo (503)
  IA_MAX_CALLS_PER_HOUR     padrao 150
  IA_MAX_CALLS_PER_DAY      padrao 800
  IA_MAX_TOKENS_PER_DAY     padrao 6000000 (entrada+saida)
  IA_MAX_CALLS_PER_SESSION  padrao 150
  IA_MAX_INPUT_CHARS        padrao 120000  (~30 mil tokens, folga para foto)
  IA_CIRCUIT_FAILURES       padrao 10
  IA_CIRCUIT_SECONDS        padrao 300
  IA_DEDUPE_SECONDS         padrao 10
"""
from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

logger = logging.getLogger("ia_limits")

_lock = threading.Lock()
_calls_ts: deque[float] = deque()
_tokens_day = 0
_day = ""
_sessao_calls: dict[str, int] = defaultdict(int)
_sessao_day: dict[str, str] = {}
_fails: deque[float] = deque()
_circuit_until = 0.0
_recent: dict[str, float] = {}


class AnthropicBloqueado(Exception):
    def __init__(self, mensagem: str, http: int = 429):
        super().__init__(mensagem)
        self.http = http


def _int(nome: str, padrao: int) -> int:
    try:
        return int((os.getenv(nome) or "").strip() or padrao)
    except ValueError:
        return padrao


def _hoje() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _reset_se_novo_dia() -> None:
    global _tokens_day, _day
    h = _hoje()
    if _day != h:
        _day = h
        _tokens_day = 0
        _sessao_calls.clear()
        _sessao_day.clear()


def _conta_dia() -> int:
    return sum(_sessao_calls.values())


def permitir(rota: str, sessao: str, corpo: str = "") -> None:
    """Recusa com AnthropicBloqueado se a chamada nao deve sair."""
    global _circuit_until
    if (os.getenv("IA_KILL_SWITCH") or "").strip().lower() in {"1", "true", "yes"}:
        raise AnthropicBloqueado("IA temporariamente desligada (IA_KILL_SWITCH).", 503)

    agora = time.time()
    max_hora = _int("IA_MAX_CALLS_PER_HOUR", 150)
    max_dia = _int("IA_MAX_CALLS_PER_DAY", 800)
    max_tok = _int("IA_MAX_TOKENS_PER_DAY", 6_000_000)
    max_ses = _int("IA_MAX_CALLS_PER_SESSION", 150)
    max_chars = _int("IA_MAX_INPUT_CHARS", 120_000)
    circ_n = _int("IA_CIRCUIT_FAILURES", 10)
    circ_s = _int("IA_CIRCUIT_SECONDS", 300)
    dedupe_s = _int("IA_DEDUPE_SECONDS", 10)

    if corpo and len(corpo) > max_chars:
        raise AnthropicBloqueado(
            f"Pedido de IA grande demais ({len(corpo)} caracteres; teto {max_chars}).", 413
        )

    chave_dedupe = hashlib.sha256(
        f"{rota}|{sessao}|{corpo}".encode("utf-8", "ignore")
    ).hexdigest()

    with _lock:
        _reset_se_novo_dia()
        if agora < _circuit_until:
            faltam = int(_circuit_until - agora)
            raise AnthropicBloqueado(
                f"IA em pausa apos falhas repetidas. Tente de novo em {faltam} s.", 503
            )

        while _calls_ts and _calls_ts[0] < agora - 3600:
            _calls_ts.popleft()
        while _fails and _fails[0] < agora - circ_s:
            _fails.popleft()
        for k in [k for k, t in _recent.items() if t < agora - dedupe_s]:
            _recent.pop(k, None)

        if chave_dedupe in _recent:
            raise AnthropicBloqueado(
                "O mesmo pedido de IA acabou de ser enviado. Espere um instante.", 429
            )

        if _sessao_day.get(sessao) != _day:
            _sessao_calls[sessao] = 0
            _sessao_day[sessao] = _day
        if _sessao_calls[sessao] >= max_ses:
            raise AnthropicBloqueado(
                f"Esta consulta ja usou o limite de {max_ses} chamadas de IA no dia.", 429
            )
        if len(_calls_ts) >= max_hora:
            raise AnthropicBloqueado(
                f"Limite de {max_hora} chamadas de IA por hora atingido.", 429
            )
        if _conta_dia() >= max_dia:
            raise AnthropicBloqueado(
                f"Limite de {max_dia} chamadas de IA no dia atingido.", 429
            )
        if _tokens_day >= max_tok:
            raise AnthropicBloqueado("Limite diario de tokens de IA atingido.", 429)

        _calls_ts.append(agora)
        _sessao_calls[sessao] += 1
        _recent[chave_dedupe] = agora

    logger.info(
        "ia.anthropic autorizada rota=%s sessao=%s chars=%s hora=%s dia_tokens=%s",
        rota, sessao, len(corpo or ""), len(_calls_ts), _tokens_day,
    )


def registrar_uso(rota: str, modelo: str, input_tokens: int = 0, output_tokens: int = 0) -> None:
    global _tokens_day
    with _lock:
        _reset_se_novo_dia()
        _tokens_day += max(0, int(input_tokens)) + max(0, int(output_tokens))
    logger.info(
        "ia.anthropic ok rota=%s modelo=%s input=%s output=%s dia_tokens=%s",
        rota, modelo, input_tokens, output_tokens, _tokens_day,
    )


def registrar_falha(rota: str, motivo: str) -> None:
    global _circuit_until
    agora = time.time()
    circ_n = _int("IA_CIRCUIT_FAILURES", 10)
    circ_s = _int("IA_CIRCUIT_SECONDS", 300)
    with _lock:
        _fails.append(agora)
        while _fails and _fails[0] < agora - circ_s:
            _fails.popleft()
        if len(_fails) >= circ_n:
            _circuit_until = agora + circ_s
            logger.error(
                "ia.anthropic circuito ABERTO por %ss apos %s falhas (%s)",
                circ_s, len(_fails), motivo,
            )
            return
    logger.warning("ia.anthropic falha rota=%s motivo=%s consecutivas=%s", rota, motivo, len(_fails))


def reset_para_teste() -> None:
    global _tokens_day, _day, _circuit_until
    with _lock:
        _calls_ts.clear()
        _tokens_day = 0
        _day = _hoje()
        _sessao_calls.clear()
        _sessao_day.clear()
        _fails.clear()
        _circuit_until = 0.0
        _recent.clear()
