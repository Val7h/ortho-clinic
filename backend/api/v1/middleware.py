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
from typing import Callable, Deque, Dict

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

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

class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Attach a unique request ID to every request.

    - If the caller supplies X-Request-ID we honour it (max 64 chars, alphanumeric+dash).
    - Otherwise we generate one: req_<16 hex chars>.
    - The ID is set on request.state.request_id and echoed in the response header.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        incoming = request.headers.get("X-Request-ID", "").strip()
        # Accept caller-supplied ID if it looks safe (no injection risk)
        if incoming and len(incoming) <= 64 and incoming.replace("-", "").isalnum():
            request_id = incoming
        else:
            request_id = f"req_{uuid.uuid4().hex[:16]}"

        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


# ---------------------------------------------------------------------------
# 2. Response Time Middleware
# ---------------------------------------------------------------------------

class ResponseTimeMiddleware(BaseHTTPMiddleware):
    """Append X-Response-Time: <N>ms to every response."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        response.headers["X-Response-Time"] = f"{elapsed_ms}ms"
        return response


# ---------------------------------------------------------------------------
# 3. Rate Limit Middleware
# ---------------------------------------------------------------------------

class RateLimitMiddleware(BaseHTTPMiddleware):
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
        super().__init__(app)
        self._redis = _get_redis()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Only rate-limit the public API
        if not request.url.path.startswith("/api/v1/"):
            return await call_next(request)

        limit = DEFAULT_RATE_LIMIT_RPM
        # Allow per-key override set by auth dependency
        key_limit = getattr(request.state, "rate_limit_rpm", None)
        if key_limit is not None:
            limit = int(key_limit)

        identity = self._identity(request)
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
            resp = err_rate_limit(request, retry_after=RATE_WINDOW_SECONDS)
            resp.headers.update(headers)
            return resp

        response = await call_next(request)
        response.headers.update(headers)
        return response

    # ------------------------------------------------------------------

    def _identity(self, request: Request) -> str:
        key_id = getattr(request.state, "api_key_id", None)
        if key_id:
            return f"apikey:{key_id}"
        client_id = getattr(request.state, "oauth_client_id", None)
        if client_id:
            return f"oauth:{client_id}"
        forwarded = request.headers.get("X-Forwarded-For", "")
        ip = forwarded.split(",")[0].strip() if forwarded else request.client.host
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

class AuditLogMiddleware(BaseHTTPMiddleware):
    """
    Structured audit log for every /api/v1/* request.

    Log fields (JSON-compatible):
      timestamp, request_id, method, path, query, status_code,
      response_time_ms, api_key_id, oauth_client_id, user_id, ip
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not request.url.path.startswith("/api/v1/"):
            return await call_next(request)

        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        request_id   = getattr(request.state, "request_id", "")
        api_key_id   = getattr(request.state, "api_key_id", None)
        oauth_client = getattr(request.state, "oauth_client_id", None)
        user_id      = getattr(request.state, "public_api_user_id", None)
        forwarded    = request.headers.get("X-Forwarded-For", "")
        ip           = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else "unknown"
        )

        logger.info(
            "api_audit",
            extra={
                "request_id":      request_id,
                "method":          request.method,
                "path":            request.url.path,
                "query":           str(request.url.query),
                "status_code":     response.status_code,
                "response_time_ms": elapsed_ms,
                "api_key_id":      api_key_id,
                "oauth_client_id": oauth_client,
                "user_id":         user_id,
                "ip":              ip,
            },
        )
        return response


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
