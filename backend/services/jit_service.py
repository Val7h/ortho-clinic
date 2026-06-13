"""
JIT Provisioning Service — OrthoClinic Sprint 8

Just-in-Time user provisioning:
  1. First SSO login: auto-create user account.
  2. Role assigned from SAML groups claim.
  3. Optional pending-approval workflow (configurable per org).
  4. Subsequent logins: update name/role if changed in IdP.
  5. Deprovisioning: user deactivated via SCIM or SLO → session invalidated.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from models.organization import User, Organization
from models.sso import SSOConfiguration, SCIMSyncLog
from services.saml_service import resolve_role_from_groups

logger = logging.getLogger(__name__)

# Placeholder password hash for SSO-only users (no direct password login)
SSO_PLACEHOLDER_HASH = "$argon2id$sso-account-no-password-login$"


def provision_or_update_user(
    sso_config: SSOConfiguration,
    attrs: dict,
    db: Session,
) -> tuple[User, bool]:
    """
    Find or create a User from SSO attributes.

    Args:
        sso_config: Active SSO configuration for the organization.
        attrs: Normalized user attributes from SAML/OIDC:
               email, first_name, last_name, display_name, groups, organization_id
        db: SQLAlchemy session.

    Returns:
        (user, created) — created=True on first-login JIT provisioning.

    Raises:
        ValueError: If JIT provisioning is disabled and user doesn't exist.
        PermissionError: If jit_approval_required and user is pending.
    """
    email = attrs["email"].strip().lower()
    org   = db.query(Organization).filter(Organization.id == sso_config.organization_id).first()
    if not org:
        raise ValueError(f"Organization {sso_config.organization_id} not found")

    user    = db.query(User).filter(User.email == email).first()
    created = False

    if user is None:
        # ── New user ──────────────────────────────────────────────────────────
        if not sso_config.jit_provisioning_enabled:
            raise ValueError(
                f"JIT provisioning disabled. User '{email}' has no OrthoClinic account."
            )

        role = resolve_role_from_groups(
            attrs.get("groups", []),
            default_role=sso_config.jit_default_role or "secretary",
        )

        user = User(
            organization_id = sso_config.organization_id,
            email           = email,
            name            = attrs.get("display_name") or email.split("@")[0],
            password_hash   = SSO_PLACEHOLDER_HASH,
            role            = role,
            active          = not sso_config.jit_approval_required,
            is_verified     = True,   # IdP already verified the email
        )
        db.add(user)
        db.flush()  # get user.id without full commit
        created = True

        logger.info(
            "JIT: created user id=%d email=%s role=%s org=%d approval_required=%s",
            user.id, email, role, org.id, sso_config.jit_approval_required,
        )

        if sso_config.jit_approval_required:
            db.commit()
            raise PermissionError(
                f"Account created for '{email}' but requires admin approval before first login."
            )

    else:
        # ── Existing user — sync updated attributes ────────────────────────────
        _sync_user_attributes(user, attrs, sso_config)

        if not user.active:
            raise PermissionError(
                f"Account for '{email}' is deactivated. Contact your administrator."
            )
        if user.is_suspended:
            raise PermissionError(
                f"Account for '{email}' is suspended: {user.suspension_reason}"
            )

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user, created


def _sync_user_attributes(
    user: User,
    attrs: dict,
    sso_config: SSOConfiguration,
) -> None:
    """
    Sync display name and role from IdP on each login.
    Does not touch password_hash (SSO users authenticate via IdP only).
    """
    new_name = attrs.get("display_name") or user.name
    if new_name and new_name != user.name:
        logger.info("JIT sync: updating name for user %d: %r → %r", user.id, user.name, new_name)
        user.name = new_name

    # Only update role if groups claim is present and non-empty
    groups = attrs.get("groups") or []
    if groups:
        new_role = resolve_role_from_groups(
            groups,
            default_role=sso_config.jit_default_role or user.role,
        )
        if new_role != user.role:
            logger.info(
                "JIT sync: role change for user %d %r: %r → %r",
                user.id, user.email, user.role, new_role,
            )
            user.role = new_role


def deprovision_user(user: User, reason: str, db: Session) -> None:
    """
    Deactivate a user (called from SCIM deactivate or SLO event).
    Invalidates all sessions by rotating the user's security stamp.
    """
    logger.info("Deprovisioning user id=%d email=%s reason=%s", user.id, user.email, reason)
    user.active             = False
    user.suspension_reason  = reason
    # Invalidating sessions: the JWT blacklist check in deps.py will catch active==False
    db.commit()
