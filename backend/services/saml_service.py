"""
SAML 2.0 Service — OrthoClinic Sprint 8

Handles:
  - SP metadata generation
  - AuthnRequest creation + redirect URL
  - Assertion Consumer Service (ACS): parse + validate assertion
  - Attribute mapping → OrthoClinic user fields
  - Single Logout (SLO)

Requires: python3-saml (python3-saml==1.16.0)
    pip install python3-saml

Tested IdPs:
  Azure Active Directory / Entra ID
  Google Workspace
  Okta
  OneLogin
  ADFS (Active Directory Federation Services)
  Generic SAML 2.0
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

from onelogin.saml2.auth import OneLogin_Saml2_Auth
from onelogin.saml2.settings import OneLogin_Saml2_Settings
from onelogin.saml2.utils import OneLogin_Saml2_Utils

from sqlalchemy.orm import Session
from fastapi import Request

from models.sso import SSOConfiguration, SAMLSession
from models.organization import User, Organization

logger = logging.getLogger(__name__)

# ── OrthoClinic base URL (set via env var) ────────────────────────────────────
BASE_URL = os.getenv("BASE_URL", "https://app.orthoclinic.com.br")

# ── Role group claim name → OrthoClinic role mapping ────────────────────────
# IdP group names that map to each role.  Override per-org via saml_attribute_mapping.
DEFAULT_GROUP_ROLE_MAP: dict[str, str] = {
    # Azure AD / Entra ID group object names
    "orthoclinic-admin":     "admin",
    "orthoclinic-doctor":    "doctor",
    "orthoclinic-secretary": "secretary",
    # Okta / OneLogin / Google Workspace profile attribute values
    "admin":     "admin",
    "doctor":    "doctor",
    "medico":    "doctor",
    "secretary": "secretary",
    "secretaria": "secretary",
}


# ---------------------------------------------------------------------------
# Build python3-saml settings dict from DB config
# ---------------------------------------------------------------------------

def _build_saml_settings(config: SSOConfiguration) -> dict:
    """
    Convert a SSOConfiguration row into the dict expected by python3-saml.
    https://github.com/SAML-Toolkits/python3-saml#settings
    """
    sp_entity_id  = f"{BASE_URL}/auth/saml/metadata"
    acs_url       = f"{BASE_URL}/auth/saml/callback"
    slo_url       = f"{BASE_URL}/auth/saml/logout"

    settings: dict = {
        "strict": True,
        "debug": os.getenv("SAML_DEBUG", "false").lower() == "true",
        "sp": {
            "entityId": sp_entity_id,
            "assertionConsumerService": {
                "url":     acs_url,
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
            },
            "singleLogoutService": {
                "url":     slo_url,
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "NameIDFormat": config.saml_nameid_format or
                            "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "x509cert": config.saml_sp_cert or "",
            "privateKey": (config.saml_sp_private_key or "").replace("-----BEGIN RSA PRIVATE KEY-----", "")
                                                                .replace("-----END RSA PRIVATE KEY-----", "")
                                                                .strip()
                                                                .replace("\n", ""),
        },
        "idp": {
            "entityId": config.saml_idp_entity_id or "",
            "singleSignOnService": {
                "url":     config.saml_idp_sso_url or "",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "singleLogoutService": {
                "url":     config.saml_idp_slo_url or "",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "x509cert": (config.saml_idp_cert or "").replace("-----BEGIN CERTIFICATE-----", "")
                                                      .replace("-----END CERTIFICATE-----", "")
                                                      .strip()
                                                      .replace("\n", ""),
        },
        "security": {
            "nameIdEncrypted":       False,
            "authnRequestsSigned":   config.saml_sign_requests,
            "logoutRequestSigned":   config.saml_sign_requests,
            "logoutResponseSigned":  config.saml_sign_requests,
            "signMetadata":          config.saml_sign_requests,
            "wantMessagesSigned":    False,
            "wantAssertionsSigned":  config.saml_require_signed_assertions,
            "wantAssertionsEncrypted": False,
            "wantNameId":            True,
            "wantNameIdEncrypted":   False,
            "requestedAuthnContext": True,
            "signatureAlgorithm":
                "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
            "digestAlgorithm":
                "http://www.w3.org/2001/04/xmlenc#sha256",
            "rejectDeprecatedAlgorithm": True,
        },
    }
    return settings


def _prepare_request(request: Request) -> dict:
    """
    Convert a FastAPI Request into the dict python3-saml expects.
    Handles both GET (redirect binding) and POST (HTTP-POST binding).
    """
    return {
        "https":       "on" if request.url.scheme == "https" else "off",
        "http_host":   request.headers.get("host", request.url.netloc),
        "server_port": str(request.url.port or (443 if request.url.scheme == "https" else 80)),
        "script_name": request.url.path,
        "get_data":    dict(request.query_params),
        "post_data":   {},  # filled by ACS endpoint before calling parse_assertion
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_sp_metadata(config: SSOConfiguration) -> str:
    """
    Return XML metadata for this SP (Service Provider).
    Serve at /auth/saml/metadata?org_id=<org_id>  or a static /auth/saml/metadata
    if the platform is single-tenant.
    """
    settings = OneLogin_Saml2_Settings(settings=_build_saml_settings(config),
                                        sp_validation_only=True)
    metadata = settings.get_sp_metadata()
    errors = settings.validate_metadata(metadata)
    if errors:
        raise ValueError(f"SP metadata invalid: {errors}")
    return metadata


def create_authn_redirect(
    config: SSOConfiguration,
    request: Request,
    db: Session,
    relay_state: Optional[str] = None,
    next_url: Optional[str] = None,
) -> str:
    """
    Build an AuthnRequest and return the IdP SSO redirect URL.
    Persists a SAMLSession row to validate the InResponseTo in the ACS.
    """
    req_dict = _prepare_request(request)
    auth = OneLogin_Saml2_Auth(req_dict, old_settings=_build_saml_settings(config))
    sso_url = auth.login(return_to=relay_state, force_authn=False, is_passive=False)

    # Persist session for reply validation
    request_id = auth.get_last_request_id()
    session = SAMLSession(
        request_id   = request_id,
        sso_config_id= config.id,
        relay_state  = relay_state,
        next_url     = next_url,
        expires_at   = datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(session)
    db.commit()
    return sso_url


def parse_assertion(
    config: SSOConfiguration,
    request: Request,
    post_data: dict,
    db: Session,
) -> dict:
    """
    Validate a SAML Response POSTed to the ACS endpoint.
    Returns normalized user attributes:
      {
        "email": str,
        "first_name": str,
        "last_name": str,
        "display_name": str,
        "groups": list[str],
        "organization_id": str | None,
        "name_id": str,
        "session_index": str | None,
      }
    Raises ValueError on any validation failure.
    """
    req_dict = _prepare_request(request)
    req_dict["post_data"] = post_data

    auth = OneLogin_Saml2_Auth(req_dict, old_settings=_build_saml_settings(config))
    auth.process_response()

    errors = auth.get_errors()
    if errors:
        last_error = auth.get_last_error_reason()
        logger.error("SAML ACS errors: %s — %s", errors, last_error)
        raise ValueError(f"SAML assertion invalid: {last_error or errors}")

    if not auth.is_authenticated():
        raise ValueError("SAML: authentication failed (not authenticated after process_response)")

    # Validate InResponseTo → protect against unsolicited assertions
    in_response_to = auth.get_last_request_id()
    if in_response_to:
        session = db.query(SAMLSession).filter(
            SAMLSession.request_id   == in_response_to,
            SAMLSession.sso_config_id == config.id,
        ).first()
        if not session:
            raise ValueError(f"SAML: unknown InResponseTo='{in_response_to}'")
        if session.expires_at < datetime.now(timezone.utc):
            raise ValueError("SAML: SAMLSession expired")
        # Mark consumed (delete to prevent replay)
        db.delete(session)
        db.commit()

    name_id = auth.get_nameid()
    attrs   = auth.get_attributes()

    return _map_attributes(config, name_id, attrs, auth.get_session_index())


def _map_attributes(
    config: SSOConfiguration,
    name_id: str,
    attrs: dict,
    session_index: Optional[str],
) -> dict:
    """
    Map raw SAML attributes to OrthoClinic fields using the per-config mapping
    (or sensible defaults covering all major IdPs).
    """
    mapping: dict = config.saml_attribute_mapping or {}

    def _get(key: str, defaults: list[str]) -> Optional[str]:
        """Pull first non-empty value from attrs using mapped key or defaults."""
        candidates = [mapping.get(key)] + defaults if mapping.get(key) else defaults
        for candidate in candidates:
            if not candidate:
                continue
            val = attrs.get(candidate)
            if val:
                return val[0] if isinstance(val, list) else val
        return None

    def _get_list(key: str, defaults: list[str]) -> list[str]:
        candidates = [mapping.get(key)] + defaults if mapping.get(key) else defaults
        for candidate in candidates:
            if not candidate:
                continue
            val = attrs.get(candidate)
            if val:
                return val if isinstance(val, list) else [val]
        return []

    # ── email ────────────────────────────────────────────────────────────────
    email = _get("email", [
        # Azure AD / ADFS
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
        # Okta / OneLogin / Google
        "email", "mail", "urn:oid:0.9.2342.19200300.100.1.3",
    ]) or name_id  # NameID is usually email; fall back

    # ── name ─────────────────────────────────────────────────────────────────
    first_name = _get("firstName", [
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
        "givenname", "givenName", "firstName", "first_name",
        "urn:oid:2.5.4.42",
    ]) or ""

    last_name = _get("lastName", [
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
        "surname", "sn", "lastName", "last_name", "familyName",
        "urn:oid:2.5.4.4",
    ]) or ""

    display_name = _get("displayName", [
        "http://schemas.microsoft.com/identity/claims/displayname",
        "displayName", "cn", "name", "urn:oid:2.16.840.1.113730.3.1.241",
    ]) or f"{first_name} {last_name}".strip() or email.split("@")[0]

    # ── groups / roles ────────────────────────────────────────────────────────
    groups = _get_list("groups", [
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
        "groups", "roles", "memberOf",
        "urn:oid:1.3.6.1.4.1.5923.1.5.1.1",  # eduMember
    ])

    # ── organizationId ────────────────────────────────────────────────────────
    org_id_claim = _get("organizationId", [
        "http://schemas.microsoft.com/identity/claims/tenantid",
        "tenantId", "tenant_id", "organizationId", "orgId",
    ])

    return {
        "email":           email.strip().lower(),
        "first_name":      first_name,
        "last_name":       last_name,
        "display_name":    display_name,
        "groups":          groups,
        "organization_id": org_id_claim,
        "name_id":         name_id,
        "session_index":   session_index,
    }


def resolve_role_from_groups(groups: list[str],
                              default_role: str = "secretary") -> str:
    """Map IdP group membership to a single OrthoClinic role (highest wins)."""
    priority = {"admin": 3, "doctor": 2, "secretary": 1}
    best_role  = default_role
    best_prio  = priority.get(default_role, 0)
    for group in groups:
        role = DEFAULT_GROUP_ROLE_MAP.get(group.lower())
        if role and priority.get(role, 0) > best_prio:
            best_role = role
            best_prio = priority[role]
    return best_role


def create_slo_redirect(
    config: SSOConfiguration,
    request: Request,
    name_id: str,
    session_index: Optional[str] = None,
) -> str:
    """
    Build a LogoutRequest and return the IdP SLO redirect URL.
    """
    if not config.saml_idp_slo_url:
        raise ValueError("IdP SLO URL not configured")

    req_dict = _prepare_request(request)
    auth = OneLogin_Saml2_Auth(req_dict, old_settings=_build_saml_settings(config))
    slo_url = auth.logout(name_id=name_id, session_index=session_index)
    return slo_url


def parse_slo_response(
    config: SSOConfiguration,
    request: Request,
    get_data: dict,
) -> None:
    """
    Process a LogoutResponse from the IdP.
    Raises ValueError if invalid.
    """
    req_dict = _prepare_request(request)
    req_dict["get_data"] = get_data
    auth = OneLogin_Saml2_Auth(req_dict, old_settings=_build_saml_settings(config))
    auth.process_slo()
    errors = auth.get_errors()
    if errors:
        raise ValueError(f"SLO response invalid: {auth.get_last_error_reason()}")
