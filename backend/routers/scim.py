"""
SCIM 2.0 Router — OrthoClinic Sprint 8

RFC 7644 (SCIM Protocol) + RFC 7643 (SCIM Schema)

Base path: /scim/v2/

Endpoints:
  GET  /scim/v2/ServiceProviderConfig   — capabilities
  GET  /scim/v2/Schemas                 — schema discovery
  GET  /scim/v2/ResourceTypes           — resource types

  GET  /scim/v2/Users                   — list users (filter support)
  POST /scim/v2/Users                   — create user
  GET  /scim/v2/Users/{id}             — get user
  PUT  /scim/v2/Users/{id}             — full replace
  PATCH /scim/v2/Users/{id}            — partial update (active, name, email)
  DELETE /scim/v2/Users/{id}           — deactivate

  GET  /scim/v2/Groups                  — list groups (mapped from roles)
  GET  /scim/v2/Groups/{id}            — get group

SCIM Token Management (admin):
  POST /scim/v2/token                   — issue a SCIM bearer token
  GET  /scim/v2/tokens                  — list active tokens
  DELETE /scim/v2/token/{token_id}      — revoke token

Authentication: Bearer token (SCIMToken table).
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_admin
from models.organization import User
from models.sso import SCIMToken, SSOConfiguration, SCIMSyncLog
from services import scim_service

logger = logging.getLogger(__name__)

# SCIM uses a separate bearer token, NOT the user JWT
scim_router = APIRouter(prefix="/scim/v2", tags=["SCIM 2.0"])

SCIM_CONTENT_TYPE = "application/scim+json"


# ============================================================================
# SCIM Token auth dependency
# ============================================================================

def _get_scim_token_org(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> tuple[int, SCIMToken]:
    """Validate SCIM bearer token; return (org_id, token_row)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "SCIM: Bearer token required",
                            headers={"WWW-Authenticate": "Bearer"})
    raw_token = authorization[7:]
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    token = db.query(SCIMToken).filter(
        SCIMToken.token_hash == token_hash,
        SCIMToken.active     == True,
    ).first()
    if not token:
        raise HTTPException(401, "SCIM: Invalid or revoked token")
    if token.expires_at and token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(401, "SCIM: Token expired")

    token.last_used_at = datetime.now(timezone.utc)
    db.commit()
    return token.organization_id, token


# ── Helpers ───────────────────────────────────────────────────────────────────

def _scim_response(data: dict, status: int = 200) -> JSONResponse:
    return JSONResponse(content=data, status_code=status,
                        media_type=SCIM_CONTENT_TYPE)


def _scim_error(status: int, detail: str) -> JSONResponse:
    return JSONResponse(
        content={
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:Error"],
            "status":  str(status),
            "detail":  detail,
        },
        status_code=status,
        media_type=SCIM_CONTENT_TYPE,
    )


# ============================================================================
# Discovery endpoints (no auth required)
# ============================================================================

@scim_router.get("/ServiceProviderConfig")
def service_provider_config():
    return _scim_response({
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        "documentationUri": "https://docs.orthoclinic.com.br/scim",
        "patch":     {"supported": True},
        "bulk":      {"supported": False, "maxOperations": 0, "maxPayloadSize": 0},
        "filter":    {"supported": True, "maxResults": 200},
        "changePassword": {"supported": False},
        "sort":      {"supported": False},
        "etag":      {"supported": False},
        "authenticationSchemes": [{
            "type":        "oauthbearertoken",
            "name":        "SCIM Bearer Token",
            "description": "OrthoClinic SCIM access token issued via admin panel",
        }],
        "meta": {
            "resourceType": "ServiceProviderConfig",
            "location":     "/scim/v2/ServiceProviderConfig",
        },
    })


@scim_router.get("/Schemas")
def scim_schemas():
    return _scim_response({
        "schemas":      ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": 2,
        "Resources": [
            {"id": "urn:ietf:params:scim:schemas:core:2.0:User",  "name": "User"},
            {"id": "urn:ietf:params:scim:schemas:core:2.0:Group", "name": "Group"},
        ],
    })


@scim_router.get("/ResourceTypes")
def scim_resource_types():
    return _scim_response({
        "schemas":      ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": 2,
        "Resources": [
            {
                "schemas":    ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
                "id":         "User",
                "name":       "User",
                "endpoint":   "/Users",
                "schema":     "urn:ietf:params:scim:schemas:core:2.0:User",
                "meta":       {"location": "/scim/v2/ResourceTypes/User", "resourceType": "ResourceType"},
            },
            {
                "schemas":    ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
                "id":         "Group",
                "name":       "Group",
                "endpoint":   "/Groups",
                "schema":     "urn:ietf:params:scim:schemas:core:2.0:Group",
                "meta":       {"location": "/scim/v2/ResourceTypes/Group", "resourceType": "ResourceType"},
            },
        ],
    })


# ============================================================================
# Users
# ============================================================================

@scim_router.get("/Users")
def list_users(
    filter:      Optional[str] = Query(None, alias="filter"),
    startIndex:  int           = Query(1, ge=1),
    count:       int           = Query(100, ge=1, le=200),
    auth: tuple                = Depends(_get_scim_token_org),
    db: Session                = Depends(get_db),
):
    org_id, _ = auth
    result = scim_service.scim_list_users(org_id, db, filter, startIndex, count)
    return _scim_response(result)


@scim_router.post("/Users")
def create_user(
    payload: dict = Body(...),
    auth: tuple   = Depends(_get_scim_token_org),
    db: Session   = Depends(get_db),
):
    org_id, token = auth
    config = db.query(SSOConfiguration).filter(
        SSOConfiguration.id == token.sso_config_id
    ).first()
    if not config:
        return _scim_error(500, "SCIM token not associated with an SSO config")

    result, http_status = scim_service.scim_create_user(payload, org_id, config, db)
    return _scim_response(result, http_status)


@scim_router.get("/Users/{user_id}")
def get_user(
    user_id: int,
    auth: tuple  = Depends(_get_scim_token_org),
    db: Session  = Depends(get_db),
):
    org_id, _ = auth
    try:
        result = scim_service.scim_get_user(user_id, org_id, db)
    except scim_service._SCIMNotFound as exc:
        return _scim_error(404, str(exc))
    return _scim_response(result)


@scim_router.put("/Users/{user_id}")
def replace_user(
    user_id: int,
    payload: dict = Body(...),
    auth: tuple   = Depends(_get_scim_token_org),
    db: Session   = Depends(get_db),
):
    org_id, _ = auth
    try:
        result = scim_service.scim_update_user(user_id, payload, org_id, db)
    except scim_service._SCIMNotFound as exc:
        return _scim_error(404, str(exc))
    return _scim_response(result)


@scim_router.patch("/Users/{user_id}")
def patch_user(
    user_id: int,
    payload: dict = Body(...),
    auth: tuple   = Depends(_get_scim_token_org),
    db: Session   = Depends(get_db),
):
    org_id, _ = auth
    operations = payload.get("Operations") or []
    try:
        result = scim_service.scim_patch_user(user_id, operations, org_id, db)
    except scim_service._SCIMNotFound as exc:
        return _scim_error(404, str(exc))
    return _scim_response(result)


@scim_router.delete("/Users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    auth: tuple  = Depends(_get_scim_token_org),
    db: Session  = Depends(get_db),
):
    org_id, _ = auth
    try:
        scim_service.scim_delete_user(user_id, org_id, db)
    except scim_service._SCIMNotFound as exc:
        return _scim_error(404, str(exc))


# ============================================================================
# Groups (read-only — mapped from OrthoClinic roles)
# ============================================================================

@scim_router.get("/Groups")
def list_groups(
    auth: tuple  = Depends(_get_scim_token_org),
    db: Session  = Depends(get_db),
):
    org_id, _ = auth
    result = scim_service.scim_list_groups(org_id, db)
    return _scim_response(result)


@scim_router.get("/Groups/{group_id}")
def get_group(
    group_id: str,
    auth: tuple  = Depends(_get_scim_token_org),
    db: Session  = Depends(get_db),
):
    org_id, _ = auth
    result = scim_service.scim_list_groups(org_id, db)
    for g in result["Resources"]:
        if g["id"] == group_id:
            return _scim_response(g)
    return _scim_error(404, f"Group {group_id!r} not found")


# ============================================================================
# SCIM Token Management (admin-only, uses regular JWT auth)
# ============================================================================

scim_admin_router = APIRouter(prefix="/scim/admin", tags=["SCIM Admin"])


class SCIMTokenCreateIn(BaseModel):
    sso_config_id: int
    description:   Optional[str] = None


@scim_admin_router.post("/token", status_code=201)
def issue_scim_token(
    data: SCIMTokenCreateIn,
    current_user: User = Depends(require_admin),
    db: Session        = Depends(get_db),
):
    config = db.query(SSOConfiguration).filter(
        SSOConfiguration.id             == data.sso_config_id,
        SSOConfiguration.organization_id == current_user.organization_id,
    ).first()
    if not config:
        raise HTTPException(404, "SSO configuration not found")

    raw_token  = f"scim_{secrets.token_urlsafe(40)}"
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    prefix     = raw_token[:12]

    token = SCIMToken(
        sso_config_id   = config.id,
        organization_id = current_user.organization_id,
        token_hash      = token_hash,
        token_prefix    = prefix,
        description     = data.description,
        active          = True,
    )
    db.add(token)
    db.commit()

    return {
        "token":       raw_token,  # only shown once
        "prefix":      prefix,
        "id":          token.id,
        "warning":     "Store this token securely — it will not be shown again.",
        "scim_base_url": "/scim/v2/",
    }


@scim_admin_router.get("/tokens")
def list_scim_tokens(
    current_user: User = Depends(require_admin),
    db: Session        = Depends(get_db),
):
    tokens = db.query(SCIMToken).filter(
        SCIMToken.organization_id == current_user.organization_id,
        SCIMToken.active          == True,
    ).all()
    return [
        {
            "id":           t.id,
            "prefix":       t.token_prefix,
            "description":  t.description,
            "created_at":   t.created_at.isoformat() if t.created_at else None,
            "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
        }
        for t in tokens
    ]


@scim_admin_router.delete("/token/{token_id}", status_code=204)
def revoke_scim_token(
    token_id: int,
    current_user: User = Depends(require_admin),
    db: Session        = Depends(get_db),
):
    token = db.query(SCIMToken).filter(
        SCIMToken.id             == token_id,
        SCIMToken.organization_id == current_user.organization_id,
    ).first()
    if not token:
        raise HTTPException(404, "Token not found")
    token.active = False
    db.commit()


@scim_admin_router.get("/sync-log")
def scim_sync_log(
    limit:        int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_admin),
    db: Session        = Depends(get_db),
):
    logs = db.query(SCIMSyncLog).filter(
        SCIMSyncLog.organization_id == current_user.organization_id
    ).order_by(SCIMSyncLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id":              l.id,
            "operation":       l.operation,
            "resource_type":   l.scim_resource_type,
            "external_id":     l.scim_external_id,
            "user_id":         l.user_id,
            "status":          l.status,
            "error_message":   l.error_message,
            "payload_summary": l.payload_summary,
            "created_at":      l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
