"""
MFA Service — OrthoClinic Sprint 8

Supports:
  - TOTP (RFC 6238): Google Authenticator, Authy, etc.
  - WebAuthn / FIDO2 / Passkeys (via py_webauthn)
  - Backup codes (10 single-use, bcrypt-hashed)
  - MFA challenge/verify flow
  - Admin: force MFA reset for a user
  - Org-level policy enforcement

Dependencies:
  pip install pyotp==2.9.0 qrcode[pil]==7.4.2 py_webauthn==2.1.0 passlib[bcrypt]
"""

from __future__ import annotations

import base64
import os
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import pyotp
import qrcode
import qrcode.image.svg
from io import BytesIO
from passlib.context import CryptContext

from sqlalchemy.orm import Session
from fastapi import HTTPException

from models.sso import MFACredential, MFABackupCode, MFAChallenge, SSOConfiguration
from models.organization import User

logger  = logging.getLogger(__name__)
_bcrypt = CryptContext(schemes=["bcrypt"], deprecated="auto")

APP_NAME       = os.getenv("APP_NAME", "OrthoClinic")
BASE_URL       = os.getenv("BASE_URL", "https://app.orthoclinic.com.br")
WEBAUTHN_RP_ID = os.getenv("WEBAUTHN_RP_ID", "app.orthoclinic.com.br")

# MFA challenge TTL
CHALLENGE_TTL_SECONDS = 300   # 5 minutes
BACKUP_CODE_COUNT     = 10


# ============================================================================
# MFA Policy
# ============================================================================

def is_mfa_required(user: User, sso_config: Optional[SSOConfiguration]) -> bool:
    """
    Return True if MFA is required for this user right now.
    Considers org-level policy and grace period for new users.
    """
    if sso_config and sso_config.mfa_policy == "required":
        grace_days = sso_config.mfa_grace_days or 7
        if user.created_at:
            age_days = (datetime.now(timezone.utc) - user.created_at).days
            if age_days <= grace_days:
                return False   # still within grace period
        return True
    return False


def user_has_mfa(user: User, db: Session) -> bool:
    """Return True if the user has at least one active MFA credential."""
    return db.query(MFACredential).filter(
        MFACredential.user_id == user.id,
        MFACredential.active  == True,
    ).count() > 0


# ============================================================================
# TOTP
# ============================================================================

def generate_totp_secret() -> str:
    """Generate a new base32 TOTP secret."""
    return pyotp.random_base32()


def get_totp_provisioning_uri(user: User, secret: str) -> str:
    """Return the otpauth:// URI for QR code generation."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=user.email, issuer_name=APP_NAME)


def get_totp_qr_svg(user: User, secret: str) -> str:
    """Return an SVG QR code for the TOTP provisioning URI."""
    uri = get_totp_provisioning_uri(user, secret)
    qr  = qrcode.make(uri, image_factory=qrcode.image.svg.SvgImage)
    buf = BytesIO()
    qr.save(buf)
    return buf.getvalue().decode("utf-8")


def enroll_totp(user: User, secret: str, code: str, name: str, db: Session) -> MFACredential:
    """
    Verify the first TOTP code (proves the user has the secret), then save.
    Raises HTTPException(400) if code is wrong.
    """
    totp = pyotp.TOTP(secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(400, "TOTP code invalid — check your authenticator app")

    cred = MFACredential(
        user_id     = user.id,
        method      = "totp",
        totp_secret = _encrypt_secret(secret),   # encrypt before storing
        name        = name or "Authenticator App",
        active      = True,
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    logger.info("TOTP enrolled for user %d", user.id)
    return cred


def verify_totp(user: User, code: str, db: Session) -> bool:
    """
    Verify a TOTP code against all active TOTP credentials for the user.
    Returns True on success; raises HTTPException(401) on failure.
    """
    credentials = db.query(MFACredential).filter(
        MFACredential.user_id == user.id,
        MFACredential.method  == "totp",
        MFACredential.active  == True,
    ).all()

    for cred in credentials:
        secret = _decrypt_secret(cred.totp_secret)
        totp   = pyotp.TOTP(secret)
        if totp.verify(code, valid_window=1):
            cred.last_used_at = datetime.now(timezone.utc)
            db.commit()
            return True

    raise HTTPException(401, "TOTP code inválido ou expirado")


# ============================================================================
# WebAuthn / FIDO2 / Passkeys
# ============================================================================

def _get_webauthn_rp():
    """Lazy-import webauthn to avoid hard dependency if not used."""
    try:
        import webauthn
        return webauthn
    except ImportError:
        raise RuntimeError(
            "py_webauthn not installed. Run: pip install py_webauthn==2.1.0"
        )


def generate_webauthn_registration_options(user: User, db: Session) -> dict:
    """
    Generate WebAuthn credential creation options (RP → browser).
    Returns a dict suitable for JSON serialization.
    """
    webauthn = _get_webauthn_rp()

    # Exclude already-registered credentials
    existing = db.query(MFACredential).filter(
        MFACredential.user_id == user.id,
        MFACredential.method.in_(["webauthn", "passkey"]),
        MFACredential.active  == True,
    ).all()
    exclude_creds = [
        webauthn.helpers.structs.PublicKeyCredentialDescriptor(
            id=base64.urlsafe_b64decode(c.webauthn_credential_id + "==")
        )
        for c in existing
        if c.webauthn_credential_id
    ]

    options = webauthn.generate_registration_options(
        rp_id              = WEBAUTHN_RP_ID,
        rp_name            = APP_NAME,
        user_id            = str(user.id).encode(),
        user_name          = user.email,
        user_display_name  = user.name,
        attestation        = webauthn.helpers.structs.AttestationConveyancePreference.NONE,
        authenticator_selection = webauthn.helpers.structs.AuthenticatorSelectionCriteria(
            resident_key        = webauthn.helpers.structs.ResidentKeyRequirement.PREFERRED,
            user_verification   = webauthn.helpers.structs.UserVerificationRequirement.PREFERRED,
        ),
        supported_pub_key_algs = [
            webauthn.helpers.structs.COSEAlgorithmIdentifier.ECDSA_SHA_256,
            webauthn.helpers.structs.COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
        exclude_credentials = exclude_creds,
        timeout             = 60_000,
    )

    return webauthn.options_to_json(options)


def verify_webauthn_registration(
    user: User,
    credential: dict,
    expected_challenge: bytes,
    method: str,
    name: str,
    db: Session,
) -> MFACredential:
    """
    Verify and store a newly registered WebAuthn credential.
    method: "webauthn" | "passkey"
    """
    webauthn = _get_webauthn_rp()

    verification = webauthn.verify_registration_response(
        credential         = credential,
        expected_challenge = expected_challenge,
        expected_rp_id     = WEBAUTHN_RP_ID,
        expected_origin    = BASE_URL,
        require_user_verification = False,
    )

    cred_id_b64 = base64.urlsafe_b64encode(verification.credential_id).decode().rstrip("=")
    pub_key_b64 = base64.urlsafe_b64encode(verification.credential_public_key).decode().rstrip("=")

    cred = MFACredential(
        user_id                 = user.id,
        method                  = method,
        webauthn_credential_id  = cred_id_b64,
        webauthn_public_key     = pub_key_b64,
        webauthn_sign_count     = verification.sign_count,
        webauthn_aaguid         = str(verification.aaguid) if verification.aaguid else None,
        webauthn_transports     = list(verification.credential_device_type or []),
        name                    = name or method.title(),
        active                  = True,
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    logger.info("WebAuthn %s enrolled for user %d cred_id=%s", method, user.id, cred_id_b64[:16])
    return cred


def generate_webauthn_authentication_options(user: User, db: Session) -> dict:
    """Generate WebAuthn assertion options for login verification."""
    webauthn = _get_webauthn_rp()

    creds = db.query(MFACredential).filter(
        MFACredential.user_id == user.id,
        MFACredential.method.in_(["webauthn", "passkey"]),
        MFACredential.active  == True,
    ).all()

    allow_creds = [
        webauthn.helpers.structs.PublicKeyCredentialDescriptor(
            id          = base64.urlsafe_b64decode(c.webauthn_credential_id + "=="),
            transports  = c.webauthn_transports or [],
        )
        for c in creds
        if c.webauthn_credential_id
    ]

    options = webauthn.generate_authentication_options(
        rp_id                = WEBAUTHN_RP_ID,
        allow_credentials    = allow_creds,
        user_verification    = webauthn.helpers.structs.UserVerificationRequirement.PREFERRED,
        timeout              = 60_000,
    )
    return webauthn.options_to_json(options)


def verify_webauthn_authentication(
    user: User,
    credential: dict,
    expected_challenge: bytes,
    db: Session,
) -> bool:
    """Verify a WebAuthn assertion. Updates sign_count. Raises on failure."""
    webauthn = _get_webauthn_rp()

    cred_id_b64 = base64.urlsafe_b64encode(
        base64.urlsafe_b64decode(credential["id"] + "==")
    ).decode().rstrip("=")

    stored = db.query(MFACredential).filter(
        MFACredential.user_id               == user.id,
        MFACredential.webauthn_credential_id == cred_id_b64,
        MFACredential.active                == True,
    ).first()

    if not stored:
        raise HTTPException(401, "WebAuthn credential not found")

    pub_key = base64.urlsafe_b64decode(stored.webauthn_public_key + "==")

    verification = webauthn.verify_authentication_response(
        credential          = credential,
        expected_challenge  = expected_challenge,
        expected_rp_id      = WEBAUTHN_RP_ID,
        expected_origin     = BASE_URL,
        credential_public_key   = pub_key,
        credential_current_sign_count = stored.webauthn_sign_count,
        require_user_verification = False,
    )

    stored.webauthn_sign_count = verification.new_sign_count
    stored.last_used_at        = datetime.now(timezone.utc)
    db.commit()
    return True


# ============================================================================
# Backup Codes
# ============================================================================

def generate_backup_codes(user: User, db: Session) -> list[str]:
    """
    Generate 10 single-use backup codes.
    Replaces any existing codes.
    Returns plaintext codes to show once to the user.
    """
    # Invalidate old codes
    db.query(MFABackupCode).filter(MFABackupCode.user_id == user.id).delete()

    plain_codes = []
    for _ in range(BACKUP_CODE_COUNT):
        # Format: XXXX-XXXX-XXXX (readable but secure)
        segments = [secrets.token_hex(2).upper() for _ in range(3)]
        code     = "-".join(segments)
        plain_codes.append(code)
        db.add(MFABackupCode(
            user_id   = user.id,
            code_hash = _bcrypt.hash(code.replace("-", "").lower()),
        ))

    db.commit()
    logger.info("Generated %d backup codes for user %d", BACKUP_CODE_COUNT, user.id)
    return plain_codes


def verify_backup_code(user: User, code: str, db: Session) -> bool:
    """
    Verify and consume a backup code.
    Raises HTTPException(401) on failure.
    """
    normalized = code.replace("-", "").replace(" ", "").lower()

    unused_codes = db.query(MFABackupCode).filter(
        MFABackupCode.user_id == user.id,
        MFABackupCode.used_at == None,
    ).all()

    for backup in unused_codes:
        if _bcrypt.verify(normalized, backup.code_hash):
            backup.used_at = datetime.now(timezone.utc)
            db.commit()
            remaining = db.query(MFABackupCode).filter(
                MFABackupCode.user_id == user.id,
                MFABackupCode.used_at == None,
            ).count()
            logger.info(
                "Backup code used for user %d — %d remaining", user.id, remaining
            )
            return True

    raise HTTPException(401, "Código de recuperação inválido ou já utilizado")


# ============================================================================
# MFA Challenge (post-password, pre-session)
# ============================================================================

def create_mfa_challenge(user: User, db: Session) -> str:
    """
    Issue a short-lived MFA challenge token after password verification.
    The client must complete MFA within CHALLENGE_TTL_SECONDS.
    Returns the challenge_token to send to the client.
    """
    token = secrets.token_urlsafe(48)
    challenge = MFAChallenge(
        challenge_token = token,
        user_id         = user.id,
        expires_at      = datetime.now(timezone.utc) + timedelta(seconds=CHALLENGE_TTL_SECONDS),
    )
    db.add(challenge)
    db.commit()
    return token


def get_pending_challenge(challenge_token: str, db: Session) -> MFAChallenge:
    """Retrieve and validate an open MFA challenge. Raises 401 if invalid/expired."""
    challenge = db.query(MFAChallenge).filter(
        MFAChallenge.challenge_token == challenge_token,
        MFAChallenge.completed_at   == None,
    ).first()
    if not challenge:
        raise HTTPException(401, "MFA challenge inválido ou já utilizado")
    if challenge.expires_at < datetime.now(timezone.utc):
        raise HTTPException(401, "MFA challenge expirado — faça login novamente")
    return challenge


def complete_challenge(challenge: MFAChallenge, db: Session) -> None:
    challenge.completed_at = datetime.now(timezone.utc)
    db.commit()


# ============================================================================
# Admin: Force MFA Reset
# ============================================================================

def force_mfa_reset(target_user: User, admin: User, db: Session) -> None:
    """
    Admin action: revoke all MFA credentials and backup codes for a user.
    The user must re-enroll on next login.
    """
    db.query(MFACredential).filter(MFACredential.user_id == target_user.id).update(
        {"active": False}
    )
    db.query(MFABackupCode).filter(MFABackupCode.user_id == target_user.id).delete()
    db.commit()
    logger.info(
        "MFA reset forced for user %d by admin %d", target_user.id, admin.id
    )


# ============================================================================
# Encryption helpers (simple Fernet; replace with KMS in production)
# ============================================================================

def _get_fernet():
    from cryptography.fernet import Fernet
    key_b64 = os.getenv("MFA_ENCRYPTION_KEY")
    if not key_b64:
        # Generate one for dev; log a warning
        logger.warning(
            "MFA_ENCRYPTION_KEY not set — using ephemeral key. "
            "Set this env var to a Fernet key for production."
        )
        key_b64 = Fernet.generate_key().decode()
    return Fernet(key_b64.encode() if isinstance(key_b64, str) else key_b64)


def _encrypt_secret(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def _decrypt_secret(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()
