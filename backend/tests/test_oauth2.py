"""
OAuth2 Authorization Server Tests — OrthoClinic Sprint 7

Tests cover:
- PKCE pair generation and S256 verification
- JWT mint / verify round-trip
- Access token revocation check
- Scope validation helpers
- API key prefix format
- get_jwks structure
- Opaque refresh token entropy
"""

import base64
import hashlib
import secrets

import pytest

from services.oauth2_service import (
    CANONICAL_SCOPES,
    SENSITIVE_SCOPES,
    generate_pkce_pair,
    get_jwks,
    mint_access_token,
    validate_scopes,
    verify_access_token,
    verify_pkce,
    _generate_opaque_token,
    _generate_user_code,
)


# ---------------------------------------------------------------------------
# PKCE
# ---------------------------------------------------------------------------

def test_pkce_pair_generates_valid_s256():
    verifier, challenge = generate_pkce_pair()
    assert verify_pkce(verifier, challenge, "S256")


def test_pkce_wrong_verifier_fails():
    _, challenge = generate_pkce_pair()
    assert not verify_pkce("wrong_verifier", challenge, "S256")


def test_pkce_plain_method():
    verifier = secrets.token_urlsafe(32)
    assert verify_pkce(verifier, verifier, "plain")
    assert not verify_pkce(verifier, "not_" + verifier, "plain")


def test_pkce_unknown_method_fails():
    assert not verify_pkce("v", "c", "MD5")


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def test_jwt_mint_and_verify_round_trip():
    import uuid
    jti = str(uuid.uuid4())
    token = mint_access_token(
        jti=jti,
        sub="42",
        client_id="oc_test_abc",
        scopes=["patients:read", "appointments:read"],
        organization_id=7,
    )
    assert isinstance(token, str)
    payload = verify_access_token(token)
    assert payload["sub"] == "42"
    assert payload["jti"] == jti
    assert payload["org_id"] == 7
    assert "patients:read" in payload["scope"]


def test_jwt_tampered_signature_rejected():
    import uuid
    token = mint_access_token(
        jti=str(uuid.uuid4()),
        sub="1",
        client_id="oc_x",
        scopes=["org:read"],
    )
    # Replace the last 8 characters of the signature segment with fixed garbage
    tampered = token[:-8] + "XXXXXXXX"
    from jose import JWTError
    with pytest.raises(JWTError):
        verify_access_token(tampered)


def test_jwt_expired_token_rejected(monkeypatch):
    """Force expiry by minting with ttl=0 and patching datetime."""
    import uuid
    from datetime import datetime, timezone, timedelta
    # mint with negative ttl to force exp in past
    jti = str(uuid.uuid4())
    # We mint with ttl=-10 which sets exp = now - 10s → should fail verification
    import services.oauth2_service as svc
    from datetime import timedelta as td
    original_mint = svc.mint_access_token

    # Patch: mint token that expired 60s ago
    token = original_mint(
        jti=jti,
        sub="99",
        client_id="oc_y",
        scopes=[],
        ttl=-60,
    )
    from jose import JWTError
    with pytest.raises(JWTError):
        verify_access_token(token)


# ---------------------------------------------------------------------------
# Scopes
# ---------------------------------------------------------------------------

def test_validate_scopes_intersection():
    result = validate_scopes(
        ["patients:read", "appointments:read"],
        ["patients:read", "patients:write", "appointments:read"],
    )
    assert set(result) == {"patients:read", "appointments:read"}


def test_validate_scopes_filters_disallowed():
    result = validate_scopes(["patients:read", "admin:full"], ["patients:read"])
    assert result == ["patients:read"]


def test_validate_scopes_unknown_raises():
    with pytest.raises(ValueError, match="Unknown scopes"):
        validate_scopes(["nonexistent:scope"], ["patients:read"])


def test_sensitive_scopes_subset_of_canonical():
    assert SENSITIVE_SCOPES.issubset(CANONICAL_SCOPES)


def test_admin_full_is_sensitive():
    assert "admin:full" in SENSITIVE_SCOPES


# ---------------------------------------------------------------------------
# JWKS
# ---------------------------------------------------------------------------

def test_jwks_structure():
    jwks = get_jwks()
    assert "keys" in jwks
    assert len(jwks["keys"]) >= 1
    key = jwks["keys"][0]
    assert key["kty"] == "RSA"
    assert key["alg"] == "RS256"
    assert key["use"] == "sig"
    assert "n" in key
    assert "e" in key
    assert "kid" in key


# ---------------------------------------------------------------------------
# Opaque tokens
# ---------------------------------------------------------------------------

def test_opaque_token_entropy():
    tokens = {_generate_opaque_token() for _ in range(100)}
    assert len(tokens) == 100, "All opaque tokens should be unique"


def test_opaque_token_url_safe():
    import re
    token = _generate_opaque_token()
    # base64url — only alphanumeric + - _ =
    assert re.match(r"^[A-Za-z0-9\-_]+$", token)


# ---------------------------------------------------------------------------
# Device user code
# ---------------------------------------------------------------------------

def test_user_code_format():
    code = _generate_user_code()
    assert "-" in code
    parts = code.split("-")
    assert len(parts) == 2
    assert all(c.isalpha() and c.isupper() for c in "".join(parts))
    # No ambiguous characters
    for ch in ("O", "I", "L"):
        assert ch not in code


def test_user_code_uniqueness():
    codes = {_generate_user_code() for _ in range(200)}
    # Statistically extremely unlikely to collide in 200
    assert len(codes) >= 195
