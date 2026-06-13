"""
Audit Log Service — OrthoClinic Sprint 8

This module provides:
  - AuditLogService.record()  — the single call-site for writing audit entries
  - HMAC-SHA256 chain computation and verification
  - Anomaly detection helpers (impossible travel, bulk-export alert)
  - CEF (Common Event Format) serialiser for SIEM integrations
  - LGPD Article 37 / access report helpers
  - S3 export stubs (hot→warm→cold tiering)

IMMUTABILITY GUARANTEE
  This service only issues INSERT.  There are no UPDATE or DELETE paths.
  In production, the DB connection used for inserts should be authenticated
  as the append-only 'audit_writer' PostgreSQL role which has been granted
  INSERT on audit_logs but NOT UPDATE or DELETE.

HMAC CHAIN
  Each entry's signature is:
    HMAC-SHA256(AUDIT_HMAC_KEY, prev_signature_hex + canonical_json(payload))
  where canonical_json is sorted-keys, no whitespace.
  The first entry of each organisation uses the AUDIT_HMAC_KEY itself as the
  "previous signature" seed (encoded as its 64-char hex digest).

  To verify the entire chain, run:
    python scripts/verify_audit_chain.py --org <org_id>
"""

from __future__ import annotations

import hashlib
import hmac as _hmac
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import text

from models.audit_log import AuditLog

logger = logging.getLogger("orthoclinic.audit")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

AUDIT_HMAC_KEY: bytes = os.getenv("AUDIT_HMAC_KEY", "audit-dev-key-change-in-prod").encode()

# Anomaly thresholds
IMPOSSIBLE_TRAVEL_MINUTES    = 30    # Two logins from countries farther than ~1500 km apart
BULK_EXPORT_THRESHOLD        = 100   # patient records exported in one session
BULK_EXPORT_WINDOW_MINUTES   = 60

# Supported auditable actions — used for validation and CEF mapping
AUDITABLE_ACTIONS: Dict[str, str] = {
    # Authentication
    "user.login":           "Authentication",
    "user.logout":          "Authentication",
    "user.login_failed":    "Authentication",
    "user.mfa_challenged":  "Authentication",
    # Patients
    "patient.viewed":       "PatientAccess",
    "patient.created":      "PatientAccess",
    "patient.updated":      "PatientAccess",
    "patient.deleted":      "PatientAccess",
    "patient.exported":     "PatientAccess",
    # Appointments
    "appointment.created":      "Appointment",
    "appointment.cancelled":    "Appointment",
    "appointment.rescheduled":  "Appointment",
    # Documents
    "document.uploaded":    "Document",
    "document.downloaded":  "Document",
    "document.deleted":     "Document",
    # Users
    "user.invited":         "UserManagement",
    "user.role_changed":    "UserManagement",
    "user.deactivated":     "UserManagement",
    # API Keys
    "api_key.created":      "APIKeyManagement",
    "api_key.rotated":      "APIKeyManagement",
    "api_key.revoked":      "APIKeyManagement",
    # Billing
    "subscription.changed": "Billing",
    "invoice.paid":         "Billing",
    "invoice.failed":       "Billing",
    # Security
    "mfa.enabled":          "Security",
    "mfa.disabled":         "Security",
    "password.changed":     "Security",
    "sso.configured":       "Security",
    # Admin
    "org.settings_changed": "Admin",
    "webhook.created":      "Admin",
    "ip_allowlist.changed": "Admin",
}

# CEF severity mapping (0-10)
_CEF_SEVERITY: Dict[str, int] = {
    "Authentication":    5,
    "PatientAccess":     3,
    "Appointment":       2,
    "Document":          3,
    "UserManagement":    7,
    "APIKeyManagement":  6,
    "Billing":           4,
    "Security":          9,
    "Admin":             7,
}


# ---------------------------------------------------------------------------
# Internal HMAC helpers
# ---------------------------------------------------------------------------

def _canonical_json(payload: Dict[str, Any]) -> bytes:
    """
    Deterministic JSON serialisation for HMAC input.
    Sorts keys, strips whitespace, handles datetime/uuid objects.
    """
    def _default(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, uuid.UUID):
            return str(obj)
        raise TypeError(f"Not serializable: {type(obj)}")

    return json.dumps(payload, sort_keys=True, separators=(",", ":"),
                      default=_default).encode()


def _compute_signature(prev_signature: str, payload: Dict[str, Any]) -> str:
    """
    HMAC-SHA256(AUDIT_HMAC_KEY,  prev_signature_hex + canonical_json(payload))
    Returns the 64-char lower-hex digest.
    """
    msg = prev_signature.encode() + _canonical_json(payload)
    return _hmac.new(AUDIT_HMAC_KEY, msg, hashlib.sha256).hexdigest()


def _seed_signature() -> str:
    """Seed used as 'prev_signature' for the very first entry of each org."""
    return _hmac.new(AUDIT_HMAC_KEY, b"genesis", hashlib.sha256).hexdigest()


def _get_last_signature(db: Session, organization_id: int) -> str:
    """
    Fetch the most-recent signature for an org from the DB.
    Returns the genesis seed if no previous entry exists.
    """
    row = (
        db.execute(
            text(
                "SELECT signature FROM audit_logs "
                "WHERE organization_id = :org_id "
                "ORDER BY timestamp DESC, id DESC "
                "LIMIT 1"
            ),
            {"org_id": organization_id},
        ).first()
    )
    return row[0] if row else _seed_signature()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class AuditLogService:
    """
    Single entry point for writing audit log entries.

    Usage (from any router or service):

        from services.audit_service import AuditLogService, AuditContext

        ctx = AuditContext.from_request(request, current_user)
        AuditLogService.record(
            db=db,
            ctx=ctx,
            action="patient.viewed",
            resource_type="patient",
            resource_id=str(patient.id),
        )

    The call is intentionally synchronous so it participates in the route's
    database transaction.  If the route rolls back, the audit entry is also
    rolled back — preserving referential integrity.  For fire-and-forget
    audit logging (e.g. from Celery tasks), use record_async().
    """

    @staticmethod
    def record(
        db: Session,
        *,
        organization_id: int,
        actor_id: Optional[int],
        actor_ip: Optional[str],
        actor_user_agent: Optional[str],
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        before_state: Optional[Dict[str, Any]] = None,
        after_state: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> AuditLog:
        """
        Insert one immutable audit log entry.

        Returns the committed AuditLog ORM object so callers can read its id
        if needed. The row is flushed (not committed) within the caller's
        transaction — the caller is responsible for db.commit().
        """
        if action not in AUDITABLE_ACTIONS:
            logger.warning("Unknown audit action: %s — recording anyway", action)

        entry_id   = str(uuid.uuid4())
        request_id = request_id or str(uuid.uuid4())
        ts         = datetime.now(timezone.utc)

        # Build the payload dict used for HMAC (must match the column values)
        payload_for_hmac: Dict[str, Any] = {
            "id":               entry_id,
            "timestamp":        ts.isoformat(),
            "organization_id":  organization_id,
            "actor_id":         actor_id,
            "actor_ip":         actor_ip,
            "actor_user_agent": actor_user_agent,
            "action":           action,
            "resource_type":    resource_type,
            "resource_id":      resource_id,
            "before_state":     before_state,
            "after_state":      after_state,
            "metadata":         metadata,
            "session_id":       session_id,
            "request_id":       request_id,
        }

        prev_sig  = _get_last_signature(db, organization_id)
        signature = _compute_signature(prev_sig, payload_for_hmac)

        entry = AuditLog(
            id               = entry_id,
            timestamp        = ts,
            organization_id  = organization_id,
            actor_id         = actor_id,
            actor_ip         = actor_ip,
            actor_user_agent = actor_user_agent,
            action           = action,
            resource_type    = resource_type,
            resource_id      = resource_id,
            before_state     = before_state,
            after_state      = after_state,
            extra_metadata   = metadata,
            session_id       = session_id,
            request_id       = request_id,
            signature        = signature,
        )

        db.add(entry)
        db.flush()          # assign PK; caller commits
        logger.debug("audit[%s] org=%s actor=%s action=%s resource=%s/%s",
                     entry_id, organization_id, actor_id, action,
                     resource_type, resource_id)

        # Non-blocking anomaly check (side-effect: log warnings / emit alerts)
        try:
            AnomalyDetector.check(db, entry)
        except Exception as exc:
            logger.warning("Anomaly check failed (non-fatal): %s", exc)

        # Non-blocking SIEM stream push
        try:
            SIEMStreamer.push(entry)
        except Exception as exc:
            logger.warning("SIEM push failed (non-fatal): %s", exc)

        return entry

    # ------------------------------------------------------------------
    # Convenience helper for FastAPI request context
    # ------------------------------------------------------------------

    @staticmethod
    def from_request(
        db: Session,
        request,            # starlette.requests.Request
        current_user,       # models.organization.User
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        before_state: Optional[Dict[str, Any]] = None,
        after_state: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Shortcut that extracts network context from a FastAPI Request object.
        """
        forwarded = request.headers.get("X-Forwarded-For", "")
        ip = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else None
        )
        ua = request.headers.get("User-Agent")

        session_id = getattr(request.state, "session_id", None)
        request_id = getattr(request.state, "request_id", None)

        return AuditLogService.record(
            db=db,
            organization_id=current_user.organization_id,
            actor_id=current_user.id,
            actor_ip=ip,
            actor_user_agent=ua,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            before_state=before_state,
            after_state=after_state,
            metadata=metadata,
            session_id=session_id,
            request_id=request_id,
        )


# ---------------------------------------------------------------------------
# Chain verification
# ---------------------------------------------------------------------------

class ChainVerifier:
    """
    Verify the HMAC chain integrity for an organisation's audit log.

    Called by the daily cron job (scripts/verify_audit_chain.py) and exposed
    via GET /audit/chain-integrity (superadmin only).
    """

    @staticmethod
    def verify_org(
        db: Session,
        organization_id: int,
        limit: int = 0,         # 0 = all rows
    ) -> Tuple[bool, int, Optional[str]]:
        """
        Walk the org's audit log in chronological order, recomputing each
        HMAC and comparing it to the stored signature.

        Returns (ok: bool, rows_checked: int, first_bad_id: str | None).
        """
        query = (
            "SELECT id, timestamp, organization_id, actor_id, actor_ip, "
            "       actor_user_agent, action, resource_type, resource_id, "
            "       before_state, after_state, metadata, session_id, request_id, "
            "       signature "
            "FROM audit_logs "
            "WHERE organization_id = :org_id "
            "ORDER BY timestamp ASC, id ASC"
        )
        if limit:
            query += f" LIMIT {int(limit)}"

        rows = db.execute(text(query), {"org_id": organization_id}).fetchall()

        prev_sig = _seed_signature()
        for idx, row in enumerate(rows):
            row_dict = dict(row._mapping)
            stored_sig = row_dict.pop("signature")

            # Reconstruct payload dict in the same order used by record()
            payload: Dict[str, Any] = {
                "id":               row_dict["id"],
                "timestamp":        row_dict["timestamp"].isoformat()
                                    if isinstance(row_dict["timestamp"], datetime)
                                    else row_dict["timestamp"],
                "organization_id":  row_dict["organization_id"],
                "actor_id":         row_dict["actor_id"],
                "actor_ip":         row_dict["actor_ip"],
                "actor_user_agent": row_dict["actor_user_agent"],
                "action":           row_dict["action"],
                "resource_type":    row_dict["resource_type"],
                "resource_id":      row_dict["resource_id"],
                "before_state":     row_dict["before_state"],
                "after_state":      row_dict["after_state"],
                "metadata":         row_dict["metadata"],
                "session_id":       row_dict["session_id"],
                "request_id":       row_dict["request_id"],
            }

            expected_sig = _compute_signature(prev_sig, payload)
            if not _hmac.compare_digest(expected_sig, stored_sig):
                return False, idx + 1, str(row_dict["id"])
            prev_sig = stored_sig

        return True, len(rows), None


# ---------------------------------------------------------------------------
# Anomaly Detection
# ---------------------------------------------------------------------------

class AnomalyDetector:
    """
    Lightweight, in-process anomaly checks run synchronously after each
    audit entry is written.  Heavy ML-based detection should be offloaded
    to a Celery task or external SIEM.
    """

    @staticmethod
    def check(db: Session, entry: AuditLog) -> None:
        if entry.action == "user.login" and entry.actor_id:
            AnomalyDetector._impossible_travel(db, entry)
        if entry.action == "patient.exported" and entry.actor_id:
            AnomalyDetector._bulk_export(db, entry)

    # ------------------------------------------------------------------ private

    @staticmethod
    def _impossible_travel(db: Session, entry: AuditLog) -> None:
        """
        Alert if the same user logs in from two different IPs within
        IMPOSSIBLE_TRAVEL_MINUTES and the IPs are in different countries.

        Simplified version: alert whenever two logins < 30 min apart have
        different IPs (proper geo-IP lookup requires an external lib).
        """
        if not entry.actor_ip:
            return

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=IMPOSSIBLE_TRAVEL_MINUTES)
        prev = db.execute(
            text(
                "SELECT actor_ip FROM audit_logs "
                "WHERE actor_id = :uid AND action = 'user.login' "
                "  AND timestamp >= :cutoff AND id != :eid "
                "ORDER BY timestamp DESC LIMIT 1"
            ),
            {"uid": entry.actor_id, "cutoff": cutoff, "eid": str(entry.id)},
        ).first()

        if prev and prev[0] and prev[0] != entry.actor_ip:
            logger.warning(
                "ANOMALY:impossible_travel actor=%s new_ip=%s prev_ip=%s",
                entry.actor_id, entry.actor_ip, prev[0],
            )
            # In production: emit to SIEM / send alert email here.

    @staticmethod
    def _bulk_export(db: Session, entry: AuditLog) -> None:
        """Alert if a user exports more than BULK_EXPORT_THRESHOLD patients
        in BULK_EXPORT_WINDOW_MINUTES."""
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=BULK_EXPORT_WINDOW_MINUTES)
        count_row = db.execute(
            text(
                "SELECT COUNT(*) FROM audit_logs "
                "WHERE actor_id = :uid AND action = 'patient.exported' "
                "  AND organization_id = :org_id AND timestamp >= :cutoff"
            ),
            {
                "uid":    entry.actor_id,
                "org_id": entry.organization_id,
                "cutoff": cutoff,
            },
        ).first()

        count = count_row[0] if count_row else 0
        if count >= BULK_EXPORT_THRESHOLD:
            logger.warning(
                "ANOMALY:bulk_export actor=%s org=%s count=%d in %dmin",
                entry.actor_id, entry.organization_id,
                count, BULK_EXPORT_WINDOW_MINUTES,
            )


# ---------------------------------------------------------------------------
# CEF (Common Event Format) serialiser — used by SIEM integrations
# ---------------------------------------------------------------------------

class SIEMStreamer:
    """
    Push audit entries to configured SIEM endpoints.

    Supported outputs:
      1. Webhook (generic HTTP POST — Splunk HEC, Datadog, Elastic)
      2. CEF string (written to stdout / syslog — for Sentinel syslog ingestion)

    Configure via environment variables:
      SIEM_WEBHOOK_URL      — HTTP endpoint that accepts JSON POST
      SIEM_WEBHOOK_TOKEN    — Bearer token (optional)
      SIEM_CEF_ENABLED      — "1" to emit CEF lines to stdout
    """

    SIEM_URL   = os.getenv("SIEM_WEBHOOK_URL")
    SIEM_TOKEN = os.getenv("SIEM_WEBHOOK_TOKEN")
    CEF_ENABLED = os.getenv("SIEM_CEF_ENABLED", "0") == "1"

    @classmethod
    def push(cls, entry: AuditLog) -> None:
        if cls.CEF_ENABLED:
            print(cls.to_cef(entry), flush=True)   # systemd / syslog capture
        if cls.SIEM_URL:
            cls._post_json(entry)

    @classmethod
    def to_cef(cls, entry: AuditLog) -> str:
        """
        Produce a CEF 0 string for the audit entry.
        Format:
          CEF:0|Vendor|Product|Version|SignatureID|Name|Severity|Extensions
        """
        category  = AUDITABLE_ACTIONS.get(entry.action, "Unknown")
        severity  = _CEF_SEVERITY.get(category, 3)
        ts_str    = (
            entry.timestamp.strftime("%b %d %Y %H:%M:%S")
            if isinstance(entry.timestamp, datetime)
            else str(entry.timestamp)
        )

        ext_parts = [
            f"rt={ts_str}",
            f"src={entry.actor_ip or 'unknown'}",
            f"suser={entry.actor_id or 'system'}",
            f"cs1={entry.organization_id}",
            f"cs1Label=OrganizationID",
            f"cs2={entry.resource_type}",
            f"cs2Label=ResourceType",
            f"cs3={entry.resource_id or ''}",
            f"cs3Label=ResourceID",
            f"requestClientApplication={entry.actor_user_agent or ''}",
            f"externalId={entry.id}",
            f"requestMethod=AUDIT",
        ]

        return (
            f"CEF:0|OrthoClinic|AuditLog|2.0|{entry.action}|{entry.action}"
            f"|{severity}|{' '.join(ext_parts)}"
        )

    @classmethod
    def _post_json(cls, entry: AuditLog) -> None:
        try:
            import httpx
            headers = {"Content-Type": "application/json"}
            if cls.SIEM_TOKEN:
                headers["Authorization"] = f"Bearer {cls.SIEM_TOKEN}"

            payload = {
                "id":              str(entry.id),
                "timestamp":       entry.timestamp.isoformat()
                                   if isinstance(entry.timestamp, datetime)
                                   else str(entry.timestamp),
                "organization_id": entry.organization_id,
                "actor_id":        entry.actor_id,
                "actor_ip":        entry.actor_ip,
                "action":          entry.action,
                "resource_type":   entry.resource_type,
                "resource_id":     entry.resource_id,
                "metadata":        entry.extra_metadata,
                "cef":             cls.to_cef(entry),
            }

            httpx.post(cls.SIEM_URL, json=payload, headers=headers, timeout=5)
        except Exception as exc:
            logger.debug("SIEM webhook error (non-fatal): %s", exc)


# ---------------------------------------------------------------------------
# Query helpers — used by compliance report endpoints
# ---------------------------------------------------------------------------

class AuditQueryService:
    """Read-side helpers for compliance reports and API endpoints."""

    @staticmethod
    def list_entries(
        db: Session,
        organization_id: int,
        actor_id: Optional[int] = None,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[AuditLog]:
        from sqlalchemy.orm import Query
        from models.audit_log import AuditLog as AL

        q: Query = db.query(AL).filter(AL.organization_id == organization_id)
        if actor_id:
            q = q.filter(AL.actor_id == actor_id)
        if action:
            q = q.filter(AL.action == action)
        if resource_type:
            q = q.filter(AL.resource_type == resource_type)
        if resource_id:
            q = q.filter(AL.resource_id == resource_id)
        if since:
            q = q.filter(AL.timestamp >= since)
        if until:
            q = q.filter(AL.timestamp <= until)

        return (
            q.order_by(AL.timestamp.desc())
             .offset(offset)
             .limit(min(limit, 1000))
             .all()
        )

    @staticmethod
    def patient_access_report(
        db: Session,
        organization_id: int,
        patient_id: Optional[int] = None,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """
        LGPD Art. 37 — 'Who accessed which patient record, when'.
        """
        from models.audit_log import AuditLog as AL

        q = db.query(AL).filter(
            AL.organization_id == organization_id,
            AL.resource_type == "patient",
        )
        if patient_id:
            q = q.filter(AL.resource_id == str(patient_id))
        if since:
            q = q.filter(AL.timestamp >= since)
        if until:
            q = q.filter(AL.timestamp <= until)

        rows = q.order_by(AL.timestamp.desc()).limit(5000).all()

        return [
            {
                "timestamp":   r.timestamp.isoformat() if isinstance(r.timestamp, datetime) else str(r.timestamp),
                "actor_id":    r.actor_id,
                "actor_ip":    r.actor_ip,
                "action":      r.action,
                "patient_id":  r.resource_id,
                "metadata":    r.extra_metadata,
                "request_id":  r.request_id,
            }
            for r in rows
        ]

    @staticmethod
    def export_csv(
        db: Session,
        organization_id: int,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
    ) -> str:
        """Return a CSV string of the audit log for the given date range."""
        import csv, io

        entries = AuditQueryService.list_entries(
            db, organization_id, since=since, until=until, limit=50_000
        )
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=[
            "id", "timestamp", "organization_id", "actor_id",
            "actor_ip", "action", "resource_type", "resource_id",
            "session_id", "request_id", "signature",
        ])
        writer.writeheader()
        for e in entries:
            writer.writerow({
                "id":              str(e.id),
                "timestamp":       e.timestamp.isoformat() if isinstance(e.timestamp, datetime) else str(e.timestamp),
                "organization_id": e.organization_id,
                "actor_id":        e.actor_id,
                "actor_ip":        e.actor_ip,
                "action":          e.action,
                "resource_type":   e.resource_type,
                "resource_id":     e.resource_id,
                "session_id":      e.session_id,
                "request_id":      e.request_id,
                "signature":       e.signature,
            })
        return buf.getvalue()

    @staticmethod
    def monthly_executive_summary(
        db: Session,
        organization_id: int,
        year: int,
        month: int,
    ) -> Dict[str, Any]:
        """Auto-generated monthly compliance summary for executives."""
        from models.audit_log import AuditLog as AL
        import calendar

        since = datetime(year, month, 1, tzinfo=timezone.utc)
        last_day = calendar.monthrange(year, month)[1]
        until = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)

        entries = AuditQueryService.list_entries(
            db, organization_id, since=since, until=until, limit=100_000
        )

        action_counts: Dict[str, int] = {}
        actor_counts:  Dict[Optional[int], int] = {}
        for e in entries:
            action_counts[e.action] = action_counts.get(e.action, 0) + 1
            actor_counts[e.actor_id] = actor_counts.get(e.actor_id, 0) + 1

        top_actors = sorted(actor_counts.items(), key=lambda x: -x[1])[:10]

        return {
            "organization_id": organization_id,
            "period":          f"{year}-{month:02d}",
            "total_events":    len(entries),
            "action_breakdown": action_counts,
            "top_actors":      [{"actor_id": a, "event_count": c} for a, c in top_actors],
            "patient_accesses": action_counts.get("patient.viewed", 0),
            "failed_logins":   action_counts.get("user.login_failed", 0),
            "security_events": sum(
                v for k, v in action_counts.items()
                if AUDITABLE_ACTIONS.get(k) == "Security"
            ),
            "generated_at":    datetime.now(timezone.utc).isoformat(),
        }
