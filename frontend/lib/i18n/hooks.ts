import { useTranslation as useReactI18nextTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { SupportedLanguage, SUPPORTED_LANGUAGES } from './index';

/**
 * Enhanced translation hook with type safety and helpers
 */
export function useTranslation(namespace?: string) {
  const { t, i18n } = useReactI18nextTranslation(namespace);

  const language = i18n.language as SupportedLanguage;
  const isRTL = language === 'ar' || language === 'he'; // For future expansion

  const changeLanguage = useCallback(
    async (lng: SupportedLanguage) => {
      await i18n.changeLanguage(lng);
      localStorage.setItem('preferred_language', lng);
      document.documentElement.lang = lng;
      document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    },
    [i18n, isRTL]
  );

  const formatDate = useCallback(
    (date: Date | string, format: 'short' | 'long' = 'short') => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const options: Intl.DateTimeFormatOptions =
        format === 'short'
          ? { year: 'numeric', month: '2-digit', day: '2-digit' }
          : { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };

      return dateObj.toLocaleDateString(language, options);
    },
    [language]
  );

  const formatTime = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return dateObj.toLocaleTimeString(language, {
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [language]
  );

  const formatCurrency = useCallback(
    (value: number, currency = 'BRL') => {
      return new Intl.NumberFormat(language, {
        style: 'currency',
        currency,
      }).format(value);
    },
    [language]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => {
      return new Intl.NumberFormat(language, options).format(value);
    },
    [language]
  );

  const formatPercent = useCallback(
    (value: number, decimals = 2) => {
      return new Intl.NumberFormat(language, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value / 100);
    },
    [language]
  );

  const pluralize = useCallback(
    (key: string, count: number) => {
      const pluralKey = count === 1 ? `${key}_singular` : `${key}_plural`;
      return t(pluralKey, { count });
    },
    [t]
  );

  return {
    t,
    i18n,
    language,
    isRTL,
    changeLanguage,
    formatDate,
    formatTime,
    formatCurrency,
    formatNumber,
    formatPercent,
    pluralize,
    supportedLanguages: SUPPORTED_LANGUAGES,
  };
}

/**
 * Hook for language switching with persistence
 */
export function useLanguageSwitcher() {
  const { i18n } = useReactI18nextTranslation();
  const [language, setLanguage] = useState<SupportedLanguage>('pt-BR');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('preferred_language') as SupportedLanguage | null;
    setLanguage(stored || (i18n.language as SupportedLanguage) || 'pt-BR');
  }, [i18n]);

  const switchLanguage = useCallback(
    async (lng: SupportedLanguage) => {
      setIsLoading(true);
      try {
        await i18n.changeLanguage(lng);
        setLanguage(lng);
        localStorage.setItem('preferred_language', lng);
        document.documentElement.lang = lng;

        // Update dir attribute for RTL support
        const isRTL = lng === 'ar' || lng === 'he';
        document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
      } finally {
        setIsLoading(false);
      }
    },
    [i18n]
  );

  return {
    language,
    isLoading,
    switchLanguage,
    availableLanguages: SUPPORTED_LANGUAGES,
  };
}

/**
 * Server-side translation for static content
 */
export function getStaticTranslations(locale: SupportedLanguage) {
  const localesMap: Record<SupportedLanguage, Record<string, any>> = {
    'pt-BR': require('@/public/locales/pt-BR/common.json'),
    'en': require('@/public/locales/en/common.json'),
    'es': require('@/public/locales/es/common.json'),
    'fr': require('@/public/locales/fr/common.json'),
    'de': require('@/public/locales/de/common.json'),
  };

  return localesMap[locale] || localesMap['pt-BR'];
}
