"""
Stripe service — wraps all Stripe API interactions.

Environment variables required:
  STRIPE_SECRET_KEY          — sk_live_xxx or sk_test_xxx
  STRIPE_WEBHOOK_SECRET      — whsec_xxx (from Stripe Dashboard)
  STRIPE_METER_ID_API_CALLS  — Stripe Meter ID for API call metering
  FRONTEND_URL               — https://app.orthoclinic.com.br (for redirect URLs)
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

log = logging.getLogger(__name__)

STRIPE_SECRET_KEY    = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_API_BASE      = "https://api.stripe.com/v1"
FRONTEND_URL         = os.getenv("FRONTEND_URL", "http://localhost:3000")

# ── Low-level helper ──────────────────────────────────────────────────────────

def _stripe_headers() -> dict:
    return {
        "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
        "Stripe-Version": "2024-06-20",
    }


async def _stripe_post(path: str, data: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{STRIPE_API_BASE}{path}",
            data=data,
            headers=_stripe_headers(),
        )
        r.raise_for_status()
        return r.json()


async def _stripe_get(path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{STRIPE_API_BASE}{path}",
            params=params or {},
            headers=_stripe_headers(),
        )
        r.raise_for_status()
        return r.json()


async def _stripe_delete(path: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.delete(
            f"{STRIPE_API_BASE}{path}",
            headers=_stripe_headers(),
        )
        r.raise_for_status()
        return r.json()


# ── Customer ──────────────────────────────────────────────────────────────────

async def create_customer(
    name: str,
    email: str,
    organization_id: int,
    tax_id: Optional[str] = None,  # CNPJ
    metadata: dict | None = None,
) -> dict:
    """Creates a Stripe Customer for the organization."""
    data: dict = {
        "name": name,
        "email": email,
        "preferred_locales[]": "pt-BR",
        "metadata[organization_id]": str(organization_id),
        "metadata[platform]": "orthoclinic",
    }
    if tax_id:
        data["tax_id_data[0][type]"] = "br_cnpj"
        data["tax_id_data[0][value]"] = tax_id.replace(".", "").replace("/", "").replace("-", "")
    if metadata:
        for k, v in metadata.items():
            data[f"metadata[{k}]"] = str(v)
    return await _stripe_post("/customers", data)


async def get_customer(stripe_customer_id: str) -> dict:
    return await _stripe_get(f"/customers/{stripe_customer_id}")


async def update_customer(stripe_customer_id: str, updates: dict) -> dict:
    return await _stripe_post(f"/customers/{stripe_customer_id}", updates)


# ── Checkout Session (hosted payment page) ────────────────────────────────────

async def create_checkout_session(
    stripe_customer_id: str,
    stripe_price_id: str,
    organization_id: int,
    billing_cycle: str,  # "monthly" | "annual"
    trial_days: int = 14,
    payment_methods: list[str] | None = None,  # ["card", "boleto"]
) -> dict:
    """
    Creates a Stripe Checkout Session.
    Returns {id, url} — redirect user to url.
    """
    pm = payment_methods or ["card", "boleto"]
    data: dict = {
        "mode": "subscription",
        "customer": stripe_customer_id,
        "line_items[0][price]": stripe_price_id,
        "line_items[0][quantity]": "1",
        "subscription_data[trial_period_days]": str(trial_days),
        "subscription_data[metadata][organization_id]": str(organization_id),
        "subscription_data[metadata][billing_cycle]": billing_cycle,
        "success_url": f"{FRONTEND_URL}/billing/sucesso?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{FRONTEND_URL}/planos",
        "locale": "pt-BR",
        "allow_promotion_codes": "true",
        "billing_address_collection": "required",
        "customer_update[address]": "auto",
    }
    for i, pm_type in enumerate(pm):
        data[f"payment_method_types[{i}]"] = pm_type

    return await _stripe_post("/checkout/sessions", data)


# ── Subscriptions ─────────────────────────────────────────────────────────────

async def create_subscription(
    stripe_customer_id: str,
    stripe_price_id: str,
    organization_id: int,
    billing_cycle: str,
    trial_days: int = 14,
    metadata: dict | None = None,
) -> dict:
    """Creates subscription directly (for API flows, not hosted checkout)."""
    data: dict = {
        "customer": stripe_customer_id,
        "items[0][price]": stripe_price_id,
        "trial_period_days": str(trial_days),
        "collection_method": "charge_automatically",
        "payment_behavior": "default_incomplete",
        "payment_settings[save_default_payment_method]": "on_subscription",
        "expand[]": "latest_invoice.payment_intent",
        "metadata[organization_id]": str(organization_id),
        "metadata[billing_cycle]": billing_cycle,
        "metadata[platform]": "orthoclinic",
    }
    if metadata:
        for k, v in metadata.items():
            data[f"metadata[{k}]"] = str(v)
    return await _stripe_post("/subscriptions", data)


async def cancel_subscription(
    stripe_subscription_id: str,
    at_period_end: bool = True,
    reason: str | None = None,
) -> dict:
    data: dict = {"cancel_at_period_end": "true" if at_period_end else "false"}
    if reason:
        data["cancellation_details[comment]"] = reason
    return await _stripe_post(f"/subscriptions/{stripe_subscription_id}", data)


async def update_subscription(
    stripe_subscription_id: str,
    new_price_id: str,
    prorate: bool = True,
) -> dict:
    """Upgrades or downgrades a subscription with proration."""
    # First get subscription to find item id
    sub = await _stripe_get(f"/subscriptions/{stripe_subscription_id}")
    item_id = sub["items"]["data"][0]["id"]

    data: dict = {
        "items[0][id]": item_id,
        "items[0][price]": new_price_id,
        "proration_behavior": "create_prorations" if prorate else "none",
        "billing_cycle_anchor": "unchanged",
    }
    return await _stripe_post(f"/subscriptions/{stripe_subscription_id}", data)


async def pause_subscription(stripe_subscription_id: str) -> dict:
    """Pauses subscription — useful during dunning grace period."""
    data = {"pause_collection[behavior]": "void"}
    return await _stripe_post(f"/subscriptions/{stripe_subscription_id}", data)


async def resume_subscription(stripe_subscription_id: str) -> dict:
    data = {"pause_collection": ""}
    return await _stripe_post(f"/subscriptions/{stripe_subscription_id}", data)


async def get_subscription(stripe_subscription_id: str) -> dict:
    return await _stripe_get(
        f"/subscriptions/{stripe_subscription_id}",
        {"expand[]": "latest_invoice,customer,default_payment_method"},
    )


# ── Usage-based Metering (Stripe Meters) ─────────────────────────────────────

async def report_meter_event(
    meter_event_name: str,  # e.g. "api_calls"
    stripe_customer_id: str,
    value: int,
    idempotency_key: str,
    timestamp: int | None = None,  # Unix timestamp; None = now
) -> dict:
    """
    Reports a usage meter event to Stripe.
    Used for API call overage metering.
    """
    data: dict = {
        "event_name": meter_event_name,
        "payload[stripe_customer_id]": stripe_customer_id,
        "payload[value]": str(value),
        "identifier": idempotency_key,
    }
    if timestamp:
        data["timestamp"] = str(timestamp)

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{STRIPE_API_BASE}/billing/meter_events",
            data=data,
            headers={**_stripe_headers(), "Idempotency-Key": idempotency_key},
        )
        r.raise_for_status()
        return r.json()


async def get_meter_usage(
    meter_id: str,
    stripe_customer_id: str,
    start_time: int,
    end_time: int,
) -> dict:
    return await _stripe_get(
        f"/billing/meters/{meter_id}/event_summaries",
        {
            "customer": stripe_customer_id,
            "start_time": str(start_time),
            "end_time": str(end_time),
        },
    )


# ── Invoices ──────────────────────────────────────────────────────────────────

async def get_invoice(stripe_invoice_id: str) -> dict:
    return await _stripe_get(f"/invoices/{stripe_invoice_id}")


async def list_invoices(stripe_customer_id: str, limit: int = 20) -> dict:
    return await _stripe_get(
        "/invoices",
        {"customer": stripe_customer_id, "limit": str(limit)},
    )


async def send_invoice(stripe_invoice_id: str) -> dict:
    return await _stripe_post(f"/invoices/{stripe_invoice_id}/send", {})


async def void_invoice(stripe_invoice_id: str) -> dict:
    return await _stripe_post(f"/invoices/{stripe_invoice_id}/void", {})


async def finalize_invoice(stripe_invoice_id: str) -> dict:
    return await _stripe_post(f"/invoices/{stripe_invoice_id}/finalize", {})


async def create_invoice_item(
    stripe_customer_id: str,
    amount_cents: int,
    description: str,
    currency: str = "brl",
    subscription_id: str | None = None,
) -> dict:
    """Adds an out-of-cycle line item (e.g., overage charge)."""
    data: dict = {
        "customer": stripe_customer_id,
        "amount": str(amount_cents),
        "currency": currency,
        "description": description,
    }
    if subscription_id:
        data["subscription"] = subscription_id
    return await _stripe_post("/invoiceitems", data)


# ── Payment Intents (PIX / Boleto) ────────────────────────────────────────────

async def create_pix_payment_intent(
    amount_cents: int,
    stripe_customer_id: str,
    description: str,
    metadata: dict | None = None,
) -> dict:
    """Creates a PaymentIntent for PIX payment."""
    data: dict = {
        "amount": str(amount_cents),
        "currency": "brl",
        "customer": stripe_customer_id,
        "payment_method_types[]": "pix",
        "description": description,
        "capture_method": "automatic",
    }
    if metadata:
        for k, v in (metadata or {}).items():
            data[f"metadata[{k}]"] = str(v)
    return await _stripe_post("/payment_intents", data)


async def create_boleto_payment_intent(
    amount_cents: int,
    stripe_customer_id: str,
    customer_name: str,
    customer_email: str,
    customer_tax_id: str,  # CPF or CNPJ (numbers only)
    description: str,
    due_date: datetime | None = None,
) -> dict:
    """Creates a PaymentIntent for Boleto Bancário."""
    due_dt = due_date or (datetime.now(timezone.utc) + timedelta(days=3))
    data: dict = {
        "amount": str(amount_cents),
        "currency": "brl",
        "customer": stripe_customer_id,
        "payment_method_types[]": "boleto",
        "description": description,
        "payment_method_data[type]": "boleto",
        "payment_method_data[boleto][tax_id]": customer_tax_id,
        "payment_method_data[billing_details][name]": customer_name,
        "payment_method_data[billing_details][email]": customer_email,
        "payment_method_options[boleto][expires_after_days]": str(
            (due_dt - datetime.now(timezone.utc)).days or 3
        ),
        "confirm": "true",
    }
    return await _stripe_post("/payment_intents", data)


# ── Customer Portal ───────────────────────────────────────────────────────────

async def create_billing_portal_session(
    stripe_customer_id: str,
    return_url: str | None = None,
) -> dict:
    """Creates a Stripe Customer Portal session for self-service billing."""
    data = {
        "customer": stripe_customer_id,
        "return_url": return_url or f"{FRONTEND_URL}/billing",
    }
    return await _stripe_post("/billing_portal/sessions", data)


# ── Webhook Signature Verification ────────────────────────────────────────────

def verify_webhook_signature(payload: bytes, sig_header: str) -> dict:
    """
    Verifies Stripe webhook signature and returns the event dict.
    Raises ValueError on invalid signature.
    """
    import hashlib
    import hmac

    try:
        parts = {
            k: v
            for item in sig_header.split(",")
            for k, v in [item.split("=", 1)]
        }
        timestamp = parts["t"]
        v1_sigs = [v for k, v in parts.items() if k == "v1"]
    except Exception:
        raise ValueError("Invalid Stripe-Signature header format")

    signed_payload = f"{timestamp}.{payload.decode('utf-8')}"
    expected = hmac.new(
        STRIPE_WEBHOOK_SECRET.encode(),
        signed_payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not any(hmac.compare_digest(expected, sig) for sig in v1_sigs):
        raise ValueError("Stripe webhook signature verification failed")

    # Tolerance: 5 minutes
    if abs(datetime.now(timezone.utc).timestamp() - int(timestamp)) > 300:
        raise ValueError("Stripe webhook timestamp too old (replay attack?)")

    import json
    return json.loads(payload)


# ── Products & Prices (plan sync) ─────────────────────────────────────────────

async def get_or_create_product(name: str, description: str, metadata: dict) -> dict:
    # Try to find by metadata
    products = await _stripe_get("/products", {"limit": "100"})
    for p in products.get("data", []):
        if p.get("metadata", {}).get("plan_tier") == metadata.get("plan_tier"):
            return p
    # Create new
    data: dict = {
        "name": name,
        "description": description,
        "metadata[platform]": "orthoclinic",
    }
    for k, v in metadata.items():
        data[f"metadata[{k}]"] = str(v)
    return await _stripe_post("/products", data)


async def get_or_create_price(
    product_id: str,
    amount_cents: int,
    currency: str = "brl",
    interval: str = "month",
    metadata: dict | None = None,
) -> dict:
    prices = await _stripe_get(
        "/prices",
        {"product": product_id, "currency": currency, "limit": "100"},
    )
    for p in prices.get("data", []):
        if (
            p.get("unit_amount") == amount_cents
            and p.get("recurring", {}).get("interval") == interval
            and p.get("active")
        ):
            return p
    data: dict = {
        "product": product_id,
        "unit_amount": str(amount_cents),
        "currency": currency,
        "recurring[interval]": interval,
        "recurring[interval_count]": "1" if interval == "month" else "1",
    }
    if metadata:
        for k, v in (metadata or {}).items():
            data[f"metadata[{k}]"] = str(v)
    return await _stripe_post("/prices", data)
