"""
Password Service

Handles:
- Password hashing and verification
- Password strength validation
- Password history tracking
"""

from passlib.context import CryptContext
import re
from fastapi import HTTPException, status

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_strength(password: str) -> None:
    """Validate password strength requirements

    Requirements:
    - Minimum 12 characters
    - At least 1 uppercase letter
    - At least 1 lowercase letter
    - At least 1 digit
    - At least 1 special character (!@#$%^&*)
    """
    errors = []

    if len(password) < 12:
        errors.append("Password must be at least 12 characters long")

    if not re.search(r'[A-Z]', password):
        errors.append("Password must contain at least one uppercase letter")

    if not re.search(r'[a-z]', password):
        errors.append("Password must contain at least one lowercase letter")

    if not re.search(r'\d', password):
        errors.append("Password must contain at least one digit")

    if not re.search(r'[!@#$%^&*]', password):
        errors.append("Password must contain at least one special character (!@#$%^&*)")

    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=" | ".join(errors)
        )


def get_password_strength(password: str) -> dict:
    """
    Calculate password strength score

    Returns dict with:
    - score: 0-6 (higher is stronger)
    - level: weak | fair | good | strong
    - feedback: list of suggestions
    """
    score = 0
    feedback = []

    # Length checks
    if len(password) >= 12:
        score += 1
    else:
        feedback.append("Use at least 12 characters")

    if len(password) >= 16:
        score += 1

    # Character type checks
    if re.search(r'[a-z]', password):
        score += 1
    else:
        feedback.append("Add lowercase letters")

    if re.search(r'[A-Z]', password):
        score += 1
    else:
        feedback.append("Add uppercase letters")

    if re.search(r'\d', password):
        score += 1
    else:
        feedback.append("Add numbers")

    if re.search(r'[!@#$%^&*]', password):
        score += 1
    else:
        feedback.append("Add special characters")

    # Determine level
    if score < 2:
        level = "weak"
    elif score < 4:
        level = "fair"
    elif score < 5:
        level = "good"
    else:
        level = "strong"

    return {
        "score": score,
        "level": level,
        "feedback": feedback,
        "max_score": 6
    }
