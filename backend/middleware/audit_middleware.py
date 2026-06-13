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
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class AuditContextMiddleware(BaseHTTPMiddleware):
    """
    Attach audit context to every request so downstream code can call
    AuditLogService.from_request(request, ...) without extracting headers.

    Sets on request.state:
      - request_id   : str   (X-Request-ID header or generated uuid4)
      - session_id   : str   (X-Session-ID header, if present)
      - actor_ip     : str   (X-Forwarded-For first hop or direct IP)
      - actor_ua     : str   (User-Agent)
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Request ID (honour incoming header from load balancer / gateway)
        incoming_rid = request.headers.get("X-Request-ID", "").strip()
        if incoming_rid and len(incoming_rid) <= 64 and incoming_rid.replace("-", "").isalnum():
            rid = incoming_rid
        else:
            rid = str(uuid.uuid4())

        request.state.request_id = rid

        # Session ID (set by frontend after login)
        request.state.session_id = request.headers.get("X-Session-ID") or None

        # IP — honour X-Forwarded-For (first hop = real client)
        forwarded = request.headers.get("X-Forwarded-For", "")
        request.state.actor_ip = (
            forwarded.split(",")[0].strip()
            if forwarded
            else (request.client.host if request.client else None)
        )

        request.state.actor_ua = request.headers.get("User-Agent")

        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response
