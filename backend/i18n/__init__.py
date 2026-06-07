"""
OrthoClinic backend internationalization (i18n) module.

Provides:
- Language detection and management
- Translation loading and caching
- API response localization
- Email template localization
"""

from .config import (
    I18nConfig,
    LanguageEnum,
    TranslationManager,
    get_translation_manager,
    t,
)
from .middleware import (
    I18nMiddleware,
    LocalizationHelper,
    get_localization_helper,
    set_language,
    get_language,
    with_language,
)

__all__ = [
    "I18nConfig",
    "LanguageEnum",
    "TranslationManager",
    "I18nMiddleware",
    "LocalizationHelper",
    "get_translation_manager",
    "get_localization_helper",
    "set_language",
    "get_language",
    "with_language",
    "t",
]
