"""
Billing plan definitions — canonical source of truth.
Synced to Stripe Products/Prices on startup via sync_plans_to_stripe().
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from models.billing import PlanTier


@dataclass
class PlanDefinition:
    tier: PlanTier
    name: str
    description: str
    price_monthly_cents: int   # 0 = custom
    price_annual_cents: int    # 0 = custom  (monthly × 10 = 2 months free)
    max_users: Optional[int]
    max_appointments: Optional[int]
    max_storage_gb: Optional[int]
    api_calls_per_hour: Optional[int]
    api_overage_per_1k_cents: int   # R$ 0.15 default
    trial_days: int
    features: list[str]


PLAN_CATALOG: dict[PlanTier, PlanDefinition] = {

    PlanTier.STARTER: PlanDefinition(
        tier=PlanTier.STARTER,
        name="Starter",
        description="Ideal para clínicas individuais digitalizando pela primeira vez.",
        price_monthly_cents=29700,          # R$ 297,00
        price_annual_cents=29700 * 10,      # R$ 2.970,00/ano (2 meses grátis)
        max_users=3,
        max_appointments=500,
        max_storage_gb=5,
        api_calls_per_hour=1000,
        api_overage_per_1k_cents=15,
        trial_days=14,
        features=[
            "prontuario_eletronico",
            "agendamento_online",
            "walk_in_queue",
            "pdf_generation",
            "whatsapp_basic",
            "email_support",
            "basic_reporting",
        ],
    ),

    PlanTier.PROFESSIONAL: PlanDefinition(
        tier=PlanTier.PROFESSIONAL,
        name="Professional",
        description="Para clínicas em crescimento com equipe e múltiplas unidades.",
        price_monthly_cents=69700,          # R$ 697,00
        price_annual_cents=69700 * 10,      # R$ 6.970,00/ano
        max_users=15,
        max_appointments=None,              # unlimited
        max_storage_gb=50,
        api_calls_per_hour=10000,
        api_overage_per_1k_cents=15,
        trial_days=14,
        features=[
            "prontuario_eletronico",
            "agendamento_online",
            "walk_in_queue",
            "pdf_generation",
            "whatsapp_advanced",
            "anamnese_digital",
            "teleconsulta",
            "financial_module",
            "custom_branding",
            "webhooks",
            "advanced_analytics",
            "chat_email_support_24h",
            "basic_reporting",
            "advanced_reporting",
        ],
    ),

    PlanTier.ENTERPRISE: PlanDefinition(
        tier=PlanTier.ENTERPRISE,
        name="Enterprise",
        description="Para grupos hospitalares e redes com necessidades avançadas de compliance.",
        price_monthly_cents=0,              # custom — min R$ 2.497
        price_annual_cents=0,              # custom
        max_users=None,                    # unlimited
        max_appointments=None,             # unlimited
        max_storage_gb=None,               # unlimited
        api_calls_per_hour=None,           # unlimited
        api_overage_per_1k_cents=0,        # no overage
        trial_days=30,                     # POC period
        features=[
            "prontuario_eletronico",
            "agendamento_online",
            "walk_in_queue",
            "pdf_generation",
            "whatsapp_advanced",
            "anamnese_digital",
            "teleconsulta",
            "financial_module",
            "custom_branding",
            "webhooks",
            "advanced_analytics",
            "dedicated_csm",
            "phone_support",
            "sso_saml",
            "lgpd_hipaa_package",
            "custom_sla_9999",
            "on_premise_roadmap",
            "custom_contract",
            "dpa",
            "audit_logs",
            "ip_allowlist",
            "priority_feature_requests",
            "scim_provisioning",
            "multi_clinic_billing",
            "volume_discounts",
        ],
    ),
}

# Volume discount thresholds (clinic count → discount %)
VOLUME_DISCOUNT_TIERS = [
    (25, 0.25),  # 25+ clinics = 25% off
    (10, 0.15),  # 10+ clinics = 15% off
    (0,  0.0),
]

# Multi-year contract discounts
MULTI_YEAR_DISCOUNTS = {
    1: 0.0,
    2: 0.10,   # 10% off for 2-year contract
    3: 0.15,   # 15% off for 3-year contract
}

ENTERPRISE_MIN_PRICE_CENTS = 249700   # R$ 2.497,00


def compute_volume_discount(clinic_count: int) -> float:
    for threshold, discount in VOLUME_DISCOUNT_TIERS:
        if clinic_count >= threshold:
            return discount
    return 0.0


def compute_effective_price(
    plan: PlanDefinition,
    billing_cycle: str,
    clinic_count: int = 1,
    contract_years: int = 1,
    custom_price_cents: int | None = None,
) -> dict:
    """
    Returns effective pricing with all discounts applied.
    Returns amounts in BRL cents.
    """
    if custom_price_cents is not None:
        base = custom_price_cents
    elif billing_cycle == "annual":
        base = plan.price_annual_cents
    else:
        base = plan.price_monthly_cents

    volume_disc = compute_volume_discount(clinic_count)
    multi_year_disc = MULTI_YEAR_DISCOUNTS.get(contract_years, 0.0)
    total_disc = min(volume_disc + multi_year_disc, 0.40)  # cap at 40%

    discounted = int(base * (1 - total_disc))
    discount_amount = base - discounted

    return {
        "base_cents": base,
        "discount_pct": total_disc,
        "discount_cents": discount_amount,
        "final_cents": discounted,
        "volume_discount_pct": volume_disc,
        "multi_year_discount_pct": multi_year_disc,
        "billing_cycle": billing_cycle,
    }
