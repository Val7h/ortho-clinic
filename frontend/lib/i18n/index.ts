import i18next, { TFunction } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

// Import all translation namespaces
import commonPtBr from '@/public/locales/pt-BR/common.json';
import commonEn from '@/public/locales/en/common.json';
import commonEs from '@/public/locales/es/common.json';
import commonFr from '@/public/locales/fr/common.json';
import commonDe from '@/public/locales/de/common.json';

import authPtBr from '@/public/locales/pt-BR/auth.json';
import authEn from '@/public/locales/en/auth.json';
import authEs from '@/public/locales/es/auth.json';
import authFr from '@/public/locales/fr/auth.json';
import authDe from '@/public/locales/de/auth.json';

import navigationPtBr from '@/public/locales/pt-BR/navigation.json';
import navigationEn from '@/public/locales/en/navigation.json';
import navigationEs from '@/public/locales/es/navigation.json';
import navigationFr from '@/public/locales/fr/navigation.json';
import navigationDe from '@/public/locales/de/navigation.json';

import dashboardPtBr from '@/public/locales/pt-BR/dashboard.json';
import dashboardEn from '@/public/locales/en/dashboard.json';
import dashboardEs from '@/public/locales/es/dashboard.json';
import dashboardFr from '@/public/locales/fr/dashboard.json';
import dashboardDe from '@/public/locales/de/dashboard.json';

import patientsPtBr from '@/public/locales/pt-BR/patients.json';
import patientsEn from '@/public/locales/en/patients.json';
import patientsEs from '@/public/locales/es/patients.json';
import patientsFr from '@/public/locales/fr/patients.json';
import patientsDe from '@/public/locales/de/patients.json';

import consultationsPtBr from '@/public/locales/pt-BR/consultations.json';
import consultationsEn from '@/public/locales/en/consultations.json';
import consultationsEs from '@/public/locales/es/consultations.json';
import consultationsFr from '@/public/locales/fr/consultations.json';
import consultationsDe from '@/public/locales/de/consultations.json';

import financialPtBr from '@/public/locales/pt-BR/financial.json';
import financialEn from '@/public/locales/en/financial.json';
import financialEs from '@/public/locales/es/financial.json';
import financialFr from '@/public/locales/fr/financial.json';
import financialDe from '@/public/locales/de/financial.json';

import errorsPtBr from '@/public/locales/pt-BR/errors.json';
import errorsEn from '@/public/locales/en/errors.json';
import errorsEs from '@/public/locales/es/errors.json';
import errorsFr from '@/public/locales/fr/errors.json';
import errorsDe from '@/public/locales/de/errors.json';

export const SUPPORTED_LANGUAGES = {
  'pt-BR': { name: 'Português (BR)', flag: '🇧🇷' },
  'en': { name: 'English', flag: '🇺🇸' },
  'es': { name: 'Español', flag: '🇪🇸' },
  'fr': { name: 'Français', flag: '🇫🇷' },
  'de': { name: 'Deutsch', flag: '🇩🇪' },
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

const resources = {
  'pt-BR': {
    common: commonPtBr,
    auth: authPtBr,
    navigation: navigationPtBr,
    dashboard: dashboardPtBr,
    patients: patientsPtBr,
    consultations: consultationsPtBr,
    financial: financialPtBr,
    errors: errorsPtBr,
  },
  en: {
    common: commonEn,
    auth: authEn,
    navigation: navigationEn,
    dashboard: dashboardEn,
    patients: patientsEn,
    consultations: consultationsEn,
    financial: financialEn,
    errors: errorsEn,
  },
  es: {
    common: commonEs,
    auth: authEs,
    navigation: navigationEs,
    dashboard: dashboardEs,
    patients: patientsEs,
    consultations: consultationsEs,
    financial: financialEs,
    errors: errorsEs,
  },
  fr: {
    common: commonFr,
    auth: authFr,
    navigation: navigationFr,
    dashboard: dashboardFr,
    patients: patientsFr,
    consultations: consultationsFr,
    financial: financialFr,
    errors: errorsFr,
  },
  de: {
    common: commonDe,
    auth: authDe,
    navigation: navigationDe,
    dashboard: dashboardDe,
    patients: patientsDe,
    consultations: consultationsDe,
    financial: financialDe,
    errors: errorsDe,
  },
};

if (!i18next.isInitialized) {
  i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: 'pt-BR',
      defaultNS: 'common',
      fallbackNS: 'common',
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
      },
      detection: {
        order: ['localStorage', 'sessionStorage', 'cookie', 'navigator'],
        caches: ['localStorage', 'cookie'],
        lookupLocalStorage: 'preferred_language',
        lookupSessionStorage: 'preferred_language',
        lookupCookie: 'preferred_language',
        cookieMinutes: 10080, // 1 week
      },
    });
}

export default i18next;
