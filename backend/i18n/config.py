"""
Internationalization configuration for OrthoClinic backend.

Handles translation loading, language management, and localization utilities.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional
from enum import Enum
from functools import lru_cache

class LanguageEnum(str, Enum):
    """Supported languages."""
    PT_BR = "pt-BR"
    EN = "en"
    ES = "es"
    FR = "fr"
    DE = "de"

class I18nConfig:
    """Configuration for internationalization."""

    # Supported languages
    SUPPORTED_LANGUAGES = [
        LanguageEnum.PT_BR,
        LanguageEnum.EN,
        LanguageEnum.ES,
        LanguageEnum.FR,
        LanguageEnum.DE,
    ]

    # Default language
    DEFAULT_LANGUAGE = LanguageEnum.PT_BR

    # Path to translation files (shared with frontend)
    LOCALES_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "locales"

    # Supported translation namespaces
    NAMESPACES = [
        "common",
        "auth",
        "navigation",
        "dashboard",
        "patients",
        "consultations",
        "financial",
        "errors",
    ]

    # Language to locale code mapping for formatting
    LOCALE_MAPPING = {
        LanguageEnum.PT_BR: "pt_BR",
        LanguageEnum.EN: "en_US",
        LanguageEnum.ES: "es_ES",
        LanguageEnum.FR: "fr_FR",
        LanguageEnum.DE: "de_DE",
    }

    @classmethod
    @lru_cache(maxsize=128)
    def load_translations(
        cls,
        language: str,
        namespace: str
    ) -> Dict[str, Any]:
        """
        Load translation file for given language and namespace.

        Args:
            language: Language code (e.g., 'pt-BR', 'en')
            namespace: Translation namespace (e.g., 'common', 'auth')

        Returns:
            Dictionary of translations

        Raises:
            FileNotFoundError: If translation file not found
        """
        # Validate language
        if language not in [lang.value for lang in cls.SUPPORTED_LANGUAGES]:
            language = cls.DEFAULT_LANGUAGE.value

        # Validate namespace
        if namespace not in cls.NAMESPACES:
            raise ValueError(f"Unknown namespace: {namespace}")

        try:
            file_path = cls.LOCALES_PATH / language / f"{namespace}.json"
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            # Fall back to default language
            file_path = cls.LOCALES_PATH / cls.DEFAULT_LANGUAGE.value / f"{namespace}.json"
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)

    @classmethod
    def get_translation(
        cls,
        language: str,
        namespace: str,
        key: str,
        default: Optional[str] = None
    ) -> str:
        """
        Get a single translation key.

        Args:
            language: Language code
            namespace: Translation namespace
            key: Translation key (dot notation, e.g., 'auth.login.title')
            default: Default value if not found

        Returns:
            Translated string or default
        """
        try:
            translations = cls.load_translations(language, namespace)

            # Handle nested keys with dot notation
            keys = key.split(".")
            value = translations
            for k in keys:
                if isinstance(value, dict):
                    value = value.get(k)
                else:
                    return default or key

            return value or default or key
        except (FileNotFoundError, KeyError, ValueError):
            return default or key

    @classmethod
    def get_all_translations(cls, language: str) -> Dict[str, Any]:
        """
        Load all translation namespaces for a language.

        Args:
            language: Language code

        Returns:
            Dictionary with all translations
        """
        all_translations = {}
        for namespace in cls.NAMESPACES:
            try:
                all_translations[namespace] = cls.load_translations(language, namespace)
            except FileNotFoundError:
                pass
        return all_translations

    @classmethod
    def get_supported_languages(cls) -> Dict[str, Dict[str, str]]:
        """
        Get list of supported languages with metadata.

        Returns:
            Dictionary of language information
        """
        return {
            "pt-BR": {
                "name": "Português (Brasil)",
                "native_name": "Português (Brasil)",
                "flag": "🇧🇷",
                "code": "pt-BR",
            },
            "en": {
                "name": "English",
                "native_name": "English",
                "flag": "🇺🇸",
                "code": "en",
            },
            "es": {
                "name": "Español",
                "native_name": "Español",
                "flag": "🇪🇸",
                "code": "es",
            },
            "fr": {
                "name": "Français",
                "native_name": "Français",
                "flag": "🇫🇷",
                "code": "fr",
            },
            "de": {
                "name": "Deutsch",
                "native_name": "Deutsch",
                "flag": "🇩🇪",
                "code": "de",
            },
        }


class TranslationManager:
    """Manages translations for API responses and templates."""

    def __init__(self, language: str = LanguageEnum.PT_BR.value):
        """
        Initialize translation manager.

        Args:
            language: Language code
        """
        self.language = language or I18nConfig.DEFAULT_LANGUAGE.value
        self._cache: Dict[str, Any] = {}

    def get(self, namespace: str, key: str, default: Optional[str] = None) -> str:
        """
        Get translated string.

        Args:
            namespace: Translation namespace
            key: Translation key
            default: Default value

        Returns:
            Translated string
        """
        cache_key = f"{namespace}:{key}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        value = I18nConfig.get_translation(self.language, namespace, key, default)
        self._cache[cache_key] = value
        return value

    def format_error(self, error_code: str, **kwargs) -> Dict[str, str]:
        """
        Format error message for API response.

        Args:
            error_code: Error code (e.g., 'auth.unauthorized')
            **kwargs: Values for string interpolation

        Returns:
            Formatted error response
        """
        namespace, key = error_code.split(".", 1)
        message = self.get(namespace, key, error_code)

        # Simple interpolation
        for k, v in kwargs.items():
            message = message.replace(f"{{{{{k}}}}}", str(v))

        return {
            "error": error_code,
            "message": message,
            "language": self.language,
        }

    def translate_list(self, items: list, key_path: str) -> list:
        """
        Translate items in a list.

        Args:
            items: List of items
            key_path: Path to translate (e.g., 'status.value')

        Returns:
            List with translated values
        """
        translated = []
        for item in items:
            if isinstance(item, dict):
                keys = key_path.split(".")
                value = item
                for k in keys[:-1]:
                    value = value.get(k, {})

                if isinstance(value, dict):
                    original = value.get(keys[-1])
                    if original:
                        value[keys[-1]] = self.get("common", f"status.{original}", original)

                translated.append(item)
            else:
                translated.append(item)

        return translated

    def change_language(self, language: str) -> None:
        """Change language and clear cache."""
        if language in [l.value for l in I18nConfig.SUPPORTED_LANGUAGES]:
            self.language = language
            self._cache.clear()


# Global translation manager instance
_translation_manager: Optional[TranslationManager] = None

def get_translation_manager(language: str = None) -> TranslationManager:
    """
    Get or create translation manager.

    Args:
        language: Language code

    Returns:
        TranslationManager instance
    """
    global _translation_manager

    if _translation_manager is None:
        _translation_manager = TranslationManager(language or I18nConfig.DEFAULT_LANGUAGE.value)
    elif language:
        _translation_manager.change_language(language)

    return _translation_manager


def t(namespace: str, key: str, language: str = None, default: str = None) -> str:
    """
    Shorthand function for getting translations.

    Args:
        namespace: Translation namespace
        key: Translation key
        language: Language code (optional, uses current manager language)
        default: Default value

    Returns:
        Translated string
    """
    manager = get_translation_manager(language)
    return manager.get(namespace, key, default)
