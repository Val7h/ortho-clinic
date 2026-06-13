"""
OAuth2 Authorization Server Models - OrthoClinic Sprint 7

Tables:
- OAuthClient       : registered developer applications
- OAuthScope        : canonical scope definitions
- OAuthAuthCode     : short-lived authorization codes (PKCE)
- OAuthToken        : access + refresh tokens
- OAuthDeviceCode   : device authorization grant pending codes
- OAuthAPIKey       : scoped server-side API keys (no OAuth flow)
"""

from __future__ import annotations

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, ForeignKey,
    JSON, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


# ---------------------------------------------------------------------------
# Client (Developer App)
# ---------------------------------------------------------------------------

class OAuthClient(Base):
    __tablename__ = "oauth_clients"

    id = Column(Integer, primary_key=True, index=True)

    # Registration
    client_id     = Column(String(64),  unique=True, nullable=False, index=True)
    client_secret = Column(String(255), nullable=True)   # NULL for public clients

    # Identity
    name          = Column(String(200), nullable=False)
    description   = Column(Text, nullable=True)
    logo_url      = Column(String(500), nullable=True)
    website_url   = Column(String(500), nullable=True)
    privacy_url   = Column(String(500), nullable=True)
    tos_url       = Column(String(500), nullable=True)

    # Owner
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    developer_email = Column(String(200), nullable=False)

    # Client type: "confidential" | "public"
    client_type   = Column(String(20), default="confidential", nullable=False)

    # Grant types allowed (JSON list)
    # e.g. ["authorization_code","client_credentials","refresh_token","urn:ietf:params:oauth:grant-type:device_code"]
    grant_types   = Column(JSON, default=["authorization_code", "refresh_token"])

    # Redirect URIs (JSON list, exact-match enforced)
    redirect_uris = Column(JSON, default=[])

    # Allowed scopes (JSON list, subset of canonical scopes)
    allowed_scopes = Column(JSON, default=[])

    # Approval
    # pending | approved | rejected | suspended
    status        = Column(String(20), default="pending", nullable=False)
    reviewed_by   = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at   = Column(DateTime(timezone=True), nullable=True)
    review_notes  = Column(Text, nullable=True)

    # Sensitive scopes require manual review
    requires_review = Column(Boolean, default=False)

    # PKCE required for public clients (enforced in router)
    pkce_required = Column(Boolean, default=True)

    # Token settings
    access_token_ttl_seconds  = Column(Integer, default=3600)       # 1 hour
    refresh_token_ttl_seconds = Column(Integer, default=2592000)    # 30 days

    # Audit
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())
    active        = Column(Boolean, default=True)

    # Relationships
    auth_codes    = relationship("OAuthAuthCode",   back_populates="client", cascade="all, delete-orphan")
    tokens        = relationship("OAuthToken",       back_populates="client", cascade="all, delete-orphan")
    device_codes  = relationship("OAuthDeviceCode",  back_populates="client", cascade="all, delete-orphan")
    api_keys      = relationship("OAuthAPIKey",      back_populates="client", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Scope Catalog
# ---------------------------------------------------------------------------

class OAuthScope(Base):
    __tablename__ = "oauth_scopes"

    id          = Column(Integer, primary_key=True)
    name        = Column(String(100), unique=True, nullable=False)   # e.g. "patients:read"
    description = Column(String(500), nullable=True)
    category    = Column(String(50),  nullable=True)                 # patients | appointments | etc.
    sensitive   = Column(Boolean, default=False)                     # requires manual approval
    active      = Column(Boolean, default=True)


# ---------------------------------------------------------------------------
# Authorization Code (PKCE)
# ---------------------------------------------------------------------------

class OAuthAuthCode(Base):
    __tablename__ = "oauth_auth_codes"

    id          = Column(Integer, primary_key=True)
    code        = Column(String(128), unique=True, nullable=False, index=True)
    client_id   = Column(Integer, ForeignKey("oauth_clients.id", ondelete="CASCADE"), nullable=False)
    user_id     = Column(Integer, ForeignKey("users.id",          ondelete="CASCADE"), nullable=False)

    # PKCE
    code_challenge        = Column(String(128), nullable=True)
    code_challenge_method = Column(String(10),  nullable=True)  # S256 | plain

    # Redirect used in this request (must match registered)
    redirect_uri  = Column(String(500), nullable=False)

    # Scopes granted in this code
    scopes        = Column(JSON, default=[])

    # State (caller-supplied, for CSRF binding)
    state         = Column(String(256), nullable=True)

    # Nonce (OpenID Connect)
    nonce         = Column(String(256), nullable=True)

    expires_at    = Column(DateTime(timezone=True), nullable=False)
    used_at       = Column(DateTime(timezone=True), nullable=True)   # NULL = not yet used
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    client        = relationship("OAuthClient", back_populates="auth_codes")
    user          = relationship("User")

    __table_args__ = (
        Index("ix_oauth_auth_codes_client_user", "client_id", "user_id"),
    )


# ---------------------------------------------------------------------------
# Tokens (access + refresh)
# ---------------------------------------------------------------------------

class OAuthToken(Base):
    __tablename__ = "oauth_tokens"

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("oauth_clients.id", ondelete="CASCADE"), nullable=False)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)  # NULL for client_credentials

    # Opaque identifiers stored in DB; the actual access token is a signed JWT
    jti             = Column(String(64), unique=True, nullable=False, index=True)   # JWT ID
    refresh_token   = Column(String(256), unique=True, nullable=True, index=True)  # opaque

    # Grant type that produced this token
    grant_type      = Column(String(64), nullable=False)

    # Scopes
    scopes          = Column(JSON, default=[])

    # Lifecycle
    access_expires_at  = Column(DateTime(timezone=True), nullable=False)
    refresh_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())

    # Revocation
    revoked            = Column(Boolean, default=False)
    revoked_at         = Column(DateTime(timezone=True), nullable=True)
    revocation_reason  = Column(String(100), nullable=True)  # "logout" | "rotation" | "admin"

    # Refresh token rotation: link child → parent
    parent_jti         = Column(String(64), ForeignKey("oauth_tokens.jti"), nullable=True)

    # IP / UA for audit
    ip_address         = Column(String(45), nullable=True)
    user_agent         = Column(String(500), nullable=True)

    # Relationships
    client             = relationship("OAuthClient", back_populates="tokens")
    user               = relationship("User")

    __table_args__ = (
        Index("ix_oauth_tokens_client_user", "client_id", "user_id"),
    )


# ---------------------------------------------------------------------------
# Device Authorization Code (RFC 8628)
# ---------------------------------------------------------------------------

class OAuthDeviceCode(Base):
    __tablename__ = "oauth_device_codes"

    id           = Column(Integer, primary_key=True)
    device_code  = Column(String(128), unique=True, nullable=False, index=True)
    user_code    = Column(String(10),  unique=True, nullable=False, index=True)  # 8-char UPPERCASE
    client_id    = Column(Integer, ForeignKey("oauth_clients.id", ondelete="CASCADE"), nullable=False)

    scopes       = Column(JSON, default=[])

    # Polling
    interval_seconds = Column(Integer, default=5)
    expires_at   = Column(DateTime(timezone=True), nullable=False)
    last_poll_at = Column(DateTime(timezone=True), nullable=True)

    # status: pending | authorized | denied | expired
    status       = Column(String(20), default="pending", nullable=False)

    # Filled after user authorizes
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    authorized_at = Column(DateTime(timezone=True), nullable=True)

    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    client       = relationship("OAuthClient", back_populates="device_codes")
    user         = relationship("User")


# ---------------------------------------------------------------------------
# Scoped API Keys (server-side, no OAuth flow)
# ---------------------------------------------------------------------------

class OAuthAPIKey(Base):
    __tablename__ = "oauth_api_keys"

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("oauth_clients.id", ondelete="CASCADE"), nullable=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)

    # Visible prefix for UX (e.g. "oc_live_abc12345...")
    key_prefix      = Column(String(20), nullable=False)
    key_hash        = Column(String(255), unique=True, nullable=False, index=True)

    name            = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)

    # Scopes this key is restricted to
    scopes          = Column(JSON, default=[])

    # Environment: "live" | "test"
    environment     = Column(String(10), default="live")

    # Rate limit override (req/minute); NULL = org default
    rate_limit_rpm  = Column(Integer, nullable=True)

    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at    = Column(DateTime(timezone=True), nullable=True)
    expires_at      = Column(DateTime(timezone=True), nullable=True)

    revoked         = Column(Boolean, default=False)
    revoked_at      = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    client          = relationship("OAuthClient", back_populates="api_keys")
    user            = relationship("User")
