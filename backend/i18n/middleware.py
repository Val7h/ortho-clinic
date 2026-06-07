"""
FastAPI middleware for handling internationalization (i18n).

Detects language from headers, query parameters, and user preferences.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from typing import Optional
from contextlib import asynccontextmanager

from .config import I18nConfig, get_translation_manager, TranslationManager

# Context variable for current language
_current_language: Optional[str] = None

def set_language(language: str) -> None:
    """Set the current language for this request."""
    global _current_language
    if language in [l.value for l in I18nConfig.SUPPORTED_LANGUAGES]:
        _current_language = language
        get_translation_manager(language)

def get_language() -> str:
    """Get the current language for this request."""
    global _current_language
    return _current_language or I18nConfig.DEFAULT_LANGUAGE.value

@asynccontextmanager
async def with_language(language: str):
    """Context manager for temporarily switching language."""
    global _current_language
    previous = _current_language
    try:
        set_language(language)
        yield
    finally:
        _current_language = previous

class I18nMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for automatic language detection and management.

    Detects language from (in order of precedence):
    1. Query parameter: ?lang=en
    2. Accept-Language header
    3. User preference (if authenticated)
    4. Default language
    """

    async def dispatch(self, request: Request, call_next) -> None:
        """Process request and set appropriate language."""
        language = await self._detect_language(request)
        set_language(language)

        # Add language to request state for use in handlers
        request.state.language = language
        request.state.translator = get_translation_manager(language)

        response = await call_next(request)

        # Add language header to response
        response.headers["X-Language"] = language

        return response

    async def _detect_language(self, request: Request) -> str:
        """
        Detect language from request.

        Checks in order:
        1. Query parameter ?lang=en
        2. Accept-Language header
        3. User preference (if authenticated)
        4. Default language
        """
        # 1. Check query parameter
        lang = request.query_params.get("lang")
        if self._is_valid_language(lang):
            return lang

        # 2. Check Accept-Language header
        accept_language = request.headers.get("Accept-Language", "")
        if accept_language:
            lang = self._parse_accept_language(accept_language)
            if self._is_valid_language(lang):
                return lang

        # 3. Check user preference (if authenticated)
        if hasattr(request.state, "user") and hasattr(request.state.user, "preferred_language"):
            lang = request.state.user.preferred_language
            if self._is_valid_language(lang):
                return lang

        # 4. Return default
        return I18nConfig.DEFAULT_LANGUAGE.value

    @staticmethod
    def _is_valid_language(language: Optional[str]) -> bool:
        """Check if language is supported."""
        if not language:
            return False
        return language in [l.value for l in I18nConfig.SUPPORTED_LANGUAGES]

    @staticmethod
    def _parse_accept_language(accept_language: str) -> Optional[str]:
        """
        Parse Accept-Language header.

        Examples:
            'pt-BR,pt;q=0.9,en;q=0.8' -> 'pt-BR'
            'en-US,en;q=0.9' -> 'en'
        """
        # Split by comma and get first preference
        preferences = accept_language.split(",")
        if not preferences:
            return None

        # Get the language code from first preference
        first = preferences[0].split(";")[0].strip().lower()

        # Exact match
        if first in [l.value for l in I18nConfig.SUPPORTED_LANGUAGES]:
            return first

        # Language without region (e.g., 'pt' -> 'pt-BR')
        language_code = first.split("-")[0]
        for lang in I18nConfig.SUPPORTED_LANGUAGES:
            if lang.value.startswith(language_code):
                return lang.value

        return None


class LocalizationHelper:
    """Helper class for localizing API responses."""

    def __init__(self, language: str):
        """Initialize with language."""
        self.language = language
        self.manager = get_translation_manager(language)

    def localize_error(self, error_code: str, **kwargs) -> dict:
        """
        Localize error response.

        Args:
            error_code: Error code (e.g., 'auth.unauthorized')
            **kwargs: Values for string interpolation

        Returns:
            Localized error response
        """
        return self.manager.format_error(error_code, **kwargs)

    def localize_enum(self, enum_value: str, enum_type: str) -> str:
        """
        Localize enum value.

        Args:
            enum_value: Enum value (e.g., 'active')
            enum_type: Enum type (e.g., 'status')

        Returns:
            Localized enum value
        """
        return self.manager.get("common", f"{enum_type}.{enum_value}", enum_value)

    def localize_list(self, items: list, translation_keys: dict) -> list:
        """
        Localize items in a list.

        Args:
            items: List of items (dicts)
            translation_keys: Mapping of field names to translation paths
                Example: {'status': 'status', 'type': 'type'}

        Returns:
            List with localized values
        """
        localized = []
        for item in items:
            localized_item = item.copy()
            for field, trans_type in translation_keys.items():
                if field in localized_item:
                    value = localized_item[field]
                    localized_item[field] = self.localize_enum(value, trans_type)
            localized.append(localized_item)
        return localized

    def localize_response(self, data: dict, rules: dict) -> dict:
        """
        Localize entire response based on rules.

        Args:
            data: Response data
            rules: Localization rules
                Example: {
                    'patients': {
                        'status': 'status',
                        'gender': 'gender'
                    }
                }

        Returns:
            Localized response
        """
        localized = data.copy()

        for key, translations in rules.items():
            if key in localized and isinstance(localized[key], list):
                localized[key] = self.localize_list(localized[key], translations)

        return localized


def get_localization_helper(request: Request) -> LocalizationHelper:
    """Get localization helper for current request."""
    language = getattr(request.state, "language", I18nConfig.DEFAULT_LANGUAGE.value)
    return LocalizationHelper(language)
