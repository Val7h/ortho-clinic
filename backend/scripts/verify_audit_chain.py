#!/usr/bin/env python3
"""
verify_audit_chain.py — Daily HMAC chain integrity check for OrthoClinic audit logs.

Usage:
  python scripts/verify_audit_chain.py                  # all orgs
  python scripts/verify_audit_chain.py --org 1          # single org
  python scripts/verify_audit_chain.py --org 1 --limit 1000

Exit codes:
  0 — chain intact
  1 — one or more orgs have broken chains (tampering detected)
  2 — configuration / connection error

Run as a daily cron job (crontab):
  0 3 * * * cd /app && python scripts/verify_audit_chain.py >> /var/log/audit_chain.log 2>&1

Sends a Slack / email alert if tampering is detected.
Set ALERT_WEBHOOK_URL to a Slack incoming-webhook URL to enable.
"""

from __future__ import annotations

import argparse
import os
import sys
import logging
from datetime import datetime, timezone

# Allow importing from the backend package root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("verify_audit_chain")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify audit log HMAC chain")
    parser.add_argument("--org",   type=int, default=None, help="Organisation ID (default: all)")
    parser.add_argument("--limit", type=int, default=0,    help="Max rows per org (0=all)")
    args = parser.parse_args()

    try:
        from database import SessionLocal
        from models.audit_log import AuditLog  # ensure table is mapped
        from services.audit_service import ChainVerifier
        from sqlalchemy import text
    except Exception as exc:
        logger.error("Startup error: %s", exc)
        return 2

    db = SessionLocal()
    try:
        # Determine which orgs to check
        if args.org:
            org_ids = [args.org]
        else:
            rows = db.execute(
                text("SELECT DISTINCT organization_id FROM audit_logs ORDER BY organization_id")
            ).fetchall()
            org_ids = [r[0] for r in rows]

        if not org_ids:
            logger.info("No audit log entries found — nothing to verify.")
            return 0

        any_broken = False
        for org_id in org_ids:
            logger.info("Verifying org=%d ...", org_id)
            ok, rows_checked, first_bad_id = ChainVerifier.verify_org(
                db, org_id, limit=args.limit
            )
            if ok:
                logger.info("  org=%d: OK (%d rows)", org_id, rows_checked)
            else:
                logger.error(
                    "  org=%d: CHAIN BROKEN at entry %s (checked %d rows)",
                    org_id, first_bad_id, rows_checked,
                )
                any_broken = True
                _send_alert(org_id, first_bad_id, rows_checked)

        return 1 if any_broken else 0

    except Exception as exc:
        logger.error("Unexpected error: %s", exc)
        return 2
    finally:
        db.close()


def _send_alert(org_id: int, first_bad_id: str, rows_checked: int) -> None:
    """Send a Slack or webhook alert when tampering is detected."""
    alert_url = os.getenv("ALERT_WEBHOOK_URL")
    if not alert_url:
        return
    try:
        import httpx
        msg = (
            f":rotating_light: *AUDIT CHAIN BREACH* org={org_id} "
            f"first_bad_entry={first_bad_id} rows_checked={rows_checked} "
            f"at {datetime.now(timezone.utc).isoformat()}"
        )
        httpx.post(alert_url, json={"text": msg}, timeout=10)
    except Exception as exc:
        logger.warning("Alert webhook failed: %s", exc)


if __name__ == "__main__":
    sys.exit(main())
