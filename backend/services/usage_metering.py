"""
Usage metering service.
Tracks API calls, storage, and appointments per organization.
Reports usage to Stripe Meters for overage billing.
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from models.billing import Subscription, UsageRecord, Plan
from models.billing import PlanTier, SubscriptionStatus
from services.stripe_service import report_meter_event

log = logging.getLogger(__name__)

STRIPE_METER_NAME_API_CALLS = os.getenv("STRIPE_METER_NAME_API_CALLS", "api_calls")

# Storage warning thresholds
STORAGE_WARN_PCT  = 0.80   # send warning at 80% usage
STORAGE_BLOCK_PCT = 1.00   # block at 100%


# ── Increment counters ────────────────────────────────────────────────────────

def increment_api_calls(
    db: Session,
    organization_id: int,
    count: int = 1,
) -> None:
    """
    Increments today's API call count for the organization.
    This is called by the middleware on every API request.
    Lightweight — just updates a daily aggregate row.
    """
    today = date.today()
    record = (
        db.query(UsageRecord)
        .filter(
            UsageRecord.organization_id == organization_id,
            UsageRecord.date == today,
        )
        .with_for_update(skip_locked=True)
        .first()
    )
    if record:
        record.api_calls += count
        record.updated_at = datetime.now(timezone.utc)
    else:
        # Get subscription_id
        sub = db.query(Subscription).filter(
            Subscription.organization_id == organization_id
        ).first()
        record = UsageRecord(
            organization_id=organization_id,
            subscription_id=sub.id if sub else 0,
            date=today,
            api_calls=count,
        )
        db.add(record)
    db.commit()


def update_storage_usage(
    db: Session,
    organization_id: int,
    storage_gb: float,
) -> None:
    """Updates today's storage snapshot."""
    today = date.today()
    record = (
        db.query(UsageRecord)
        .filter(
            UsageRecord.organization_id == organization_id,
            UsageRecord.date == today,
        )
        .first()
    )
    if record:
        record.storage_gb_used = storage_gb
        record.updated_at = datetime.now(timezone.utc)
        db.commit()


# ── Rate limiting check ───────────────────────────────────────────────────────

def check_api_rate_limit(
    db: Session,
    organization_id: int,
) -> tuple[bool, dict]:
    """
    Checks whether the organization is within their API rate limit (calls/hour).
    Returns (is_allowed, info_dict).

    Note: for production use this should be checked against Redis for sub-second
    precision. This DB implementation is a fallback.
    """
    sub = (
        db.query(Subscription)
        .filter(Subscription.organization_id == organization_id)
        .first()
    )
    if not sub or sub.status not in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING):
        return False, {"error": "No active subscription"}

    plan: Plan = sub.plan
    if plan is None or plan.api_calls_per_hour is None:
        return True, {"limit": None, "remaining": None}  # unlimited

    # Count calls in the last hour (approximate — uses today's total)
    # Production: use Redis INCR with 1h TTL window
    today = date.today()
    record = db.query(UsageRecord).filter(
        UsageRecord.organization_id == organization_id,
        UsageRecord.date == today,
    ).first()

    calls_today = record.api_calls if record else 0
    # Rough hourly estimate (divide by 8 working hours) — use Redis for precision
    calls_hour_est = calls_today  # conservative: use full day count

    limit = plan.api_calls_per_hour
    remaining = max(0, limit - calls_hour_est)
    allowed = calls_hour_est < limit

    return allowed, {
        "limit": limit,
        "remaining": remaining,
        "calls_this_window": calls_hour_est,
        "plan": plan.tier,
    }


# ── Storage check ─────────────────────────────────────────────────────────────

def check_storage_quota(
    db: Session,
    organization_id: int,
) -> tuple[bool, dict]:
    """Returns (is_within_quota, info_dict)."""
    sub = db.query(Subscription).filter(
        Subscription.organization_id == organization_id
    ).first()
    if not sub:
        return False, {"error": "No subscription"}

    plan: Plan = sub.plan
    if plan is None or plan.max_storage_gb is None:
        return True, {"limit_gb": None, "used_gb": 0}

    today = date.today()
    record = db.query(UsageRecord).filter(
        UsageRecord.organization_id == organization_id,
        UsageRecord.date == today,
    ).first()

    used_gb = record.storage_gb_used if record else 0.0
    limit_gb = plan.max_storage_gb
    pct = used_gb / limit_gb if limit_gb else 0

    return pct < STORAGE_BLOCK_PCT, {
        "limit_gb": limit_gb,
        "used_gb": used_gb,
        "pct_used": round(pct * 100, 1),
        "warn": pct >= STORAGE_WARN_PCT,
        "blocked": pct >= STORAGE_BLOCK_PCT,
    }


# ── Monthly overage reporting to Stripe ──────────────────────────────────────

async def report_monthly_usage_to_stripe(
    db: Session,
    subscription: Subscription,
    billing_period_start: datetime,
    billing_period_end: datetime,
) -> Optional[dict]:
    """
    Called at end of billing period to report overage API calls to Stripe Meters.
    Stripe will automatically generate an overage invoice line item.
    """
    if not subscription.stripe_customer_id:
        return None

    plan: Plan = subscription.plan
    if plan is None or plan.api_calls_per_hour is None:
        return None  # unlimited plan, no overage

    # Sum all API calls in the billing period
    total_calls = (
        db.query(func.sum(UsageRecord.api_calls))
        .filter(
            UsageRecord.subscription_id == subscription.id,
            UsageRecord.date >= billing_period_start.date(),
            UsageRecord.date <= billing_period_end.date(),
        )
        .scalar()
    ) or 0

    # Monthly limit = hourly limit × 720 hours/month (approx)
    monthly_limit = plan.api_calls_per_hour * 720
    overage = max(0, total_calls - monthly_limit)

    if overage == 0:
        return {"overage": 0, "reported": False}

    # Report to Stripe Meter
    idempotency_key = (
        f"overage-{subscription.id}-"
        f"{billing_period_end.strftime('%Y%m')}"
    )
    try:
        result = await report_meter_event(
            meter_event_name=STRIPE_METER_NAME_API_CALLS,
            stripe_customer_id=subscription.stripe_customer_id,
            value=overage,
            idempotency_key=idempotency_key,
            timestamp=int(billing_period_end.timestamp()),
        )
        log.info(
            "Reported %d overage API calls for subscription %s",
            overage,
            subscription.id,
        )
        return {
            "overage": overage,
            "reported": True,
            "stripe_event": result,
            "overage_cost_cents": (overage // 1000) * plan.api_overage_per_1k_cents,
        }
    except Exception as e:
        log.error("Failed to report overage to Stripe: %s", e)
        return {"overage": overage, "reported": False, "error": str(e)}


# ── Appointment quota check ───────────────────────────────────────────────────

def check_appointment_quota(
    db: Session,
    organization_id: int,
) -> tuple[bool, dict]:
    """Checks if org can create more appointments this month."""
    sub = db.query(Subscription).filter(
        Subscription.organization_id == organization_id
    ).first()
    if not sub:
        return False, {"error": "No subscription"}

    plan: Plan = sub.plan
    if plan is None or plan.max_appointments is None:
        return True, {"limit": None, "used": 0}  # unlimited

    # Count appointments created this month
    from models.clinic import Appointment
    from sqlalchemy import extract
    now = datetime.now(timezone.utc)
    monthly_count = (
        db.query(func.count(Appointment.id))
        .join("clinic")
        .filter(
            extract("year", Appointment.created_at) == now.year,
            extract("month", Appointment.created_at) == now.month,
        )
        .scalar()
    ) or 0

    allowed = monthly_count < plan.max_appointments
    return allowed, {
        "limit": plan.max_appointments,
        "used": monthly_count,
        "remaining": max(0, plan.max_appointments - monthly_count),
    }
