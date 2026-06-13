"""
API Key + OAuth token authentication for /api/v1/* endpoints.

Authentication flow
-------------------
Every request to /api/v1/* must carry ONE of:

  a) Authorization: Bearer ok_live_<token>   — API key (raw)
  b) Authorization: Bearer <jwt>              — OAuth access token (RS256 JWT)

This module provides:

  - APIKeyService : generate / hash / validate / rotate API keys
  - Dependency    : resolve_api_credentials(request, db)
                    → populates request.state fields and returns AuthContext
  - require_scope : endpoint-level scope enforcer
"""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from api.v1.errors import err_auth, err_forbidden
from database import get_db
from models.oauth2 import OAuthAPIKey, OAuthToken
from models.organization import User

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_KEY_LIVE_PREFIX = "ok_live_"
API_KEY_TEST_PREFIX = "ok_test_"
API_KEY_BYTES       = 32   # 32 random bytes → 64 hex chars
GRACE_PERIOD_HOURS  = 24   # rotated keys remain valid for 24 h

SECRET_KEY  = os.getenv("SECRET_KEY", "dev-secret-change-in-production-32chars")
ALGORITHM   = "RS256"
FALLBACK_ALG = "HS256"  # used when RSA key not loaded (local dev)

ISSUER = os.getenv("OAUTH2_ISSUER", "https://api.orthoclinic.com.br")
KEY_DIR = os.getenv("OAUTH2_KEY_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "keys"))


# ---------------------------------------------------------------------------
# Auth context (passed through request.state and returned by dep)
# ---------------------------------------------------------------------------

class AuthContext:
    """Container for resolved authentication identity."""

    def __init__(
        self,
        *,
        api_key_id: Optional[int] = None,
        oauth_client_id: Optional[int] = None,
        user_id: Optional[int] = None,
        scopes: List[str],
        environment: str = "live",
        rate_limit_rpm: Optional[int] = None,
    ):
        self.api_key_id      = api_key_id
        self.oauth_client_id = oauth_client_id
        self.user_id         = user_id
        self.scopes          = scopes
        self.environment     = environment
        self.rate_limit_rpm  = rate_limit_rpm

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes or "admin" in self.scopes


# ---------------------------------------------------------------------------
# API Key Service
# ---------------------------------------------------------------------------

class APIKeyService:
    """
    Handles the full lifecycle of API keys.

    Key format:
      ok_live_<64 hex chars>   (production)
      ok_test_<64 hex chars>   (sandbox / test)

    Storage:
      Only SHA-256(key) is persisted. The plaintext is returned ONCE at
      creation time and never stored.
    """

    @staticmethod
    def generate(environment: str = "live") -> tuple[str, str]:
        """
        Generate a fresh API key.

        Returns:
            (plaintext_key, key_hash)
            plaintext_key is shown to the user exactly once.
        """
        raw   = secrets.token_bytes(API_KEY_BYTES)
        token = raw.hex()
        prefix = API_KEY_LIVE_PREFIX if environment == "live" else API_KEY_TEST_PREFIX
        plaintext = f"{prefix}{token}"
        key_hash = hashlib.sha256(plaintext.encode()).hexdigest()
        return plaintext, key_hash

    @staticmethod
    def hash_key(plaintext: str) -> str:
        return hashlib.sha256(plaintext.encode()).hexdigest()

    @staticmethod
    def extract_prefix(plaintext: str) -> str:
        """Return the ok_live_ or ok_test_ prefix."""
        for prefix in (API_KEY_LIVE_PREFIX, API_KEY_TEST_PREFIX):
            if plaintext.startswith(prefix):
                return prefix
        return ""

    @staticmethod
    def validate_format(key: str) -> bool:
        for prefix in (API_KEY_LIVE_PREFIX, API_KEY_TEST_PREFIX):
            if key.startswith(prefix):
                rest = key[len(prefix):]
                return len(rest) == API_KEY_BYTES * 2 and all(c in "0123456789abcdef" for c in rest)
        return False

    # ------------------------------------------------------------------
    # DB operations
    # ------------------------------------------------------------------

    @staticmethod
    def lookup(key: str, db: Session) -> Optional[OAuthAPIKey]:
        """
        Validate an API key against the DB.
        Returns the OAuthAPIKey row if valid, None otherwise.
        Fast path: single indexed query on key_hash.
        """
        if not APIKeyService.validate_format(key):
            return None
        key_hash = APIKeyService.hash_key(key)
        row = (
            db.query(OAuthAPIKey)
            .filter(
                OAuthAPIKey.key_hash == key_hash,
                OAuthAPIKey.revoked.is_(False),
            )
            .first()
        )
        if row is None:
            return None
        # Check expiry
        if row.expires_at and row.expires_at < datetime.now(timezone.utc):
            return None
        # Update last_used_at (non-blocking — ignore failure)
        try:
            row.last_used_at = datetime.now(timezone.utc)
            db.commit()
        except Exception:
            db.rollback()
        return row

    @staticmethod
    def create(
        *,
        db: Session,
        name: str,
        scopes: List[str],
        environment: str = "live",
        description: str = "",
        organization_id: Optional[int] = None,
        user_id: Optional[int] = None,
        client_id: Optional[int] = None,
        rate_limit_rpm: Optional[int] = None,
        expires_days: Optional[int] = None,
    ) -> tuple[str, OAuthAPIKey]:
        """
        Create and persist a new API key.

        Returns:
            (plaintext_key, OAuthAPIKey row)
            plaintext_key must be shown to the caller and never stored.
        """
        plaintext, key_hash = APIKeyService.generate(environment)
        prefix = APIKeyService.extract_prefix(plaintext)

        expires_at = None
        if expires_days:
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)

        row = OAuthAPIKey(
            client_id=client_id,
            user_id=user_id,
            organization_id=organization_id,
            key_prefix=prefix,
            key_hash=key_hash,
            name=name,
            description=description,
            scopes=scopes,
            environment=environment,
            rate_limit_rpm=rate_limit_rpm,
            expires_at=expires_at,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return plaintext, row

    @staticmethod
    def rotate(
        key_id: int,
        db: Session,
    ) -> tuple[str, OAuthAPIKey]:
        """
        Rotate an API key.

        1. Revoke the old key.
        2. Create a new key with the same settings.
        3. The old key remains usable until grace period expires (set expires_at).

        Returns (new_plaintext, new_row).
        """
        old = db.query(OAuthAPIKey).filter(OAuthAPIKey.id == key_id).first()
        if not old or old.revoked:
            raise ValueError("API key not found or already revoked")

        # Soft-expire old key after grace period
        grace_until = datetime.now(timezone.utc) + timedelta(hours=GRACE_PERIOD_HOURS)
        old.expires_at = grace_until
        old.revoked = False  # still alive during grace period

        new_plaintext, new_row = APIKeyService.create(
            db=db,
            name=f"{old.name} (rotated)",
            scopes=old.scopes or [],
            environment=old.environment,
            description=old.description or "",
            organization_id=old.organization_id,
            user_id=old.user_id,
            client_id=old.client_id,
            rate_limit_rpm=old.rate_limit_rpm,
        )
        db.commit()
        return new_plaintext, new_row

    @staticmethod
    def revoke(key_id: int, db: Session) -> None:
        row = db.query(OAuthAPIKey).filter(OAuthAPIKey.id == key_id).first()
        if row:
            row.revoked = True
            row.revoked_at = datetime.now(timezone.utc)
            db.commit()


# ---------------------------------------------------------------------------
# JWT (OAuth access token) verification
# ---------------------------------------------------------------------------

def _load_public_key() -> Optional[str]:
    """Load RSA public key PEM from disk (generated by oauth2_service)."""
    pub_path = os.path.join(KEY_DIR, "public.pem")
    if os.path.exists(pub_path):
        with open(pub_path, "r") as f:
            return f.read()
    return None


def verify_oauth_token(token: str, db: Session) -> Optional[AuthContext]:
    """
    Validate an RS256 (or HS256 fallback) JWT access token.
    Returns AuthContext or None if invalid.
    """
    pub_key = _load_public_key()
    algorithms = [ALGORITHM] if pub_key else [FALLBACK_ALG]
    key = pub_key if pub_key else SECRET_KEY

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            options={"require": ["sub", "exp", "jti"]},
        )
    except JWTError:
        return None

    jti = payload.get("jti", "")
    # Check token is not revoked in DB
    token_row = (
        db.query(OAuthToken)
        .filter(OAuthToken.jti == jti, OAuthToken.revoked.is_(False))
        .first()
    )
    if not token_row:
        return None
    if token_row.access_expires_at < datetime.now(timezone.utc):
        return None

    return AuthContext(
        oauth_client_id=token_row.client_id,
        user_id=token_row.user_id,
        scopes=token_row.scopes or [],
        environment="live",
    )


# ---------------------------------------------------------------------------
# FastAPI dependency: resolve credentials on each /api/v1/* request
# ---------------------------------------------------------------------------

async def resolve_api_credentials(
    request: Request,
    db: Session = Depends(get_db),
) -> AuthContext:
    """
    Dependency injected into every public API endpoint.

    Reads Authorization header, resolves identity, populates request.state,
    and returns AuthContext.

    Raises 401 JSONResponse (RFC 7807) if no valid credentials are found.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise _auth_error(request, "Missing or malformed Authorization header. "
                          "Provide: Authorization: Bearer <api_key_or_token>")

    token = auth_header[7:].strip()

    # --- API key path ---
    if token.startswith(API_KEY_LIVE_PREFIX) or token.startswith(API_KEY_TEST_PREFIX):
        row = APIKeyService.lookup(token, db)
        if not row:
            raise _auth_error(request, "Invalid or revoked API key.")
        ctx = AuthContext(
            api_key_id=row.id,
            oauth_client_id=row.client_id,
            user_id=row.user_id,
            scopes=row.scopes or [],
            environment=row.environment,
            rate_limit_rpm=row.rate_limit_rpm,
        )
    else:
        # --- OAuth JWT path ---
        ctx = verify_oauth_token(token, db)
        if ctx is None:
            raise _auth_error(request, "Invalid, expired, or revoked access token.")

    # Populate request.state for middleware (rate-limit, audit)
    request.state.api_key_id       = ctx.api_key_id
    request.state.oauth_client_id  = ctx.oauth_client_id
    request.state.public_api_user_id = ctx.user_id
    request.state.rate_limit_rpm   = ctx.rate_limit_rpm

    return ctx


def _auth_error(request: Request, detail: str):
    """Return a JSONResponse exception that FastAPI will use as the response."""
    from fastapi import HTTPException
    from fastapi.responses import JSONResponse
    response = err_auth(request, detail)
    # We raise an HTTPException with the pre-built JSONResponse body so that
    # FastAPI's exception handlers do not re-wrap it.
    raise HTTPException(
        status_code=401,
        detail=response.body.decode(),
        headers={"WWW-Authenticate": "Bearer"},
    )


# ---------------------------------------------------------------------------
# Scope enforcer dependency factory
# ---------------------------------------------------------------------------

def require_scope(*required: str):
    """
    Endpoint-level scope guard.

    Usage:
        @router.get("/patients", dependencies=[Depends(require_scope("patients:read"))])

    Any one of the required scopes suffices (OR logic).
    The special scope "admin" always passes.
    """
    async def _check(
        request: Request,
        ctx: AuthContext = Depends(resolve_api_credentials),
    ) -> AuthContext:
        if "admin" in ctx.scopes:
            return ctx
        for scope in required:
            if scope in ctx.scopes:
                return ctx
        needed = " | ".join(required)
        raise _scope_error(request, needed)
    return _check


def _scope_error(request: Request, scope: str):
    from fastapi import HTTPException
    response = err_forbidden(request, f"Missing required scope: {scope}", scope=scope)
    raise HTTPException(status_code=403, detail=response.body.decode())
