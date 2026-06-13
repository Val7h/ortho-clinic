"""
SCIM 2.0 Service — OrthoClinic Sprint 8

Implements RFC 7644 (SCIM Protocol) + RFC 7643 (SCIM Schema).

Supported operations (push from IdP):
  Users:   Create, Read, Update (PUT/PATCH), Deactivate (PATCH active=false)
  Groups:  Create, Read, Update (PUT/PATCH), Delete → role mapping

Base path: /scim/v2/

Supported IdPs (real-time push):
  - Azure Active Directory / Entra ID
  - Okta
  - OneLogin

Group → Role mapping:
  SCIM group displayName (or externalId) → OrthoClinic role
  Uses the same DEFAULT_GROUP_ROLE_MAP as SAML.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from models.organization import User, Organization
from models.sso import SCIMSyncLog, SSOConfiguration
from services.jit_service import SSO_PLACEHOLDER_HASH, deprovision_user
from services.saml_service import DEFAULT_GROUP_ROLE_MAP

logger = logging.getLogger(__name__)

SCIM_SCHEMA_USER  = "urn:ietf:params:scim:schemas:core:2.0:User"
SCIM_SCHEMA_GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group"
SCIM_SCHEMA_LIST  = "urn:ietf:params:scim:api:messages:2.0:ListResponse"
SCIM_SCHEMA_ERROR = "urn:ietf:params:scim:api:messages:2.0:Error"


# ============================================================================
# SCIM User serialization
# ============================================================================

def user_to_scim(user: User) -> dict:
    name_parts = user.name.split(" ", 1)
    return {
        "schemas":    [SCIM_SCHEMA_USER],
        "id":         str(user.id),
        "externalId": user.email,
        "userName":   user.email,
        "name": {
            "formatted":  user.name,
            "givenName":  name_parts[0],
            "familyName": name_parts[1] if len(name_parts) > 1 else "",
        },
        "emails": [{"value": user.email, "primary": True, "type": "work"}],
        "active": user.active,
        "meta": {
            "resourceType": "User",
            "created":      _fmt_dt(user.created_at),
            "lastModified": _fmt_dt(user.updated_at or user.created_at),
            "location":     f"/scim/v2/Users/{user.id}",
        },
        # Enterprise extension
        "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
            "organization": str(user.organization_id),
        },
    }


def _fmt_dt(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ============================================================================
# SCIM User CRUD
# ============================================================================

def scim_list_users(
    org_id: int,
    db: Session,
    filter_str: Optional[str] = None,
    start_index: int = 1,
    count: int = 100,
) -> dict:
    """
    GET /scim/v2/Users
    Supports filter: userName eq "email@org.com"
    """
    query = db.query(User).filter(User.organization_id == org_id)

    if filter_str:
        # Parse simple SCIM filter: "userName eq \"value\""
        import re
        m = re.match(r'(\w+)\s+eq\s+"([^"]+)"', filter_str, re.IGNORECASE)
        if m:
            attr, val = m.group(1).lower(), m.group(2).lower()
            if attr in ("username", "email"):
                query = query.filter(User.email == val)
            elif attr == "active":
                query = query.filter(User.active == (val.lower() == "true"))
            elif attr == "externalid":
                query = query.filter(User.email == val)

    total     = query.count()
    users     = query.offset(start_index - 1).limit(count).all()

    return {
        "schemas":      [SCIM_SCHEMA_LIST],
        "totalResults": total,
        "startIndex":   start_index,
        "itemsPerPage": len(users),
        "Resources":    [user_to_scim(u) for u in users],
    }


def scim_get_user(user_id: int, org_id: int, db: Session) -> dict:
    user = _get_user_or_404(user_id, org_id, db)
    return user_to_scim(user)


def scim_create_user(
    payload: dict,
    org_id: int,
    sso_config: SSOConfiguration,
    db: Session,
) -> tuple[dict, int]:
    """
    POST /scim/v2/Users
    Returns (scim_user_dict, http_status_code).
    """
    email = _extract_email(payload)
    if not email:
        _log_scim(db, org_id, "create_user", "User", None, None, "error",
                  "userName/email missing", payload)
        return _scim_error(400, "userName is required"), 400

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        _log_scim(db, org_id, "create_user", "User", payload.get("externalId"),
                  existing.id, "noop", "user already exists", None)
        return user_to_scim(existing), 200

    name_obj  = payload.get("name", {})
    full_name = (
        name_obj.get("formatted")
        or f"{name_obj.get('givenName', '')} {name_obj.get('familyName', '')}".strip()
        or email.split("@")[0]
    )

    role = _role_from_scim_groups(payload)

    user = User(
        organization_id = org_id,
        email           = email,
        name            = full_name,
        password_hash   = SSO_PLACEHOLDER_HASH,
        role            = role,
        active          = payload.get("active", True),
        is_verified     = True,
    )
    db.add(user)
    db.flush()

    _log_scim(db, org_id, "create_user", "User", payload.get("externalId"),
              user.id, "success", None, {"email": email, "role": role})
    db.commit()
    db.refresh(user)

    logger.info("SCIM: created user id=%d email=%s role=%s", user.id, email, role)
    return user_to_scim(user), 201


def scim_update_user(
    user_id: int,
    payload: dict,
    org_id: int,
    db: Session,
) -> dict:
    """
    PUT /scim/v2/Users/{id} — full replacement
    """
    user  = _get_user_or_404(user_id, org_id, db)
    email = _extract_email(payload) or user.email

    name_obj  = payload.get("name", {})
    full_name = (
        name_obj.get("formatted")
        or f"{name_obj.get('givenName', '')} {name_obj.get('familyName', '')}".strip()
        or user.name
    )

    active = payload.get("active", True)
    role   = _role_from_scim_groups(payload) or user.role

    changed = {}
    if email != user.email:
        changed["email"] = (user.email, email)
        user.email = email
    if full_name and full_name != user.name:
        changed["name"] = (user.name, full_name)
        user.name = full_name
    if role != user.role:
        changed["role"] = (user.role, role)
        user.role = role
    if active != user.active:
        changed["active"] = (user.active, active)
        user.active = active

    _log_scim(db, org_id, "update_user", "User", payload.get("externalId"),
              user.id, "success", None, changed)
    db.commit()
    db.refresh(user)
    return user_to_scim(user)


def scim_patch_user(
    user_id: int,
    operations: list[dict],
    org_id: int,
    db: Session,
) -> dict:
    """
    PATCH /scim/v2/Users/{id}
    Supports: replace active, replace emails, replace name
    """
    user = _get_user_or_404(user_id, org_id, db)

    for op in operations:
        op_name = (op.get("op") or "").lower()
        path    = (op.get("path") or "").lower()
        value   = op.get("value")

        if op_name == "replace":
            if path == "active" or (isinstance(value, dict) and "active" in value):
                new_active = value if isinstance(value, bool) else value.get("active", user.active)
                if not new_active and user.active:
                    deprovision_user(user, "SCIM deactivation", db)
                    _log_scim(db, org_id, "deactivate_user", "User", None,
                              user.id, "success", None, {"reason": "SCIM PATCH active=false"})
                elif new_active and not user.active:
                    user.active = True
                    _log_scim(db, org_id, "update_user", "User", None,
                              user.id, "success", None, {"active": True})

            elif path in ("username", "emails[type eq \"work\"].value"):
                email = value if isinstance(value, str) else (
                    next((e["value"] for e in value if e.get("primary")), user.email)
                    if isinstance(value, list) else user.email
                )
                user.email = email.strip().lower()

            elif path == "name.formatted":
                user.name = value
            elif path == "name.givenname":
                parts = user.name.split(" ", 1)
                user.name = f"{value} {parts[1] if len(parts) > 1 else ''}".strip()
            elif path == "name.familyname":
                parts = user.name.split(" ", 1)
                user.name = f"{parts[0]} {value}".strip()

    db.commit()
    db.refresh(user)
    return user_to_scim(user)


def scim_delete_user(user_id: int, org_id: int, db: Session) -> None:
    """
    DELETE /scim/v2/Users/{id} — soft delete (deactivate)
    """
    user = _get_user_or_404(user_id, org_id, db)
    deprovision_user(user, "SCIM delete", db)
    _log_scim(db, org_id, "deactivate_user", "User", None, user.id,
              "success", None, {"reason": "SCIM DELETE"})


# ============================================================================
# SCIM Groups (→ role mapping)
# ============================================================================

def scim_list_groups(org_id: int, db: Session) -> dict:
    """
    GET /scim/v2/Groups
    Returns synthetic groups based on distinct roles in the org.
    """
    roles    = db.query(User.role).filter(
        User.organization_id == org_id, User.active == True
    ).distinct().all()
    groups   = []
    for (role,) in roles:
        members = db.query(User).filter(
            User.organization_id == org_id,
            User.role == role,
            User.active == True,
        ).all()
        groups.append({
            "schemas":     [SCIM_SCHEMA_GROUP],
            "id":          f"role-{role}",
            "displayName": f"orthoclinic-{role}",
            "members":     [{"value": str(u.id), "display": u.email} for u in members],
            "meta": {"resourceType": "Group", "location": f"/scim/v2/Groups/role-{role}"},
        })
    return {
        "schemas":      [SCIM_SCHEMA_LIST],
        "totalResults": len(groups),
        "startIndex":   1,
        "itemsPerPage": len(groups),
        "Resources":    groups,
    }


# ============================================================================
# Helpers
# ============================================================================

def _get_user_or_404(user_id: int, org_id: int, db: Session) -> User:
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == org_id,
    ).first()
    if not user:
        raise _SCIMNotFound(f"User {user_id} not found")
    return user


def _extract_email(payload: dict) -> Optional[str]:
    # Try emails list first
    emails = payload.get("emails")
    if emails and isinstance(emails, list):
        primary = next((e["value"] for e in emails if e.get("primary")), None)
        if primary:
            return primary.strip().lower()
        if emails:
            return emails[0].get("value", "").strip().lower()
    # Fall back to userName
    username = payload.get("userName") or payload.get("externalId")
    return username.strip().lower() if username else None


def _role_from_scim_groups(payload: dict) -> str:
    """
    Extract role from 'groups' array in SCIM payload.
    Uses DEFAULT_GROUP_ROLE_MAP (same as SAML).
    """
    groups = payload.get("groups") or []
    for g in groups:
        display = (g.get("display") or g.get("value") or "").lower()
        if display in DEFAULT_GROUP_ROLE_MAP:
            return DEFAULT_GROUP_ROLE_MAP[display]
    return "secretary"


def _scim_error(status: int, detail: str) -> dict:
    return {
        "schemas": [SCIM_SCHEMA_ERROR],
        "status":  str(status),
        "detail":  detail,
    }


def _log_scim(
    db: Session,
    org_id: int,
    operation: str,
    resource_type: str,
    external_id: Optional[str],
    user_id: Optional[int],
    status: str,
    error: Optional[str],
    payload_summary: Optional[dict],
) -> None:
    log = SCIMSyncLog(
        organization_id    = org_id,
        operation          = operation,
        scim_resource_type = resource_type,
        scim_external_id   = external_id,
        user_id            = user_id,
        status             = status,
        error_message      = error,
        payload_summary    = payload_summary,
    )
    db.add(log)
    # do not commit here — caller commits


class _SCIMNotFound(Exception):
    pass
