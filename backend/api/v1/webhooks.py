"""
Webhook registration and management — Public API v1 (Sprint 7).

Endpoints
---------
POST   /api/v1/webhooks                           register endpoint
GET    /api/v1/webhooks                           list endpoints
GET    /api/v1/webhooks/{id}                      get single endpoint
PATCH  /api/v1/webhooks/{id}                      update endpoint
DELETE /api/v1/webhooks/{id}                      remove endpoint
POST   /api/v1/webhooks/{id}/test                 send synchronous test payload
GET    /api/v1/webhooks/{id}/deliveries           delivery history (paginated)
GET    /api/v1/webhooks/{id}/dead-letters         dead-letter queue
POST   /api/v1/webhooks/{id}/dead-letters/{dl_id}/replay  requeue dead-letter

Delivery engine
---------------
The actual HTTP calls are performed by Celery workers (services/celery_app.py).
The /test endpoint delivers synchronously and returns the result immediately.

Signature
---------
Every delivery includes:
    X-OrthoClinic-Signature: sha256=<HMAC-SHA256 hex>
    X-OrthoClinic-Event:     <event_type>
    X-Delivery-ID:           evt_<12 hex chars>
    X-Attempt-Number:        1

The HMAC key is the secret stored in webhook_endpoints.secret.

Security notes
--------------
- The secret is stored in plaintext in the DB row (treated as a credential).
  It is never returned in API responses; only a masked hint is shown.
- HTTPS is enforced for all endpoint URLs (configurable via WEBHOOK_ALLOW_HTTP
  env var for test mode).
- IP allow-listing and mTLS are enterprise features stored in the DB row and
  enforced by the delivery service.
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from api.v1.auth import AuthContext, require_scope
from api.v1.errors import err_not_found, err_validation
from api.v1.schemas import (
    DeadLetterOut,
    DeliveryLogOut,
    WebhookCreate,
    WebhookOut,
    WebhookTestResult,
    WebhookUpdate,
)
from database import Base, get_db
from models.webhook import WebhookDeadLetter, WebhookDeliveryLog, WebhookEndpoint

router = APIRouter(prefix="/api/v1/webhooks", tags=["Public API — Webhooks"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_hint(secret: str) -> str:
    """Return a masked hint for display, e.g. 'whsec_...abcd'."""
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}...{secret[-4:]}"


def _sign_payload(payload_bytes: bytes, secret: str) -> str:
    import hmac
    digest = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _row_to_out(row: WebhookEndpoint) -> WebhookOut:
    return WebhookOut(
        id=row.id,
        url=row.url,
        events=row.events or [],
        description=row.description,
        active=row.active,
        created_at=row.created_at,
        updated_at=row.updated_at,
        consecutive_failures=row.consecutive_failures or 0,
        circuit_opened_at=row.circuit_opened_at,
        secret_hint=_make_hint(row.secret) if row.secret else None,
        has_ip_allowlist=bool(row.ip_allowlist),
        has_mtls=bool(row.mtls_cert_pem),
    )


def _resolve_ownership(ctx: AuthContext, db: Session):
    """Return (api_key_id, client_id, org_id) from auth context."""
    api_key_id = ctx.api_key_id
    client_id  = ctx.oauth_client_id
    org_id     = None

    if api_key_id:
        from models.oauth2 import OAuthAPIKey
        key_row = db.query(OAuthAPIKey).filter(OAuthAPIKey.id == api_key_id).first()
        if key_row:
            org_id = key_row.organization_id

    return api_key_id, client_id, org_id


def _base_query(ctx: AuthContext, db: Session):
    """Return a query filtered to webhooks owned by this credential."""
    api_key_id, client_id, _ = _resolve_ownership(ctx, db)
    q = db.query(WebhookEndpoint)
    if api_key_id:
        return q.filter(WebhookEndpoint.api_key_id == api_key_id)
    if client_id:
        return q.filter(WebhookEndpoint.client_id == client_id)
    return q.filter(WebhookEndpoint.id == -1)   # empty — no owner scope


# ---------------------------------------------------------------------------
# POST /api/v1/webhooks — Register
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=WebhookOut,
    status_code=201,
    summary="Register webhook endpoint",
    description=(
        "Register an HTTPS URL to receive event deliveries. "
        "Requires scope `webhooks:write`. "
        "The secret is stored server-side and **never returned** — save it now."
    ),
)
async def create_webhook(
    request: Request,
    body:    WebhookCreate,
    ctx:     AuthContext   = Depends(require_scope("webhooks:write")),
    db:      Session       = Depends(get_db),
) -> WebhookOut:

    api_key_id, client_id, org_id = _resolve_ownership(ctx, db)

    row = WebhookEndpoint(
        api_key_id=api_key_id,
        client_id=client_id,
        org_id=org_id,
        url=body.url,
        events=body.events,
        secret=body.secret,                   # stored as credential, never returned
        description=body.description,
        active=body.active,
        consecutive_failures=0,
        ip_allowlist=body.ip_allowlist,
        mtls_cert_pem=body.mtls_cert_pem,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return _row_to_out(row)


# ---------------------------------------------------------------------------
# GET /api/v1/webhooks — List
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=List[WebhookOut],
    summary="List webhook endpoints",
    description="List all webhooks registered by the current API key. Requires scope `webhooks:read`.",
)
async def list_webhooks(
    request: Request,
    ctx:     AuthContext = Depends(require_scope("webhooks:read")),
    db:      Session     = Depends(get_db),
) -> List[WebhookOut]:

    rows = _base_query(ctx, db).order_by(WebhookEndpoint.id.desc()).all()
    return [_row_to_out(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /api/v1/webhooks/{id} — Single endpoint
# ---------------------------------------------------------------------------

@router.get(
    "/{webhook_id}",
    response_model=WebhookOut,
    summary="Get webhook endpoint",
    description="Retrieve a single registered webhook. Requires scope `webhooks:read`.",
)
async def get_webhook(
    webhook_id: int,
    request:    Request,
    ctx:        AuthContext = Depends(require_scope("webhooks:read")),
    db:         Session     = Depends(get_db),
) -> WebhookOut:

    row = _base_query(ctx, db).filter(WebhookEndpoint.id == webhook_id).first()
    if not row:
        return err_not_found(request, "Webhook", webhook_id)
    return _row_to_out(row)


# ---------------------------------------------------------------------------
# PATCH /api/v1/webhooks/{id} — Update
# ---------------------------------------------------------------------------

@router.patch(
    "/{webhook_id}",
    response_model=WebhookOut,
    summary="Update webhook endpoint",
    description=(
        "Partial update. Pass only the fields you want to change. "
        "Set `active=true` to re-enable an endpoint that was disabled by the circuit breaker "
        "(consecutive_failures counter is also reset). "
        "Requires scope `webhooks:write`."
    ),
)
async def update_webhook(
    webhook_id: int,
    body:       WebhookUpdate,
    request:    Request,
    ctx:        AuthContext = Depends(require_scope("webhooks:write")),
    db:         Session     = Depends(get_db),
) -> WebhookOut:

    row = _base_query(ctx, db).filter(WebhookEndpoint.id == webhook_id).first()
    if not row:
        return err_not_found(request, "Webhook", webhook_id)

    if body.url is not None:
        row.url = body.url
    if body.events is not None:
        row.events = body.events
    if body.secret is not None:
        row.secret = body.secret
    if body.description is not None:
        row.description = body.description
    if body.ip_allowlist is not None:
        row.ip_allowlist = body.ip_allowlist
    if body.active is not None:
        row.active = body.active
        # Re-enabling after circuit break → reset failure counter
        if body.active:
            row.consecutive_failures = 0
            row.circuit_opened_at    = None

    db.commit()
    db.refresh(row)
    return _row_to_out(row)


# ---------------------------------------------------------------------------
# DELETE /api/v1/webhooks/{id}
# ---------------------------------------------------------------------------

@router.delete(
    "/{webhook_id}",
    status_code=200,
    summary="Delete webhook endpoint",
    description="Remove a registered webhook and all its delivery logs. Requires scope `webhooks:write`.",
)
async def delete_webhook(
    webhook_id: int,
    request:    Request,
    ctx:        AuthContext = Depends(require_scope("webhooks:write")),
    db:         Session     = Depends(get_db),
) -> Dict[str, Any]:

    row = _base_query(ctx, db).filter(WebhookEndpoint.id == webhook_id).first()
    if not row:
        return err_not_found(request, "Webhook", webhook_id)

    db.delete(row)
    db.commit()
    return {"deleted": True, "id": webhook_id}


# ---------------------------------------------------------------------------
# POST /api/v1/webhooks/{id}/test — Synchronous test delivery
# ---------------------------------------------------------------------------

@router.post(
    "/{webhook_id}/test",
    response_model=WebhookTestResult,
    summary="Send test payload",
    description=(
        "Deliver a synthetic `ping` event to the webhook URL **immediately** "
        "(synchronous, not via Celery). "
        "Returns delivery result including HTTP status, response body, and duration. "
        "Requires scope `webhooks:write`."
    ),
)
async def test_webhook(
    webhook_id: int,
    request:    Request,
    ctx:        AuthContext = Depends(require_scope("webhooks:write")),
    db:         Session     = Depends(get_db),
) -> WebhookTestResult:

    row = _base_query(ctx, db).filter(WebhookEndpoint.id == webhook_id).first()
    if not row:
        return err_not_found(request, "Webhook", webhook_id)

    from services.webhook_service import build_envelope, sign_payload, DELIVERY_TIMEOUT_SECONDS

    evt_id   = f"test_{uuid.uuid4().hex[:12]}"
    payload  = build_envelope(
        event_type="ping",
        data={"message": "Test delivery from OrthoClinic.", "webhook_id": webhook_id},
        organization_id=row.org_id,
        evt_id=evt_id,
    )
    payload_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    headers: Dict[str, str] = {
        "Content-Type":        "application/json; charset=utf-8",
        "X-OrthoClinic-Event": "ping",
        "X-Delivery-ID":       evt_id,
        "X-Attempt-Number":    "1",
        "User-Agent":          "OrthoClinic-Webhooks/1.0",
    }
    if row.secret:
        headers["X-OrthoClinic-Signature"] = sign_payload(payload_bytes, row.secret)

    t0             = time.perf_counter()
    http_status:   Optional[int] = None
    response_body: Optional[str] = None
    error:         Optional[str] = None
    delivered      = False

    try:
        async with httpx.AsyncClient(timeout=float(DELIVERY_TIMEOUT_SECONDS)) as client:
            resp = await client.post(row.url, content=payload_bytes, headers=headers)
            http_status   = resp.status_code
            response_body = resp.text[:1024]
            delivered     = 200 <= resp.status_code < 300
    except httpx.TimeoutException:
        error = f"Request timed out after {DELIVERY_TIMEOUT_SECONDS}s"
    except httpx.ConnectError as exc:
        error = f"Connection error: {exc}"
    except Exception as exc:
        error = f"Unexpected error: {exc}"

    duration_ms = int((time.perf_counter() - t0) * 1000)

    # Write a test delivery log
    log = WebhookDeliveryLog(
        endpoint_id=row.id,
        evt_id=evt_id,
        event_type="ping",
        attempt_number=1,
        status="success" if delivered else "failed",
        http_status=http_status,
        response_body=response_body,
        error_message=error,
        duration_ms=duration_ms,
        payload_snapshot=payload,
    )
    db.add(log)
    db.commit()

    return WebhookTestResult(
        webhook_id=webhook_id,
        delivered=delivered,
        http_status=http_status,
        response_body=response_body,
        duration_ms=duration_ms,
        error=error,
        payload=payload,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/webhooks/{id}/deliveries — Delivery history
# ---------------------------------------------------------------------------

@router.get(
    "/{webhook_id}/deliveries",
    response_model=List[DeliveryLogOut],
    summary="Delivery history",
    description=(
        "Paginated delivery log for a webhook endpoint. "
        "Returns up to `limit` records sorted newest-first. "
        "Requires scope `webhooks:read`."
    ),
)
async def list_deliveries(
    webhook_id: int,
    request:    Request,
    limit:      int          = Query(50, ge=1, le=200),
    offset:     int          = Query(0, ge=0),
    status:     Optional[str] = Query(None, description="Filter: success | failed | dead"),
    ctx:        AuthContext  = Depends(require_scope("webhooks:read")),
    db:         Session      = Depends(get_db),
) -> List[DeliveryLogOut]:

    row = _base_query(ctx, db).filter(WebhookEndpoint.id == webhook_id).first()
    if not row:
        return err_not_found(request, "Webhook", webhook_id)

    q = (
        db.query(WebhookDeliveryLog)
        .filter(WebhookDeliveryLog.endpoint_id == webhook_id)
        .order_by(WebhookDeliveryLog.attempted_at.desc())
    )
    if status:
        q = q.filter(WebhookDeliveryLog.status == status)

    logs = q.offset(offset).limit(limit).all()
    return [DeliveryLogOut.model_validate(l) for l in logs]


# ---------------------------------------------------------------------------
# GET /api/v1/webhooks/{id}/dead-letters — Dead-letter queue
# ---------------------------------------------------------------------------

@router.get(
    "/{webhook_id}/dead-letters",
    response_model=List[DeadLetterOut],
    summary="Dead-letter queue",
    description=(
        "Events that exhausted all 6 retry attempts. "
        "Use the replay endpoint to requeue. "
        "Requires scope `webhooks:read`."
    ),
)
async def list_dead_letters(
    webhook_id: int,
    request:    Request,
    limit:      int = Query(50, ge=1, le=200),
    offset:     int = Query(0, ge=0),
    ctx:        AuthContext = Depends(require_scope("webhooks:read")),
    db:         Session     = Depends(get_db),
) -> List[DeadLetterOut]:

    row = _base_query(ctx, db).filter(WebhookEndpoint.id == webhook_id).first()
    if not row:
        return err_not_found(request, "Webhook", webhook_id)

    dead = (
        db.query(WebhookDeadLetter)
        .filter(WebhookDeadLetter.endpoint_id == webhook_id)
        .order_by(WebhookDeadLetter.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [DeadLetterOut.model_validate(d) for d in dead]


# ---------------------------------------------------------------------------
# POST /api/v1/webhooks/{id}/dead-letters/{dl_id}/replay — Requeue
# ---------------------------------------------------------------------------

@router.post(
    "/{webhook_id}/dead-letters/{dead_letter_id}/replay",
    status_code=202,
    summary="Replay dead-letter event",
    description=(
        "Re-enqueue a dead-letter event into the Celery delivery queue. "
        "The retry counter is reset; a fresh set of up to 6 attempts will be made. "
        "Requires scope `webhooks:write`."
    ),
)
async def replay_dead_letter(
    webhook_id:     int,
    dead_letter_id: int,
    request:        Request,
    ctx:            AuthContext = Depends(require_scope("webhooks:write")),
    db:             Session     = Depends(get_db),
) -> Dict[str, Any]:

    row = _base_query(ctx, db).filter(WebhookEndpoint.id == webhook_id).first()
    if not row:
        return err_not_found(request, "Webhook", webhook_id)

    dead = (
        db.query(WebhookDeadLetter)
        .filter(
            WebhookDeadLetter.id == dead_letter_id,
            WebhookDeadLetter.endpoint_id == webhook_id,
        )
        .first()
    )
    if not dead:
        return err_not_found(request, "DeadLetter", dead_letter_id)

    from services.celery_app import deliver_webhook_task

    task = deliver_webhook_task.apply_async(
        kwargs={
            "endpoint_id": webhook_id,
            "payload":     dead.payload,
            "attempt":     1,
            "first_attempted_at": datetime.now(timezone.utc).isoformat(),
        },
        countdown=0,
    )

    dead.replayed_at    = datetime.now(timezone.utc)
    dead.replay_task_id = task.id
    db.commit()

    return {
        "queued":       True,
        "task_id":      task.id,
        "evt_id":       dead.evt_id,
        "webhook_id":   webhook_id,
        "replayed_at":  dead.replayed_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# GET /api/v1/webhooks/events — Event catalogue
# ---------------------------------------------------------------------------

@router.get(
    "/events/catalogue",
    tags=["Public API — Webhooks"],
    summary="Supported event types",
    description="Return all event types that can be subscribed to.",
    include_in_schema=True,
)
async def event_catalogue() -> Dict[str, Any]:
    from services.webhook_service import SUPPORTED_EVENTS
    return {
        "events": [
            {"type": e, "description": _EVENT_DESCRIPTIONS.get(e, "")}
            for e in SUPPORTED_EVENTS
            if e != "ping"
        ],
        "wildcard": "*",
        "wildcard_description": "Subscribe to all current and future events.",
    }


_EVENT_DESCRIPTIONS: Dict[str, str] = {
    "appointment.created":   "A new appointment (consultation) was scheduled.",
    "appointment.updated":   "An existing appointment was modified.",
    "appointment.cancelled": "An appointment was cancelled.",
    "patient.created":       "A new patient record was created.",
    "patient.updated":       "A patient record was updated.",
    "document.uploaded":     "A clinical document or file was uploaded for a patient.",
    "payment.received":      "A payment was recorded for a patient consultation.",
}
