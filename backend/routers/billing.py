"""
Billing router — Sprint 8 Enterprise Billing

Routes:
  POST /billing/stripe/webhook          — Stripe webhook handler
  GET  /billing/subscription            — Get org subscription
  POST /billing/checkout                — Create Stripe Checkout session
  POST /billing/portal                  — Create Customer Portal session
  POST /billing/upgrade                 — Upgrade/downgrade plan
  POST /billing/cancel                  — Cancel subscription
  GET  /billing/invoices                — List invoices
  GET  /billing/invoices/{id}/pdf       — Download invoice PDF
  GET  /billing/usage                   — Current period usage stats
  POST /billing/quotes                  — Submit enterprise quote request
  GET  /billing/quotes/{id}             — Get quote details
  POST /billing/nfe/webhook             — NFE.io async callback
  GET  /billing/plans                   — Public plan catalog
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models.billing import (
    BillingInvoice,
    BillingCycle,
    DunningEvent,
    EnterpriseQuote,
    NFeLog,
    Plan,
    PlanTier,
    QuoteStatus,
    Subscription,
    SubscriptionStatus,
    StripeWebhookLog,
    UsageRecord,
)
from models.organization import Organization, User
from services.billing_plans import (
    PLAN_CATALOG,
    compute_effective_price,
    ENTERPRISE_MIN_PRICE_CENTS,
)
from services.dunning_service import handle_payment_failure, handle_payment_recovered
from services.nfe_service import emit_nfse, get_nfse_status
from services.stripe_service import (
    cancel_subscription,
    create_billing_portal_session,
    create_checkout_session,
    create_customer,
    get_invoice,
    list_invoices,
    send_invoice,
    update_subscription,
    verify_webhook_signature,
    create_pix_payment_intent,
)
from services.usage_metering import (
    check_api_rate_limit,
    check_storage_quota,
    check_appointment_quota,
    report_monthly_usage_to_stripe,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
NFE_IO_WEBHOOK_URL = os.getenv("NFE_IO_WEBHOOK_URL", f"{FRONTEND_URL}/billing/nfe/webhook")


# ── Schemas ───────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan_tier: PlanTier
    billing_cycle: BillingCycle = BillingCycle.MONTHLY
    payment_methods: list[str] = ["card", "boleto", "pix"]


class UpgradeRequest(BaseModel):
    new_plan_tier: PlanTier
    billing_cycle: BillingCycle = BillingCycle.MONTHLY
    prorate: bool = True


class CancelRequest(BaseModel):
    at_period_end: bool = True
    reason: Optional[str] = None


class EnterpriseQuoteRequest(BaseModel):
    prospect_name: str
    prospect_email: EmailStr
    prospect_phone: Optional[str] = None
    prospect_company: str
    clinic_count: Optional[int] = None
    user_count: Optional[int] = None
    contract_years: int = 1
    poc_requested: bool = False
    notes: Optional[str] = None


class QuoteDecisionRequest(BaseModel):
    decision: str  # "accept" | "decline"
    reason: Optional[str] = None


# ── Helper: get or create Stripe customer for org ────────────────────────────

async def _ensure_stripe_customer(
    org: Organization,
    subscription: Subscription,
    db: Session,
) -> str:
    if subscription.stripe_customer_id:
        return subscription.stripe_customer_id

    customer = await create_customer(
        name=org.name,
        email=_get_org_admin_email(org, db),
        organization_id=org.id,
    )
    stripe_customer_id = customer["id"]
    subscription.stripe_customer_id = stripe_customer_id
    db.commit()
    return stripe_customer_id


def _get_org_admin_email(org: Organization, db: Session) -> str:
    admin = (
        db.query(User)
        .filter(User.organization_id == org.id, User.role.in_(["admin", "superadmin"]))
        .first()
    )
    return admin.email if admin else "admin@orthoclinic.com.br"


def _get_stripe_price_id(plan: Plan, billing_cycle: BillingCycle) -> str:
    if billing_cycle == BillingCycle.ANNUAL:
        price_id = plan.stripe_price_annual
    else:
        price_id = plan.stripe_price_monthly
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"Stripe price not configured for plan {plan.tier}. Contact support.",
        )
    return price_id


# ── Public: plan catalog ──────────────────────────────────────────────────────

@router.get("/plans")
def get_plans():
    """Returns the public plan catalog with pricing."""
    plans = []
    for tier, defn in PLAN_CATALOG.items():
        plans.append({
            "tier": defn.tier,
            "name": defn.name,
            "description": defn.description,
            "price_monthly_brl": defn.price_monthly_cents / 100 if defn.price_monthly_cents else None,
            "price_annual_brl": defn.price_annual_cents / 100 if defn.price_annual_cents else None,
            "price_annual_monthly_equivalent": (
                defn.price_annual_cents / 100 / 12 if defn.price_annual_cents else None
            ),
            "savings_annual_brl": (
                (defn.price_monthly_cents * 12 - defn.price_annual_cents) / 100
                if defn.price_monthly_cents and defn.price_annual_cents
                else None
            ),
            "max_users": defn.max_users,
            "max_appointments": defn.max_appointments,
            "max_storage_gb": defn.max_storage_gb,
            "api_calls_per_hour": defn.api_calls_per_hour,
            "api_overage_per_1k_brl": defn.api_overage_per_1k_cents / 100,
            "trial_days": defn.trial_days,
            "features": defn.features,
        })
    return {"plans": plans}


# ── Subscription state ────────────────────────────────────────────────────────

@router.get("/subscription")
def get_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the current organization's subscription details."""
    sub = db.query(Subscription).filter(
        Subscription.organization_id == current_user.organization_id
    ).first()
    if not sub:
        return {"status": "no_subscription", "trial_available": True}

    plan = sub.plan
    plan_defn = PLAN_CATALOG.get(plan.tier) if plan else None

    # Usage stats
    _, rate_info = check_api_rate_limit(db, current_user.organization_id)
    _, storage_info = check_storage_quota(db, current_user.organization_id)
    _, appt_info = check_appointment_quota(db, current_user.organization_id)

    return {
        "subscription": {
            "id": sub.id,
            "status": sub.status,
            "billing_cycle": sub.billing_cycle,
            "plan": {
                "tier": plan.tier if plan else None,
                "name": plan.name if plan else None,
                "features": plan.features if plan else [],
            },
            "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
            "current_period_end": (
                sub.current_period_end.isoformat() if sub.current_period_end else None
            ),
            "cancel_at_period_end": sub.cancel_at_period_end,
            "volume_discount_pct": sub.volume_discount_pct,
        },
        "usage": {
            "api_calls": rate_info,
            "storage": storage_info,
            "appointments": appt_info,
        },
    }


# ── Checkout ──────────────────────────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creates a Stripe Checkout session. Returns {checkout_url}."""
    if body.plan_tier == PlanTier.ENTERPRISE:
        raise HTTPException(
            status_code=400,
            detail="Enterprise plans require a custom quote. Use /billing/quotes.",
        )

    org = db.query(Organization).filter(
        Organization.id == current_user.organization_id
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Get or create subscription record
    sub = db.query(Subscription).filter(
        Subscription.organization_id == org.id
    ).first()
    if not sub:
        plan = db.query(Plan).filter(Plan.tier == body.plan_tier).first()
        if not plan:
            raise HTTPException(status_code=400, detail="Plan not found")
        sub = Subscription(
            organization_id=org.id,
            plan_id=plan.id,
            billing_cycle=body.billing_cycle,
            status=SubscriptionStatus.INCOMPLETE,
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)

    plan = db.query(Plan).filter(Plan.tier == body.plan_tier).first()
    stripe_customer_id = await _ensure_stripe_customer(org, sub, db)
    price_id = _get_stripe_price_id(plan, body.billing_cycle)

    plan_defn = PLAN_CATALOG[body.plan_tier]
    trial_days = plan_defn.trial_days

    # No trial for downgrades (existing subscribers)
    if sub.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE):
        trial_days = 0

    session = await create_checkout_session(
        stripe_customer_id=stripe_customer_id,
        stripe_price_id=price_id,
        organization_id=org.id,
        billing_cycle=body.billing_cycle.value,
        trial_days=trial_days,
        payment_methods=body.payment_methods,
    )

    return {"checkout_url": session["url"], "session_id": session["id"]}


# ── Customer Portal ───────────────────────────────────────────────────────────

@router.post("/portal")
async def billing_portal(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creates a Stripe Customer Portal session for self-service billing."""
    sub = db.query(Subscription).filter(
        Subscription.organization_id == current_user.organization_id
    ).first()
    if not sub or not sub.stripe_customer_id:
        raise HTTPException(status_code=404, detail="No billing account found")

    session = await create_billing_portal_session(
        stripe_customer_id=sub.stripe_customer_id,
        return_url=f"{FRONTEND_URL}/billing",
    )
    return {"portal_url": session["url"]}


# ── Plan upgrade/downgrade ────────────────────────────────────────────────────

@router.post("/upgrade")
async def upgrade_plan(
    body: UpgradeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upgrades or downgrades the subscription. Prorates automatically."""
    if body.new_plan_tier == PlanTier.ENTERPRISE:
        raise HTTPException(
            status_code=400,
            detail="Enterprise upgrades require a custom quote. Contact sales.",
        )

    sub = db.query(Subscription).filter(
        Subscription.organization_id == current_user.organization_id
    ).first()
    if not sub or not sub.stripe_subscription_id:
        raise HTTPException(status_code=404, detail="No active subscription")

    new_plan = db.query(Plan).filter(Plan.tier == body.new_plan_tier).first()
    if not new_plan:
        raise HTTPException(status_code=400, detail="Plan not found")

    price_id = _get_stripe_price_id(new_plan, body.billing_cycle)
    updated = await update_subscription(
        stripe_subscription_id=sub.stripe_subscription_id,
        new_price_id=price_id,
        prorate=body.prorate,
    )

    # Update local records
    sub.plan_id = new_plan.id
    sub.billing_cycle = body.billing_cycle
    sub.status = SubscriptionStatus(updated.get("status", "active"))
    db.commit()

    return {"status": "upgraded", "plan": body.new_plan_tier, "proration": body.prorate}


# ── Cancel ────────────────────────────────────────────────────────────────────

@router.post("/cancel")
async def cancel_plan(
    body: CancelRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sub = db.query(Subscription).filter(
        Subscription.organization_id == current_user.organization_id
    ).first()
    if not sub or not sub.stripe_subscription_id:
        raise HTTPException(status_code=404, detail="No active subscription")

    result = await cancel_subscription(
        stripe_subscription_id=sub.stripe_subscription_id,
        at_period_end=body.at_period_end,
        reason=body.reason,
    )

    sub.cancel_at_period_end = body.at_period_end
    sub.cancellation_reason = body.reason
    if not body.at_period_end:
        sub.status = SubscriptionStatus.CANCELED
        sub.canceled_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "status": "canceled" if not body.at_period_end else "cancels_at_period_end",
        "period_end": (
            sub.current_period_end.isoformat() if sub.current_period_end else None
        ),
    }


# ── Invoices ──────────────────────────────────────────────────────────────────

@router.get("/invoices")
async def get_invoices(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns local invoice records + Stripe invoice data."""
    local_invoices = (
        db.query(BillingInvoice)
        .filter(BillingInvoice.organization_id == current_user.organization_id)
        .order_by(BillingInvoice.created_at.desc())
        .limit(limit)
        .all()
    )

    results = []
    for inv in local_invoices:
        results.append({
            "id": inv.id,
            "stripe_invoice_id": inv.stripe_invoice_id,
            "status": inv.status,
            "total_brl": inv.total_cents / 100,
            "period_start": inv.period_start.isoformat() if inv.period_start else None,
            "period_end": inv.period_end.isoformat() if inv.period_end else None,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "pdf_url": inv.pdf_url,
            "nfe_number": inv.nfe_number,
            "nfe_url": inv.nfe_url,
            "payment_method_type": inv.payment_method_type,
        })

    return {"invoices": results}


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inv = db.query(BillingInvoice).filter(
        BillingInvoice.id == invoice_id,
        BillingInvoice.organization_id == current_user.organization_id,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv.pdf_url:
        raise HTTPException(status_code=404, detail="PDF not yet available")
    # Redirect to Stripe-hosted PDF
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=inv.pdf_url, status_code=302)


# ── Usage stats ───────────────────────────────────────────────────────────────

@router.get("/usage")
def get_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns current period usage for all metered dimensions."""
    _, api_info  = check_api_rate_limit(db, current_user.organization_id)
    _, stor_info = check_storage_quota(db, current_user.organization_id)
    _, appt_info = check_appointment_quota(db, current_user.organization_id)

    return {
        "api_calls": api_info,
        "storage":   stor_info,
        "appointments": appt_info,
    }


# ── Enterprise quotes ─────────────────────────────────────────────────────────

@router.post("/quotes", status_code=status.HTTP_201_CREATED)
def submit_enterprise_quote(
    body: EnterpriseQuoteRequest,
    db: Session = Depends(get_db),
):
    """
    Submits an enterprise quote request.
    No authentication required — prospects can submit before signing up.
    """
    # Calculate base price estimate
    clinic_count = body.clinic_count or 1
    price_estimate = max(
        ENTERPRISE_MIN_PRICE_CENTS,
        ENTERPRISE_MIN_PRICE_CENTS + (clinic_count - 1) * 50000,  # +R$500 per extra clinic
    )

    poc_start = None
    poc_end = None
    if body.poc_requested:
        from datetime import date, timedelta
        poc_start = date.today()
        poc_end = poc_start + timedelta(days=30)

    quote = EnterpriseQuote(
        prospect_name=body.prospect_name,
        prospect_email=body.prospect_email,
        prospect_phone=body.prospect_phone,
        prospect_company=body.prospect_company,
        clinic_count=body.clinic_count,
        user_count=body.user_count,
        contract_years=body.contract_years,
        poc_offered=body.poc_requested,
        poc_start=poc_start,
        poc_end=poc_end,
        monthly_price_cents=price_estimate,
        status=QuoteStatus.DRAFT,
        notes=body.notes,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    log.info(
        "Enterprise quote #%d received from %s <%s>",
        quote.id, body.prospect_name, body.prospect_email,
    )

    return {
        "quote_id": quote.id,
        "status": quote.status,
        "price_estimate_monthly_brl": price_estimate / 100,
        "poc_start": poc_start.isoformat() if poc_start else None,
        "poc_end": poc_end.isoformat() if poc_end else None,
        "message": (
            "Sua solicitação foi recebida. Nossa equipe entrará em contato em até 24 horas "
            "com uma proposta personalizada."
        ),
    }


@router.get("/quotes/{quote_id}")
def get_quote(
    quote_id: int,
    token: str,  # simple security token (emailed to prospect)
    db: Session = Depends(get_db),
):
    quote = db.query(EnterpriseQuote).filter(EnterpriseQuote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    # Very lightweight auth: token must match email hash
    import hashlib
    expected = hashlib.sha256(f"{quote.prospect_email}-{quote_id}".encode()).hexdigest()[:16]
    if token != expected:
        raise HTTPException(status_code=403, detail="Invalid token")

    return {
        "id": quote.id,
        "status": quote.status,
        "prospect_name": quote.prospect_name,
        "prospect_company": quote.prospect_company,
        "monthly_price_brl": quote.monthly_price_cents / 100 if quote.monthly_price_cents else None,
        "annual_price_brl": quote.annual_price_cents / 100 if quote.annual_price_cents else None,
        "contract_years": quote.contract_years,
        "poc_start": quote.poc_start.isoformat() if quote.poc_start else None,
        "poc_end": quote.poc_end.isoformat() if quote.poc_end else None,
        "sla_uptime_pct": quote.sla_uptime_pct,
        "docusign_status": quote.docusign_status,
        "msa_signed_at": quote.msa_signed_at.isoformat() if quote.msa_signed_at else None,
        "expires_at": quote.expires_at.isoformat() if quote.expires_at else None,
    }


# ── NFE.io async webhook ──────────────────────────────────────────────────────

@router.post("/nfe/webhook")
async def nfe_webhook(request: Request, db: Session = Depends(get_db)):
    """Receives async status updates from NFE.io after NFS-e emission."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    nfe_io_id = payload.get("id") or payload.get("serviceInvoiceId")
    nfe_status = payload.get("flowStatus") or payload.get("status", "")

    log.info("NFE.io webhook: id=%s status=%s", nfe_io_id, nfe_status)

    if nfe_io_id:
        nfe_log = db.query(NFeLog).filter(NFeLog.nfe_io_id == nfe_io_id).first()
        if nfe_log:
            nfe_log.status = nfe_status.lower()
            if "issued" in nfe_status.lower() or "autorizada" in nfe_status.lower():
                nfe_log.issued_at = datetime.now(timezone.utc)
                nfe_log.nfe_number = str(payload.get("number", ""))
                nfe_log.pdf_url = payload.get("pdfUrl") or payload.get("pdf_url")
                nfe_log.xml_url = payload.get("xmlUrl") or payload.get("xml_url")
                # Update invoice
                inv = db.query(BillingInvoice).filter(
                    BillingInvoice.id == nfe_log.invoice_id
                ).first()
                if inv:
                    inv.nfe_number = nfe_log.nfe_number
                    inv.nfe_url = nfe_log.pdf_url
                    inv.nfe_issued_at = nfe_log.issued_at
            elif "error" in nfe_status.lower() or "erro" in nfe_status.lower():
                nfe_log.error_message = payload.get("description") or payload.get("message")
            db.commit()

    return {"received": True}


# ── Stripe webhook (main handler) ─────────────────────────────────────────────

@router.post("/stripe/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    """
    Handles all Stripe webhook events.
    Idempotent: events are logged and deduplicated via stripe_webhook_logs.
    """
    payload = await request.body()

    # Verify signature
    try:
        event = verify_webhook_signature(payload, stripe_signature or "")
    except ValueError as e:
        log.warning("Stripe webhook signature failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))

    event_id   = event["id"]
    event_type = event["type"]

    # Idempotency check
    existing = db.query(StripeWebhookLog).filter(
        StripeWebhookLog.stripe_event_id == event_id
    ).first()
    if existing and existing.processed:
        log.debug("Duplicate Stripe event %s — skipping", event_id)
        return {"received": True, "duplicate": True}

    # Log the event
    log_entry = existing or StripeWebhookLog(
        stripe_event_id=event_id,
        event_type=event_type,
        api_version=event.get("api_version"),
        payload=event,
    )
    if not existing:
        db.add(log_entry)
        db.commit()

    try:
        await _dispatch_stripe_event(event, db)
        log_entry.processed = True
        log_entry.processed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        log.error("Error processing Stripe event %s (%s): %s", event_id, event_type, e)
        log_entry.error_message = str(e)
        db.commit()
        # Return 200 to prevent Stripe retries on app logic errors
        return {"received": True, "error": str(e)}

    return {"received": True}


async def _dispatch_stripe_event(event: dict, db: Session) -> None:
    """Routes Stripe events to specific handlers."""
    event_type = event["type"]
    data_obj   = event["data"]["object"]

    handlers = {
        "checkout.session.completed":          _handle_checkout_completed,
        "customer.subscription.created":       _handle_subscription_created,
        "customer.subscription.updated":       _handle_subscription_updated,
        "customer.subscription.deleted":       _handle_subscription_deleted,
        "customer.subscription.trial_will_end": _handle_trial_ending,
        "invoice.created":                     _handle_invoice_created,
        "invoice.payment_succeeded":           _handle_invoice_paid,
        "invoice.payment_failed":              _handle_invoice_payment_failed,
        "invoice.upcoming":                    _handle_invoice_upcoming,
        "payment_intent.payment_failed":       _handle_payment_intent_failed,
        "billing.meter_event_adjustment.created": _handle_meter_event,
    }

    handler = handlers.get(event_type)
    if handler:
        await handler(data_obj, db)
    else:
        log.debug("Unhandled Stripe event type: %s", event_type)


# ── Stripe event handlers ─────────────────────────────────────────────────────

async def _handle_checkout_completed(session: dict, db: Session) -> None:
    """checkout.session.completed — user completed checkout."""
    stripe_subscription_id = session.get("subscription")
    stripe_customer_id     = session.get("customer")
    metadata               = session.get("metadata", {}) or session.get("subscription_data", {}).get("metadata", {})
    organization_id        = int(metadata.get("organization_id", 0))

    if not organization_id or not stripe_subscription_id:
        return

    sub = db.query(Subscription).filter(
        Subscription.organization_id == organization_id
    ).first()
    if not sub:
        return

    sub.stripe_subscription_id = stripe_subscription_id
    sub.stripe_customer_id     = stripe_customer_id
    sub.status = SubscriptionStatus.ACTIVE
    db.commit()
    log.info("Checkout completed for org %d, sub %s", organization_id, stripe_subscription_id)


async def _handle_subscription_created(stripe_sub: dict, db: Session) -> None:
    """customer.subscription.created."""
    org_id = int(stripe_sub.get("metadata", {}).get("organization_id", 0))
    if not org_id:
        return
    sub = db.query(Subscription).filter(Subscription.organization_id == org_id).first()
    if not sub:
        return

    sub.stripe_subscription_id = stripe_sub["id"]
    sub.stripe_customer_id     = stripe_sub["customer"]
    sub.status = SubscriptionStatus(stripe_sub.get("status", "active"))

    if stripe_sub.get("trial_start"):
        sub.trial_start = datetime.fromtimestamp(stripe_sub["trial_start"], tz=timezone.utc)
    if stripe_sub.get("trial_end"):
        sub.trial_end = datetime.fromtimestamp(stripe_sub["trial_end"], tz=timezone.utc)
    if stripe_sub.get("current_period_start"):
        sub.current_period_start = datetime.fromtimestamp(
            stripe_sub["current_period_start"], tz=timezone.utc
        )
    if stripe_sub.get("current_period_end"):
        sub.current_period_end = datetime.fromtimestamp(
            stripe_sub["current_period_end"], tz=timezone.utc
        )
    db.commit()


async def _handle_subscription_updated(stripe_sub: dict, db: Session) -> None:
    """customer.subscription.updated — handles plan changes, trial end, etc."""
    sub = db.query(Subscription).filter(
        Subscription.stripe_subscription_id == stripe_sub["id"]
    ).first()
    if not sub:
        return

    stripe_status = stripe_sub.get("status")
    if stripe_status:
        sub.status = SubscriptionStatus(stripe_status)

    if stripe_sub.get("current_period_start"):
        sub.current_period_start = datetime.fromtimestamp(
            stripe_sub["current_period_start"], tz=timezone.utc
        )
    if stripe_sub.get("current_period_end"):
        sub.current_period_end = datetime.fromtimestamp(
            stripe_sub["current_period_end"], tz=timezone.utc
        )

    sub.cancel_at_period_end = stripe_sub.get("cancel_at_period_end", False)
    db.commit()


async def _handle_subscription_deleted(stripe_sub: dict, db: Session) -> None:
    """customer.subscription.deleted — subscription ended."""
    sub = db.query(Subscription).filter(
        Subscription.stripe_subscription_id == stripe_sub["id"]
    ).first()
    if not sub:
        return

    sub.status = SubscriptionStatus.CANCELED
    sub.canceled_at = datetime.now(timezone.utc)
    db.commit()
    log.info("Subscription %s deleted", stripe_sub["id"])


async def _handle_trial_ending(stripe_sub: dict, db: Session) -> None:
    """customer.subscription.trial_will_end — 3 days before trial ends."""
    org_id = int(stripe_sub.get("metadata", {}).get("organization_id", 0))
    log.info(
        "Trial ending soon for org %d, sub %s. Trial ends: %s",
        org_id,
        stripe_sub["id"],
        datetime.fromtimestamp(stripe_sub["trial_end"], tz=timezone.utc).isoformat(),
    )
    # TODO: send trial-ending email (use SendGrid template)


async def _handle_invoice_created(invoice: dict, db: Session) -> None:
    """invoice.created — create local invoice record."""
    stripe_invoice_id = invoice["id"]
    stripe_customer   = invoice["customer"]
    amount_due        = invoice.get("amount_due", 0)

    # Find subscription
    sub = db.query(Subscription).filter(
        Subscription.stripe_customer_id == stripe_customer
    ).first()
    if not sub:
        return

    # Avoid duplicate
    existing = db.query(BillingInvoice).filter(
        BillingInvoice.stripe_invoice_id == stripe_invoice_id
    ).first()
    if existing:
        return

    period_start = period_end = None
    if invoice.get("period_start"):
        period_start = datetime.fromtimestamp(invoice["period_start"], tz=timezone.utc)
    if invoice.get("period_end"):
        period_end = datetime.fromtimestamp(invoice["period_end"], tz=timezone.utc)

    line_items = []
    for line in invoice.get("lines", {}).get("data", []):
        line_items.append({
            "description": line.get("description"),
            "amount_cents": line.get("amount", 0),
            "quantity": line.get("quantity", 1),
        })

    local_inv = BillingInvoice(
        subscription_id=sub.id,
        organization_id=sub.organization_id,
        stripe_invoice_id=stripe_invoice_id,
        status="open",
        total_cents=amount_due,
        amount_due_cents=amount_due,
        period_start=period_start,
        period_end=period_end,
        pdf_url=invoice.get("invoice_pdf"),
        line_items=line_items,
    )
    db.add(local_inv)
    db.commit()


async def _handle_invoice_paid(invoice: dict, db: Session) -> None:
    """invoice.payment_succeeded — mark invoice paid, emit NFS-e."""
    local_inv = db.query(BillingInvoice).filter(
        BillingInvoice.stripe_invoice_id == invoice["id"]
    ).first()
    if not local_inv:
        await _handle_invoice_created(invoice, db)
        local_inv = db.query(BillingInvoice).filter(
            BillingInvoice.stripe_invoice_id == invoice["id"]
        ).first()
    if not local_inv:
        return

    local_inv.status = "paid"
    local_inv.paid_at = datetime.now(timezone.utc)
    local_inv.amount_paid_cents = invoice.get("amount_paid", 0)
    local_inv.pdf_url = invoice.get("invoice_pdf") or local_inv.pdf_url

    # Detect payment method
    pm = invoice.get("payment_intent") or {}
    pm_type_raw = invoice.get("payment_method_details", {}).get("type") or "card"
    local_inv.payment_method_type = pm_type_raw

    db.commit()

    # Recover dunning if applicable
    sub = db.query(Subscription).filter(
        Subscription.id == local_inv.subscription_id
    ).first()
    if sub and sub.status == SubscriptionStatus.PAST_DUE:
        await handle_payment_recovered(db, sub)

    # Emit NFS-e asynchronously (non-blocking)
    await _emit_nfse_for_invoice(local_inv, db)

    log.info("Invoice %s paid for org %d", invoice["id"], local_inv.organization_id)


async def _emit_nfse_for_invoice(inv: BillingInvoice, db: Session) -> None:
    """Triggers NFS-e emission after invoice payment."""
    if inv.nfe_number:
        return  # Already emitted

    org = db.query(Organization).filter(Organization.id == inv.organization_id).first()
    if not org:
        return

    admin = (
        db.query(User)
        .filter(User.organization_id == org.id, User.role.in_(["admin", "superadmin"]))
        .first()
    )
    if not admin:
        return

    try:
        result = await emit_nfse(
            invoice_id=inv.id,
            organization_name=org.name,
            taker_document="00000000000",  # TODO: pull from org settings
            taker_name=admin.name,
            taker_email=admin.email,
            taker_address={
                "street": "Rua Exemplo",
                "number": "100",
                "district": "Centro",
                "city_code": "3550308",
                "state": org.state or "SP",
                "postal_code": "01310-100",
            },
            service_description=f"Licença de software OrthoClinic — {org.name}",
            service_amount_cents=inv.total_cents,
            webhook_url=NFE_IO_WEBHOOK_URL,
        )

        if result.get("error"):
            log.warning("NFS-e emission failed for invoice %d: %s", inv.id, result["error"])
            return

        nfe_log = NFeLog(
            invoice_id=inv.id,
            organization_id=inv.organization_id,
            nfe_io_id=result.get("id"),
            status=result.get("flowStatus", "pending"),
            value_cents=inv.total_cents,
        )
        db.add(nfe_log)
        db.commit()

    except Exception as e:
        log.error("NFS-e exception for invoice %d: %s", inv.id, e)


async def _handle_invoice_payment_failed(invoice: dict, db: Session) -> None:
    """invoice.payment_failed — trigger dunning sequence."""
    local_inv = db.query(BillingInvoice).filter(
        BillingInvoice.stripe_invoice_id == invoice["id"]
    ).first()
    if not local_inv:
        await _handle_invoice_created(invoice, db)
        local_inv = db.query(BillingInvoice).filter(
            BillingInvoice.stripe_invoice_id == invoice["id"]
        ).first()
    if not local_inv:
        return

    sub = db.query(Subscription).filter(
        Subscription.id == local_inv.subscription_id
    ).first()
    if not sub:
        return

    # Determine attempt number from existing dunning events
    existing_attempts = db.query(DunningEvent).filter(
        DunningEvent.subscription_id == sub.id
    ).count()
    attempt_number = existing_attempts + 1

    org = db.query(Organization).filter(Organization.id == sub.organization_id).first()
    admin = (
        db.query(User)
        .filter(User.organization_id == sub.organization_id, User.role.in_(["admin", "superadmin"]))
        .first()
    )

    await handle_payment_failure(
        db=db,
        subscription=sub,
        stripe_invoice_id=invoice["id"],
        attempt_number=min(attempt_number, 4),
        customer_name=admin.name if admin else org.name,
        customer_email=admin.email if admin else "admin@orthoclinic.com.br",
        amount_cents=invoice.get("amount_due", 0),
        plan_name=sub.plan.name if sub.plan else "OrthoClinic",
    )


async def _handle_invoice_upcoming(invoice: dict, db: Session) -> None:
    """invoice.upcoming — 7 days before next billing. Check overage."""
    stripe_customer = invoice.get("customer")
    sub = db.query(Subscription).filter(
        Subscription.stripe_customer_id == stripe_customer
    ).first()
    if not sub:
        return

    # Check if there's API overage to report
    if sub.current_period_start and sub.current_period_end:
        result = await report_monthly_usage_to_stripe(
            db=db,
            subscription=sub,
            billing_period_start=sub.current_period_start,
            billing_period_end=datetime.now(timezone.utc),
        )
        if result and result.get("overage", 0) > 0:
            log.info(
                "Reported %d overage API calls for subscription %d",
                result["overage"], sub.id,
            )


async def _handle_payment_intent_failed(payment_intent: dict, db: Session) -> None:
    """payment_intent.payment_failed — for PIX/Boleto specific failures."""
    log.warning(
        "PaymentIntent %s failed: %s",
        payment_intent["id"],
        payment_intent.get("last_payment_error", {}).get("message"),
    )


async def _handle_meter_event(meter_event: dict, db: Session) -> None:
    """billing.meter_event_adjustment.created."""
    log.info("Meter event adjustment: %s", meter_event.get("id"))
