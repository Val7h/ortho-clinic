"""
OIDC (OpenID Connect) Service — OrthoClinic Sprint 8

Supports Authorization Code + PKCE flow.
Compatible with: Keycloak, Auth0, Azure AD, Google, Okta, OneLogin.

Discovery is automatic via /.well-known/openid-configuration.
Manual endpoint overrides in SSOConfiguration take precedence.

Requires: httpx (already in requirements), python-jose[cryptography]
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from jose import jwt as jose_jwt, JWTError
from sqlalchemy.orm import Session

from models.sso import SSOConfiguration, OIDCState

logger = logging.getLogger(__name__)

BASE_URL = os.getenv("BASE_URL", "https://app.orthoclinic.com.br")
OIDC_CALLBACK_PATH = "/auth/oidc/callback"


# ---------------------------------------------------------------------------
# Discovery cache (in-memory; production: use Redis with TTL)
# ---------------------------------------------------------------------------
_discovery_cache: dict[str, dict] = {}
_discovery_cache_ttl: dict[str, datetime] = {}
DISCOVERY_CACHE_SECONDS = 3600


async def _fetch_discovery(issuer: str) -> dict:
    url = issuer.rstrip("/") + "/.well-known/openid-configuration"
    cached_at = _discovery_cache_ttl.get(issuer)
    if cached_at and (datetime.now(timezone.utc) - cached_at).total_seconds() < DISCOVERY_CACHE_SECONDS:
        return _discovery_cache[issuer]

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        doc = resp.json()

    _discovery_cache[issuer] = doc
    _discovery_cache_ttl[issuer] = datetime.now(timezone.utc)
    return doc


async def _get_endpoints(config: SSOConfiguration) -> dict:
    """Return authorization/token/userinfo/jwks_uri endpoints."""
    if config.oidc_authorization_endpoint and config.oidc_token_endpoint:
        return {
            "authorization_endpoint": config.oidc_authorization_endpoint,
            "token_endpoint":         config.oidc_token_endpoint,
            "userinfo_endpoint":      config.oidc_userinfo_endpoint,
            "jwks_uri":               config.oidc_jwks_uri,
        }
    if not config.oidc_issuer:
        raise ValueError("OIDC: issuer not configured")
    doc = await _fetch_discovery(config.oidc_issuer)
    return {
        "authorization_endpoint": doc["authorization_endpoint"],
        "token_endpoint":         doc["token_endpoint"],
        "userinfo_endpoint":      doc.get("userinfo_endpoint"),
        "jwks_uri":               doc.get("jwks_uri"),
    }


# ---------------------------------------------------------------------------
# PKCE helpers
# ---------------------------------------------------------------------------

def _generate_pkce_pair() -> tuple[str, str]:
    """Returns (code_verifier, code_challenge) for PKCE S256."""
    verifier  = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


# ---------------------------------------------------------------------------
# Authorization URL builder
# ---------------------------------------------------------------------------

async def create_authorization_url(
    config: SSOConfiguration,
    db: Session,
    next_url: Optional[str] = None,
) -> str:
    """
    Build the IdP authorization URL and persist state+nonce+pkce_verifier.
    Returns the full URL to redirect the browser to.
    """
    endpoints = await _get_endpoints(config)

    state          = secrets.token_urlsafe(32)
    nonce          = secrets.token_urlsafe(32)
    pkce_verifier, pkce_challenge = _generate_pkce_pair()

    oidc_state = OIDCState(
        state          = state,
        nonce          = nonce,
        pkce_verifier  = pkce_verifier,
        sso_config_id  = config.id,
        next_url       = next_url,
        expires_at     = datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(oidc_state)
    db.commit()

    scopes = " ".join(config.oidc_scopes or ["openid", "email", "profile"])
    redirect_uri = f"{BASE_URL}{OIDC_CALLBACK_PATH}"

    params: dict[str, str] = {
        "response_type":         "code",
        "client_id":             config.oidc_client_id or "",
        "redirect_uri":          redirect_uri,
        "scope":                 scopes,
        "state":                 state,
        "nonce":                 nonce,
        "code_challenge":        pkce_challenge,
        "code_challenge_method": "S256",
    }

    from urllib.parse import urlencode
    return f"{endpoints['authorization_endpoint']}?{urlencode(params)}"


# ---------------------------------------------------------------------------
# Callback handler
# ---------------------------------------------------------------------------

async def handle_callback(
    config: SSOConfiguration,
    code: str,
    state: str,
    db: Session,
) -> dict:
    """
    Exchange authorization code for tokens; validate ID token; return user claims.

    Returns:
      {
        "email": str,
        "first_name": str,
        "last_name": str,
        "display_name": str,
        "groups": list[str],
        "sub": str,
        "email_verified": bool,
      }
    """
    # ── Validate state / retrieve nonce ──────────────────────────────────────
    oidc_state = db.query(OIDCState).filter(
        OIDCState.state         == state,
        OIDCState.sso_config_id == config.id,
    ).first()
    if not oidc_state:
        raise ValueError("OIDC: invalid or unknown state parameter")
    if oidc_state.expires_at < datetime.now(timezone.utc):
        raise ValueError("OIDC: state expired (session too old)")

    pkce_verifier = oidc_state.pkce_verifier
    nonce         = oidc_state.nonce
    # Consume state (prevent replay)
    db.delete(oidc_state)
    db.commit()

    endpoints    = await _get_endpoints(config)
    redirect_uri = f"{BASE_URL}{OIDC_CALLBACK_PATH}"

    # ── Token exchange ────────────────────────────────────────────────────────
    token_payload: dict = {
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  redirect_uri,
        "client_id":     config.oidc_client_id or "",
        "code_verifier": pkce_verifier or "",
    }
    if config.oidc_client_secret:
        token_payload["client_secret"] = config.oidc_client_secret

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            endpoints["token_endpoint"],
            data=token_payload,
            headers={"Accept": "application/json"},
        )
        if resp.status_code != 200:
            logger.error("OIDC token exchange failed: %s %s", resp.status_code, resp.text)
            raise ValueError(f"OIDC: token exchange failed ({resp.status_code})")
        tokens = resp.json()

    access_token = tokens.get("access_token")
    id_token     = tokens.get("id_token")

    if not id_token:
        raise ValueError("OIDC: no id_token in token response")

    # ── Validate ID token ─────────────────────────────────────────────────────
    claims = await _validate_id_token(config, id_token, nonce, endpoints)

    # ── Userinfo (supplement claims if needed) ────────────────────────────────
    if endpoints.get("userinfo_endpoint") and access_token:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                ui_resp = await client.get(
                    endpoints["userinfo_endpoint"],
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if ui_resp.status_code == 200:
                    userinfo = ui_resp.json()
                    # Merge; claims from ID token take precedence for security
                    for k, v in userinfo.items():
                        if k not in claims:
                            claims[k] = v
        except Exception as exc:
            logger.warning("OIDC userinfo fetch failed (non-fatal): %s", exc)

    return _normalize_oidc_claims(config, claims)


async def _validate_id_token(
    config: SSOConfiguration,
    id_token: str,
    nonce: str,
    endpoints: dict,
) -> dict:
    """Validate ID token signature and standard claims."""
    # Fetch JWKS for signature verification
    if not endpoints.get("jwks_uri"):
        # Fallback: decode without verification for IdPs that don't expose JWKS
        # (not recommended; log warning)
        logger.warning("OIDC: no jwks_uri — skipping signature verification (insecure)")
        return jose_jwt.decode(id_token, "", options={"verify_signature": False,
                                                       "verify_aud": False})

    async with httpx.AsyncClient(timeout=10) as client:
        jwks_resp = await client.get(endpoints["jwks_uri"])
        jwks_resp.raise_for_status()
        jwks = jwks_resp.json()

    try:
        claims = jose_jwt.decode(
            id_token,
            jwks,
            algorithms=["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"],
            audience=config.oidc_client_id,
            options={"verify_exp": True},
        )
    except JWTError as exc:
        raise ValueError(f"OIDC: ID token signature invalid: {exc}") from exc

    # Nonce validation (replay protection)
    if claims.get("nonce") != nonce:
        raise ValueError("OIDC: nonce mismatch — possible replay attack")

    # Issuer validation
    if config.oidc_issuer:
        expected_iss = config.oidc_issuer.rstrip("/")
        actual_iss   = (claims.get("iss") or "").rstrip("/")
        # Azure AD multi-tenant: iss contains {tenantid} — skip strict check
        if "{tenantid}" not in expected_iss and actual_iss != expected_iss:
            raise ValueError(f"OIDC: issuer mismatch (got {actual_iss!r}, want {expected_iss!r})")

    return claims


def _normalize_oidc_claims(config: SSOConfiguration, claims: dict) -> dict:
    """Map OIDC claims to OrthoClinic user fields."""
    email_claim  = config.oidc_email_claim or "email"
    groups_claim = config.oidc_groups_claim or "groups"

    email = (claims.get(email_claim) or claims.get("email") or "").strip().lower()
    if not email:
        raise ValueError("OIDC: email claim missing — cannot identify user")

    first_name   = claims.get("given_name") or claims.get("givenName") or ""
    last_name    = claims.get("family_name") or claims.get("familyName") or ""
    display_name = (
        claims.get("name")
        or claims.get("display_name")
        or f"{first_name} {last_name}".strip()
        or email.split("@")[0]
    )

    raw_groups = claims.get(groups_claim) or claims.get("roles") or []
    if isinstance(raw_groups, str):
        raw_groups = [raw_groups]

    return {
        "email":          email,
        "first_name":     first_name,
        "last_name":      last_name,
        "display_name":   display_name,
        "groups":         list(raw_groups),
        "sub":            claims.get("sub", ""),
        "email_verified": bool(claims.get("email_verified", False)),
    }
