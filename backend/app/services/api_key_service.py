"""
API Key Service

Handles:
- API key generation
- API key hashing and verification
- API key validation
"""

import secrets
import string
import hashlib


def generate_api_key(prefix: str = "sk_live", key_length: int = 32) -> str:
    """
    Generate a cryptographically secure API key

    Args:
        prefix: Prefix for the API key
        key_length: Length of the random part

    Returns:
        str: Generated API key
    """
    # Generate random key using system's secure random
    random_part = secrets.token_urlsafe(key_length)

    return f"{prefix}_{random_part}"


def hash_api_key(api_key: str) -> str:
    """
    Hash an API key for storage

    Args:
        api_key: API key to hash

    Returns:
        str: SHA-256 hash of the API key
    """
    return hashlib.sha256(api_key.encode()).hexdigest()


def verify_api_key(plain_key: str, hashed_key: str) -> bool:
    """
    Verify an API key against its hash

    Args:
        plain_key: Plain API key
        hashed_key: Hashed API key

    Returns:
        bool: True if key matches
    """
    return hash_api_key(plain_key) == hashed_key


def get_api_key_prefix(api_key: str, prefix_length: int = 8) -> str:
    """
    Get the prefix of an API key (visible part)

    Args:
        api_key: Full API key
        prefix_length: Length of prefix to return

    Returns:
        str: API key prefix
    """
    return api_key[:prefix_length]


def get_api_key_suffix(api_key: str, suffix_length: int = 4) -> str:
    """
    Get the suffix of an API key

    Args:
        api_key: Full API key
        suffix_length: Length of suffix to return

    Returns:
        str: API key suffix
    """
    return api_key[-suffix_length:]


def mask_api_key(api_key: str) -> str:
    """
    Mask an API key for display (show only prefix and suffix)

    Args:
        api_key: Full API key

    Returns:
        str: Masked API key
    """
    prefix = get_api_key_prefix(api_key, 8)
    suffix = get_api_key_suffix(api_key, 4)
    return f"{prefix}...{suffix}"
