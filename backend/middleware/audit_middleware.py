"""
Audit Middleware — OrthoClinic Sprint 8

Injects audit log writes for authenticated API calls automatically.
Complements the manual AuditLogService.from_request() calls in routers
by handling authentication events (login / login_failed) at the middleware
layer, so routers do not need to be modified.

For patient, document, appointment, and admin actions the router is the
right place to call AuditLogService.from_request() with full context
(before_state / after_state).  This middleware only handles the transport
layer events (request-scoped metadata).

Usage in main.py:
    from middleware.audit_middleware import AuditContextMiddleware
    app.add_middleware(AuditContextMiddleware)
"""

from __future__ import annotations

import uuid

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from middleware.asgi_util import client_host, header


class AuditContextMiddleware:
    """
    Attach audit context to every request so downstream code can call
    AuditLogService.from_request(request, ...) without extracting headers.

    Sets on request.state:
      - request_id   : str   (X-Request-ID header or generated uuid4)
      - session_id   : str   (X-Session-ID header, if present)
      - actor_ip     : str   (X-Forwarded-For first hop or direct IP)
      - actor_ua     : str   (User-Agent)

    ASGI puro: não bufferiza o corpo (o BaseHTTPMiddleware copiava a resposta
    inteira e, em payload grande, disparava Content-Length maior que o header).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Request ID (honour incoming header from load balancer / gateway)
        incoming_rid = header(scope, b"x-request-id").strip()
        if incoming_rid and len(incoming_rid) <= 64 and incoming_rid.replace("-", "").isalnum():
            rid = incoming_rid
        else:
            rid = str(uuid.uuid4())

        bag = scope.setdefault("state", {})
        bag["request_id"] = rid
        sessao = header(scope, b"x-session-id")
        bag["session_id"] = sessao or None

        # IP — honour X-Forwarded-For (first hop = real client)
        forwarded = header(scope, b"x-forwarded-for")
        bag["actor_ip"] = (
            forwarded.split(",")[0].strip()
            if forwarded
            else client_host(scope)
        )
        bag["actor_ua"] = header(scope, b"user-agent") or None

        async def send_com_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-ID"] = rid
            await send(message)

        await self.app(scope, receive, send_com_id)
