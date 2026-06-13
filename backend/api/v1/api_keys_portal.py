"""
Developer portal endpoints for managing API keys.

GET    /api/v1/api-keys                — list keys for current credential
POST   /api/v1/api-keys                — create a new API key
DELETE /api/v1/api-keys/{id}           — revoke a key
POST   /api/v1/api-keys/{id}/rotate    — rotate (generate new, grace-expire old)

These endpoints themselves require an authenticated session (JWT or existing
API key with the `api_keys:manage` scope, used only by the developer portal).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from api.v1.auth import APIKeyService, AuthContext, require_scope
from api.v1.errors import err_not_found, err_forbidden
from api.v1.schemas import APIKeyCreate, APIKeyOut, APIKeyRotateOut
from database import get_db
from models.oauth2 import OAuthAPIKey

router = APIRouter(prefix="/api/v1/api-keys", tags=["Public API — API Key Portal"])


def _row_to_out(row: OAuthAPIKey, plaintext: Optional[str] = None) -> APIKeyOut:
    return APIKeyOut(
        id=row.id,
        name=row.name,
        description=row.description,
        key_prefix=row.key_prefix,
        scopes=row.scopes or [],
        environment=row.environment,
        created_at=row.created_at,
        last_used_at=row.last_used_at,
        expires_at=row.expires_at,
        revoked=row.revoked,
        plaintext_key=plaintext,
    )


def _ownership_filter(ctx: AuthContext, db: Session):
    q = db.query(OAuthAPIKey)
    if ctx.api_key_id:
        # Same org as the calling key
        caller = db.query(OAuthAPIKey).filter(OAuthAPIKey.id == ctx.api_key_id).first()
        if caller and caller.organization_id:
            return q.filter(OAuthAPIKey.organization_id == caller.organization_id)
        return q.filter(OAuthAPIKey.id == ctx.api_key_id)
    if ctx.oauth_client_id:
        return q.filter(OAuthAPIKey.client_id == ctx.oauth_client_id)
    return q.filter(OAuthAPIKey.id == -1)


# ---------------------------------------------------------------------------
# GET /api/v1/api-keys
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=List[APIKeyOut],
    summary="List API keys",
    description="List all API keys owned by the current credential. Requires scope `api_keys:manage`.",
)
async def list_api_keys(
    request: Request,
    ctx:     AuthContext = Depends(require_scope("api_keys:manage")),
    db:      Session     = Depends(get_db),
) -> List[APIKeyOut]:
    rows = _ownership_filter(ctx, db).filter(OAuthAPIKey.revoked.is_(False)).all()
    return [_row_to_out(r) for r in rows]


# ---------------------------------------------------------------------------
# POST /api/v1/api-keys
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=APIKeyOut,
    status_code=201,
    summary="Create API key",
    description=(
        "Generate a new API key. The `plaintext_key` field in the response is shown "
        "EXACTLY ONCE. Store it securely — it cannot be retrieved again. "
        "Requires scope `api_keys:manage`."
    ),
)
async def create_api_key(
    request: Request,
    body:    APIKeyCreate,
    ctx:     AuthContext  = Depends(require_scope("api_keys:manage")),
    db:      Session      = Depends(get_db),
) -> APIKeyOut:

    # Resolve org / client from calling credential
    org_id    = None
    client_id = ctx.oauth_client_id
    user_id   = ctx.user_id

    if ctx.api_key_id:
        caller = db.query(OAuthAPIKey).filter(OAuthAPIKey.id == ctx.api_key_id).first()
        if caller:
            org_id    = caller.organization_id
            client_id = caller.client_id
            user_id   = caller.user_id

    plaintext, row = APIKeyService.create(
        db=db,
        name=body.name,
        description=body.description or "",
        scopes=body.scopes,
        environment=body.environment,
        organization_id=org_id,
        user_id=user_id,
        client_id=client_id,
        expires_days=body.expires_days,
    )

    return _row_to_out(row, plaintext=plaintext)


# ---------------------------------------------------------------------------
# DELETE /api/v1/api-keys/{key_id}
# ---------------------------------------------------------------------------

@router.delete(
    "/{key_id}",
    status_code=200,
    summary="Revoke API key",
    description="Immediately revoke an API key. Requires scope `api_keys:manage`.",
)
async def revoke_api_key(
    key_id:  int,
    request: Request,
    ctx:     AuthContext = Depends(require_scope("api_keys:manage")),
    db:      Session     = Depends(get_db),
) -> None:

    row = _ownership_filter(ctx, db).filter(OAuthAPIKey.id == key_id).first()
    if not row:
        return err_not_found(request, "APIKey", key_id)

    APIKeyService.revoke(key_id, db)


# ---------------------------------------------------------------------------
# POST /api/v1/api-keys/{key_id}/rotate
# ---------------------------------------------------------------------------

@router.post(
    "/{key_id}/rotate",
    response_model=APIKeyRotateOut,
    summary="Rotate API key",
    description=(
        "Rotate an API key: generate a new one with identical settings. "
        "The old key remains valid for 24 hours (grace period) to allow "
        "seamless credential rotation in your systems. "
        "Requires scope `api_keys:manage`."
    ),
)
async def rotate_api_key(
    key_id:  int,
    request: Request,
    ctx:     AuthContext = Depends(require_scope("api_keys:manage")),
    db:      Session     = Depends(get_db),
) -> APIKeyRotateOut:

    row = _ownership_filter(ctx, db).filter(OAuthAPIKey.id == key_id).first()
    if not row:
        return err_not_found(request, "APIKey", key_id)

    try:
        new_plaintext, new_row = APIKeyService.rotate(key_id, db)
    except ValueError as e:
        from api.v1.errors import err_conflict
        return err_conflict(request, str(e))

    # Reload old row after rotation updated its expires_at
    db.refresh(row)

    return APIKeyRotateOut(
        old_key_id=key_id,
        new_key=_row_to_out(new_row, plaintext=new_plaintext),
        grace_expires_at=row.expires_at,
        message=(
            f"New API key created. The old key (id={key_id}) remains valid until "
            f"{row.expires_at.isoformat()} (24-hour grace period). "
            "Update your systems before the grace period expires."
        ),
    )
