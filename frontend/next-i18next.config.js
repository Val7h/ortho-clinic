const path = require('path');

module.exports = {
  i18n: {
    defaultLocale: 'pt-BR',
    locales: ['pt-BR', 'en', 'es', 'fr', 'de'],
    localeDetection: true,
  },
  ns: ['common', 'auth', 'navigation', 'dashboard', 'patients', 'consultations', 'financial', 'errors'],
  defaultNS: 'common',
  fallbackLng: 'pt-BR',
  fallbackNS: 'common',
  localePath: path.resolve('./public/locales'),
  nsSeparator: ':',
  keySeparator: '.',
  interpolation: {
    escapeValue: false,
    formatSeparator: ',',
    format: (value, format) => {
      if (format === 'uppercase') return value.toUpperCase();
      if (format === 'lowercase') return value.toLowerCase();
      if (format === 'capitalize') return value.charAt(0).toUpperCase() + value.slice(1);
      return value;
    },
  },
  react: {
    useSuspense: false,
    bindI18n: 'languageChanged loaded',
    bindI18nStore: 'added removed',
    transEmptyNodeValue: '',
    transSupportBasicHtmlNodes: true,
    transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'p'],
  },
  backend: {
    loadPath: './public/locales/{{lng}}/{{ns}}.json',
    savePath: './public/locales/{{lng}}/{{ns}}.json',
  },
  detection: {
    order: ['localStorage', 'sessionStorage', 'cookie', 'navigator'],
    caches: ['localStorage', 'cookie'],
    lookupLocalStorage: 'preferred_language',
    lookupSessionStorage: 'preferred_language',
    lookupCookie: 'preferred_language',
    cookieMinutes: 10080, // 1 week
  },
};
