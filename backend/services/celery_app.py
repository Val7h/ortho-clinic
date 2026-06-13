"""
Celery application + webhook delivery task (Sprint 7).

Broker / backend
----------------
Defaults to Redis (REDIS_URL env var).  Falls back to an in-process
"eager" mode (CELERY_TASK_ALWAYS_EAGER=true) for local dev / testing
without a running Redis server — tasks execute synchronously in the
calling thread.

Running the worker
------------------
    # from backend/
    celery -A services.celery_app worker --loglevel=info -Q webhooks

Worker concurrency
------------------
Each task performs a blocking HTTP call with a 10-second timeout.
Use gevent or eventlet for high concurrency with minimal threads:

    celery -A services.celery_app worker -P gevent -c 100 -Q webhooks

Task: deliver_webhook_task
--------------------------
Retry schedule (exponential backoff, attempt 1 = first try):
    attempt 1  →  immediate
    attempt 2  →  5 s
    attempt 3  →  30 s
    attempt 4  →  5 min
    attempt 5  →  30 min
    attempt 6  →  2 h
    attempt 7  →  24 h   (last; then dead-letter)

After attempt 6 fails the event is written to webhook_dead_letters and
no further retries are scheduled.  The circuit breaker (10 consecutive
failures) can disable the endpoint before this point.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from celery import Celery
from celery.utils.log import get_task_logger

# ---------------------------------------------------------------------------
# Celery application
# ---------------------------------------------------------------------------

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "orthoclinic",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Reliability
    task_acks_late=True,           # ACK only after the task completes (at-least-once)
    task_reject_on_worker_lost=True,  # re-queue if worker dies mid-task
    worker_prefetch_multiplier=1,  # prevent long-lived retry tasks from starving
    # Retry / result expiry
    result_expires=86400 * 7,      # keep results 7 days
    # Routing — all webhook tasks go to the dedicated queue
    task_routes={"services.celery_app.deliver_webhook_task": {"queue": "webhooks"}},
    # Local dev: run tasks inline without a broker
    task_always_eager=os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() == "true",
    task_eager_propagates=True,
)

logger = get_task_logger(__name__)

# Retry back-off: index 0 = delay before attempt 2, index 5 = delay before attempt 7 (dead-letter)
BACKOFF_SCHEDULE = [5, 30, 300, 1800, 7200, 86400]  # seconds
MAX_ATTEMPTS = 6


# ---------------------------------------------------------------------------
# Delivery task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="orthoclinic.deliver_webhook",
    bind=True,
    max_retries=MAX_ATTEMPTS - 1,   # Celery retries = attempts after the first
    acks_late=True,
    reject_on_worker_lost=True,
    # Soft time limit: log a warning at 12s, hard kill at 15s (task timeout = 10s)
    soft_time_limit=12,
    time_limit=15,
)
def deliver_webhook_task(
    self,
    *,
    endpoint_id: int,
    payload: Dict[str, Any],
    attempt: int = 1,
    first_attempted_at: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Deliver one webhook event to one endpoint.

    Parameters
    ----------
    endpoint_id         : PK of the WebhookEndpoint row
    payload             : full event envelope dict (already serialised to JSON-safe)
    attempt             : current attempt number (1-indexed)
    first_attempted_at  : ISO-8601 string recorded on attempt 1 for dead-letter TTL

    Returns
    -------
    dict with keys: success, http_status, duration_ms, attempt
    """
    from database import SessionLocal
    from models.webhook import WebhookEndpoint
    from services.webhook_service import (
        MAX_ATTEMPTS,
        BACKOFF_SCHEDULE,
        deliver_once,
        move_to_dead_letter,
    )

    db = SessionLocal()
    evt_id     = payload.get("id", "unknown")
    event_type = payload.get("type", "unknown")

    logger.info(
        "Delivering %s (evt=%s, endpoint=%s, attempt=%d/%d)",
        event_type, evt_id, endpoint_id, attempt, MAX_ATTEMPTS,
    )

    try:
        endpoint: Optional[WebhookEndpoint] = (
            db.query(WebhookEndpoint)
            .filter(WebhookEndpoint.id == endpoint_id)
            .first()
        )
        if endpoint is None:
            logger.warning("Endpoint %s not found — dropping evt %s", endpoint_id, evt_id)
            return {"success": False, "reason": "endpoint_not_found"}

        if not endpoint.active:
            logger.info("Endpoint %s is inactive (circuit open?) — dropping evt %s", endpoint_id, evt_id)
            return {"success": False, "reason": "endpoint_inactive"}

        success = deliver_once(
            endpoint=endpoint,
            payload=payload,
            attempt_number=attempt,
            db=db,
        )

        if success:
            logger.info("Delivered evt %s to endpoint %s in attempt %d", evt_id, endpoint_id, attempt)
            return {"success": True, "attempt": attempt}

        # Delivery failed — should we retry?
        if attempt >= MAX_ATTEMPTS:
            # All retries exhausted → dead-letter
            logger.error(
                "evt %s exhausted all %d attempts for endpoint %s — moving to dead-letter",
                evt_id, MAX_ATTEMPTS, endpoint_id,
            )
            first_dt = None
            if first_attempted_at:
                try:
                    first_dt = datetime.fromisoformat(first_attempted_at)
                except ValueError:
                    pass
            move_to_dead_letter(
                endpoint=endpoint,
                payload=payload,
                total_attempts=attempt,
                last_error="All retry attempts exhausted",
                first_attempted_at=first_dt,
                db=db,
            )
            return {"success": False, "reason": "dead_letter", "attempt": attempt}

        # Schedule next retry with exponential back-off
        delay = BACKOFF_SCHEDULE[attempt - 1]   # attempt 1 failed → wait BACKOFF[0]=5s
        logger.info(
            "Scheduling retry %d for evt %s (endpoint %s) in %ds",
            attempt + 1, evt_id, endpoint_id, delay,
        )
        self.retry(
            kwargs={
                "endpoint_id": endpoint_id,
                "payload": payload,
                "attempt": attempt + 1,
                "first_attempted_at": first_attempted_at or datetime.now(timezone.utc).isoformat(),
            },
            countdown=delay,
            exc=None,   # do not propagate the previous exception as Celery retry exc
        )
        # self.retry raises celery.exceptions.Retry — the code below is unreachable
        return {}  # pragma: no cover

    finally:
        db.close()


# ---------------------------------------------------------------------------
# Convenience: enqueue an event from synchronous code
# ---------------------------------------------------------------------------

def enqueue_event(
    event_type: str,
    data: Dict[str, Any],
    organization_id: Optional[int] = None,
    db=None,
    evt_id: Optional[str] = None,
) -> None:
    """
    High-level helper called from SQLAlchemy after_flush hooks and API endpoints.

    If `db` is provided, fan-out is done inside the same session (reads only).
    Otherwise a new short-lived session is opened.
    """
    from database import SessionLocal
    from services.webhook_service import fan_out_event

    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        task_ids = fan_out_event(
            event_type=event_type,
            data=data,
            organization_id=organization_id,
            db=db,
            evt_id=evt_id,
        )
        if task_ids:
            logger.debug("Enqueued %d webhook task(s) for %s", len(task_ids), event_type)
    except Exception as exc:
        # Webhook dispatch must never crash the caller
        logger.error("fan_out_event failed for %s: %s", event_type, exc)
    finally:
        if close_db:
            db.close()
