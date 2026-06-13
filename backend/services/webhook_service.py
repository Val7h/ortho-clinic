"""
Webhook delivery service — core logic consumed by Celery tasks and FastAPI
routes.

Responsibilities
----------------
1.  Fan-out: given an event envelope, query matching active webhook endpoints
    and enqueue one Celery task per endpoint.
2.  Delivery: perform the actual HTTP POST with HMAC-SHA256 signature, record
    the result in webhook_delivery_logs.
3.  Circuit breaker: after CIRCUIT_BREAKER_THRESHOLD consecutive failures,
    mark the endpoint inactive and write an alert to the log.
4.  Dead-letter: after MAX_ATTEMPTS failed tries, move the event to
    webhook_dead_letters.
5.  Payload construction: build the standard envelope expected by consumers.

Design decisions
----------------
- The service is intentionally framework-agnostic; it receives a db Session as
  a parameter so it can be called from Celery (which manages its own sessions)
  without importing FastAPI request context.
- Secrets are stored in plaintext in webhook_endpoints.secret (the column is
  treated as a credential, never returned in API responses).  HMAC is computed
  fresh on every delivery attempt using the stored plaintext.
- IP allow-listing is enforced at the application layer (before the HTTP call).
  mTLS is negotiated via httpx's ssl_context parameter when a PEM cert is
  present.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import os
import ssl
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from models.webhook import WebhookDeadLetter, WebhookDeliveryLog, WebhookEndpoint

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DELIVERY_TIMEOUT_SECONDS  = 10
MAX_ATTEMPTS              = 6
CIRCUIT_BREAKER_THRESHOLD = 10

# Exponential back-off schedule (seconds between attempts 1→2, 2→3, …)
BACKOFF_SCHEDULE = [5, 30, 300, 1800, 7200, 86400]  # 5s 30s 5m 30m 2h 24h

# All supported event types
SUPPORTED_EVENTS = [
    "appointment.created",
    "appointment.updated",
    "appointment.cancelled",
    "patient.created",
    "patient.updated",
    "document.uploaded",
    "payment.received",
    "ping",  # internal test event
]

API_VERSION = "v1"
USER_AGENT  = "OrthoClinic-Webhooks/1.0"


# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------

def build_envelope(
    event_type: str,
    data: Dict[str, Any],
    organization_id: Optional[int] = None,
    evt_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Construct the standard webhook payload envelope.

    {
      "id":              "evt_abc123",           # idempotency key
      "type":            "appointment.created",
      "created_at":      "2026-10-15T14:30:00Z",
      "api_version":     "v1",
      "data": {
        "object": { ...resource... }
      },
      "organization_id": 42
    }
    """
    return {
        "id":              evt_id or f"evt_{uuid.uuid4().hex[:12]}",
        "type":            event_type,
        "created_at":      datetime.now(timezone.utc).isoformat(),
        "api_version":     API_VERSION,
        "data":            {"object": data},
        "organization_id": organization_id,
    }


# ---------------------------------------------------------------------------
# HMAC signing
# ---------------------------------------------------------------------------

def sign_payload(payload_bytes: bytes, secret: str) -> str:
    """
    Return the HMAC-SHA256 signature in the format expected by consumers:
        sha256=<hexdigest>

    Consumers verify with:
        expected = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()
        received = header.split("=", 1)[1]
        secrets.compare_digest(expected, received)
    """
    digest = hmac.new(
        secret.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={digest}"


# ---------------------------------------------------------------------------
# IP allow-list enforcement
# ---------------------------------------------------------------------------

def _check_ip_allowlist(endpoint: WebhookEndpoint, target_host: str) -> None:
    """
    Raise ValueError if the endpoint has an IP allowlist and the resolved host
    does not match.  This is a best-effort check; the actual connection may
    resolve to a different IP.  For full enforcement use network-level controls.
    """
    if not endpoint.ip_allowlist:
        return
    import socket
    try:
        resolved_ip = socket.gethostbyname(target_host)
    except OSError:
        raise ValueError(f"Cannot resolve host '{target_host}' for IP allow-list check")

    ip_obj = ipaddress.ip_address(resolved_ip)
    for cidr in endpoint.ip_allowlist:
        if ip_obj in ipaddress.ip_network(cidr, strict=False):
            return  # allowed

    raise ValueError(
        f"Resolved IP {resolved_ip} for host '{target_host}' is not in the "
        f"IP allowlist {endpoint.ip_allowlist}"
    )


# ---------------------------------------------------------------------------
# mTLS context builder
# ---------------------------------------------------------------------------

def _build_ssl_context(endpoint: WebhookEndpoint) -> Optional[ssl.SSLContext]:
    """
    Build an SSL context with client certificate when mtls_cert_pem is set.
    The certificate must be a PEM-encoded client cert + private key bundle.
    Returns None (use httpx defaults) when mTLS is not configured.
    """
    if not endpoint.mtls_cert_pem:
        return None
    ctx = ssl.create_default_context()
    # Write PEM to a temp buffer; httpx accepts an SSLContext directly.
    import tempfile, os as _os
    with tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as f:
        f.write(endpoint.mtls_cert_pem)
        tmp_path = f.name
    try:
        ctx.load_cert_chain(tmp_path)
    finally:
        _os.unlink(tmp_path)
    return ctx


# ---------------------------------------------------------------------------
# Single delivery attempt (synchronous, called from Celery task)
# ---------------------------------------------------------------------------

def deliver_once(
    *,
    endpoint: WebhookEndpoint,
    payload: Dict[str, Any],
    attempt_number: int,
    db: Session,
) -> bool:
    """
    Perform one HTTP POST delivery attempt.

    Returns True on success (2xx), False on any failure.
    Always writes a WebhookDeliveryLog row.
    Updates endpoint.consecutive_failures and triggers circuit breaker if needed.
    """
    evt_id     = payload.get("id", "unknown")
    event_type = payload.get("type", "unknown")

    payload_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    # Build request headers
    headers: Dict[str, str] = {
        "Content-Type":        "application/json; charset=utf-8",
        "X-OrthoClinic-Event": event_type,
        "X-Delivery-ID":       evt_id,
        "X-Attempt-Number":    str(attempt_number),
        "User-Agent":          USER_AGENT,
    }
    if endpoint.secret:
        headers["X-OrthoClinic-Signature"] = sign_payload(payload_bytes, endpoint.secret)

    # IP allow-list check
    from urllib.parse import urlparse
    parsed = urlparse(endpoint.url)
    ip_error: Optional[str] = None
    try:
        _check_ip_allowlist(endpoint, parsed.hostname or "")
    except ValueError as exc:
        ip_error = str(exc)

    # Prepare log row
    log = WebhookDeliveryLog(
        endpoint_id=endpoint.id,
        evt_id=evt_id,
        event_type=event_type,
        attempt_number=attempt_number,
        status="failed",
        payload_snapshot=payload,
    )

    if ip_error:
        log.error_message = ip_error
        db.add(log)
        db.commit()
        _record_failure(endpoint, log.error_message, db)
        return False

    # mTLS
    ssl_ctx = _build_ssl_context(endpoint)

    # Perform HTTP call
    t0 = time.perf_counter()
    http_status:   Optional[int] = None
    response_body: Optional[str] = None
    error_message: Optional[str] = None
    success = False

    try:
        transport = httpx.HTTPTransport(ssl_context=ssl_ctx) if ssl_ctx else None
        with httpx.Client(timeout=DELIVERY_TIMEOUT_SECONDS, transport=transport) as client:
            resp = client.post(endpoint.url, content=payload_bytes, headers=headers)
            http_status   = resp.status_code
            response_body = resp.text[:1024]
            success       = 200 <= resp.status_code < 300
            if not success:
                error_message = f"Endpoint returned HTTP {http_status}"
    except httpx.TimeoutException:
        error_message = f"Request timed out after {DELIVERY_TIMEOUT_SECONDS}s"
    except httpx.ConnectError as exc:
        error_message = f"Connection error: {exc}"
    except Exception as exc:
        error_message = f"Unexpected error: {exc}"

    duration_ms = int((time.perf_counter() - t0) * 1000)

    # Write log
    log.status        = "success" if success else "failed"
    log.http_status   = http_status
    log.response_body = response_body
    log.error_message = error_message
    log.duration_ms   = duration_ms
    db.add(log)

    # Update circuit breaker counters
    if success:
        endpoint.consecutive_failures = 0
        endpoint.circuit_opened_at    = None
    else:
        _record_failure(endpoint, error_message or "unknown", db)

    db.commit()
    return success


# ---------------------------------------------------------------------------
# Circuit breaker helper
# ---------------------------------------------------------------------------

def _record_failure(endpoint: WebhookEndpoint, reason: str, db: Session) -> None:
    """Increment consecutive_failures and disable endpoint if threshold reached."""
    endpoint.consecutive_failures = (endpoint.consecutive_failures or 0) + 1
    if endpoint.consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD:
        endpoint.active            = False
        endpoint.circuit_opened_at = datetime.now(timezone.utc)
        print(
            f"[webhook] CIRCUIT OPEN — endpoint {endpoint.id} ({endpoint.url}) "
            f"disabled after {CIRCUIT_BREAKER_THRESHOLD} consecutive failures. "
            f"Last error: {reason}"
        )
    db.add(endpoint)


# ---------------------------------------------------------------------------
# Dead-letter writer
# ---------------------------------------------------------------------------

def move_to_dead_letter(
    *,
    endpoint: WebhookEndpoint,
    payload: Dict[str, Any],
    total_attempts: int,
    last_error: Optional[str],
    first_attempted_at: Optional[datetime],
    db: Session,
) -> WebhookDeadLetter:
    """Persist a dead-letter record and mark the last delivery log as 'dead'."""
    dead = WebhookDeadLetter(
        endpoint_id=endpoint.id,
        evt_id=payload.get("id", "unknown"),
        event_type=payload.get("type", "unknown"),
        payload=payload,
        total_attempts=total_attempts,
        first_attempted_at=first_attempted_at,
        last_attempted_at=datetime.now(timezone.utc),
        last_error=last_error,
    )
    db.add(dead)

    # Mark the latest log row as dead
    latest_log = (
        db.query(WebhookDeliveryLog)
        .filter(
            WebhookDeliveryLog.endpoint_id == endpoint.id,
            WebhookDeliveryLog.evt_id == payload.get("id", ""),
        )
        .order_by(WebhookDeliveryLog.attempt_number.desc())
        .first()
    )
    if latest_log:
        latest_log.status = "dead"

    db.commit()
    db.refresh(dead)
    return dead


# ---------------------------------------------------------------------------
# Fan-out: find matching endpoints and enqueue Celery tasks
# ---------------------------------------------------------------------------

def fan_out_event(
    event_type: str,
    data: Dict[str, Any],
    organization_id: Optional[int],
    db: Session,
    evt_id: Optional[str] = None,
) -> List[str]:
    """
    Build the event envelope and enqueue one Celery delivery task per matching
    active webhook endpoint.

    Returns the list of Celery task IDs enqueued.

    This function is safe to call from SQLAlchemy event hooks because it only
    reads from the DB (to find endpoints) and writes to a Celery broker queue.
    The actual HTTP calls happen inside the Celery worker.
    """
    from services.celery_app import deliver_webhook_task  # lazy import avoids circular deps

    envelope = build_envelope(event_type, data, organization_id, evt_id)

    # Find all active endpoints that subscribe to this event type or wildcard
    endpoints: List[WebhookEndpoint] = (
        db.query(WebhookEndpoint)
        .filter(WebhookEndpoint.active.is_(True))
        .all()
    )

    task_ids: List[str] = []
    for ep in endpoints:
        subscribed = ep.events or []
        if "*" not in subscribed and event_type not in subscribed:
            continue
        # Optionally filter by org
        if organization_id and ep.org_id and ep.org_id != organization_id:
            continue

        task = deliver_webhook_task.apply_async(
            kwargs={
                "endpoint_id": ep.id,
                "payload":     envelope,
                "attempt":     1,
                "first_attempted_at": datetime.now(timezone.utc).isoformat(),
            },
            countdown=0,
        )
        task_ids.append(task.id)

    return task_ids
