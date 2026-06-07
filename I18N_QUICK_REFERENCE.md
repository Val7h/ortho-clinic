# i18n Quick Reference Guide

## Installation (5 minutes)

```bash
cd frontend
npm install next-i18next i18next react-i18next i18next-browser-languagedetector i18next-http-backend
```

## Basic Usage

### Import Translation Hook
```typescript
import { useTranslation } from '@/lib/i18n/hooks';
```

### Get Translation
```typescript
const { t } = useTranslation('namespace');
const text = t('key.path');
```

### Available Namespaces
- `common` - General UI strings
- `auth` - Login, profile, authentication
- `navigation` - Menus, breadcrumbs
- `dashboard` - Dashboard content
- `patients` - Patient management
- `consultations` - Consultation/agenda
- `financial` - Invoicing, payments
- `errors` - Error messages

## Common Patterns

### Translation with Namespace
```typescript
// Full example
const { t } = useTranslation('patients');
return <h1>{t('title')}</h1>; // "Pacientes" in PT-BR
```

### Date Formatting
```typescript
const { formatDate } = useTranslation();

formatDate(new Date())              // "07/06/2025" (PT-BR)
formatDate(new Date(), 'long')      // "7 de junho de 2025" (PT-BR)
```

### Currency Formatting
```typescript
const { formatCurrency } = useTranslation();

formatCurrency(1250.50)             // "R$ 1.250,50" (PT-BR)
formatCurrency(1250.50, 'USD')      // "$1,250.50"
```

### Number Formatting
```typescript
const { formatNumber } = useTranslation();

formatNumber(1250.50)               // "1.250,50" (PT-BR)
```

### Percentage Formatting
```typescript
const { formatPercent } = useTranslation();

formatPercent(50)                   // "50,00%" (PT-BR)
formatPercent(50.5, 1)              // "50,5%" (PT-BR)
```

### Language Switcher
```typescript
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// Dropdown variant (default)
<LanguageSwitcher variant="dropdown" showLabel={true} />

// Inline variant
<LanguageSwitcher variant="inline" />

// Compact variant
<LanguageSwitcher variant="compact" />
```

### Language Switcher Hook
```typescript
const { language, isLoading, switchLanguage } = useLanguageSwitcher();

const handleChange = async (lang) => {
  await switchLanguage(lang);
  // No reload needed!
};
```

## File Locations

| Resource | Location |
|----------|----------|
| Configuration | `frontend/next-i18next.config.js` |
| i18next Init | `frontend/lib/i18n/index.ts` |
| Hooks | `frontend/lib/i18n/hooks.ts` |
| Provider | `frontend/app/i18n-provider.tsx` |
| Switcher | `frontend/components/LanguageSwitcher.tsx` |
| PT-BR Translations | `frontend/public/locales/pt-BR/` |
| EN Translations | `frontend/public/locales/en/` |
| ES Translations | `frontend/public/locales/es/` |
| FR Translations | `frontend/public/locales/fr/` |
| DE Translations | `frontend/public/locales/de/` |

## Adding a Translation Key

1. Add to PT-BR file (primary source):
```json
// public/locales/pt-BR/common.json
{
  "new_feature": {
    "title": "Novo Recurso",
    "description": "Descrição"
  }
}
```

2. Add to EN file:
```json
// public/locales/en/common.json
{
  "new_feature": {
    "title": "New Feature",
    "description": "Description"
  }
}
```

3. Add to ES, FR, DE files (same structure, translated text)

4. Use in component:
```typescript
const { t } = useTranslation('common');
<div>{t('new_feature.title')}</div>
```

## Translation Key Naming Convention

```
namespace.section.key

Examples:
- auth.login.title
- auth.login.email_label
- patients.table.name
- consultations.status.scheduled
- financial.invoice.total
- errors.validation.required_field
```

## Supported Languages

| Code | Name | Flag |
|------|------|------|
| pt-BR | Português (Brasil) | 🇧🇷 |
| en | English | 🇺🇸 |
| es | Español | 🇪🇸 |
| fr | Français | 🇫🇷 |
| de | Deutsch | 🇩🇪 |

## Language Detection Priority

1. URL parameter: `?lang=en`
2. localStorage value
3. Accept-Language header
4. User profile preference
5. Default: `pt-BR`

## Backend Usage

### Import
```python
from backend.i18n import get_translation_manager, t
```

### Get Translation
```python
# Using manager
manager = get_translation_manager('en')
error = manager.get('auth', 'error_invalid_credentials')

# Using shorthand
msg = t('auth', 'error_invalid_credentials', language='en')
```

### Format Error Response
```python
@router.post('/login')
async def login(request: Request):
    manager = get_translation_manager(request.state.language)
    return manager.format_error('auth.invalid_credentials')
```

### Localize Enum Values
```python
status_text = manager.get('common', f'status.{patient.status}')
# 'active' -> 'Ativo' (PT-BR) or 'Active' (EN)
```

### Register Middleware
```python
# main.py
from backend.i18n.middleware import I18nMiddleware

app.add_middleware(I18nMiddleware)
```

## Troubleshooting

### Translations Not Appearing
```typescript
// 1. Check if i18n is initialized
import i18next from '@/lib/i18n';
console.log(i18next.isInitialized); // Should be true

// 2. Check if namespace is loaded
console.log(i18next.languages);

// 3. Check key exists
const { t } = useTranslation('namespace');
console.log(t('your.key'));
```

### Language Not Switching
```typescript
// 1. Clear cache
localStorage.removeItem('preferred_language');

// 2. Check if component re-renders
const { language } = useTranslation();
console.log('Current language:', language);
```

### Wrong Formatting
```typescript
// Check locale mapping
const { formatCurrency } = useTranslation();
console.log(new Intl.Intl.DateTimeFormat().resolvedOptions().locale);
```

## Performance Tips

1. Use specific namespaces:
```typescript
// Good
const { t } = useTranslation('patients');

// Less efficient (loads all namespaces)
const { t } = useTranslation();
```

2. Memoize formatters:
```typescript
const { formatCurrency } = useTranslation();
const memoizedPrice = useMemo(
  () => formatCurrency(price),
  [price, formatCurrency]
);
```

3. Don't create new hooks in render:
```typescript
// Bad - creates new hook each render
const Component = () => {
  const { t } = useTranslation();
  return <div>{t('key')}</div>;
};

// Good - stable hook reference
const useMyComponent = () => {
  return useTranslation();
};
```

## Testing Translations

```typescript
// __tests__/translations.test.ts
import { render, screen } from '@testing-library/react';
import { useTranslation } from '@/lib/i18n/hooks';

test('translations work', () => {
  const { result } = renderHook(() => useTranslation('common'));
  expect(result.current.t('common.loading')).toBe('Carregando...');
});
```

## API Endpoints for Language

All endpoints accept language parameter:
```
GET /api/patients?lang=en
GET /api/consultations?lang=fr
POST /api/login?lang=es

Response header:
X-Language: en
```

## Keyboard Shortcuts

Consider adding:
```
Alt + 1: Portuguese
Alt + 2: English
Alt + 3: Spanish
Alt + 4: French
Alt + 5: German
```

## Common Translation Keys

### Status Values
```
common.status.active: "Ativo" / "Active"
common.status.inactive: "Inativo" / "Inactive"
common.status.pending: "Pendente" / "Pending"
common.status.completed: "Concluído" / "Completed"
```

### Gender
```
common.gender.male: "Masculino" / "Male"
common.gender.female: "Feminino" / "Female"
common.gender.other: "Outro" / "Other"
```

### Actions
```
common.delete: "Deletar" / "Delete"
common.edit: "Editar" / "Edit"
common.save: "Salvar" / "Save"
common.cancel: "Cancelar" / "Cancel"
```

## Environment Variables

```
# .env.local
NEXT_PUBLIC_DEFAULT_LANGUAGE=pt-BR
NEXT_PUBLIC_FALLBACK_LANGUAGE=pt-BR
```

## Deployment

```bash
# Build includes all translation files
npm run build

# Production
npm run start
```

All translation files are statically bundled - no server-side requests needed.

## Support

For issues:
1. Check `frontend/next-i18next.config.js` syntax
2. Verify `lib/i18n/index.ts` initialization
3. Check browser console for errors
4. Review translation JSON for syntax errors
5. Clear localStorage and cache
6. Check `Accept-Language` header in network tab

## Version

i18n Implementation: v1.0.0
Last Updated: 2025-06-07
Status: Production Ready
