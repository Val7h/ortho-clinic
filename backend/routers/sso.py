"""
SSO Router — OrthoClinic Sprint 8

SAML 2.0 Endpoints:
  GET  /auth/saml/metadata          — SP metadata XML
  GET  /auth/saml/login             — Initiate SSO (redirect to IdP)
  POST /auth/saml/callback          — Assertion Consumer Service (ACS)
  GET  /auth/saml/logout            — SLO initiation
  GET  /auth/saml/logout/callback   — SLO response from IdP

OIDC Endpoints:
  GET  /auth/oidc/login             — Initiate OIDC flow
  GET  /auth/oidc/callback          — Authorization Code callback

SSO Admin (admin-only):
  GET  /auth/sso/config             — Get org SSO config
  POST /auth/sso/config             — Create/update SSO config
  POST /auth/sso/test               — Test IdP connection

MFA Endpoints:
  POST /auth/mfa/totp/setup         — Generate TOTP secret + QR
  POST /auth/mfa/totp/enroll        — Confirm TOTP code and save
  POST /auth/mfa/webauthn/registration/options — WebAuthn reg options
  POST /auth/mfa/webauthn/register  — Complete WebAuthn registration
  POST /auth/mfa/webauthn/auth/options — WebAuthn auth options
  POST /auth/mfa/challenge/verify   — Verify TOTP / WebAuthn / backup code
  POST /auth/mfa/backup-codes/generate — Generate 10 backup codes
  POST /auth/mfa/backup-codes/verify  — Verify a backup code
  POST /auth/mfa/reset/{user_id}    — Admin: force MFA reset
  GET  /auth/mfa/status             — Current user MFA status
"""

from __future__ import annotations

import secrets
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter, Depends, Form, HTTPException, Query, Request, Response,
)
from fastapi.responses import JSONResponse, RedirectResponse, Response as FastResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_admin, require_superadmin, SECRET_KEY, ALGORITHM
from models.organization import User, Organization
from models.sso import (
    SSOConfiguration, MFACredential, MFABackupCode, MFAChallenge, SCIMToken,
)
from services import saml_service, oidc_service, jit_service, mfa_service

from jose import jwt as jose_jwt
from passlib.context import CryptContext
from datetime import timedelta

logger = APIRouter()

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
TOKEN_DAYS = 7


# ── Token helper ──────────────────────────────────────────────────────────────

def _make_token(user: User) -> str:
    exp = datetime.utcnow() + timedelta(days=TOKEN_DAYS)
    return jose_jwt.encode(
        {"sub": str(user.id), "org": user.organization_id,
         "role": user.role, "exp": exp},
        SECRET_KEY, algorithm=ALGORITHM,
    )


# ── Response schemas ──────────────────────────────────────────────────────────

class SSOConfigIn(BaseModel):
    protocol:      str = Field(..., pattern="^(saml|oidc)$")
    display_name:  str = "SSO"
    active:        bool = True

    # SAML
    saml_idp_entity_id:       Optional[str] = None
    saml_idp_sso_url:         Optional[str] = None
    saml_idp_slo_url:         Optional[str] = None
    saml_idp_cert:            Optional[str] = None
    saml_sp_private_key:      Optional[str] = None
    saml_sp_cert:             Optional[str] = None
    saml_sign_requests:       bool = True
    saml_require_signed_assertions: bool = True
    saml_nameid_format:       Optional[str] = None
    saml_attribute_mapping:   Optional[dict] = None

    # OIDC
    oidc_issuer:              Optional[str] = None
    oidc_client_id:           Optional[str] = None
    oidc_client_secret:       Optional[str] = None
    oidc_scopes:              Optional[list[str]] = None
    oidc_email_claim:         Optional[str] = None
    oidc_groups_claim:        Optional[str] = None

    # JIT
    jit_provisioning_enabled: bool = True
    jit_approval_required:    bool = False
    jit_default_role:         str = "secretary"

    # MFA policy
    mfa_policy:               str = "optional"
    mfa_grace_days:           int = 7

    # SCIM
    scim_enabled:             bool = False


class TOTPSetupOut(BaseModel):
    secret: str
    qr_svg: str
    uri:    str


class MFAStatusOut(BaseModel):
    has_totp:     bool
    has_webauthn: bool
    has_passkey:  bool
    backup_codes_remaining: int
    mfa_required: bool


# =============================================================================
# SSO Admin — config CRUD
# =============================================================================

sso_admin = APIRouter(prefix="/auth/sso", tags=["SSO Admin"])


@sso_admin.get("/config")
def get_sso_config(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    configs = db.query(SSOConfiguration).filter(
        SSOConfiguration.organization_id == current_user.organization_id
    ).all()
    return [_sanitize_config(c) for c in configs]


@sso_admin.post("/config", status_code=201)
def create_or_update_sso_config(
    data: SSOConfigIn,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    org_id = current_user.organization_id

    existing = db.query(SSOConfiguration).filter(
        SSOConfiguration.organization_id == org_id,
        SSOConfiguration.protocol        == data.protocol,
    ).first()

    if existing:
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(existing, field, value)
        config = existing
    else:
        config = SSOConfiguration(
            organization_id = org_id,
            created_by      = current_user.id,
            **data.model_dump(exclude_none=True),
        )
        db.add(config)

    db.commit()
    db.refresh(config)
    return _sanitize_config(config)


@sso_admin.post("/test")
async def test_sso_config(
    protocol: str = Query(..., pattern="^(saml|oidc)$"),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    config = _get_config(current_user.organization_id, protocol, db)
    result: dict = {"protocol": protocol, "status": "ok", "checks": {}}

    if protocol == "saml":
        try:
            saml_service.get_sp_metadata(config)
            result["checks"]["sp_metadata"] = "ok"
        except Exception as exc:
            result["checks"]["sp_metadata"] = f"error: {exc}"
            result["status"] = "error"
        result["checks"]["idp_sso_url"]  = config.saml_idp_sso_url or "not configured"
        result["checks"]["idp_cert"]     = "present" if config.saml_idp_cert else "missing"
    else:
        try:
            endpoints = await oidc_service._get_endpoints(config)
            result["checks"]["discovery"]             = "ok"
            result["checks"]["authorization_endpoint"] = endpoints["authorization_endpoint"]
            result["checks"]["token_endpoint"]         = endpoints["token_endpoint"]
        except Exception as exc:
            result["checks"]["discovery"] = f"error: {exc}"
            result["status"] = "error"

    return result


def _sanitize_config(c: SSOConfiguration) -> dict:
    """Return config without private keys."""
    return {
        "id":                     c.id,
        "protocol":               c.protocol,
        "display_name":           c.display_name,
        "active":                 c.active,
        "saml_idp_entity_id":     c.saml_idp_entity_id,
        "saml_idp_sso_url":       c.saml_idp_sso_url,
        "saml_idp_slo_url":       c.saml_idp_slo_url,
        "saml_idp_cert":          "present" if c.saml_idp_cert else None,
        "saml_sp_cert":           "present" if c.saml_sp_cert else None,
        "saml_sp_private_key":    "present" if c.saml_sp_private_key else None,
        "saml_sign_requests":     c.saml_sign_requests,
        "saml_require_signed_assertions": c.saml_require_signed_assertions,
        "saml_attribute_mapping": c.saml_attribute_mapping,
        "oidc_issuer":            c.oidc_issuer,
        "oidc_client_id":         c.oidc_client_id,
        "oidc_scopes":            c.oidc_scopes,
        "jit_provisioning_enabled": c.jit_provisioning_enabled,
        "jit_approval_required":    c.jit_approval_required,
        "jit_default_role":         c.jit_default_role,
        "mfa_policy":             c.mfa_policy,
        "mfa_grace_days":         c.mfa_grace_days,
        "scim_enabled":           c.scim_enabled,
    }


# =============================================================================
# SAML 2.0 Endpoints
# =============================================================================

saml_router = APIRouter(prefix="/auth/saml", tags=["SAML 2.0"])


@saml_router.get("/metadata")
def saml_metadata(
    org_id: int = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    config = _get_config(org_id, "saml", db)
    xml    = saml_service.get_sp_metadata(config)
    return FastResponse(content=xml, media_type="application/xml")


@saml_router.get("/login")
def saml_login(
    request: Request,
    org_id: int = Query(...),
    next: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Redirect browser to IdP SSO URL."""
    config  = _get_config(org_id, "saml", db)
    sso_url = saml_service.create_authn_redirect(
        config      = config,
        request     = request,
        db          = db,
        relay_state = next,
        next_url    = next,
    )
    return RedirectResponse(url=sso_url, status_code=302)


@saml_router.post("/callback")
async def saml_acs(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Assertion Consumer Service — receives SAML Response from IdP.
    Validates assertion, provisions/updates user, issues JWT.
    """
    form_data = await request.form()
    post_data = dict(form_data)

    # Determine org from RelayState or SAMLResponse issuer
    relay_state = post_data.get("RelayState", "")
    org_id      = _extract_org_from_relay(relay_state)

    if not org_id:
        raise HTTPException(400, "Cannot determine organization from SAML RelayState")

    config = _get_config(org_id, "saml", db)

    try:
        attrs = saml_service.parse_assertion(config, request, post_data, db)
    except ValueError as exc:
        logger.warning("SAML ACS failed for org %d: %s", org_id, exc)
        raise HTTPException(401, f"SAML authentication failed: {exc}")

    try:
        user, created = jit_service.provision_or_update_user(config, attrs, db)
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    # Check MFA requirement
    if mfa_service.is_mfa_required(user, config):
        if not mfa_service.user_has_mfa(user, db):
            # New user within grace period OR needs enrollment
            challenge_token = mfa_service.create_mfa_challenge(user, db)
            return JSONResponse({
                "mfa_required":    True,
                "mfa_enrolled":    False,
                "challenge_token": challenge_token,
                "redirect":        "/auth/mfa/enroll",
            })
        challenge_token = mfa_service.create_mfa_challenge(user, db)
        return JSONResponse({
            "mfa_required":    True,
            "mfa_enrolled":    True,
            "challenge_token": challenge_token,
            "redirect":        "/auth/mfa/verify",
        })

    token   = _make_token(user)
    next_url = attrs.get("relay_state") or "/"
    return JSONResponse({
        "access_token": token,
        "token_type":   "bearer",
        "user":         _user_out(user),
        "created":      created,
        "redirect":     next_url,
    })


@saml_router.get("/logout")
def saml_slo_init(
    request: Request,
    org_id: int = Query(...),
    name_id: str = Query(...),
    session_index: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Initiate Single Logout — redirect to IdP SLO URL."""
    config  = _get_config(org_id, "saml", db)
    slo_url = saml_service.create_slo_redirect(config, request, name_id, session_index)
    return RedirectResponse(url=slo_url, status_code=302)


@saml_router.get("/logout/callback")
def saml_slo_callback(
    request: Request,
    org_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Receive SLO response from IdP."""
    config   = _get_config(org_id, "saml", db)
    get_data = dict(request.query_params)
    try:
        saml_service.parse_slo_response(config, request, get_data)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"status": "logged_out"}


# =============================================================================
# OIDC Endpoints
# =============================================================================

oidc_router = APIRouter(prefix="/auth/oidc", tags=["OIDC"])


@oidc_router.get("/login")
async def oidc_login(
    org_id: int = Query(...),
    next: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Redirect browser to OIDC IdP authorization URL."""
    config = _get_config(org_id, "oidc", db)
    url    = await oidc_service.create_authorization_url(config, db, next_url=next)
    return RedirectResponse(url=url, status_code=302)


@oidc_router.get("/callback")
async def oidc_callback(
    code:    str = Query(...),
    state:   str = Query(...),
    error:   Optional[str] = Query(None),
    org_id:  int = Query(...),
    db: Session = Depends(get_db),
):
    """Handle OIDC Authorization Code callback."""
    if error:
        raise HTTPException(400, f"OIDC IdP returned error: {error}")

    config = _get_config(org_id, "oidc", db)

    try:
        attrs = await oidc_service.handle_callback(config, code, state, db)
    except ValueError as exc:
        logger.warning("OIDC callback failed for org %d: %s", org_id, exc)
        raise HTTPException(401, str(exc))

    try:
        user, created = jit_service.provision_or_update_user(config, attrs, db)
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    if mfa_service.is_mfa_required(user, config) and mfa_service.user_has_mfa(user, db):
        challenge_token = mfa_service.create_mfa_challenge(user, db)
        return JSONResponse({
            "mfa_required":    True,
            "mfa_enrolled":    True,
            "challenge_token": challenge_token,
        })

    token = _make_token(user)
    return JSONResponse({
        "access_token": token,
        "token_type":   "bearer",
        "user":         _user_out(user),
        "created":      created,
    })


# =============================================================================
# MFA Endpoints
# =============================================================================

mfa_router = APIRouter(prefix="/auth/mfa", tags=["MFA"])


@mfa_router.get("/status", response_model=MFAStatusOut)
def mfa_status(
    current_user: User = Depends(get_current_user),
    db: Session       = Depends(get_db),
):
    creds = db.query(MFACredential).filter(
        MFACredential.user_id == current_user.id,
        MFACredential.active  == True,
    ).all()

    backup_remaining = db.query(MFABackupCode).filter(
        MFABackupCode.user_id == current_user.id,
        MFABackupCode.used_at == None,
    ).count()

    config = db.query(SSOConfiguration).filter(
        SSOConfiguration.organization_id == current_user.organization_id,
        SSOConfiguration.active          == True,
    ).first()

    return MFAStatusOut(
        has_totp              = any(c.method == "totp"    for c in creds),
        has_webauthn          = any(c.method == "webauthn" for c in creds),
        has_passkey           = any(c.method == "passkey"  for c in creds),
        backup_codes_remaining= backup_remaining,
        mfa_required          = mfa_service.is_mfa_required(current_user, config),
    )


# ── TOTP ──────────────────────────────────────────────────────────────────────

class TOTPEnrollIn(BaseModel):
    secret: str
    code:   str
    name:   str = "Authenticator App"


@mfa_router.post("/totp/setup", response_model=TOTPSetupOut)
def totp_setup(current_user: User = Depends(get_current_user)):
    secret = mfa_service.generate_totp_secret()
    return TOTPSetupOut(
        secret = secret,
        qr_svg = mfa_service.get_totp_qr_svg(current_user, secret),
        uri    = mfa_service.get_totp_provisioning_uri(current_user, secret),
    )


@mfa_router.post("/totp/enroll", status_code=201)
def totp_enroll(
    data: TOTPEnrollIn,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    cred = mfa_service.enroll_totp(current_user, data.secret, data.code, data.name, db)
    return {"id": cred.id, "method": cred.method, "name": cred.name}


# ── WebAuthn Registration ─────────────────────────────────────────────────────

@mfa_router.post("/webauthn/registration/options")
def webauthn_reg_options(
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    return mfa_service.generate_webauthn_registration_options(current_user, db)


class WebAuthnRegisterIn(BaseModel):
    credential: dict
    name:       str = "Security Key"
    method:     str = Field("webauthn", pattern="^(webauthn|passkey)$")
    challenge:  str   # base64url challenge from registration options


@mfa_router.post("/webauthn/register", status_code=201)
def webauthn_register(
    data: WebAuthnRegisterIn,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    import base64
    challenge_bytes = base64.urlsafe_b64decode(data.challenge + "==")
    cred = mfa_service.verify_webauthn_registration(
        user              = current_user,
        credential        = data.credential,
        expected_challenge= challenge_bytes,
        method            = data.method,
        name              = data.name,
        db                = db,
    )
    return {"id": cred.id, "method": cred.method, "name": cred.name}


# ── WebAuthn Authentication ───────────────────────────────────────────────────

@mfa_router.post("/webauthn/auth/options")
def webauthn_auth_options(
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    return mfa_service.generate_webauthn_authentication_options(current_user, db)


# ── MFA Challenge Verification ────────────────────────────────────────────────

class MFAVerifyIn(BaseModel):
    challenge_token: str
    method:          str = Field(..., pattern="^(totp|webauthn|backup_code)$")
    # For TOTP or backup_code:
    code:            Optional[str] = None
    # For WebAuthn:
    credential:      Optional[dict] = None
    challenge:       Optional[str]  = None   # base64url WebAuthn challenge


@mfa_router.post("/challenge/verify")
def mfa_challenge_verify(
    data: MFAVerifyIn,
    db: Session = Depends(get_db),
):
    """
    Second factor verification after password step.
    On success: returns a full JWT access token.
    """
    challenge = mfa_service.get_pending_challenge(data.challenge_token, db)
    user      = db.query(User).filter(User.id == challenge.user_id).first()
    if not user or not user.active:
        raise HTTPException(401, "Usuário não encontrado ou inativo")

    if data.method == "totp":
        if not data.code:
            raise HTTPException(400, "TOTP code required")
        mfa_service.verify_totp(user, data.code, db)

    elif data.method == "backup_code":
        if not data.code:
            raise HTTPException(400, "Backup code required")
        mfa_service.verify_backup_code(user, data.code, db)

    elif data.method == "webauthn":
        if not data.credential or not data.challenge:
            raise HTTPException(400, "credential and challenge required for WebAuthn")
        import base64
        challenge_bytes = base64.urlsafe_b64decode(data.challenge + "==")
        mfa_service.verify_webauthn_authentication(user, data.credential, challenge_bytes, db)

    mfa_service.complete_challenge(challenge, db)

    token = _make_token(user)
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user)}


# ── Backup Codes ──────────────────────────────────────────────────────────────

@mfa_router.post("/backup-codes/generate")
def generate_backup_codes(
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    """
    Generate 10 new backup codes (replaces existing ones).
    Show ONCE to user — not stored in plaintext.
    """
    codes = mfa_service.generate_backup_codes(current_user, db)
    return {"codes": codes, "warning": "Save these codes securely — they will not be shown again."}


class BackupCodeVerifyIn(BaseModel):
    code: str


@mfa_router.post("/backup-codes/verify")
def verify_backup_code_endpoint(
    data: BackupCodeVerifyIn,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    mfa_service.verify_backup_code(current_user, data.code, db)
    return {"verified": True}


# ── Admin: Force MFA Reset ────────────────────────────────────────────────────

@mfa_router.post("/reset/{user_id}", status_code=204)
def admin_force_mfa_reset(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session        = Depends(get_db),
):
    target = db.query(User).filter(
        User.id              == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not target:
        raise HTTPException(404, "Usuário não encontrado")
    mfa_service.force_mfa_reset(target, current_user, db)


# =============================================================================
# Helpers
# =============================================================================

def _get_config(org_id: int, protocol: str, db: Session) -> SSOConfiguration:
    config = db.query(SSOConfiguration).filter(
        SSOConfiguration.organization_id == org_id,
        SSOConfiguration.protocol        == protocol,
        SSOConfiguration.active          == True,
    ).first()
    if not config:
        raise HTTPException(404, f"SSO {protocol.upper()} not configured for this organization")
    return config


def _extract_org_from_relay(relay_state: str) -> Optional[int]:
    """
    Decode org_id from RelayState.
    We encode it as "org=<id>&next=..." when initiating the AuthnRequest.
    """
    if not relay_state:
        return None
    from urllib.parse import parse_qs
    try:
        params = parse_qs(relay_state)
        val    = params.get("org", [None])[0]
        return int(val) if val else None
    except (ValueError, TypeError):
        return None


def _user_out(user: User) -> dict:
    return {
        "id":              user.id,
        "name":            user.name,
        "email":           user.email,
        "role":            user.role,
        "organization_id": user.organization_id,
    }
