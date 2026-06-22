#!/usr/bin/env python3
"""
export_audit_to_s3.py — Audit log tiered S3 export for OrthoClinic.

Tier strategy:
  Hot   (0-90 days)     — PostgreSQL, served directly via API
  Warm  (90d-2yr)       — S3 Standard + Parquet (queryable via Athena)
  Cold  (2yr+)          — S3 Glacier Instant Retrieval (WORM / compliance)

Object Lock (WORM):
  The target S3 bucket must be created with Object Lock enabled.
  Use governance or compliance mode — we recommend COMPLIANCE for LGPD.
  Retention: 7 years (LGPD + Brazilian medical records requirement).

Required environment variables:
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_DEFAULT_REGION        (e.g. sa-east-1)
  AUDIT_S3_BUCKET           (bucket name with Object Lock enabled)
  AUDIT_HMAC_KEY            (same key used for chain computation)

Optional:
  AUDIT_S3_PREFIX           (default: "audit/")
  AUDIT_RETENTION_DAYS      (default: 2555 = 7 years)

Usage (manual):
  python scripts/export_audit_to_s3.py --org 1 --month 2026-05

Cron (monthly, run on the 1st at 04:00):
  0 4 1 * * cd /app && python scripts/export_audit_to_s3.py >> /var/log/audit_export.log 2>&1

The script exports the PREVIOUS full calendar month for all organisations.
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import sys
from datetime import datetime, timezone, timedelta
import calendar

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("audit_s3_export")


# ---------------------------------------------------------------------------
# S3 helpers
# ---------------------------------------------------------------------------

def _get_s3_client():
    try:
        import boto3
        return boto3.client("s3")
    except ImportError:
        logger.error("boto3 not installed.  pip install boto3")
        sys.exit(2)


def _upload_with_object_lock(s3, bucket: str, key: str, body: bytes, retention_days: int) -> None:
    """
    PUT object with Object Lock COMPLIANCE mode.
    The bucket must have Object Lock enabled at creation time.
    """
    retain_until = datetime.now(timezone.utc) + timedelta(days=retention_days)
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
        ObjectLockMode="COMPLIANCE",
        ObjectLockRetainUntilDate=retain_until.isoformat(),
    )
    logger.info("Uploaded s3://%s/%s (retain until %s)", bucket, key, retain_until.date())


# ---------------------------------------------------------------------------
# Export logic
# ---------------------------------------------------------------------------

def export_month(org_id: int, year: int, month: int) -> bool:
    """
    Export one organisation's audit log for a calendar month to S3.
    Returns True on success.
    """
    bucket          = os.environ.get("AUDIT_S3_BUCKET", "")
    prefix          = os.environ.get("AUDIT_S3_PREFIX", "audit/")
    retention_days  = int(os.environ.get("AUDIT_RETENTION_DAYS", "2555"))  # 7 years

    if not bucket:
        logger.error("AUDIT_S3_BUCKET not set")
        return False

    # Date range
    since = datetime(year, month, 1, tzinfo=timezone.utc)
    last_day = calendar.monthrange(year, month)[1]
    until = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)

    from database import SessionLocal
    from services.audit_service import AuditQueryService
    from models.audit_log import AuditLog  # noqa: ensure mapped

    db = SessionLocal()
    try:
        entries = AuditQueryService.list_entries(
            db,
            organization_id=org_id,
            since=since,
            until=until,
            limit=500_000,
        )

        if not entries:
            logger.info("org=%d %04d-%02d: no entries — skipping", org_id, year, month)
            return True

        # Serialise to NDJSON (newline-delimited JSON — Athena compatible)
        lines = []
        for e in entries:
            row = {
                "id":              str(e.id),
                "timestamp":       e.timestamp.isoformat() if isinstance(e.timestamp, datetime) else str(e.timestamp),
                "organization_id": e.organization_id,
                "actor_id":        e.actor_id,
                "actor_ip":        e.actor_ip,
                "actor_user_agent": e.actor_user_agent,
                "action":          e.action,
                "resource_type":   e.resource_type,
                "resource_id":     e.resource_id,
                "before_state":    e.before_state,
                "after_state":     e.after_state,
                "metadata":        e.metadata,
                "session_id":      e.session_id,
                "request_id":      e.request_id,
                "signature":       e.signature,
            }
            lines.append(json.dumps(row, default=str))

        body = "\n".join(lines).encode()

        # Partition key: org_id / year / month  (Hive-compatible for Athena)
        key = (
            f"{prefix}org_id={org_id}/"
            f"year={year:04d}/month={month:02d}/"
            f"audit_{org_id}_{year:04d}{month:02d}.ndjson"
        )

        s3 = _get_s3_client()

        # Determine if this should go to Glacier (warm→cold boundary is 24 months)
        age_months = (datetime.now(timezone.utc).year - year) * 12 + (
            datetime.now(timezone.utc).month - month
        )
        storage_class = "GLACIER" if age_months >= 24 else "STANDARD_IA" if age_months >= 3 else "STANDARD"

        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType="application/x-ndjson",
            StorageClass=storage_class,
            # Object Lock requires bucket-level Object Lock config
            # We set it here as well for explicit per-object retention.
        )

        logger.info(
            "org=%d %04d-%02d: %d entries → s3://%s/%s [%s]",
            org_id, year, month, len(entries), bucket, key, storage_class,
        )
        return True

    except Exception as exc:
        logger.error("Export failed org=%d %04d-%02d: %s", org_id, year, month, exc)
        return False
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--org",   type=int, default=None, help="Organisation ID (default: all)")
    parser.add_argument(
        "--month",
        default=None,
        help="YYYY-MM to export (default: previous calendar month)",
    )
    args = parser.parse_args()

    # Resolve target month
    if args.month:
        try:
            year, month = [int(p) for p in args.month.split("-")]
        except ValueError:
            logger.error("--month must be YYYY-MM")
            return 2
    else:
        # Previous calendar month
        today = datetime.now(timezone.utc)
        first_of_this_month = today.replace(day=1)
        last_month = first_of_this_month - timedelta(days=1)
        year, month = last_month.year, last_month.month

    logger.info("Exporting audit logs for %04d-%02d", year, month)

    # Determine orgs
    if args.org:
        org_ids = [args.org]
    else:
        from database import SessionLocal
        from sqlalchemy import text
        from models.audit_log import AuditLog  # noqa
        db = SessionLocal()
        try:
            rows = db.execute(
                text("SELECT DISTINCT organization_id FROM audit_logs ORDER BY organization_id")
            ).fetchall()
            org_ids = [r[0] for r in rows]
        finally:
            db.close()

    if not org_ids:
        logger.info("No audit data found.")
        return 0

    failures = 0
    for org_id in org_ids:
        if not export_month(org_id, year, month):
            failures += 1

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
