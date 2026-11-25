"""
Middleware stack — OrthoClinic Public API v1

Order (outermost → innermost, i.e. the order they wrap the ASGI stack):

  1. RequestIDMiddleware     — attaches X-Request-ID to every request/response
  2. ResponseTimeMiddleware  — attaches X-Response-Time (ms) to every response
  3. RateLimitMiddleware     — Redis sliding-window rate limiter per API key
  4. AuditLogMiddleware      — structured log of every /api/v1/* call + result

Rate-limit fallback:
  When Redis is unavailable we fall back to an in-process sliding window using
  a collections.deque so the API keeps working without a hard dependency on Redis.

These are pure ASGI middleware. They used to extend BaseHTTPMiddleware, which
buffers the entire body and re-sends it — that both inflated RAM on the page
renders and raised `Response content longer than Content-Length`.

Usage:
    from api.v1.middleware import attach_public_api_middleware
    attach_public_api_middleware(app)
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import FastAPI, Request
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from middleware.asgi_util import client_host, header

logger = logging.getLogger("orthoclinic.api.v1")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_RATE_LIMIT_RPM = int(os.getenv("PUBLIC_API_RATE_LIMIT_RPM", "120"))   # 120 req/min
RATE_WINDOW_SECONDS    = 60

# In-process fallback store: key_id → deque of timestamps
_local_windows: Dict[str, Deque[float]] = defaultdict(deque)


# ---------------------------------------------------------------------------
# Redis helper (optional)
# ---------------------------------------------------------------------------

def _get_redis():
    """Return a Redis client or None if Redis is not configured."""
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None
    try:
        import redis  # type: ignore
        client = redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=1)
        client.ping()
        return client
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 1. Request ID Middleware
# ---------------------------------------------------------------------------

class RequestIDMiddleware:
    """
    Attach a unique request ID to every request.

    - If the caller supplies X-Request-ID we honour it (max 64 chars, alphanumeric+dash).
    - Otherwise we generate one: req_<16 hex chars>.
    - The ID is set on request.state.request_id and echoed in the response header.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = header(scope, b"x-request-id").strip()
        # Accept caller-supplied ID if it looks safe (no injection risk)
        if incoming and len(incoming) <= 64 and incoming.replace("-", "").isalnum():
            request_id = incoming
        else:
            request_id = f"req_{uuid.uuid4().hex[:16]}"

        scope.setdefault("state", {})["request_id"] = request_id

        async def send_com_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        await self.app(scope, receive, send_com_id)


# ---------------------------------------------------------------------------
# 2. Response Time Middleware
# ---------------------------------------------------------------------------

class ResponseTimeMiddleware:
    """Append X-Response-Time: <N>ms to every response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        t0 = time.perf_counter()

        async def send_com_tempo(message: Message) -> None:
            if message["type"] == "http.response.start":
                elapsed_ms = int((time.perf_counter() - t0) * 1000)
                MutableHeaders(scope=message)["X-Response-Time"] = f"{elapsed_ms}ms"
            await send(message)

        await self.app(scope, receive, send_com_tempo)


# ---------------------------------------------------------------------------
# 3. Rate Limit Middleware
# ---------------------------------------------------------------------------

class RateLimitMiddleware:
    """
    Sliding-window rate limiter scoped to /api/v1/*.

    Identity key priority:
      1. Resolved API key ID (request.state.api_key_id, set by auth dependency)
      2. OAuth client ID from request.state.oauth_client_id
      3. Client IP address (fallback for unauthenticated requests)

    Limit: DEFAULT_RATE_LIMIT_RPM per 60-second window.
    Stores counters in Redis (ZSET sliding window) with an in-process fallback.

    Response headers:
      X-RateLimit-Limit     — window capacity
      X-RateLimit-Remaining — requests left in current window
      X-RateLimit-Reset     — Unix timestamp when the window resets
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._redis = _get_redis()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path") or ""
        # Only rate-limit the public API
        if not path.startswith("/api/v1/"):
            await self.app(scope, receive, send)
            return

        raw = scope.setdefault("state", {})
        limit = DEFAULT_RATE_LIMIT_RPM
        # Allow per-key override set by auth dependency
        key_limit = raw.get("rate_limit_rpm")
        if key_limit is not None:
            limit = int(key_limit)

        identity = self._identity(scope)
        now = time.time()
        window_start = now - RATE_WINDOW_SECONDS
        reset_at = int(now) + RATE_WINDOW_SECONDS

        count = self._count(identity, now, window_start, limit)

        remaining = max(0, limit - count)
        headers = {
            "X-RateLimit-Limit":     str(limit),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset":     str(reset_at),
        }

        if count > limit:
            from api.v1.errors import err_rate_limit
            request = Request(scope)
            resp = err_rate_limit(request, retry_after=RATE_WINDOW_SECONDS)
            resp.headers.update(headers)
            await resp(scope, receive, send)
            return

        async def send_com_limite(message: Message) -> None:
            if message["type"] == "http.response.start":
                destino = MutableHeaders(scope=message)
                for chave, valor in headers.items():
                    destino[chave] = valor
            await send(message)

        await self.app(scope, receive, send_com_limite)

    # ------------------------------------------------------------------

    def _identity(self, scope: Scope) -> str:
        raw = scope.get("state") or {}
        key_id = raw.get("api_key_id")
        if key_id:
            return f"apikey:{key_id}"
        client_id = raw.get("oauth_client_id")
        if client_id:
            return f"oauth:{client_id}"
        forwarded = header(scope, b"x-forwarded-for")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = client_host(scope) or ""
        return f"ip:{ip}"

    def _count(self, identity: str, now: float, window_start: float, limit: int) -> int:
        """Increment counter using Redis ZSET or in-process fallback."""
        if self._redis:
            return self._redis_count(identity, now, window_start, limit)
        return self._local_count(identity, now, window_start)

    def _redis_count(self, identity: str, now: float, window_start: float, limit: int) -> int:
        try:
            key = f"rl:apiv1:{identity}"
            pipe = self._redis.pipeline()
            pipe.zremrangebyscore(key, "-inf", window_start)
            pipe.zadd(key, {str(uuid.uuid4()): now})
            pipe.zcard(key)
            pipe.expire(key, RATE_WINDOW_SECONDS + 5)
            results = pipe.execute()
            return int(results[2])
        except Exception:
            # Redis failure → fall through to local
            return self._local_count(identity, now, window_start)

    def _local_count(self, identity: str, now: float, window_start: float) -> int:
        dq = _local_windows[identity]
        # Evict old entries
        while dq and dq[0] < window_start:
            dq.popleft()
        dq.append(now)
        return len(dq)


# ---------------------------------------------------------------------------
# 4. Audit Log Middleware
# ---------------------------------------------------------------------------

class AuditLogMiddleware:
    """
    Structured audit log for every /api/v1/* request.

    Log fields (JSON-compatible):
      timestamp, request_id, method, path, query, status_code,
      response_time_ms, api_key_id, oauth_client_id, user_id, ip
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path") or ""
        if not path.startswith("/api/v1/"):
            await self.app(scope, receive, send)
            return

        t0 = time.perf_counter()
        status_code = 500

        async def send_capturando(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
            await send(message)

        await self.app(scope, receive, send_capturando)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        raw = scope.get("state") or {}
        forwarded = header(scope, b"x-forwarded-for")
        ip = forwarded.split(",")[0].strip() if forwarded else (client_host(scope) or "unknown")
        query = scope.get("query_string") or b""
        if isinstance(query, bytes):
            query = query.decode("latin-1")

        logger.info(
            "api_audit",
            extra={
                "request_id":      raw.get("request_id", ""),
                "method":          scope.get("method", ""),
                "path":            path,
                "query":           query,
                "status_code":     status_code,
                "response_time_ms": elapsed_ms,
                "api_key_id":      raw.get("api_key_id"),
                "oauth_client_id": raw.get("oauth_client_id"),
                "user_id":         raw.get("public_api_user_id"),
                "ip":              ip,
            },
        )


# ---------------------------------------------------------------------------
# Attach all middleware to the FastAPI app
# ---------------------------------------------------------------------------

def attach_public_api_middleware(app: FastAPI) -> None:
    """
    Register the public API middleware stack in the correct order.

    Starlette processes middleware in LIFO order (last-added = outermost),
    so we add the outermost layer last.

    Final request execution order:
      RequestID → ResponseTime → RateLimit → AuditLog → route handler
    """
    # Added last = outermost = first to process the request
    app.add_middleware(AuditLogMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(ResponseTimeMiddleware)
    app.add_middleware(RequestIDMiddleware)
