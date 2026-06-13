"""
OAuth2 Authorization Server Router — OrthoClinic Sprint 7

Endpoints:
  POST  /oauth/token                    — all grant types
  GET   /oauth/authorize                — Authorization Code consent page (redirect)
  POST  /oauth/authorize                — consent form submit
  POST  /oauth/device/authorization     — Device Authorization (RFC 8628) initiation
  POST  /oauth/device/authorize         — user approves a device_code
  POST  /oauth/introspect               — RFC 7662 token introspection
  POST  /oauth/revoke                   — RFC 7009 token revocation
  GET   /.well-known/jwks.json          — JWKS (RS256 public key)
  GET   /.well-known/openid-configuration — Discovery document

Developer Portal:
  GET   /oauth/clients                  — list apps (current user)
  POST  /oauth/clients                  — register app
  GET   /oauth/clients/{client_id}      — get app details
  PATCH /oauth/clients/{client_id}      — update app
  DELETE /oauth/clients/{client_id}     — delete app
  POST  /oauth/clients/{client_id}/secret — rotate secret

Admin:
  GET   /oauth/admin/clients            — list all pending/approved apps
  PATCH /oauth/admin/clients/{client_id}/review — approve/reject

API Keys:
  GET   /oauth/api-keys                 — list user's API keys
  POST  /oauth/api-keys                 — create API key
  DELETE /oauth/api-keys/{key_id}       — revoke API key

Scopes:
  GET   /oauth/scopes                   — canonical scope catalog
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials, HTTPBearer
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_admin, require_superadmin
from models.oauth2 import (
    OAuthAPIKey,
    OAuthAuthCode,
    OAuthClient,
    OAuthDeviceCode,
    OAuthScope,
    OAuthToken,
)
from models.organization import User
from services.oauth2_service import (
    CANONICAL_SCOPES,
    ISSUER,
    SENSITIVE_SCOPES,
    authorize_device_code,
    client_credentials_grant,
    create_api_key,
    create_auth_code,
    create_device_authorization,
    exchange_auth_code,
    get_jwks,
    introspect_token,
    poll_device_code,
    refresh_token_grant,
    revoke_token,
    validate_scopes,
    verify_api_key,
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

router = APIRouter(tags=["OAuth2"])
well_known_router = APIRouter(tags=["OAuth2 Discovery"])

_basic_auth = HTTPBasic(auto_error=False)
_bearer_auth = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class ClientRegisterIn(BaseModel):
    name: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = None
    logo_url: Optional[str] = None
    website_url: Optional[str] = None
    privacy_url: Optional[str] = None
    tos_url: Optional[str] = None
    developer_email: str
    client_type: str = "confidential"     # confidential | public
    grant_types: List[str] = ["authorization_code", "refresh_token"]
    redirect_uris: List[str] = []
    allowed_scopes: List[str] = []


class ClientOut(BaseModel):
    client_id: str
    name: str
    description: Optional[str]
    client_type: str
    grant_types: List[str]
    redirect_uris: List[str]
    allowed_scopes: List[str]
    status: str
    created_at: datetime
    model_config = {"from_attributes": True}


class ClientUpdateIn(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    website_url: Optional[str] = None
    redirect_uris: Optional[List[str]] = None


class ReviewIn(BaseModel):
    action: str          # "approved" | "rejected" | "suspended"
    notes: Optional[str] = None
    allowed_scopes: Optional[List[str]] = None


class APIKeyCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    scopes: List[str]
    description: Optional[str] = None
    environment: str = "live"
    expires_in_days: Optional[int] = None
    rate_limit_rpm: Optional[int] = None


class APIKeyOut(BaseModel):
    id: int
    key_prefix: str
    name: str
    scopes: List[str]
    environment: str
    created_at: datetime
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    revoked: bool
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_client_from_basic_or_body(
    credentials: Optional[HTTPBasicCredentials],
    client_id_form: Optional[str],
    client_secret_form: Optional[str],
    db: Session,
) -> OAuthClient:
    """
    Authenticate client via HTTP Basic auth OR client_id/client_secret form params.
    Public clients supply client_id only (no secret).
    """
    if credentials:
        cid = credentials.username
        csecret = credentials.password
    elif client_id_form:
        cid = client_id_form
        csecret = client_secret_form
    else:
        raise HTTPException(401, detail={"error": "invalid_client", "error_description": "Client credentials required"})

    client = db.query(OAuthClient).filter(OAuthClient.client_id == cid, OAuthClient.active == True).first()
    if not client:
        raise HTTPException(401, detail={"error": "invalid_client", "error_description": "Client not found"})
    if client.status != "approved":
        raise HTTPException(403, detail={"error": "invalid_client", "error_description": "Client not approved"})

    if client.client_type == "confidential":
        if not csecret:
            raise HTTPException(401, detail={"error": "invalid_client", "error_description": "client_secret required"})
        if not client.client_secret or not secrets.compare_digest(client.client_secret, csecret):
            raise HTTPException(401, detail={"error": "invalid_client", "error_description": "Invalid client_secret"})

    return client


def _validate_redirect_uri(client: OAuthClient, redirect_uri: str) -> None:
    """
    Exact match required.
    Exception: localhost URIs allow any port for developer convenience.
    Wildcards are never allowed for non-localhost URIs.
    """
    if redirect_uri in client.redirect_uris:
        return
    # localhost flexibility
    import re
    localhost_pattern = re.compile(r"^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?(/.*)?$")
    registered_local = [u for u in client.redirect_uris if localhost_pattern.match(u)]
    if registered_local and localhost_pattern.match(redirect_uri):
        return
    raise HTTPException(400, detail={"error": "invalid_request", "error_description": "redirect_uri not registered"})


def _build_token_response(
    access_token: str,
    refresh_token: Optional[str],
    scopes: List[str],
    expires_in: int,
) -> dict:
    resp = {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": expires_in,
        "scope": " ".join(scopes),
    }
    if refresh_token:
        resp["refresh_token"] = refresh_token
    return resp


# ---------------------------------------------------------------------------
# CSRF state token (for authorization endpoint)
# ---------------------------------------------------------------------------

_CSRF_SECRET = os.getenv("OAUTH2_CSRF_SECRET", secrets.token_hex(32))


def _csrf_token(session_state: str) -> str:
    return hmac.new(_CSRF_SECRET.encode(), session_state.encode(), hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# /.well-known endpoints
# ---------------------------------------------------------------------------

@well_known_router.get("/.well-known/jwks.json", include_in_schema=False)
def jwks():
    return JSONResponse(get_jwks())


@well_known_router.get("/.well-known/openid-configuration", include_in_schema=False)
def openid_configuration():
    return {
        "issuer": ISSUER,
        "authorization_endpoint": f"{ISSUER}/oauth/authorize",
        "token_endpoint": f"{ISSUER}/oauth/token",
        "introspection_endpoint": f"{ISSUER}/oauth/introspect",
        "revocation_endpoint": f"{ISSUER}/oauth/revoke",
        "jwks_uri": f"{ISSUER}/.well-known/jwks.json",
        "device_authorization_endpoint": f"{ISSUER}/oauth/device/authorization",
        "grant_types_supported": [
            "authorization_code",
            "client_credentials",
            "refresh_token",
            "urn:ietf:params:oauth:grant-type:device_code",
        ],
        "response_types_supported": ["code"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
        "scopes_supported": sorted(CANONICAL_SCOPES),
        "claims_supported": ["sub", "iss", "aud", "exp", "iat", "jti", "client_id", "scope", "org_id"],
    }


# ---------------------------------------------------------------------------
# /oauth/token — Token Endpoint
# ---------------------------------------------------------------------------

@router.post("/oauth/token")
async def token_endpoint(
    request: Request,
    grant_type: str = Form(...),
    code: Optional[str] = Form(None),
    redirect_uri: Optional[str] = Form(None),
    code_verifier: Optional[str] = Form(None),
    refresh_token: Optional[str] = Form(None),
    scope: Optional[str] = Form(None),
    device_code: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    client_secret: Optional[str] = Form(None),
    credentials: Optional[HTTPBasicCredentials] = Depends(_basic_auth),
    db: Session = Depends(get_db),
):
    client = _get_client_from_basic_or_body(credentials, client_id, client_secret, db)

    if grant_type not in client.grant_types:
        raise HTTPException(400, detail={"error": "unsupported_grant_type"})

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    scopes_requested = scope.split() if scope else []

    try:
        if grant_type == "authorization_code":
            if not code or not redirect_uri:
                raise ValueError("invalid_request: code and redirect_uri required")
            access_token, rt, db_token = exchange_auth_code(
                db,
                code=code,
                client=client,
                redirect_uri=redirect_uri,
                code_verifier=code_verifier,
                ip_address=ip,
                user_agent=ua,
            )
            return _build_token_response(access_token, rt, db_token.scopes, client.access_token_ttl_seconds)

        elif grant_type == "client_credentials":
            access_token, db_token = client_credentials_grant(
                db,
                client=client,
                requested_scopes=scopes_requested,
                ip_address=ip,
                user_agent=ua,
            )
            return _build_token_response(access_token, None, db_token.scopes, client.access_token_ttl_seconds)

        elif grant_type == "refresh_token":
            if not refresh_token:
                raise ValueError("invalid_request: refresh_token required")
            access_token, new_rt, db_token = refresh_token_grant(
                db,
                client=client,
                refresh_token_value=refresh_token,
                requested_scopes=scopes_requested or None,
                ip_address=ip,
                user_agent=ua,
            )
            return _build_token_response(access_token, new_rt, db_token.scopes, client.access_token_ttl_seconds)

        elif grant_type == "urn:ietf:params:oauth:grant-type:device_code":
            if not device_code:
                raise ValueError("invalid_request: device_code required")
            result = poll_device_code(
                db,
                client=client,
                device_code=device_code,
                ip_address=ip,
                user_agent=ua,
            )
            if result is None:
                raise HTTPException(400, detail={"error": "authorization_pending"})
            access_token, rt, db_token = result
            return _build_token_response(access_token, rt, db_token.scopes, client.access_token_ttl_seconds)

    except ValueError as e:
        err_str = str(e)
        # Parse "error_code: description" convention from service layer
        if ": " in err_str:
            error_code, desc = err_str.split(": ", 1)
        else:
            error_code, desc = "invalid_request", err_str
        raise HTTPException(400, detail={"error": error_code, "error_description": desc})

    raise HTTPException(400, detail={"error": "unsupported_grant_type"})


# ---------------------------------------------------------------------------
# /oauth/authorize — Authorization Endpoint (GET = show consent, POST = submit)
# ---------------------------------------------------------------------------

_CONSENT_HTML = """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OrthoClinic — Autorizar Aplicativo</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 24px; }}
  .card {{ border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; }}
  h2 {{ margin-top: 0; }}
  .scope-list {{ background: #f8fafc; border-radius: 8px; padding: 16px; list-style: none; }}
  .scope-list li {{ padding: 4px 0; font-size: 14px; }}
  .btn {{ display: inline-block; padding: 10px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 15px; }}
  .btn-allow {{ background: #3b82f6; color: white; }}
  .btn-deny  {{ background: #ef4444; color: white; margin-left: 12px; }}
</style>
</head>
<body>
<div class="card">
  <h2>Autorizar <strong>{app_name}</strong></h2>
  <p>Este aplicativo está solicitando acesso à sua conta OrthoClinic com as seguintes permissões:</p>
  <ul class="scope-list">
    {scope_items}
  </ul>
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id"     value="{client_id}">
    <input type="hidden" name="redirect_uri"  value="{redirect_uri}">
    <input type="hidden" name="scope"         value="{scope}">
    <input type="hidden" name="state"         value="{state}">
    <input type="hidden" name="code_challenge"        value="{code_challenge}">
    <input type="hidden" name="code_challenge_method" value="{code_challenge_method}">
    <input type="hidden" name="nonce"         value="{nonce}">
    <input type="hidden" name="_csrf"         value="{csrf}">
    <button class="btn btn-allow" name="decision" value="allow">Permitir acesso</button>
    <button class="btn btn-deny"  name="decision" value="deny">Negar</button>
  </form>
</div>
</body>
</html>
"""


@router.get("/oauth/authorize", response_class=HTMLResponse)
def authorize_get(
    response_type: str,
    client_id: str,
    redirect_uri: str,
    scope: str = "",
    state: Optional[str] = None,
    code_challenge: Optional[str] = None,
    code_challenge_method: Optional[str] = "S256",
    nonce: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if response_type != "code":
        raise HTTPException(400, detail={"error": "unsupported_response_type"})

    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id, OAuthClient.active == True).first()
    if not client or client.status != "approved":
        raise HTTPException(400, detail={"error": "invalid_client"})

    _validate_redirect_uri(client, redirect_uri)

    # PKCE required for public clients
    if client.client_type == "public" and not code_challenge:
        raise HTTPException(400, detail={"error": "invalid_request", "error_description": "PKCE required"})

    requested_scopes = scope.split() if scope else []
    granted_scopes = validate_scopes(requested_scopes, client.allowed_scopes)

    csrf = _csrf_token(state or "nostate")
    scope_items = "\n".join(f"<li>&#10003; {s}</li>" for s in granted_scopes)

    return _CONSENT_HTML.format(
        app_name=client.name,
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=" ".join(granted_scopes),
        state=state or "",
        code_challenge=code_challenge or "",
        code_challenge_method=code_challenge_method or "S256",
        nonce=nonce or "",
        csrf=csrf,
        scope_items=scope_items,
    )


@router.post("/oauth/authorize")
def authorize_post(
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    scope: str = Form(""),
    state: Optional[str] = Form(None),
    code_challenge: Optional[str] = Form(None),
    code_challenge_method: Optional[str] = Form("S256"),
    nonce: Optional[str] = Form(None),
    csrf: str = Form(..., alias="_csrf"),
    decision: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # CSRF check
    expected = _csrf_token(state or "nostate")
    if not hmac.compare_digest(expected, csrf):
        raise HTTPException(403, detail="CSRF token invalid")

    # User denied
    if decision != "allow":
        return RedirectResponse(
            f"{redirect_uri}?error=access_denied&state={state or ''}",
            status_code=302,
        )

    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id, OAuthClient.active == True).first()
    if not client or client.status != "approved":
        raise HTTPException(400, detail={"error": "invalid_client"})

    _validate_redirect_uri(client, redirect_uri)

    scopes = scope.split() if scope else []
    auth_code = create_auth_code(
        db,
        client=client,
        user=current_user,
        redirect_uri=redirect_uri,
        scopes=scopes,
        code_challenge=code_challenge or None,
        code_challenge_method=code_challenge_method or "S256",
        state=state,
        nonce=nonce,
    )

    location = f"{redirect_uri}?code={auth_code.code}"
    if state:
        location += f"&state={state}"
    return RedirectResponse(location, status_code=302)


# ---------------------------------------------------------------------------
# /oauth/device — Device Authorization (RFC 8628)
# ---------------------------------------------------------------------------

@router.post("/oauth/device/authorization")
def device_authorization(
    scope: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    client_secret: Optional[str] = Form(None),
    credentials: Optional[HTTPBasicCredentials] = Depends(_basic_auth),
    db: Session = Depends(get_db),
):
    client = _get_client_from_basic_or_body(credentials, client_id, client_secret, db)

    if "urn:ietf:params:oauth:grant-type:device_code" not in client.grant_types:
        raise HTTPException(400, detail={"error": "unsupported_grant_type"})

    scopes_requested = scope.split() if scope else []
    try:
        entry = create_device_authorization(db, client=client, scopes=scopes_requested)
    except ValueError as e:
        raise HTTPException(400, detail={"error": "invalid_scope", "error_description": str(e)})

    return {
        "device_code": entry.device_code,
        "user_code": entry.user_code,
        "verification_uri": f"{ISSUER}/device",
        "verification_uri_complete": f"{ISSUER}/device?user_code={entry.user_code}",
        "expires_in": 1800,
        "interval": entry.interval_seconds,
    }


@router.post("/oauth/device/authorize")
def device_authorize_user(
    user_code: str = Form(...),
    decision: str = Form("allow"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """User-facing endpoint: approves or denies a device authorization request."""
    try:
        entry = db.query(OAuthDeviceCode).filter(OAuthDeviceCode.user_code == user_code).first()
        if not entry:
            raise HTTPException(404, detail="User code not found")

        if decision == "deny":
            entry.status = "denied"
            db.commit()
            return {"status": "denied"}

        authorize_device_code(db, user_code=user_code, user=current_user)
        return {"status": "authorized", "message": "Device authorized. You may close this page."}
    except ValueError as e:
        raise HTTPException(400, detail=str(e))


# ---------------------------------------------------------------------------
# /oauth/introspect — RFC 7662
# ---------------------------------------------------------------------------

@router.post("/oauth/introspect")
def introspect(
    token: str = Form(...),
    client_id: Optional[str] = Form(None),
    client_secret: Optional[str] = Form(None),
    credentials: Optional[HTTPBasicCredentials] = Depends(_basic_auth),
    db: Session = Depends(get_db),
):
    client = _get_client_from_basic_or_body(credentials, client_id, client_secret, db)
    return introspect_token(db, token=token, client=client)


# ---------------------------------------------------------------------------
# /oauth/revoke — RFC 7009
# ---------------------------------------------------------------------------

@router.post("/oauth/revoke", status_code=200)
def revoke(
    token: str = Form(...),
    token_type_hint: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    client_secret: Optional[str] = Form(None),
    credentials: Optional[HTTPBasicCredentials] = Depends(_basic_auth),
    db: Session = Depends(get_db),
):
    client = _get_client_from_basic_or_body(credentials, client_id, client_secret, db)
    revoke_token(db, token=token, client=client)
    return {}   # RFC 7009: always 200 even if token unknown


# ---------------------------------------------------------------------------
# Developer Portal — Client Management
# ---------------------------------------------------------------------------

@router.get("/oauth/clients", response_model=List[ClientOut])
def list_my_clients(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(OAuthClient)
        .filter(OAuthClient.developer_email == current_user.email, OAuthClient.active == True)
        .all()
    )


@router.post("/oauth/clients", response_model=ClientOut, status_code=201)
def register_client(
    data: ClientRegisterIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import uuid as _uuid

    # Validate redirect URIs
    for uri in data.redirect_uris:
        if "*" in uri and not uri.startswith("http://localhost"):
            raise HTTPException(400, detail="Wildcards in redirect_uri not allowed except for localhost")

    # Validate requested scopes
    unknown = set(data.allowed_scopes) - CANONICAL_SCOPES
    if unknown:
        raise HTTPException(400, detail=f"Unknown scopes: {sorted(unknown)}")

    requires_review = bool(set(data.allowed_scopes) & SENSITIVE_SCOPES)

    client_id_val = f"oc_{_uuid.uuid4().hex[:16]}"
    client_secret_val = None
    if data.client_type == "confidential":
        import secrets as _s
        client_secret_val = _s.token_urlsafe(40)

    client = OAuthClient(
        client_id=client_id_val,
        client_secret=client_secret_val,
        name=data.name,
        description=data.description,
        logo_url=data.logo_url,
        website_url=data.website_url,
        privacy_url=data.privacy_url,
        tos_url=data.tos_url,
        organization_id=current_user.organization_id,
        developer_email=current_user.email,
        client_type=data.client_type,
        grant_types=data.grant_types,
        redirect_uris=data.redirect_uris,
        allowed_scopes=data.allowed_scopes,
        status="pending" if requires_review else "approved",
        requires_review=requires_review,
        pkce_required=(data.client_type == "public"),
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    response_data = ClientOut.model_validate(client)
    # Include secret only at creation time
    result = response_data.model_dump()
    if client_secret_val:
        result["client_secret"] = client_secret_val
        result["_note"] = "Save client_secret — it will NOT be shown again."
    return JSONResponse(result, status_code=201)


@router.get("/oauth/clients/{client_id_str}", response_model=ClientOut)
def get_client(
    client_id_str: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id_str).first()
    if not client:
        raise HTTPException(404, "Client not found")
    if client.developer_email != current_user.email and current_user.role not in ("admin", "superadmin"):
        raise HTTPException(403, "Forbidden")
    return client


@router.patch("/oauth/clients/{client_id_str}", response_model=ClientOut)
def update_client(
    client_id_str: str,
    data: ClientUpdateIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id_str).first()
    if not client:
        raise HTTPException(404, "Client not found")
    if client.developer_email != current_user.email:
        raise HTTPException(403, "Forbidden")

    if data.name is not None:
        client.name = data.name
    if data.description is not None:
        client.description = data.description
    if data.logo_url is not None:
        client.logo_url = data.logo_url
    if data.website_url is not None:
        client.website_url = data.website_url
    if data.redirect_uris is not None:
        for uri in data.redirect_uris:
            if "*" in uri and not uri.startswith("http://localhost"):
                raise HTTPException(400, "Wildcards not allowed in redirect_uri")
        client.redirect_uris = data.redirect_uris

    db.commit()
    db.refresh(client)
    return client


@router.delete("/oauth/clients/{client_id_str}", status_code=204)
def delete_client(
    client_id_str: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id_str).first()
    if not client:
        raise HTTPException(404, "Client not found")
    if client.developer_email != current_user.email and current_user.role != "superadmin":
        raise HTTPException(403, "Forbidden")
    client.active = False
    db.commit()


@router.post("/oauth/clients/{client_id_str}/secret")
def rotate_secret(
    client_id_str: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import secrets as _s
    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id_str).first()
    if not client:
        raise HTTPException(404, "Client not found")
    if client.developer_email != current_user.email:
        raise HTTPException(403, "Forbidden")
    if client.client_type != "confidential":
        raise HTTPException(400, "Public clients do not have a client_secret")
    new_secret = _s.token_urlsafe(40)
    client.client_secret = new_secret
    db.commit()
    return {
        "client_id": client_id_str,
        "client_secret": new_secret,
        "_note": "Save this secret — it will NOT be shown again. Previous secret is immediately invalid.",
    }


# ---------------------------------------------------------------------------
# Admin — Review
# ---------------------------------------------------------------------------

@router.get("/oauth/admin/clients")
def admin_list_clients(
    status: Optional[str] = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(OAuthClient)
    if status:
        q = q.filter(OAuthClient.status == status)
    return q.order_by(OAuthClient.created_at.desc()).all()


@router.patch("/oauth/admin/clients/{client_id_str}/review")
def admin_review_client(
    client_id_str: str,
    data: ReviewIn,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id_str).first()
    if not client:
        raise HTTPException(404, "Client not found")
    if data.action not in ("approved", "rejected", "suspended"):
        raise HTTPException(400, "action must be approved|rejected|suspended")

    client.status = data.action
    client.reviewed_by = current_user.id
    client.reviewed_at = datetime.now(tz=timezone.utc)
    client.review_notes = data.notes

    if data.allowed_scopes is not None:
        unknown = set(data.allowed_scopes) - CANONICAL_SCOPES
        if unknown:
            raise HTTPException(400, f"Unknown scopes: {sorted(unknown)}")
        client.allowed_scopes = data.allowed_scopes

    db.commit()
    db.refresh(client)
    return {"status": client.status, "client_id": client.client_id}


# ---------------------------------------------------------------------------
# API Keys
# ---------------------------------------------------------------------------

@router.get("/oauth/api-keys", response_model=List[APIKeyOut])
def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(OAuthAPIKey)
        .filter(OAuthAPIKey.user_id == current_user.id, OAuthAPIKey.revoked == False)
        .order_by(OAuthAPIKey.created_at.desc())
        .all()
    )


@router.post("/oauth/api-keys", status_code=201)
def create_api_key_endpoint(
    data: APIKeyCreateIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    unknown = set(data.scopes) - CANONICAL_SCOPES
    if unknown:
        raise HTTPException(400, detail=f"Unknown scopes: {sorted(unknown)}")

    expires_at = None
    if data.expires_in_days:
        from datetime import timedelta
        expires_at = datetime.now(tz=timezone.utc) + timedelta(days=data.expires_in_days)

    raw_key, entry = create_api_key(
        db,
        user=current_user,
        organization_id=current_user.organization_id,
        name=data.name,
        scopes=data.scopes,
        description=data.description,
        environment=data.environment,
        expires_at=expires_at,
        rate_limit_rpm=data.rate_limit_rpm,
    )
    return {
        "id": entry.id,
        "key": raw_key,
        "key_prefix": entry.key_prefix,
        "scopes": entry.scopes,
        "environment": entry.environment,
        "_note": "Save this key — it will NOT be shown again.",
    }


@router.delete("/oauth/api-keys/{key_id}", status_code=204)
def revoke_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.query(OAuthAPIKey).filter(OAuthAPIKey.id == key_id).first()
    if not entry:
        raise HTTPException(404, "API key not found")
    if entry.user_id != current_user.id and current_user.role not in ("admin", "superadmin"):
        raise HTTPException(403, "Forbidden")
    entry.revoked = True
    entry.revoked_at = datetime.now(tz=timezone.utc)
    db.commit()


# ---------------------------------------------------------------------------
# Scope Catalog
# ---------------------------------------------------------------------------

@router.get("/oauth/scopes")
def list_scopes(db: Session = Depends(get_db)):
    return [
        {
            "name": s,
            "sensitive": s in SENSITIVE_SCOPES,
            "description": {
                "patients:read":      "Read patient demographics and medical history",
                "patients:write":     "Create and update patient records",
                "appointments:read":  "View appointments and schedules",
                "appointments:write": "Create, update and cancel appointments",
                "documents:read":     "Download medical documents and files",
                "documents:write":    "Upload and manage documents",
                "users:read":         "Read staff user profiles",
                "webhooks:manage":    "Create and manage webhook subscriptions",
                "org:read":           "Read organization settings",
                "org:write":          "Modify organization settings",
                "admin:full":         "Full administrative access (restricted)",
            }.get(s, ""),
        }
        for s in sorted(CANONICAL_SCOPES)
    ]
