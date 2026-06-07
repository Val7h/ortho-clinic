"""
TOTP Service (Two-Factor Authentication)

Handles:
- TOTP secret generation
- QR code generation
- Backup code generation
- TOTP verification
"""

import pyotp
import qrcode
import io
import base64
import secrets
import string


def generate_totp_secret(user_email: str, issuer_name: str = "OrthoClinic") -> tuple:
    """
    Generate a TOTP secret and QR code

    Returns:
        tuple: (secret, qr_code_url_base64)
    """
    totp = pyotp.TOTP.new(issuer=issuer_name)
    secret = totp.secret

    # Generate provisioning URI
    uri = totp.provisioning_uri(name=user_email, issuer_name=issuer_name)

    # Generate QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(uri)
    qr.make(fit=True)

    # Convert to image
    img = qr.make_image(fill_color="black", back_color="white")

    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    qr_code = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()

    return secret, qr_code


def verify_totp(secret: str, token: str, window: int = 1) -> bool:
    """
    Verify a TOTP token

    Args:
        secret: TOTP secret
        token: 6-digit TOTP code
        window: Time window to verify (in 30-second intervals)

    Returns:
        bool: True if token is valid
    """
    totp = pyotp.TOTP(secret)
    return totp.verify(token, valid_window=window)


def generate_backup_codes(count: int = 10, length: int = 8) -> list:
    """
    Generate backup codes for account recovery

    Args:
        count: Number of backup codes to generate
        length: Length of each code

    Returns:
        list: List of backup codes
    """
    codes = []
    charset = string.ascii_uppercase + string.digits

    for _ in range(count):
        code = ''.join(secrets.choice(charset) for _ in range(length))
        codes.append(code)

    return codes


def hash_backup_code(code: str) -> str:
    """
    Hash a backup code for storage

    Args:
        code: Backup code to hash

    Returns:
        str: Hashed backup code
    """
    import hashlib
    return hashlib.sha256(code.encode()).hexdigest()


def verify_backup_code(plain_code: str, hashed_code: str) -> bool:
    """
    Verify a backup code against its hash

    Args:
        plain_code: Plain backup code
        hashed_code: Hashed backup code

    Returns:
        bool: True if code matches
    """
    import hashlib
    return hashlib.sha256(plain_code.encode()).hexdigest() == hashed_code
