"""
OAuth2 Authorization Server Service — OrthoClinic Sprint 7

Responsibilities:
- RSA key-pair management (RS256 JWTs)
- JWT access token minting / verification
- Opaque refresh token generation + rotation
- PKCE verifier validation
- Scope validation helpers
- Token introspection / revocation
- Device-code polling
- API key generation + validation

python-jose is used for JWT signing (already in requirements.txt).
cryptography is used for RSA key generation (installed as a transitive dep of python-jose[cryptography]).
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from models.oauth2 import (
    OAuthAPIKey,
    OAuthAuthCode,
    OAuthClient,
    OAuthDeviceCode,
    OAuthScope,
    OAuthToken,
)
from models.organization import User

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ISSUER = os.getenv("OAUTH2_ISSUER", "https://api.orthoclinic.com.br")
KEY_DIR = os.getenv("OAUTH2_KEY_DIR", os.path.join(os.path.dirname(__file__), "..", "keys"))

ACCESS_TOKEN_TTL  = int(os.getenv("OAUTH2_ACCESS_TTL",  "3600"))       # 1 hour
REFRESH_TOKEN_TTL = int(os.getenv("OAUTH2_REFRESH_TTL", "2592000"))    # 30 days
AUTH_CODE_TTL     = int(os.getenv("OAUTH2_CODE_TTL",    "600"))        # 10 min
DEVICE_CODE_TTL   = int(os.getenv("OAUTH2_DEVICE_TTL",  "1800"))       # 30 min

# Algorithm
ALGORITHM = "RS256"

# Passlib context for API key hashing (uses bcrypt)
_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# RSA Key Management
# ---------------------------------------------------------------------------

os.makedirs(KEY_DIR, exist_ok=True)
_PRIVATE_KEY_PATH = os.path.join(KEY_DIR, "oauth2_private.pem")
_PUBLIC_KEY_PATH  = os.path.join(KEY_DIR, "oauth2_public.pem")
_KID              = "orthoclinic-oauth2-v1"


def _generate_rsa_keypair() -> None:
    """Generate a 2048-bit RSA keypair and persist it to KEY_DIR."""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    with open(_PRIVATE_KEY_PATH, "wb") as f:
        f.write(
            private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
    with open(_PUBLIC_KEY_PATH, "wb") as f:
        f.write(
            private_key.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        )


def _load_private_key() -> str:
    if not os.path.exists(_PRIVATE_KEY_PATH):
        _generate_rsa_keypair()
    with open(_PRIVATE_KEY_PATH, "r") as f:
        return f.read()


def _load_public_key() -> str:
    if not os.path.exists(_PUBLIC_KEY_PATH):
        _generate_rsa_keypair()
    with open(_PUBLIC_KEY_PATH, "r") as f:
        return f.read()


# Eager-load on module import so errors surface at startup
try:
    _PRIVATE_KEY = _load_private_key()
    _PUBLIC_KEY  = _load_public_key()
except Exception as exc:
    raise RuntimeError(f"[OAuth2] Failed to load RSA keys: {exc}") from exc


def get_jwks() -> dict:
    """Return a JWKS (JSON Web Key Set) containing the public key."""
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
    from cryptography.x509 import load_pem_x509_certificate
    from cryptography.hazmat.primitives.asymmetric import padding

    from cryptography.hazmat.backends import default_backend

    pub = serialization.load_pem_public_key(_PUBLIC_KEY.encode(), backend=default_backend())
    pub_numbers = pub.public_key().public_numbers() if hasattr(pub, "public_key") else pub.public_numbers()

    def _b64url(n: int, length: int) -> str:
        return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()

    return {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "alg": ALGORITHM,
                "kid": _KID,
                "n": _b64url(pub_numbers.n, 256),
                "e": _b64url(pub_numbers.e, 3),
            }
        ]
    }


# ---------------------------------------------------------------------------
# Scope helpers
# ---------------------------------------------------------------------------

CANONICAL_SCOPES = {
    "patients:read",
    "patients:write",
    "appointments:read",
    "appointments:write",
    "documents:read",
    "documents:write",
    "users:read",
    "webhooks:manage",
    "org:read",
    "org:write",
    "admin:full",
}

SENSITIVE_SCOPES = {"admin:full", "patients:write", "documents:write", "org:write"}


def validate_scopes(requested: List[str], allowed: List[str]) -> List[str]:
    """Return the intersection of requested and allowed scopes, raising if unknown scope requested."""
    unknown = set(requested) - CANONICAL_SCOPES
    if unknown:
        raise ValueError(f"Unknown scopes: {', '.join(sorted(unknown))}")
    return [s for s in requested if s in set(allowed)]


# ---------------------------------------------------------------------------
# JWT Access Token
# ---------------------------------------------------------------------------

def mint_access_token(
    *,
    jti: str,
    sub: str,                   # user_id as str, or client_id for client_credentials
    client_id: str,
    scopes: List[str],
    organization_id: Optional[int] = None,
    extra_claims: Optional[dict] = None,
    ttl: int = ACCESS_TOKEN_TTL,
) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "iss": ISSUER,
        "sub": sub,
        "aud": ISSUER,
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
        "client_id": client_id,
        "scope": " ".join(scopes),
    }
    if organization_id is not None:
        payload["org_id"] = organization_id
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, _PRIVATE_KEY, algorithm=ALGORITHM, headers={"kid": _KID})


def verify_access_token(token: str) -> dict:
    """Decode and verify an RS256 JWT. Raises JWTError on failure."""
    return jwt.decode(
        token,
        _PUBLIC_KEY,
        algorithms=[ALGORITHM],
        audience=ISSUER,
        issuer=ISSUER,
    )


# ---------------------------------------------------------------------------
# Opaque Refresh Token
# ---------------------------------------------------------------------------

def _generate_opaque_token(nbytes: int = 48) -> str:
    return secrets.token_urlsafe(nbytes)


# ---------------------------------------------------------------------------
# PKCE
# ---------------------------------------------------------------------------

def generate_pkce_pair() -> Tuple[str, str]:
    """Utility for tests / client SDK — returns (verifier, challenge_S256)."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def verify_pkce(code_verifier: str, code_challenge: str, method: str) -> bool:
    if method == "S256":
        digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        return secrets.compare_digest(expected, code_challenge)
    if method == "plain":
        return secrets.compare_digest(code_verifier, code_challenge)
    return False


# ---------------------------------------------------------------------------
# Authorization Code Flow
# ---------------------------------------------------------------------------

def create_auth_code(
    db: Session,
    *,
    client: OAuthClient,
    user: User,
    redirect_uri: str,
    scopes: List[str],
    code_challenge: Optional[str] = None,
    code_challenge_method: Optional[str] = None,
    state: Optional[str] = None,
    nonce: Optional[str] = None,
) -> OAuthAuthCode:
    code = _generate_opaque_token(32)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(seconds=AUTH_CODE_TTL)
    auth_code = OAuthAuthCode(
        code=code,
        client_id=client.id,
        user_id=user.id,
        redirect_uri=redirect_uri,
        scopes=scopes,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        state=state,
        nonce=nonce,
        expires_at=expires_at,
    )
    db.add(auth_code)
    db.commit()
    db.refresh(auth_code)
    return auth_code


def exchange_auth_code(
    db: Session,
    *,
    code: str,
    client: OAuthClient,
    redirect_uri: str,
    code_verifier: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[str, str, OAuthToken]:
    """
    Exchange an authorization code for (access_token, refresh_token, OAuthToken).
    Raises ValueError with a user-safe message on any error.
    """
    now = datetime.now(tz=timezone.utc)

    auth_code = (
        db.query(OAuthAuthCode)
        .filter(
            OAuthAuthCode.code == code,
            OAuthAuthCode.client_id == client.id,
        )
        .first()
    )
    if not auth_code:
        raise ValueError("invalid_grant: authorization code not found")
    if auth_code.used_at:
        # Code replay — revoke all tokens for this client+user as precaution
        db.query(OAuthToken).filter(
            OAuthToken.client_id == client.id,
            OAuthToken.user_id == auth_code.user_id,
            OAuthToken.revoked == False,
        ).update({"revoked": True, "revoked_at": now, "revocation_reason": "code_reuse"})
        db.commit()
        raise ValueError("invalid_grant: authorization code already used")
    if auth_code.expires_at.replace(tzinfo=timezone.utc) < now:
        raise ValueError("invalid_grant: authorization code expired")
    if auth_code.redirect_uri != redirect_uri:
        raise ValueError("invalid_grant: redirect_uri mismatch")

    # PKCE verification
    if auth_code.code_challenge:
        if not code_verifier:
            raise ValueError("invalid_grant: code_verifier required")
        if not verify_pkce(code_verifier, auth_code.code_challenge, auth_code.code_challenge_method or "S256"):
            raise ValueError("invalid_grant: code_verifier mismatch")

    # Mark code as used (single-use)
    auth_code.used_at = now
    db.flush()

    # Mint tokens
    user = db.query(User).filter(User.id == auth_code.user_id).first()
    access_token, refresh_tok, db_token = _create_token_pair(
        db,
        client=client,
        user=user,
        scopes=auth_code.scopes,
        grant_type="authorization_code",
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.commit()
    return access_token, refresh_tok, db_token


# ---------------------------------------------------------------------------
# Client Credentials Flow
# ---------------------------------------------------------------------------

def client_credentials_grant(
    db: Session,
    *,
    client: OAuthClient,
    requested_scopes: List[str],
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[str, OAuthToken]:
    """Returns (access_token, OAuthToken). No refresh token for machine grants."""
    scopes = validate_scopes(requested_scopes, client.allowed_scopes)
    if not scopes and requested_scopes:
        raise ValueError("invalid_scope: no valid scopes requested")

    jti = str(uuid.uuid4())
    access_token = mint_access_token(
        jti=jti,
        sub=f"client:{client.client_id}",
        client_id=client.client_id,
        scopes=scopes,
        ttl=client.access_token_ttl_seconds,
    )
    now = datetime.now(tz=timezone.utc)
    db_token = OAuthToken(
        client_id=client.id,
        user_id=None,
        jti=jti,
        refresh_token=None,
        grant_type="client_credentials",
        scopes=scopes,
        access_expires_at=now + timedelta(seconds=client.access_token_ttl_seconds),
        refresh_expires_at=None,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return access_token, db_token


# ---------------------------------------------------------------------------
# Refresh Token Flow (with rotation)
# ---------------------------------------------------------------------------

def refresh_token_grant(
    db: Session,
    *,
    client: OAuthClient,
    refresh_token_value: str,
    requested_scopes: Optional[List[str]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[str, str, OAuthToken]:
    """
    Rotate refresh token. Returns (new_access_token, new_refresh_token, OAuthToken).
    Old refresh token is immediately revoked.
    """
    now = datetime.now(tz=timezone.utc)
    old_token = (
        db.query(OAuthToken)
        .filter(
            OAuthToken.refresh_token == refresh_token_value,
            OAuthToken.client_id == client.id,
        )
        .first()
    )
    if not old_token:
        raise ValueError("invalid_grant: refresh token not found")
    if old_token.revoked:
        # Possible token theft — revoke entire family
        _revoke_token_family(db, old_token.jti)
        db.commit()
        raise ValueError("invalid_grant: refresh token already revoked (possible theft detected)")
    if old_token.refresh_expires_at and old_token.refresh_expires_at.replace(tzinfo=timezone.utc) < now:
        raise ValueError("invalid_grant: refresh token expired")

    # Scope downscoping (can only reduce, not expand)
    scopes = old_token.scopes
    if requested_scopes:
        scopes = validate_scopes(requested_scopes, old_token.scopes)

    # Revoke old token
    old_token.revoked = True
    old_token.revoked_at = now
    old_token.revocation_reason = "rotation"
    db.flush()

    user = db.query(User).filter(User.id == old_token.user_id).first() if old_token.user_id else None
    access_token, new_refresh, db_token = _create_token_pair(
        db,
        client=client,
        user=user,
        scopes=scopes,
        grant_type="refresh_token",
        parent_jti=old_token.jti,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.commit()
    return access_token, new_refresh, db_token


def _revoke_token_family(db: Session, jti: str) -> None:
    """Walk the refresh-token chain and revoke every related token."""
    now = datetime.now(tz=timezone.utc)
    # Revoke the root
    token = db.query(OAuthToken).filter(OAuthToken.jti == jti).first()
    if token:
        token.revoked = True
        token.revoked_at = now
        token.revocation_reason = "theft_detected"
    # Revoke descendants
    db.query(OAuthToken).filter(
        OAuthToken.parent_jti == jti,
        OAuthToken.revoked == False,
    ).update({"revoked": True, "revoked_at": now, "revocation_reason": "theft_detected"})


# ---------------------------------------------------------------------------
# Device Authorization Flow (RFC 8628)
# ---------------------------------------------------------------------------

_USER_CODE_CHARS = string.ascii_uppercase.replace("O", "").replace("I", "").replace("L", "")


def _generate_user_code(length: int = 8) -> str:
    """Generate a human-friendly user code (no ambiguous chars, separated in middle)."""
    half = length // 2
    part1 = "".join(secrets.choice(_USER_CODE_CHARS) for _ in range(half))
    part2 = "".join(secrets.choice(_USER_CODE_CHARS) for _ in range(length - half))
    return f"{part1}-{part2}"


def create_device_authorization(
    db: Session,
    *,
    client: OAuthClient,
    scopes: List[str],
) -> OAuthDeviceCode:
    scopes = validate_scopes(scopes, client.allowed_scopes)
    # Ensure uniqueness of user_code
    for _ in range(10):
        user_code = _generate_user_code()
        if not db.query(OAuthDeviceCode).filter(OAuthDeviceCode.user_code == user_code).first():
            break
    device_code = _generate_opaque_token(48)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(seconds=DEVICE_CODE_TTL)
    entry = OAuthDeviceCode(
        device_code=device_code,
        user_code=user_code,
        client_id=client.id,
        scopes=scopes,
        expires_at=expires_at,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def poll_device_code(
    db: Session,
    *,
    client: OAuthClient,
    device_code: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Optional[Tuple[str, str, OAuthToken]]:
    """
    Returns (access_token, refresh_token, OAuthToken) if authorized,
    None if still pending.
    Raises ValueError with standard error codes on failure.
    """
    now = datetime.now(tz=timezone.utc)
    entry = (
        db.query(OAuthDeviceCode)
        .filter(
            OAuthDeviceCode.device_code == device_code,
            OAuthDeviceCode.client_id == client.id,
        )
        .first()
    )
    if not entry:
        raise ValueError("invalid_grant: device code not found")

    if entry.expires_at.replace(tzinfo=timezone.utc) < now:
        entry.status = "expired"
        db.commit()
        raise ValueError("expired_token: device code expired")

    if entry.status == "denied":
        raise ValueError("access_denied: user denied the request")

    # Slow-down / rate check
    if entry.last_poll_at:
        elapsed = (now - entry.last_poll_at.replace(tzinfo=timezone.utc)).total_seconds()
        if elapsed < entry.interval_seconds:
            raise ValueError("slow_down: polling too fast")

    entry.last_poll_at = now
    db.flush()

    if entry.status != "authorized":
        db.commit()
        return None  # still pending

    # Mint tokens
    user = db.query(User).filter(User.id == entry.user_id).first()
    access_token, refresh_tok, db_token = _create_token_pair(
        db,
        client=client,
        user=user,
        scopes=entry.scopes,
        grant_type="urn:ietf:params:oauth:grant-type:device_code",
        ip_address=ip_address,
        user_agent=user_agent,
    )
    # Mark device code as consumed
    entry.status = "consumed"
    db.commit()
    return access_token, refresh_tok, db_token


def authorize_device_code(db: Session, *, user_code: str, user: User) -> OAuthDeviceCode:
    """Called from the user-facing consent endpoint to approve a device."""
    now = datetime.now(tz=timezone.utc)
    entry = db.query(OAuthDeviceCode).filter(OAuthDeviceCode.user_code == user_code).first()
    if not entry or entry.status != "pending":
        raise ValueError("invalid_grant: user code not found or already processed")
    if entry.expires_at.replace(tzinfo=timezone.utc) < now:
        raise ValueError("expired_token: user code expired")
    entry.status = "authorized"
    entry.user_id = user.id
    entry.authorized_at = now
    db.commit()
    db.refresh(entry)
    return entry


# ---------------------------------------------------------------------------
# Token Introspection (RFC 7662)
# ---------------------------------------------------------------------------

def introspect_token(db: Session, *, token: str, client: OAuthClient) -> dict:
    """
    Returns RFC 7662 introspection response.
    Supports both JWT access tokens and opaque refresh tokens.
    """
    now = datetime.now(tz=timezone.utc)

    # Try as JWT first
    try:
        payload = verify_access_token(token)
        jti = payload.get("jti")
        db_token = db.query(OAuthToken).filter(OAuthToken.jti == jti).first()
        if not db_token or db_token.revoked:
            return {"active": False}
        if db_token.access_expires_at.replace(tzinfo=timezone.utc) < now:
            return {"active": False}
        return {
            "active": True,
            "scope": payload.get("scope", ""),
            "client_id": payload.get("client_id"),
            "sub": payload.get("sub"),
            "exp": payload.get("exp"),
            "iat": payload.get("iat"),
            "iss": payload.get("iss"),
            "jti": jti,
            "token_type": "access_token",
        }
    except JWTError:
        pass

    # Try as opaque refresh token
    db_token = db.query(OAuthToken).filter(OAuthToken.refresh_token == token).first()
    if not db_token or db_token.revoked:
        return {"active": False}
    if db_token.refresh_expires_at and db_token.refresh_expires_at.replace(tzinfo=timezone.utc) < now:
        return {"active": False}
    return {
        "active": True,
        "scope": " ".join(db_token.scopes),
        "client_id": db_token.client.client_id if db_token.client else None,
        "sub": str(db_token.user_id) if db_token.user_id else None,
        "exp": int(db_token.refresh_expires_at.timestamp()) if db_token.refresh_expires_at else None,
        "token_type": "refresh_token",
    }


# ---------------------------------------------------------------------------
# Token Revocation (RFC 7009)
# ---------------------------------------------------------------------------

def revoke_token(db: Session, *, token: str, client: OAuthClient) -> None:
    """Revoke an access or refresh token. Idempotent — no error if already revoked."""
    now = datetime.now(tz=timezone.utc)

    # Try JWT access token
    try:
        payload = verify_access_token(token)
        jti = payload.get("jti")
        db.query(OAuthToken).filter(
            OAuthToken.jti == jti,
            OAuthToken.client_id == client.id,
        ).update({"revoked": True, "revoked_at": now, "revocation_reason": "client_request"})
        db.commit()
        return
    except JWTError:
        pass

    # Try opaque refresh token
    db.query(OAuthToken).filter(
        OAuthToken.refresh_token == token,
        OAuthToken.client_id == client.id,
    ).update({"revoked": True, "revoked_at": now, "revocation_reason": "client_request"})
    db.commit()


# ---------------------------------------------------------------------------
# API Key Management
# ---------------------------------------------------------------------------

_API_KEY_PREFIX_LIVE = "oc_live_"
_API_KEY_PREFIX_TEST = "oc_test_"


def create_api_key(
    db: Session,
    *,
    user: Optional[User] = None,
    client: Optional[OAuthClient] = None,
    organization_id: Optional[int] = None,
    name: str,
    scopes: List[str],
    description: Optional[str] = None,
    environment: str = "live",
    expires_at: Optional[datetime] = None,
    rate_limit_rpm: Optional[int] = None,
) -> Tuple[str, OAuthAPIKey]:
    """
    Returns (raw_key, OAuthAPIKey). raw_key is shown ONCE — store the hash only.
    """
    prefix = _API_KEY_PREFIX_LIVE if environment == "live" else _API_KEY_PREFIX_TEST
    raw_secret = secrets.token_urlsafe(40)
    raw_key = f"{prefix}{raw_secret}"
    key_hash = _pwd_ctx.hash(raw_key)
    key_prefix = raw_key[:20]

    entry = OAuthAPIKey(
        client_id=client.id if client else None,
        user_id=user.id if user else None,
        organization_id=organization_id,
        key_prefix=key_prefix,
        key_hash=key_hash,
        name=name,
        description=description,
        scopes=scopes,
        environment=environment,
        expires_at=expires_at,
        rate_limit_rpm=rate_limit_rpm,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return raw_key, entry


def verify_api_key(db: Session, raw_key: str) -> Optional[OAuthAPIKey]:
    """Find and verify an API key. Returns OAuthAPIKey or None."""
    now = datetime.now(tz=timezone.utc)
    # Narrow by prefix to avoid full-table bcrypt scan
    prefix = raw_key[:20]
    candidates = (
        db.query(OAuthAPIKey)
        .filter(
            OAuthAPIKey.key_prefix == prefix,
            OAuthAPIKey.revoked == False,
        )
        .all()
    )
    for candidate in candidates:
        if candidate.expires_at and candidate.expires_at.replace(tzinfo=timezone.utc) < now:
            continue
        if _pwd_ctx.verify(raw_key, candidate.key_hash):
            # Update last_used_at asynchronously (fire-and-forget in prod)
            candidate.last_used_at = now
            db.commit()
            return candidate
    return None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _create_token_pair(
    db: Session,
    *,
    client: OAuthClient,
    user: Optional[User],
    scopes: List[str],
    grant_type: str,
    parent_jti: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[str, str, OAuthToken]:
    now = datetime.now(tz=timezone.utc)
    jti = str(uuid.uuid4())

    sub = str(user.id) if user else f"client:{client.client_id}"
    org_id = user.organization_id if user else None

    access_token = mint_access_token(
        jti=jti,
        sub=sub,
        client_id=client.client_id,
        scopes=scopes,
        organization_id=org_id,
        ttl=client.access_token_ttl_seconds,
    )
    refresh_tok = _generate_opaque_token(48)

    db_token = OAuthToken(
        client_id=client.id,
        user_id=user.id if user else None,
        jti=jti,
        refresh_token=refresh_tok,
        grant_type=grant_type,
        scopes=scopes,
        access_expires_at=now + timedelta(seconds=client.access_token_ttl_seconds),
        refresh_expires_at=now + timedelta(seconds=client.refresh_token_ttl_seconds),
        parent_jti=parent_jti,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(db_token)
    db.flush()
    db.refresh(db_token)
    return access_token, refresh_tok, db_token
