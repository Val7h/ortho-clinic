"""
Migration: Sprint 8 — SSO / SAML 2.0 / OIDC / MFA / SCIM 2.0
Created: 2026-06-13

New tables:
  sso_configurations
  saml_sessions
  oidc_states
  mfa_credentials
  mfa_backup_codes
  mfa_challenges
  scim_tokens
  scim_sync_logs
"""

from sqlalchemy import text

SQL_UP = """
-- ── SSO Configurations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sso_configurations (
    id                          SERIAL PRIMARY KEY,
    organization_id             INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    protocol                    VARCHAR(10) NOT NULL,          -- 'saml' | 'oidc'
    display_name                VARCHAR(200) NOT NULL DEFAULT 'SSO',
    active                      BOOLEAN NOT NULL DEFAULT TRUE,

    -- SAML fields
    saml_idp_entity_id          VARCHAR(500),
    saml_idp_sso_url            VARCHAR(500),
    saml_idp_slo_url            VARCHAR(500),
    saml_idp_cert               TEXT,
    saml_sp_private_key         TEXT,
    saml_sp_cert                TEXT,
    saml_sign_requests          BOOLEAN NOT NULL DEFAULT TRUE,
    saml_require_signed_assertions BOOLEAN NOT NULL DEFAULT TRUE,
    saml_nameid_format          VARCHAR(100) DEFAULT
        'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    saml_attribute_mapping      JSONB,

    -- OIDC fields
    oidc_issuer                 VARCHAR(500),
    oidc_client_id              VARCHAR(300),
    oidc_client_secret          TEXT,
    oidc_scopes                 JSONB DEFAULT '["openid","email","profile"]',
    oidc_authorization_endpoint VARCHAR(500),
    oidc_token_endpoint         VARCHAR(500),
    oidc_userinfo_endpoint      VARCHAR(500),
    oidc_jwks_uri               VARCHAR(500),
    oidc_email_claim            VARCHAR(100) DEFAULT 'email',
    oidc_groups_claim           VARCHAR(100) DEFAULT 'groups',

    -- JIT provisioning
    jit_provisioning_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    jit_approval_required       BOOLEAN NOT NULL DEFAULT FALSE,
    jit_default_role            VARCHAR(20) DEFAULT 'secretary',

    -- MFA policy
    mfa_policy                  VARCHAR(20) DEFAULT 'optional',  -- none|optional|required
    mfa_grace_days              INTEGER DEFAULT 7,

    -- SCIM
    scim_enabled                BOOLEAN NOT NULL DEFAULT FALSE,

    -- Audit
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ,
    created_by                  INTEGER REFERENCES users(id),

    CONSTRAINT uq_sso_org_protocol UNIQUE (organization_id, protocol)
);
CREATE INDEX IF NOT EXISTS ix_sso_config_org ON sso_configurations (organization_id);

-- ── SAML in-flight sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saml_sessions (
    id              SERIAL PRIMARY KEY,
    request_id      VARCHAR(100) UNIQUE NOT NULL,
    sso_config_id   INTEGER NOT NULL REFERENCES sso_configurations(id) ON DELETE CASCADE,
    relay_state     VARCHAR(500),
    next_url        VARCHAR(1000),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_saml_sessions_req_id ON saml_sessions (request_id);

-- ── OIDC in-flight state ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oidc_states (
    id              SERIAL PRIMARY KEY,
    state           VARCHAR(128) UNIQUE NOT NULL,
    nonce           VARCHAR(128) NOT NULL,
    pkce_verifier   VARCHAR(128),
    sso_config_id   INTEGER NOT NULL REFERENCES sso_configurations(id) ON DELETE CASCADE,
    next_url        VARCHAR(1000),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_oidc_states_state ON oidc_states (state);

-- ── MFA Credentials ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_credentials (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method                  VARCHAR(20) NOT NULL,  -- totp|webauthn|passkey
    totp_secret             TEXT,                  -- encrypted Fernet
    webauthn_credential_id  TEXT,
    webauthn_public_key     TEXT,
    webauthn_sign_count     INTEGER DEFAULT 0,
    webauthn_aaguid         VARCHAR(36),
    webauthn_transports     JSONB,
    name                    VARCHAR(200),
    active                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_mfa_credentials_user ON mfa_credentials (user_id);

-- ── MFA Backup Codes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   VARCHAR(255) NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_mfa_backup_codes_user ON mfa_backup_codes (user_id);

-- ── MFA Challenges ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_challenges (
    id                  SERIAL PRIMARY KEY,
    challenge_token     VARCHAR(128) UNIQUE NOT NULL,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    webauthn_challenge  VARCHAR(256),
    expires_at          TIMESTAMPTZ NOT NULL,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_mfa_challenges_token ON mfa_challenges (challenge_token);

-- ── SCIM Tokens ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scim_tokens (
    id              SERIAL PRIMARY KEY,
    sso_config_id   INTEGER NOT NULL REFERENCES sso_configurations(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) UNIQUE NOT NULL,
    token_prefix    VARCHAR(20) NOT NULL,
    description     VARCHAR(300),
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_scim_tokens_hash ON scim_tokens (token_hash);

-- ── SCIM Sync Log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scim_sync_logs (
    id                  SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    operation           VARCHAR(30) NOT NULL,
    scim_resource_type  VARCHAR(20) NOT NULL,
    scim_external_id    VARCHAR(256),
    user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status              VARCHAR(20) NOT NULL,
    error_message       TEXT,
    payload_summary     JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_scim_sync_log_org_created
    ON scim_sync_logs (organization_id, created_at DESC);
"""

SQL_DOWN = """
DROP TABLE IF EXISTS scim_sync_logs CASCADE;
DROP TABLE IF EXISTS scim_tokens CASCADE;
DROP TABLE IF EXISTS mfa_challenges CASCADE;
DROP TABLE IF EXISTS mfa_backup_codes CASCADE;
DROP TABLE IF EXISTS mfa_credentials CASCADE;
DROP TABLE IF EXISTS oidc_states CASCADE;
DROP TABLE IF EXISTS saml_sessions CASCADE;
DROP TABLE IF EXISTS sso_configurations CASCADE;
"""


def upgrade(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(SQL_UP))
    print("[migration] SSO/MFA/SCIM tables created.")


def downgrade(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(SQL_DOWN))
    print("[migration] SSO/MFA/SCIM tables dropped.")


if __name__ == "__main__":
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from database import engine
    upgrade(engine)
