"""
Dunning management service.
Handles payment failure retries + email sequence + subscription suspension.

Retry schedule (mirrors Stripe Smart Retries):
  Day 0:  Payment failed → email #1 (failure notice)
  Day 3:  Retry #1       → email #2 (reminder)
  Day 7:  Retry #2       → email #3 (urgent)
  Day 14: Retry #3       → email #4 (final warning)
  Day 15: Subscription suspended / moved to past_due

Environment variables:
  SENDGRID_API_KEY (or SMTP settings) for email delivery
  FRONTEND_URL for billing portal links
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from models.billing import DunningEvent, Subscription, SubscriptionStatus
from services.stripe_service import pause_subscription, send_invoice

log = logging.getLogger(__name__)

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
SENDGRID_FROM    = os.getenv("SENDGRID_FROM_EMAIL", "noreply@orthoclinic.com.br")
FRONTEND_URL     = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Retry schedule: (days_after_failure, email_template, attempt_number)
DUNNING_SCHEDULE = [
    (0,  "payment_failed_initial",  1),
    (3,  "payment_failed_retry1",   2),
    (7,  "payment_failed_retry2",   3),
    (14, "payment_failed_final",    4),
]

EMAIL_TEMPLATES = {
    "payment_failed_initial": {
        "subject": "Problema com seu pagamento — OrthoClinic",
        "body_pt": (
            "Olá {name},\n\n"
            "Identificamos um problema ao processar o pagamento da sua assinatura OrthoClinic "
            "({plan_name}, R$ {amount}).\n\n"
            "Por favor, atualize seus dados de pagamento acessando:\n"
            "{billing_url}\n\n"
            "Seu acesso continua ativo por enquanto. Se o pagamento não for regularizado "
            "em 14 dias, sua conta será suspensa temporariamente.\n\n"
            "Qualquer dúvida, entre em contato conosco pelo chat ou WhatsApp.\n\n"
            "OrthoClinic"
        ),
    },
    "payment_failed_retry1": {
        "subject": "Lembrete: pagamento pendente — OrthoClinic",
        "body_pt": (
            "Olá {name},\n\n"
            "Realizamos uma nova tentativa de cobrança da sua assinatura, mas o pagamento "
            "ainda não foi processado.\n\n"
            "Regularize agora em:\n{billing_url}\n\n"
            "Você ainda tem 11 dias antes de qualquer interrupção de serviço.\n\n"
            "OrthoClinic"
        ),
    },
    "payment_failed_retry2": {
        "subject": "Urgente: pagamento da sua assinatura — OrthoClinic",
        "body_pt": (
            "Olá {name},\n\n"
            "Esta é nossa terceira tentativa de cobrança da assinatura OrthoClinic. "
            "Seu serviço continuará ativo por mais 7 dias.\n\n"
            "Atualize seu método de pagamento AGORA:\n{billing_url}\n\n"
            "Após esse prazo, sua conta será suspensa e o acesso bloqueado.\n\n"
            "OrthoClinic"
        ),
    },
    "payment_failed_final": {
        "subject": "Aviso final: sua conta será suspensa amanhã — OrthoClinic",
        "body_pt": (
            "Olá {name},\n\n"
            "Infelizmente não conseguimos processar o pagamento da sua assinatura após "
            "múltiplas tentativas.\n\n"
            "Sua conta será SUSPENSA em 24 horas se o pagamento não for regularizado.\n\n"
            "Regularize agora (leva menos de 2 minutos):\n{billing_url}\n\n"
            "Se precisar de ajuda, nosso suporte está disponível 24h pelo chat.\n\n"
            "OrthoClinic — Equipe de Cobrança"
        ),
    },
}


async def _send_email(to_email: str, subject: str, body: str) -> bool:
    """Sends email via SendGrid API."""
    if not SENDGRID_API_KEY:
        log.warning("SENDGRID_API_KEY not set; email skipped to %s", to_email)
        return False

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": SENDGRID_FROM, "name": "OrthoClinic"},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={"Authorization": f"Bearer {SENDGRID_API_KEY}"},
            )
            return r.status_code == 202
    except Exception as e:
        log.error("SendGrid error: %s", e)
        return False


async def handle_payment_failure(
    db: Session,
    subscription: Subscription,
    stripe_invoice_id: str,
    attempt_number: int,  # 1, 2, 3, 4
    customer_name: str,
    customer_email: str,
    amount_cents: int,
    plan_name: str,
) -> DunningEvent:
    """
    Called by webhook handler on invoice.payment_failed.
    Records dunning event, sends email, updates subscription status.
    """
    billing_url = f"{FRONTEND_URL}/billing/portal"
    amount_brl = f"{amount_cents / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    # Determine email template and next retry
    schedule_entry = next(
        (s for s in DUNNING_SCHEDULE if s[2] == attempt_number),
        DUNNING_SCHEDULE[-1],
    )
    template_key = schedule_entry[1]
    template = EMAIL_TEMPLATES.get(template_key, EMAIL_TEMPLATES["payment_failed_initial"])
    body = template["body_pt"].format(
        name=customer_name,
        plan_name=plan_name,
        amount=amount_brl,
        billing_url=billing_url,
    )

    email_sent_at = datetime.now(timezone.utc)
    email_ok = await _send_email(customer_email, template["subject"], body)

    # Calculate next retry
    next_retry_days = {1: 3, 2: 7, 3: 14, 4: None}
    nd = next_retry_days.get(attempt_number)
    next_retry_at = (
        datetime.now(timezone.utc) + timedelta(days=nd) if nd else None
    )

    # Create dunning event record
    event = DunningEvent(
        subscription_id=subscription.id,
        event_type=template_key,
        attempt_number=attempt_number,
        stripe_invoice_id=stripe_invoice_id,
        email_sent_to=customer_email if email_ok else None,
        email_sent_at=email_sent_at if email_ok else None,
        next_retry_at=next_retry_at,
        metadata={
            "customer_name": customer_name,
            "amount_cents": amount_cents,
            "plan_name": plan_name,
        },
    )
    db.add(event)

    # Update subscription status
    if attempt_number == 1:
        subscription.status = SubscriptionStatus.PAST_DUE
    elif attempt_number >= 4:
        subscription.status = SubscriptionStatus.UNPAID
        # Pause Stripe subscription
        if subscription.stripe_subscription_id:
            try:
                await pause_subscription(subscription.stripe_subscription_id)
            except Exception as e:
                log.error("Failed to pause Stripe subscription: %s", e)

    db.commit()
    db.refresh(event)
    return event


async def handle_payment_recovered(
    db: Session,
    subscription: Subscription,
) -> None:
    """Called when a previously failed invoice is paid."""
    subscription.status = SubscriptionStatus.ACTIVE

    # Mark all open dunning events as resolved
    from sqlalchemy import update
    db.execute(
        update(DunningEvent)
        .where(DunningEvent.subscription_id == subscription.id)
        .where(DunningEvent.resolved_at.is_(None))
        .values(resolved_at=datetime.now(timezone.utc))
    )
    db.commit()
    log.info("Payment recovered for subscription %s", subscription.id)
