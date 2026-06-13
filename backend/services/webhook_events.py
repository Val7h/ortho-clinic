"""
SQLAlchemy event hooks that trigger webhook fan-out automatically.

Call `register_webhook_hooks()` once at application startup (in main.py or
database.py init_db).  After that, every INSERT/UPDATE/DELETE on the monitored
models emits the appropriate webhook event without any manual call-site changes.

Supported events
----------------
appointment.created     — Consultation row inserted
appointment.updated     — Consultation row updated
appointment.cancelled   — Consultation.status set to "cancelled" (if field exists)
patient.created         — Patient row inserted
patient.updated         — Patient row updated
document.uploaded       — PatientDocument row inserted (file_url set)
payment.received        — FinancialRecord inserted with status="paid"

Hook strategy
-------------
We use SQLAlchemy's session-level "after_flush" event so that the primary
key is always available (it may be None in before_flush for autoincrement PKs).
The hook queues a lightweight callback that fires after the transaction commits
via session.add_listener("after_commit", …), ensuring webhooks are only
dispatched when data is actually durable.

At-least-once guarantee
-----------------------
If the process crashes between commit and the Celery enqueue the event is
lost.  For true at-least-once delivery a transactional outbox pattern (writing
to a webhook_outbox table inside the same transaction, then a separate poller
flushing the outbox to Celery) should be layered on top.  That pattern is left
as a Phase 2 enhancement; the current approach matches what most SaaS webhook
systems ship in their first iteration.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from sqlalchemy import event as sa_event
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Serialisers — convert ORM rows to webhook payload dicts
# ---------------------------------------------------------------------------

def _patient_dict(patient) -> Dict[str, Any]:
    return {
        "id":            patient.id,
        "name":          patient.name,
        "email":         getattr(patient, "email", None),
        "phone":         getattr(patient, "phone", None),
        "cpf":           getattr(patient, "cpf", None),
        "birthdate":     str(patient.birthdate) if getattr(patient, "birthdate", None) else None,
        "gender":        getattr(patient, "gender", None),
        "insurance":     getattr(patient, "insurance", None),
        "active":        getattr(patient, "active", True),
        "organization_id": getattr(patient, "organization_id", None),
        "created_at":    patient.created_at.isoformat() if getattr(patient, "created_at", None) else None,
        "updated_at":    patient.updated_at.isoformat() if getattr(patient, "updated_at", None) else None,
    }


def _appointment_dict(consultation) -> Dict[str, Any]:
    return {
        "id":              consultation.id,
        "patient_id":      consultation.patient_id,
        "type":            getattr(consultation, "type", None),
        "status":          getattr(consultation, "status", "scheduled"),
        "scheduled_at":    consultation.date.isoformat() if getattr(consultation, "date", None) else None,
        "diagnosis":       getattr(consultation, "diagnosis", None),
        "chief_complaint": getattr(consultation, "chief_complaint", None),
        "created_at":      consultation.created_at.isoformat() if getattr(consultation, "created_at", None) else None,
        "updated_at":      consultation.updated_at.isoformat() if getattr(consultation, "updated_at", None) else None,
    }


def _document_dict(doc) -> Dict[str, Any]:
    return {
        "id":          doc.id,
        "patient_id":  doc.patient_id,
        "title":       getattr(doc, "title", None),
        "category":    getattr(doc, "category", None),
        "file_url":    getattr(doc, "file_url", None),
        "mime_type":   getattr(doc, "mime_type", None),
        "file_size_kb": getattr(doc, "file_size_kb", None),
        "created_at":  doc.created_at.isoformat() if getattr(doc, "created_at", None) else None,
    }


def _payment_dict(record) -> Dict[str, Any]:
    return {
        "id":             record.id,
        "patient_id":     record.patient_id,
        "consultation_id": record.consultation_id,
        "amount":         record.amount,
        "payment_method": record.payment_method,
        "status":         record.status,
        "description":    getattr(record, "description", None),
        "date":           str(record.date) if getattr(record, "date", None) else None,
    }


# ---------------------------------------------------------------------------
# Hook registration
# ---------------------------------------------------------------------------

_hooks_registered = False


def register_webhook_hooks() -> None:
    """
    Register SQLAlchemy session hooks.  Idempotent — safe to call multiple times.
    """
    global _hooks_registered
    if _hooks_registered:
        return
    _hooks_registered = True

    # Import models here to avoid circular imports at module load time.
    try:
        from models.patient import Patient
        from models.consultation import Consultation
        from models.patient_documents import PatientDocument
        from models.financial import FinancialRecord
    except ImportError as exc:
        logger.error("webhook_events: could not import models — hooks not registered: %s", exc)
        return

    # ------------------------------------------------------------------ #
    # after_flush: collect pending new/changed objects into session state  #
    # ------------------------------------------------------------------ #

    @sa_event.listens_for(Session, "after_flush")
    def _after_flush(session: Session, flush_context) -> None:
        """Tag objects that need webhook dispatch after commit."""
        pending_events = getattr(session, "_webhook_pending", None)
        if pending_events is None:
            session._webhook_pending = []  # type: ignore[attr-defined]
            pending_events = session._webhook_pending

        # New objects
        for obj in session.new:
            if isinstance(obj, Patient):
                pending_events.append(("patient.created", _patient_dict(obj), getattr(obj, "organization_id", None)))
            elif isinstance(obj, Consultation):
                pending_events.append(("appointment.created", _appointment_dict(obj), None))
            elif isinstance(obj, PatientDocument) and getattr(obj, "file_url", None):
                pending_events.append(("document.uploaded", _document_dict(obj), None))
            elif isinstance(obj, FinancialRecord) and getattr(obj, "status", None) == "paid":
                pending_events.append(("payment.received", _payment_dict(obj), None))

        # Modified objects
        for obj in session.dirty:
            if isinstance(obj, Patient):
                pending_events.append(("patient.updated", _patient_dict(obj), getattr(obj, "organization_id", None)))
            elif isinstance(obj, Consultation):
                status = getattr(obj, "status", None)
                if status == "cancelled":
                    pending_events.append(("appointment.cancelled", _appointment_dict(obj), None))
                else:
                    pending_events.append(("appointment.updated", _appointment_dict(obj), None))

    # ------------------------------------------------------------------ #
    # after_commit: dispatch all collected events                          #
    # ------------------------------------------------------------------ #

    @sa_event.listens_for(Session, "after_commit")
    def _after_commit(session: Session) -> None:
        pending_events = getattr(session, "_webhook_pending", [])
        if not pending_events:
            return
        session._webhook_pending = []  # reset for next transaction

        from services.celery_app import enqueue_event

        for event_type, data, org_id in pending_events:
            try:
                enqueue_event(event_type=event_type, data=data, organization_id=org_id)
            except Exception as exc:
                # Webhook dispatch must never crash the main request
                logger.error("webhook dispatch failed for %s: %s", event_type, exc)

    # ------------------------------------------------------------------ #
    # after_rollback: discard pending events                               #
    # ------------------------------------------------------------------ #

    @sa_event.listens_for(Session, "after_rollback")
    def _after_rollback(session: Session) -> None:
        session._webhook_pending = []  # type: ignore[attr-defined]

    logger.info("Webhook SQLAlchemy hooks registered.")
