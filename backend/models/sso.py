"""
SSO Models — OrthoClinic Sprint 8

Tables:
  SSOConfiguration   : per-org IdP config (SAML or OIDC)
  SAMLSession        : in-flight SAML AuthnRequest state
  OIDCState          : in-flight OIDC Authorization Code state
  MFACredential      : TOTP / WebAuthn / Passkey credentials per user
  MFABackupCode      : 10 single-use recovery codes per user
  SCIMToken          : bearer tokens for SCIM 2.0 provisioning endpoints
  SCIMSyncLog        : audit log for every SCIM create/update/deactivate
"""

from __future__ import annotations

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text,
    ForeignKey, JSON, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


# ---------------------------------------------------------------------------
# SSO Configuration (one per org per protocol)
# ---------------------------------------------------------------------------

class SSOConfiguration(Base):
    """IdP configuration stored per organization."""
    __tablename__ = "sso_configurations"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"),
                             nullable=False)

    # "saml" | "oidc"
    protocol        = Column(String(10), nullable=False)

    # Human-readable label shown on login page
    display_name    = Column(String(200), nullable=False, default="SSO")

    # Active toggle — org may have one active SAML + one active OIDC
    active          = Column(Boolean, default=True)

    # ── SAML-specific ────────────────────────────────────────────────────────
    # IdP entity ID (issuer)
    saml_idp_entity_id      = Column(String(500), nullable=True)
    # IdP SSO URL (where we POST/redirect AuthnRequests)
    saml_idp_sso_url        = Column(String(500), nullable=True)
    # IdP SLO URL (Single Logout)
    saml_idp_slo_url        = Column(String(500), nullable=True)
    # IdP certificate (PEM, X.509)
    saml_idp_cert           = Column(Text, nullable=True)
    # SP private key (PEM) — for signing AuthnRequests and decrypting assertions
    saml_sp_private_key     = Column(Text, nullable=True)
    # SP certificate (PEM) — shared with IdP
    saml_sp_cert            = Column(Text, nullable=True)
    # Sign AuthnRequests?
    saml_sign_requests      = Column(Boolean, default=True)
    # Require signed assertions from IdP?
    saml_require_signed_assertions = Column(Boolean, default=True)
    # NameID format: "emailAddress" | "persistent" | "transient"
    saml_nameid_format      = Column(String(100),
                                     default="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress")

    # Attribute mapping overrides (JSON dict)
    # e.g. {"email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    #        "firstName": "givenname", "lastName": "surname",
    #        "groups": "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
    #        "organizationId": "tenant_id"}
    saml_attribute_mapping  = Column(JSON, nullable=True)

    # ── OIDC-specific ────────────────────────────────────────────────────────
    oidc_issuer             = Column(String(500), nullable=True)   # e.g. https://accounts.google.com
    oidc_client_id          = Column(String(300), nullable=True)
    oidc_client_secret      = Column(Text, nullable=True)          # encrypted at rest
    oidc_scopes             = Column(JSON, default=["openid", "email", "profile"])
    # Override discovery; if None we fetch /.well-known/openid-configuration
    oidc_authorization_endpoint = Column(String(500), nullable=True)
    oidc_token_endpoint         = Column(String(500), nullable=True)
    oidc_userinfo_endpoint      = Column(String(500), nullable=True)
    oidc_jwks_uri               = Column(String(500), nullable=True)
    # Claim that holds the user's email (default "email")
    oidc_email_claim            = Column(String(100), default="email")
    # Claim that holds role/group membership
    oidc_groups_claim           = Column(String(100), default="groups")

    # ── JIT Provisioning ────────────────────────────────────────────────────
    # Auto-create user account on first SSO login?
    jit_provisioning_enabled    = Column(Boolean, default=True)
    # Require admin approval before new JIT user can log in?
    jit_approval_required       = Column(Boolean, default=False)
    # Default role for JIT users when no group claim present
    jit_default_role            = Column(String(20), default="secretary")

    # ── MFA policy ──────────────────────────────────────────────────────────
    # "none" | "optional" | "required"
    mfa_policy                  = Column(String(20), default="optional")
    # Grace period (days) for new users before MFA is enforced
    mfa_grace_days              = Column(Integer, default=7)

    # ── SCIM ────────────────────────────────────────────────────────────────
    scim_enabled                = Column(Boolean, default=False)

    # Audit
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())
    created_by      = Column(Integer, ForeignKey("users.id"), nullable=True)

    organization    = relationship("Organization")
    scim_tokens     = relationship("SCIMToken", back_populates="sso_config",
                                   cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "protocol", name="uq_sso_org_protocol"),
        Index("ix_sso_config_org", "organization_id"),
    )


# ---------------------------------------------------------------------------
# In-flight SAML AuthnRequest state
# ---------------------------------------------------------------------------

class SAMLSession(Base):
    """Tracks an outbound SAML AuthnRequest until the assertion arrives."""
    __tablename__ = "saml_sessions"

    id              = Column(Integer, primary_key=True, index=True)
    # SAML request ID (_id attribute of AuthnRequest)
    request_id      = Column(String(100), unique=True, nullable=False, index=True)
    sso_config_id   = Column(Integer, ForeignKey("sso_configurations.id", ondelete="CASCADE"),
                             nullable=False)
    # Where to redirect the user after successful assertion
    relay_state     = Column(String(500), nullable=True)
    # Next URL after login (optional deep-link)
    next_url        = Column(String(1000), nullable=True)
    expires_at      = Column(DateTime(timezone=True), nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    sso_config      = relationship("SSOConfiguration")


# ---------------------------------------------------------------------------
# In-flight OIDC state
# ---------------------------------------------------------------------------

class OIDCState(Base):
    """CSRF/replay protection for Authorization Code + PKCE flow."""
    __tablename__ = "oidc_states"

    id              = Column(Integer, primary_key=True, index=True)
    state           = Column(String(128), unique=True, nullable=False, index=True)
    nonce           = Column(String(128), nullable=False)
    # PKCE code_verifier (stored server-side; code_challenge sent to IdP)
    pkce_verifier   = Column(String(128), nullable=True)
    sso_config_id   = Column(Integer, ForeignKey("sso_configurations.id", ondelete="CASCADE"),
                             nullable=False)
    next_url        = Column(String(1000), nullable=True)
    expires_at      = Column(DateTime(timezone=True), nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    sso_config      = relationship("SSOConfiguration")


# ---------------------------------------------------------------------------
# MFA Credentials
# ---------------------------------------------------------------------------

class MFACredential(Base):
    """
    One row per MFA method per user.
    method: "totp" | "webauthn" | "passkey"
    """
    __tablename__ = "mfa_credentials"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                             nullable=False)
    # "totp" | "webauthn" | "passkey"
    method          = Column(String(20), nullable=False)

    # TOTP: encrypted TOTP secret (base32)
    totp_secret     = Column(Text, nullable=True)

    # WebAuthn / Passkey
    # credential_id (base64url), public_key (CBOR/base64url), sign_count
    webauthn_credential_id  = Column(Text, nullable=True)
    webauthn_public_key     = Column(Text, nullable=True)
    webauthn_sign_count     = Column(Integer, default=0)
    webauthn_aaguid         = Column(String(36), nullable=True)
    webauthn_transports     = Column(JSON, nullable=True)  # ["usb","nfc","ble","internal"]

    # Friendly name (e.g. "YubiKey 5", "iPhone Face ID")
    name            = Column(String(200), nullable=True)

    active          = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at    = Column(DateTime(timezone=True), nullable=True)

    user            = relationship("User")

    __table_args__ = (
        Index("ix_mfa_credentials_user", "user_id"),
    )


# ---------------------------------------------------------------------------
# MFA Backup Codes
# ---------------------------------------------------------------------------

class MFABackupCode(Base):
    """10 single-use recovery codes per user (hashed in DB)."""
    __tablename__ = "mfa_backup_codes"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # bcrypt hash of the plain-text code
    code_hash   = Column(String(255), nullable=False)
    used_at     = Column(DateTime(timezone=True), nullable=True)   # NULL = not used
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    user        = relationship("User")

    __table_args__ = (
        Index("ix_mfa_backup_codes_user", "user_id"),
    )


# ---------------------------------------------------------------------------
# MFA Challenge (short-lived, in-flight)
# ---------------------------------------------------------------------------

class MFAChallenge(Base):
    """
    Issued after username/password is verified; user must complete MFA
    within ttl_seconds to exchange for a full session token.
    """
    __tablename__ = "mfa_challenges"

    id              = Column(Integer, primary_key=True, index=True)
    challenge_token = Column(String(128), unique=True, nullable=False, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # WebAuthn challenge bytes (base64url)
    webauthn_challenge = Column(String(256), nullable=True)
    expires_at      = Column(DateTime(timezone=True), nullable=False)
    completed_at    = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    user            = relationship("User")


# ---------------------------------------------------------------------------
# SCIM Bearer Tokens
# ---------------------------------------------------------------------------

class SCIMToken(Base):
    """
    Long-lived bearer token issued to an IdP's SCIM provisioner.
    One token per SSOConfiguration.
    """
    __tablename__ = "scim_tokens"

    id              = Column(Integer, primary_key=True, index=True)
    sso_config_id   = Column(Integer, ForeignKey("sso_configurations.id", ondelete="CASCADE"),
                             nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"),
                             nullable=False)
    token_hash      = Column(String(255), unique=True, nullable=False, index=True)
    token_prefix    = Column(String(20), nullable=False)   # first 8 chars for UX display
    description     = Column(String(300), nullable=True)
    active          = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at    = Column(DateTime(timezone=True), nullable=True)
    expires_at      = Column(DateTime(timezone=True), nullable=True)  # NULL = no expiry

    sso_config      = relationship("SSOConfiguration", back_populates="scim_tokens")
    organization    = relationship("Organization")


# ---------------------------------------------------------------------------
# SCIM Sync Log
# ---------------------------------------------------------------------------

class SCIMSyncLog(Base):
    """Audit trail for every SCIM operation from an IdP."""
    __tablename__ = "scim_sync_logs"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"),
                             nullable=False)
    # "create_user" | "update_user" | "deactivate_user" |
    # "create_group" | "update_group" | "delete_group"
    operation       = Column(String(30), nullable=False)
    scim_resource_type = Column(String(20), nullable=False)  # "User" | "Group"
    scim_external_id   = Column(String(256), nullable=True)  # externalId from IdP
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # "success" | "error" | "noop"
    status          = Column(String(20), nullable=False)
    error_message   = Column(Text, nullable=True)
    payload_summary = Column(JSON, nullable=True)  # sanitized subset of the SCIM payload
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_scim_sync_log_org_created", "organization_id", "created_at"),
    )
