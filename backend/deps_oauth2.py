"""
OAuth2 dependency injectors for FastAPI route handlers.

Usage in routers:

    from deps_oauth2 import require_scope, get_oauth2_principal, OAuthPrincipal

    @router.get("/patients")
    def list_patients(
        principal: OAuthPrincipal = Depends(require_scope("patients:read")),
        db: Session = Depends(get_db),
    ):
        ...

The injectors support both:
  1. JWT Bearer access tokens  (OAuth2 flows)
  2. Scoped API keys           (oc_live_* / oc_test_*)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from database import get_db
from models.oauth2 import OAuthAPIKey, OAuthToken
from models.organization import User
from services.oauth2_service import verify_access_token, verify_api_key

_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Principal — unified identity (user+scopes OR machine+scopes)
# ---------------------------------------------------------------------------

@dataclass
class OAuthPrincipal:
    """Represents the authenticated caller of an OAuth2-protected endpoint."""
    sub: str                           # "123" (user_id) or "client:oc_abc..." (machine)
    scopes: List[str] = field(default_factory=list)
    organization_id: Optional[int] = None
    user_id: Optional[int] = None
    client_id: Optional[str] = None
    is_api_key: bool = False
    jti: Optional[str] = None

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes

    def require_scope(self, scope: str) -> None:
        if not self.has_scope(scope):
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "insufficient_scope",
                    "error_description": f"Required scope: {scope}",
                    "required_scope": scope,
                },
            )


# ---------------------------------------------------------------------------
# Core dependency: resolve Bearer token → OAuthPrincipal
# ---------------------------------------------------------------------------

def get_oauth2_principal(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> OAuthPrincipal:
    """
    Resolve an OAuth2 access token or API key to an OAuthPrincipal.
    Raises HTTP 401 if no valid credential is supplied.
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
            detail={"error": "invalid_token", "error_description": "Bearer token required"},
        )

    token = credentials.credentials

    # --- API Key path (prefix detection is O(1)) ---
    if token.startswith("oc_live_") or token.startswith("oc_test_"):
        api_key = verify_api_key(db, token)
        if not api_key:
            raise HTTPException(
                status_code=401,
                detail={"error": "invalid_token", "error_description": "API key invalid or revoked"},
            )
        return OAuthPrincipal(
            sub=f"apikey:{api_key.key_prefix}",
            scopes=api_key.scopes or [],
            organization_id=api_key.organization_id,
            user_id=api_key.user_id,
            client_id=api_key.client.client_id if api_key.client else None,
            is_api_key=True,
        )

    # --- JWT access token path ---
    try:
        payload = verify_access_token(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
            detail={"error": "invalid_token", "error_description": str(exc)},
        )

    jti = payload.get("jti")

    # Check DB revocation (introspection check)
    if jti:
        db_token = db.query(OAuthToken).filter(OAuthToken.jti == jti).first()
        if db_token and db_token.revoked:
            raise HTTPException(
                status_code=401,
                detail={"error": "invalid_token", "error_description": "Token revoked"},
            )

    scopes_raw = payload.get("scope", "")
    scopes = scopes_raw.split() if scopes_raw else []

    sub = payload.get("sub", "")
    user_id: Optional[int] = None
    if sub and not sub.startswith("client:"):
        try:
            user_id = int(sub)
        except ValueError:
            pass

    return OAuthPrincipal(
        sub=sub,
        scopes=scopes,
        organization_id=payload.get("org_id"),
        user_id=user_id,
        client_id=payload.get("client_id"),
        is_api_key=False,
        jti=jti,
    )


# ---------------------------------------------------------------------------
# Scope-checking dependency factories
# ---------------------------------------------------------------------------

def require_scope(*required_scopes: str):
    """
    Returns a FastAPI dependency that enforces one or more scopes.
    The principal must have ALL listed scopes.

    Example:
        Depends(require_scope("patients:read"))
        Depends(require_scope("documents:read", "documents:write"))
    """

    def _dep(principal: OAuthPrincipal = Depends(get_oauth2_principal)) -> OAuthPrincipal:
        for scope in required_scopes:
            principal.require_scope(scope)
        return principal

    return _dep


def require_any_scope(*candidate_scopes: str):
    """
    Returns a FastAPI dependency that passes if the principal has ANY of the listed scopes.

    Example:
        Depends(require_any_scope("admin:full", "patients:write"))
    """

    def _dep(principal: OAuthPrincipal = Depends(get_oauth2_principal)) -> OAuthPrincipal:
        if not any(principal.has_scope(s) for s in candidate_scopes):
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "insufficient_scope",
                    "error_description": f"One of these scopes required: {', '.join(candidate_scopes)}",
                },
            )
        return principal

    return _dep


# ---------------------------------------------------------------------------
# Optional: also resolve User from principal (for user-context operations)
# ---------------------------------------------------------------------------

def get_user_from_principal(
    principal: OAuthPrincipal = Depends(get_oauth2_principal),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolve principal to a User record.
    Fails with 403 for machine-to-machine tokens (no user context).
    """
    if principal.user_id is None:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "forbidden",
                "error_description": "This endpoint requires a user-delegated token, not client_credentials.",
            },
        )
    user = db.query(User).filter(User.id == principal.user_id, User.active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail={"error": "invalid_token", "error_description": "User not found"})
    return user
