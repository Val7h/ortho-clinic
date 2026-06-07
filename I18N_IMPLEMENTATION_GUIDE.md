# OrthoClinic Internationalization (i18n) Implementation Guide

## Overview

This guide documents the complete i18n infrastructure for OrthoClinic, supporting 5 languages:
- Portuguese (PT-BR) - Default
- English (EN)
- Spanish (ES)
- French (FR)
- German (DE)

## Architecture

### Frontend Stack
- **Library**: next-i18next (Next.js 14 optimized)
- **Language Detection**: Browser language + localStorage persistence
- **Storage**: JSON translation files in `/public/locales`
- **Dynamic Switching**: No page reload required

### Backend Stack
- **Python i18n**: For API responses and email templates
- **Locale Support**: Per-user preference in database
- **Email Localization**: Based on user/clinic locale

## File Structure

```
frontend/
├── public/locales/
│   ├── pt-BR/           # Portuguese (Brazil) - Default
│   │   ├── common.json
│   │   ├── auth.json
│   │   ├── navigation.json
│   │   ├── dashboard.json
│   │   ├── patients.json
│   │   ├── consultations.json
│   │   ├── financial.json
│   │   └── errors.json
│   ├── en/              # English
│   ├── es/              # Spanish
│   ├── fr/              # French
│   └── de/              # German
├── lib/i18n/
│   ├── index.ts         # i18next initialization
│   └── hooks.ts         # Custom React hooks
├── components/
│   └── LanguageSwitcher.tsx
├── app/
│   ├── i18n-provider.tsx
│   ├── layout.tsx       # Updated with i18n
│   └── providers.tsx    # Updated with I18nProvider
├── next-i18next.config.js
└── package.json         # Add i18next dependencies
```

## Installation & Setup

### 1. Install Dependencies

```bash
npm install next-i18next i18next react-i18next i18next-browser-languagedetector i18next-http-backend
npm install --save-dev @types/i18next
```

### 2. Update package.json

The configuration files are already created. Ensure your build includes the locales directory:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

### 3. Update Next.js Configuration

Add to `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  i18n: {
    defaultLocale: 'pt-BR',
    locales: ['pt-BR', 'en', 'es', 'fr', 'de'],
  },
  publicRuntimeConfig: {
    locales: ['pt-BR', 'en', 'es', 'fr', 'de'],
  },
};

module.exports = nextConfig;
```

### 4. Update Layout (app/layout.tsx)

```typescript
import { I18nProvider } from './i18n-provider';

export const metadata: Metadata = {
  title: 'OrthoClinic',
  description: 'Sistema de gestão de consultório ortopédico',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <I18nProvider>
          <Providers>
            <AuthProvider>
              {children}
              <Toaster position="top-right" />
            </AuthProvider>
          </Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
```

### 5. Update Providers (app/providers.tsx)

```typescript
import { I18nProvider } from './i18n-provider';
import { NextUIProvider } from '@nextui-org/react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <NextUIProvider>
        <I18nProvider>
          {children}
        </I18nProvider>
      </NextUIProvider>
    </NextThemesProvider>
  );
}
```

## Usage

### Basic Translation Hook

```typescript
'use client';

import { useTranslation } from '@/lib/i18n/hooks';

export function MyComponent() {
  const { t, language, changeLanguage } = useTranslation('common');

  return (
    <div>
      <h1>{t('common.loading')}</h1>
      <p>Current: {language}</p>
      <button onClick={() => changeLanguage('en')}>English</button>
    </div>
  );
}
```

### Enhanced Translation Hook with Formatting

```typescript
'use client';

import { useTranslation } from '@/lib/i18n/hooks';

export function FinancialWidget() {
  const { t, formatCurrency, formatDate, formatNumber } = useTranslation('financial');

  const total = 1250.50;
  const date = new Date('2025-06-07');

  return (
    <div>
      <h2>{t('dashboard.total_revenue')}</h2>
      <p>{formatCurrency(total)}</p>
      <p>{formatDate(date, 'long')}</p>
      <p>{formatNumber(5000)}</p>
    </div>
  );
}
```

### Namespace-Specific Translation

```typescript
// In a page or component
const { t } = useTranslation('patients');

return <h1>{t('title')}</h1>; // "Pacientes" in PT-BR
```

### Language Switcher Component

```typescript
'use client';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function Header() {
  return (
    <header>
      <nav>
        <LanguageSwitcher variant="dropdown" showLabel={true} />
        {/* Or use other variants: */}
        {/* <LanguageSwitcher variant="inline" /> */}
        {/* <LanguageSwitcher variant="compact" /> */}
      </nav>
    </header>
  );
}
```

## Translation File Format

Each translation namespace is a JSON file with a hierarchical structure:

### common.json
```json
{
  "app": {
    "title": "OrthoClinic",
    "description": "Sistema de gestão de consultório ortopédico",
    "copyright": "OrthoClinic · Premium Edition"
  },
  "common": {
    "loading": "Carregando...",
    "error": "Erro",
    "success": "Sucesso"
  },
  "formatting": {
    "currency_symbol": "R$",
    "decimal_separator": ",",
    "thousands_separator": "."
  }
}
```

## Key Namespaces

1. **common.json** - General UI strings, pagination, time formatting
2. **auth.json** - Login, registration, password reset, user roles
3. **navigation.json** - Menu items, breadcrumbs, submenu
4. **dashboard.json** - Dashboard statistics, quick stats
5. **patients.json** - Patient list, forms, filters, messages
6. **consultations.json** - Consultation management UI
7. **financial.json** - Invoices, payments, expenses
8. **errors.json** - Error messages, validation errors, HTTP errors

## Advanced Features

### 1. Date Formatting Per Locale

```typescript
const { formatDate } = useTranslation();

// Returns: "07/06/2025" (PT-BR) or "06/07/2025" (EN)
formatDate(new Date(), 'short');

// Returns: "7 de junho de 2025" (PT-BR) or "June 7, 2025" (EN)
formatDate(new Date(), 'long');
```

### 2. Currency Formatting

```typescript
const { formatCurrency } = useTranslation();

// Returns: "R$ 1.250,50" (PT-BR) or "$1,250.50" (EN)
formatCurrency(1250.50);

// Supports other currencies
formatCurrency(100, 'USD'); // $100.00
formatCurrency(100, 'EUR'); // €100,00
```

### 3. Number Formatting

```typescript
const { formatNumber, formatPercent } = useTranslation();

// Returns: "1.250,50" (PT-BR) or "1,250.50" (EN)
formatNumber(1250.50);

// Returns: "50,00%" (PT-BR) or "50.00%" (EN)
formatPercent(50);
```

### 4. Pluralization

```typescript
const { pluralize } = useTranslation('patients');

// pluralize('patients_count', 1) returns singular form
// pluralize('patients_count', 5) returns plural form
```

Example in translation file:
```json
{
  "patients_count_singular": "1 paciente",
  "patients_count_plural": "{{count}} pacientes"
}
```

### 5. String Interpolation

```json
{
  "welcome_user": "Bem-vindo, {{name}}!",
  "consultation_date": "Consulta agendada para {{date, uppercase}}"
}
```

Usage:
```typescript
const { t } = useTranslation();

t('welcome_user', { name: 'João' }); // "Bem-vindo, João!"
t('consultation_date', { date: 'segunda' }); // "Consulta agendada para SEGUNDA"
```

## Backend Integration

### Python i18n Setup

```python
# backend/config/i18n.py

from pathlib import Path
import json

class I18nConfig:
    SUPPORTED_LANGUAGES = ['pt-BR', 'en', 'es', 'fr', 'de']
    DEFAULT_LANGUAGE = 'pt-BR'
    LOCALES_PATH = Path(__file__).parent.parent / 'locales'
    
    @classmethod
    def load_translations(cls, language: str, namespace: str) -> dict:
        try:
            file_path = cls.LOCALES_PATH / language / f'{namespace}.json'
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            # Fall back to default language
            file_path = cls.LOCALES_PATH / cls.DEFAULT_LANGUAGE / f'{namespace}.json'
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)

# Usage
translations = I18nConfig.load_translations('en', 'auth')
```

### API Response Localization

```python
# backend/routers/patients.py

from fastapi import APIRouter, Depends
from fastapi_i18n import set_language

router = APIRouter()

@router.get('/patients')
async def get_patients(language: str = Header(default='pt-BR')):
    set_language(language)
    
    response = {
        "patients": [
            {"id": 1, "name": "João Silva", "status": _("status.active")}
        ],
        "message": _("messages.patient_created")
    }
    return response
```

### Email Template Localization

```python
# backend/emails/templates.py

from jinja2 import Environment, FileSystemLoader
from config.i18n import I18nConfig

def send_consultation_confirmation(user_email: str, user_language: str, consultation_data: dict):
    translations = I18nConfig.load_translations(user_language, 'consultations')
    
    env = Environment(
        loader=FileSystemLoader('templates'),
        autoescape=True
    )
    template = env.get_template('consultation_confirmation.html')
    
    html = template.render(
        consultation_title=translations.get('title', 'Consulta'),
        consultation_date=consultation_data['date'],
        translations=translations
    )
    
    # Send email with html
```

## User Language Preference

### Database Schema Update

```python
# models/user.py

from sqlalchemy import Column, String
from enum import Enum

class LanguageEnum(str, Enum):
    PT_BR = "pt-BR"
    EN = "en"
    ES = "es"
    FR = "fr"
    DE = "de"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)
    preferred_language = Column(String, default="pt-BR")  # or use Enum
    timezone = Column(String, default="America/Sao_Paulo")
```

### Save Language Preference

```typescript
// Frontend: Save when user changes language
const { switchLanguage } = useLanguageSwitcher();
const { updateUserProfile } = useAuth();

const handleLanguageChange = async (lang: string) => {
  await switchLanguage(lang);
  await updateUserProfile({ preferred_language: lang });
};
```

## Maintenance & Scaling

### Adding a New Language

1. Create translation files:
```bash
mkdir -p frontend/public/locales/it
# Copy PT-BR files and translate
cp -r frontend/public/locales/pt-BR/* frontend/public/locales/it/
```

2. Update `lib/i18n/index.ts`:
```typescript
import commonIt from '@/public/locales/it/common.json';
// ... other imports

export const SUPPORTED_LANGUAGES = {
  'pt-BR': { name: 'Português (BR)', flag: '🇧🇷' },
  'en': { name: 'English', flag: '🇺🇸' },
  'it': { name: 'Italiano', flag: '🇮🇹' },  // Add Italian
  // ...
};

const resources = {
  'pt-BR': { ... },
  'en': { ... },
  'it': {
    common: commonIt,
    // ... other namespaces
  },
};
```

3. Update `next-i18next.config.js`:
```javascript
module.exports = {
  i18n: {
    locales: ['pt-BR', 'en', 'es', 'fr', 'de', 'it'],
    defaultLocale: 'pt-BR',
  },
};
```

### Adding Translation Keys

New keys should be added to all language files:

```json
// pt-BR/common.json
{
  "new_feature": {
    "title": "Nova Funcionalidade",
    "description": "Descrição em português"
  }
}

// en/common.json
{
  "new_feature": {
    "title": "New Feature",
    "description": "Description in English"
  }
}
```

### Translation Management Tools (Future)

Consider integrating with:
- **Crowdin** - Professional translation management
- **Phrase** - Localization management
- **Lokalise** - Translation platform
- **Transifex** - Community translations

### Key Formatting Locales

| Locale | Date | Currency | Decimal | Thousands |
|--------|------|----------|---------|-----------|
| pt-BR  | dd/MM/yyyy | R$ | , | . |
| en     | MM/dd/yyyy | $ | . | , |
| es     | dd/MM/yyyy | € | , | . |
| fr     | dd/MM/yyyy | € | , | (space) |
| de     | dd.MM.yyyy | € | , | . |

## Testing

### Unit Test Example

```typescript
// __tests__/i18n.test.ts

import { render, screen } from '@testing-library/react';
import { useTranslation } from '@/lib/i18n/hooks';

describe('i18n', () => {
  it('should translate text correctly', () => {
    const { result } = renderHook(() => useTranslation('common'));
    expect(result.current.t('common.loading')).toBe('Carregando...');
  });

  it('should format currency based on locale', () => {
    const { result } = renderHook(() => useTranslation());
    const formatted = result.current.formatCurrency(100);
    expect(formatted).toContain('R$');
  });

  it('should switch language without page reload', async () => {
    const { result } = renderHook(() => useLanguageSwitcher());
    await result.current.switchLanguage('en');
    expect(result.current.language).toBe('en');
  });
});
```

## Performance Optimization

1. **Code Splitting**: Load only needed translations
2. **Caching**: localStorage persists language preference
3. **Lazy Loading**: Translations loaded on demand
4. **Bundle Size**: Only active language translations bundled

## Browser Support

- Modern browsers with localStorage support
- Automatic fallback to default language
- Cookie-based fallback for privacy mode

## Troubleshooting

### Keys Not Translating

1. Check key spelling in JSON files
2. Verify namespace is loaded
3. Ensure i18next is initialized
4. Check browser console for errors

### Language Not Switching

1. Clear localStorage: `localStorage.removeItem('preferred_language')`
2. Verify i18n initialization
3. Check browser console for errors
4. Ensure LanguageSwitcher is within I18nProvider

### Missing Translations

1. Check all language files have the key
2. Verify JSON syntax is valid
3. Fall back to PT-BR if missing

## Resources

- [next-i18next Documentation](https://github.com/isaachinman/next-i18next)
- [i18next Documentation](https://www.i18next.com/)
- [React-i18next Guide](https://react.i18next.com/)
- [Intl API Documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)

## Deployment Checklist

- [ ] All translation files created for all 5 languages
- [ ] i18n dependencies installed
- [ ] Configuration files created and validated
- [ ] Language Switcher component integrated
- [ ] Provider updated in layout
- [ ] Default language set correctly
- [ ] localStorage configuration tested
- [ ] Date/Currency formatting verified for each locale
- [ ] Error messages translated
- [ ] Email templates localized
- [ ] Backend language preference saved
- [ ] Testing completed for all languages
- [ ] Documentation updated for team
