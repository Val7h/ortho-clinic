"""
NFE.io integration for Nota Fiscal Eletrônica (NFS-e) emission.
Docs: https://nfe.io/docs/

Environment variables:
  NFE_IO_API_KEY       — your NFE.io API key
  NFE_IO_COMPANY_ID    — your company ID in NFE.io
  NFE_IO_WEBHOOK_URL   — callback URL for async status updates
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

log = logging.getLogger(__name__)

NFE_IO_API_KEY    = os.getenv("NFE_IO_API_KEY", "")
NFE_IO_COMPANY_ID = os.getenv("NFE_IO_COMPANY_ID", "")
NFE_IO_BASE       = "https://api.nfe.io/v1"


def _nfe_headers() -> dict:
    return {
        "Authorization": f"Bearer {NFE_IO_API_KEY}",
        "Content-Type": "application/json",
    }


async def emit_nfse(
    invoice_id: int,
    organization_name: str,
    taker_document: str,          # CPF or CNPJ (digits only)
    taker_name: str,
    taker_email: str,
    taker_address: dict,          # {street, number, complement, district, city_code, state, postal_code}
    service_description: str,
    service_amount_cents: int,    # in BRL cents
    iss_rate_pct: float = 2.0,    # ISS tax rate
    service_code: str = "1.05",   # ISS LC116 service code
    webhook_url: Optional[str] = None,
) -> dict:
    """
    Emits an NFS-e (Nota Fiscal de Serviço Eletrônica) via NFE.io.
    Returns the NFE.io response with id, status, nfeNumber etc.
    """
    amount_brl = service_amount_cents / 100

    payload = {
        "cityServiceCode": service_code,
        "description": service_description[:2000],
        "servicesAmount": amount_brl,
        "issRate": iss_rate_pct / 100,
        "issTaxAmount": round(amount_brl * iss_rate_pct / 100, 2),
        "deductionsAmount": 0,
        "discountUnconditionalAmount": 0,
        "borrower": {
            "federalTaxNumber": taker_document,
            "name": taker_name,
            "email": taker_email,
            "address": {
                "street": taker_address.get("street", ""),
                "number": taker_address.get("number", "S/N"),
                "additionalInformation": taker_address.get("complement", ""),
                "district": taker_address.get("district", ""),
                "city": {"code": taker_address.get("city_code", "3550308")},  # default: São Paulo
                "state": taker_address.get("state", "SP"),
                "postalCode": taker_address.get("postal_code", ""),
                "country": "BRA",
            },
        },
        "externalId": f"orthoclinic-invoice-{invoice_id}",
    }

    if webhook_url:
        payload["webhookUrl"] = webhook_url

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{NFE_IO_BASE}/companies/{NFE_IO_COMPANY_ID}/serviceinvoices",
            json=payload,
            headers=_nfe_headers(),
        )
        if r.status_code not in (200, 201, 202):
            log.error("NFE.io error %s: %s", r.status_code, r.text)
            return {"error": r.text, "status_code": r.status_code}
        return r.json()


async def get_nfse_status(nfe_io_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{NFE_IO_BASE}/companies/{NFE_IO_COMPANY_ID}/serviceinvoices/{nfe_io_id}",
            headers=_nfe_headers(),
        )
        r.raise_for_status()
        return r.json()


async def cancel_nfse(nfe_io_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.delete(
            f"{NFE_IO_BASE}/companies/{NFE_IO_COMPANY_ID}/serviceinvoices/{nfe_io_id}",
            headers=_nfe_headers(),
        )
        r.raise_for_status()
        return r.json()


async def download_nfse_pdf(nfe_io_id: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{NFE_IO_BASE}/companies/{NFE_IO_COMPANY_ID}/serviceinvoices/{nfe_io_id}/pdf",
            headers=_nfe_headers(),
        )
        r.raise_for_status()
        return r.content
