"""Middleware ASGI que não segura o corpo da resposta.

O `BaseHTTPMiddleware` do Starlette lê a resposta inteira numa tarefa ao lado
e manda de novo. Neste serviço isso copia cada JSON — inclusive as páginas
de guia, que passam de vários MB — uma vez por camada. Com a pilha atual
são sete camadas. No meio do reenvio o uvicorn levanta
`RuntimeError: Response content longer than Content-Length` (visto 66 vezes
em 25/11/2026, nos mesmos minutos do estouro de memória).

Aqui só se mexe no cabeçalho de início. O corpo segue byte a byte.
"""
from __future__ import annotations

from starlette.datastructures import State


def header(scope, name: bytes) -> str:
    alvo = name.lower()
    for chave, valor in scope.get("headers") or []:
        if chave == alvo:
            return valor.decode("latin-1")
    return ""


def state(scope) -> State:
    return State(scope.setdefault("state", {}))


def client_host(scope) -> str | None:
    cliente = scope.get("client")
    if not cliente:
        return None
    return cliente[0]
