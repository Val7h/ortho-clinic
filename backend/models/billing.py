"""
Billing models — Sprint 8 Enterprise Billing
Covers: subscriptions, usage metering, invoices, quotes, multi-clinic billing.
"""
from __future__ import annotations

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Float, ForeignKey,
    Text, JSON, Date, Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


# ── Enums ─────────────────────────────────────────────────────────────────────

class PlanTier(str, enum.Enum):
    STARTER    = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class BillingCycle(str, enum.Enum):
    MONTHLY = "monthly"
    ANNUAL  = "annual"


class SubscriptionStatus(str, enum.Enum):
    TRIALING   = "trialing"
    ACTIVE     = "active"
    PAST_DUE   = "past_due"
    CANCELED   = "canceled"
    UNPAID     = "unpaid"
    PAUSED     = "paused"
    INCOMPLETE = "incomplete"


class InvoiceStatus(str, enum.Enum):
    DRAFT    = "draft"
    OPEN     = "open"
    PAID     = "paid"
    VOID     = "void"
    UNCOLLECTIBLE = "uncollectible"


class QuoteStatus(str, enum.Enum):
    DRAFT     = "draft"
    SENT      = "sent"
    ACCEPTED  = "accepted"
    DECLINED  = "declined"
    EXPIRED   = "expired"
    CONVERTED = "converted"


class PaymentMethodType(str, enum.Enum):
    CARD   = "card"
    PIX    = "pix"
    BOLETO = "boleto"


# ── Plan Definition (static catalog) ─────────────────────────────────────────

class Plan(Base):
    """Static plan definitions synchronized with Stripe Products/Prices."""
    __tablename__ = "billing_plans"

    id            = Column(Integer, primary_key=True, index=True)
    tier          = Column(SAEnum(PlanTier), nullable=False, unique=True)
    name          = Column(String(100), nullable=False)
    description   = Column(Text)

    # Pricing (in BRL cents to avoid float issues)
    price_monthly_cents  = Column(Integer, nullable=False)   # 0 = custom/enterprise
    price_annual_cents   = Column(Integer, nullable=False)   # 0 = custom/enterprise

    # Stripe IDs
    stripe_product_id      = Column(String(100), nullable=True)
    stripe_price_monthly   = Column(String(100), nullable=True)
    stripe_price_annual    = Column(String(100), nullable=True)
    stripe_meter_id        = Column(String(100), nullable=True)  # for API call metering

    # Limits (None = unlimited)
    max_users         = Column(Integer, nullable=True)   # NULL = unlimited
    max_appointments  = Column(Integer, nullable=True)   # NULL = unlimited
    max_storage_gb    = Column(Integer, nullable=True)   # NULL = unlimited
    api_calls_per_hour = Column(Integer, nullable=True)  # NULL = unlimited

    # Overage pricing (BRL cents per 1,000 API calls)
    api_overage_per_1k_cents = Column(Integer, default=15)  # R$ 0.15

    # Feature flags (JSON list of feature keys)
    features = Column(JSON, default=[])

    # Trial
    trial_days = Column(Integer, default=14)

    active     = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    subscriptions = relationship("Subscription", back_populates="plan")


# ── Subscription ──────────────────────────────────────────────────────────────

class Subscription(Base):
    """One subscription per organization. Covers all child clinics."""
    __tablename__ = "subscriptions"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, unique=True, index=True)
    plan_id         = Column(Integer, ForeignKey("billing_plans.id"), nullable=False)
    billing_cycle   = Column(SAEnum(BillingCycle), default=BillingCycle.MONTHLY)
    status          = Column(SAEnum(SubscriptionStatus), default=SubscriptionStatus.TRIALING)

    # Stripe
    stripe_subscription_id  = Column(String(200), unique=True, nullable=True, index=True)
    stripe_customer_id      = Column(String(200), nullable=True, index=True)
    stripe_latest_invoice_id = Column(String(200), nullable=True)

    # Current period
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end   = Column(DateTime(timezone=True), nullable=True)

    # Trial
    trial_start = Column(DateTime(timezone=True), nullable=True)
    trial_end   = Column(DateTime(timezone=True), nullable=True)
    trial_card_required = Column(Boolean, default=False)  # 14-day free, no card

    # Cancellation
    cancel_at_period_end = Column(Boolean, default=False)
    canceled_at          = Column(DateTime(timezone=True), nullable=True)
    cancellation_reason  = Column(String(500), nullable=True)

    # Multi-clinic volume discount
    # 10+ clinics = 15%, 25+ = 25%
    volume_discount_pct = Column(Float, default=0.0)

    # Enterprise custom pricing (overrides plan price)
    custom_price_cents = Column(Integer, nullable=True)

    # POC / Enterprise trial
    poc_start = Column(DateTime(timezone=True), nullable=True)
    poc_end   = Column(DateTime(timezone=True), nullable=True)

    # MSA / Contract
    contract_signed_at    = Column(DateTime(timezone=True), nullable=True)
    contract_docusign_id  = Column(String(200), nullable=True)
    contract_document_url = Column(String(500), nullable=True)
    contract_years        = Column(Integer, nullable=True)  # multi-year discount
    multi_year_discount_pct = Column(Float, default=0.0)

    # Extra data (metadata is reserved by SQLAlchemy Declarative API)
    extra_data = Column(JSON, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    plan         = relationship("Plan", back_populates="subscriptions")
    invoices     = relationship("BillingInvoice", back_populates="subscription", cascade="all, delete-orphan")
    usage_records = relationship("UsageRecord", back_populates="subscription", cascade="all, delete-orphan")
    dunning_events = relationship("DunningEvent", back_populates="subscription", cascade="all, delete-orphan")
    payment_methods = relationship("PaymentMethod", back_populates="subscription", cascade="all, delete-orphan")


# ── Payment Method ────────────────────────────────────────────────────────────

class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id              = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    stripe_pm_id    = Column(String(200), nullable=True)
    type            = Column(SAEnum(PaymentMethodType), nullable=False)
    is_default      = Column(Boolean, default=False)

    # Card details (last 4 only)
    card_brand    = Column(String(20), nullable=True)
    card_last4    = Column(String(4), nullable=True)
    card_exp_month = Column(Integer, nullable=True)
    card_exp_year  = Column(Integer, nullable=True)

    # PIX / Boleto
    pix_key       = Column(String(200), nullable=True)
    boleto_barcode = Column(String(500), nullable=True)

    active     = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    subscription = relationship("Subscription", back_populates="payment_methods")


# ── Invoice ───────────────────────────────────────────────────────────────────

class BillingInvoice(Base):
    __tablename__ = "billing_invoices"

    id              = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    stripe_invoice_id = Column(String(200), unique=True, nullable=True, index=True)
    status            = Column(SAEnum(InvoiceStatus), default=InvoiceStatus.DRAFT)

    # Amounts (BRL cents)
    subtotal_cents   = Column(Integer, default=0)
    discount_cents   = Column(Integer, default=0)
    tax_cents        = Column(Integer, default=0)
    total_cents      = Column(Integer, default=0)
    amount_paid_cents = Column(Integer, default=0)
    amount_due_cents  = Column(Integer, default=0)

    # Overage
    api_overage_calls  = Column(Integer, default=0)
    api_overage_cents  = Column(Integer, default=0)

    # Billing period
    period_start = Column(DateTime(timezone=True), nullable=True)
    period_end   = Column(DateTime(timezone=True), nullable=True)

    # Payment
    payment_method_type = Column(SAEnum(PaymentMethodType), nullable=True)
    paid_at             = Column(DateTime(timezone=True), nullable=True)
    due_date            = Column(Date, nullable=True)

    # PDF & NF-e
    pdf_url      = Column(String(500), nullable=True)
    nfe_number   = Column(String(50), nullable=True)    # Nota Fiscal eletrônica
    nfe_url      = Column(String(500), nullable=True)
    nfe_issued_at = Column(DateTime(timezone=True), nullable=True)

    # Boleto
    boleto_url        = Column(String(500), nullable=True)
    boleto_expires_at = Column(DateTime(timezone=True), nullable=True)

    # PIX
    pix_qr_code   = Column(Text, nullable=True)
    pix_copy_paste = Column(String(500), nullable=True)
    pix_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Line items (JSON for flexibility)
    line_items = Column(JSON, default=[])

    # Email tracking
    email_sent_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    subscription = relationship("Subscription", back_populates="invoices")


# ── Usage Record (API call metering) ─────────────────────────────────────────

class UsageRecord(Base):
    """
    Aggregated usage tracking per subscription per day.
    Stripe Meters receive real-time events; this table is our local mirror.
    """
    __tablename__ = "usage_records"

    id              = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    date            = Column(Date, nullable=False)
    api_calls       = Column(Integer, default=0)       # total API calls that day
    storage_gb_used = Column(Float, default=0.0)       # snapshot at end of day
    appointments    = Column(Integer, default=0)       # appointments created that day

    # Stripe Meter event IDs (for idempotency)
    stripe_meter_event_ids = Column(JSON, default=[])

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    subscription = relationship("Subscription", back_populates="usage_records")


# ── Dunning Events ────────────────────────────────────────────────────────────

class DunningEvent(Base):
    """Tracks payment retry and dunning email sequence."""
    __tablename__ = "dunning_events"

    id              = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False, index=True)

    event_type  = Column(String(50), nullable=False)
    # payment_failed | retry_1 | retry_2 | retry_3 | final_notice | suspended
    attempt_number = Column(Integer, default=1)
    stripe_invoice_id = Column(String(200), nullable=True)
    email_sent_to   = Column(String(200), nullable=True)
    email_sent_at   = Column(DateTime(timezone=True), nullable=True)
    next_retry_at   = Column(DateTime(timezone=True), nullable=True)
    resolved_at     = Column(DateTime(timezone=True), nullable=True)
    extra_data      = Column(JSON, default={})

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    subscription = relationship("Subscription", back_populates="dunning_events")


# ── Enterprise Quote ──────────────────────────────────────────────────────────

class EnterpriseQuote(Base):
    """Custom quote workflow for Enterprise tier prospects."""
    __tablename__ = "enterprise_quotes"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)

    # Prospect info (pre-signup)
    prospect_name    = Column(String(200), nullable=False)
    prospect_email   = Column(String(200), nullable=False)
    prospect_phone   = Column(String(30), nullable=True)
    prospect_company = Column(String(200), nullable=True)
    clinic_count     = Column(Integer, nullable=True)
    user_count       = Column(Integer, nullable=True)

    status = Column(SAEnum(QuoteStatus), default=QuoteStatus.DRAFT)

    # Pricing
    monthly_price_cents  = Column(Integer, nullable=True)  # min 249700 (R$2497)
    annual_price_cents   = Column(Integer, nullable=True)
    contract_years       = Column(Integer, default=1)
    volume_discount_pct  = Column(Float, default=0.0)
    multi_year_discount_pct = Column(Float, default=0.0)
    custom_items         = Column(JSON, default=[])  # extra line items

    # POC
    poc_offered  = Column(Boolean, default=False)
    poc_start    = Column(Date, nullable=True)
    poc_end      = Column(Date, nullable=True)  # 30 days default

    # DocuSign MSA
    docusign_envelope_id  = Column(String(200), nullable=True)
    docusign_status       = Column(String(50), nullable=True)
    msa_signed_at         = Column(DateTime(timezone=True), nullable=True)
    msa_document_url      = Column(String(500), nullable=True)
    dpa_signed_at         = Column(DateTime(timezone=True), nullable=True)  # Data Processing Agreement
    dpa_document_url      = Column(String(500), nullable=True)

    # SLA
    sla_uptime_pct   = Column(Float, default=99.99)
    sla_response_min = Column(Integer, default=60)  # minutes

    # Internal
    assigned_csm    = Column(String(200), nullable=True)  # Customer Success Manager name
    notes           = Column(Text, nullable=True)
    expires_at      = Column(DateTime(timezone=True), nullable=True)
    converted_at    = Column(DateTime(timezone=True), nullable=True)
    converted_subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ── Stripe Webhook Log ────────────────────────────────────────────────────────

class StripeWebhookLog(Base):
    """Idempotent log of all received Stripe webhook events."""
    __tablename__ = "stripe_webhook_logs"

    id            = Column(Integer, primary_key=True, index=True)
    stripe_event_id = Column(String(200), unique=True, nullable=False, index=True)
    event_type    = Column(String(100), nullable=False)
    api_version   = Column(String(20), nullable=True)
    payload       = Column(JSON, nullable=False)
    processed     = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)
    processed_at  = Column(DateTime(timezone=True), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())


# ── NF-e Log ─────────────────────────────────────────────────────────────────

class NFeLog(Base):
    """Log of Nota Fiscal Eletrônica emissions via NFE.io."""
    __tablename__ = "nfe_logs"

    id              = Column(Integer, primary_key=True, index=True)
    invoice_id      = Column(Integer, ForeignKey("billing_invoices.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    nfe_io_id       = Column(String(200), nullable=True, unique=True)
    nfe_number      = Column(String(50), nullable=True)
    nfe_series      = Column(String(10), nullable=True)
    status          = Column(String(50), default="pending")
    # pending | issued | cancelled | error

    issuer_cnpj     = Column(String(20), nullable=True)
    taker_document  = Column(String(20), nullable=True)  # CPF or CNPJ
    taker_name      = Column(String(200), nullable=True)
    service_code    = Column(String(20), nullable=True)  # ISS service code
    iss_rate_pct    = Column(Float, default=2.0)
    value_cents     = Column(Integer, nullable=False)

    pdf_url         = Column(String(500), nullable=True)
    xml_url         = Column(String(500), nullable=True)
    issued_at       = Column(DateTime(timezone=True), nullable=True)
    error_message   = Column(Text, nullable=True)

    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())
