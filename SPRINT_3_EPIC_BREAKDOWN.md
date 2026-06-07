# SPRINT 3 EPIC BREAKDOWN
**Detailed Task Breakdown (All 22 Epics)**

---

## FEATURE 1: ADVANCED ANALYTICS DASHBOARD (4 Epics)

### EPIC 1.1: Revenue Trends by Treatment Type ⏱️ 8 hours
**Owner:** Dev Team 1A (Backend Lead)  
**Status:** Not Started  
**Dependencies:** None (independent)

#### Tasks:

**1.1.1 Database Schema & Indexes** (2 hours)
```sql
-- Create analytics_snapshots table
CREATE TABLE analytics_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL UNIQUE,
    treatment_id INT REFERENCES treatment(id),
    daily_revenue DECIMAL(10, 2),
    consultation_count INT,
    success_count INT,
    success_percentage DECIMAL(5, 2),
    no_show_count INT,
    utilization_percentage DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analytics_date_treatment 
    ON analytics_snapshots(snapshot_date, treatment_id);

-- Run Alembic migration
alembic revision --autogenerate -m "add_analytics_snapshots_table"
alembic upgrade head
```
- [ ] Create migration file
- [ ] Test migration on local dev DB
- [ ] Verify indexes are created
- [ ] Document schema in README

**1.1.2 Daily Snapshot Aggregation Function** (2 hours)
- [ ] Create `analytics_service.py` with `compute_daily_snapshots()` function
- [ ] Function queries: financial table, calculates daily revenue by treatment
- [ ] Handles edge cases: no data, treatment type changes, rounding
- [ ] Test with sample data (5+ years)
- [ ] Document calculation logic

**1.1.3 API Endpoint** (2 hours)
```python
@router.get("/api/analytics/revenue")
async def get_revenue(
    start_date: date,
    end_date: date,
    treatment_type: Optional[str] = None,
    grouping: str = "daily"  # daily, weekly, monthly
):
    """
    Return revenue trends for selected period.
    
    Response:
    {
        "data": [
            {"date": "2026-06-01", "revenue": 2500.00, "treatment": "fisio", "count": 5},
            {"date": "2026-06-02", "revenue": 3200.00, "treatment": "fisio", "count": 8},
        ],
        "summary": {
            "total_revenue": 125000.00,
            "average_daily": 2083.33,
            "peak_day": "2026-06-15",
            "peak_revenue": 5600.00
        }
    }
    """
```
- [ ] GET endpoint with date range + optional filters
- [ ] Response schema validation (Pydantic)
- [ ] Error handling (invalid dates, missing data)
- [ ] Documentation in OpenAPI/Swagger

**1.1.4 Caching Strategy** (1 hour)
- [ ] Implement Redis caching (30-minute TTL)
- [ ] Cache key: `analytics:revenue:{start_date}:{end_date}:{treatment_type}`
- [ ] Invalidation: new financial transaction triggers cache update
- [ ] Fallback: if Redis unavailable, query DB directly
- [ ] Test cache hit rates

**1.1.5 Testing** (1 hour)
- [ ] Unit tests: aggregation function (test with sample data)
- [ ] Integration tests: API endpoint + DB
- [ ] Load test: query with 5+ years of data
- [ ] Test edge cases: no data, single transaction, massive datasets
- [ ] Code coverage: >80%

---

### EPIC 1.2: Patient Acquisition Funnel ⏱️ 8 hours
**Owner:** Dev Team 1A (Backend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 1.1 (DB schema understanding)

#### Tasks:

**1.2.1 Funnel Calculation Logic** (2 hours)
- [ ] Define "lead" → "consultation" → "treatment" progression
- [ ] Create `analytics_service.funnel_metrics()` function
- [ ] Calculate conversion % at each stage
- [ ] Test with sample patient cohorts
- [ ] Document calculation assumptions

**1.2.2 Database View** (1 hour)
```sql
CREATE VIEW patient_funnel AS
SELECT 
    DATE(p.created_at) as acquisition_date,
    COUNT(DISTINCT p.id) as leads,
    COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN p.id END) as consults,
    COUNT(DISTINCT CASE WHEN f.id IS NOT NULL THEN p.id END) as treatments,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN p.id END) 
        / NULLIF(COUNT(DISTINCT p.id), 0), 2) as consult_conversion,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN f.id IS NOT NULL THEN p.id END)
        / NULLIF(COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN p.id END), 0), 2) as treatment_conversion
FROM patient p
LEFT JOIN consultation c ON p.id = c.patient_id AND c.status = 'completed'
LEFT JOIN financial f ON p.id = f.patient_id
GROUP BY DATE(p.created_at)
ORDER BY acquisition_date DESC;
```
- [ ] Create migration for view
- [ ] Test view query performance
- [ ] Add index on patient.created_at + consultation.status

**1.2.3 Funnel API Endpoint** (2 hours)
```python
@router.get("/api/analytics/funnel")
async def get_funnel(
    period: str = "month",  # day, week, month, quarter
    group_by: str = "treatment_type"  # optional
):
    """
    Return patient acquisition funnel.
    
    Response:
    {
        "funnel": [
            {"stage": "leads", "count": 150},
            {"stage": "consultations", "count": 89, "conversion": 59.3},
            {"stage": "treatments", "count": 45, "conversion": 50.6}
        ],
        "average_funnel": {...}
    }
    """
```
- [ ] GET endpoint with period + optional grouping
- [ ] Pydantic response schema
- [ ] Error handling
- [ ] Documentation

**1.2.4 Caching & Performance** (1 hour)
- [ ] Redis cache for funnel results (24-hour TTL)
- [ ] Query optimization (use indexed columns)
- [ ] Test with 5+ years of patient data
- [ ] Document expected query time

**1.2.5 Testing** (2 hours)
- [ ] Unit tests: funnel calculation logic
- [ ] Integration tests: API + view queries
- [ ] Sample data: multiple patient cohorts
- [ ] Edge cases: empty periods, partial data
- [ ] Code coverage: >80%

---

### EPIC 1.3: Treatment Success Metrics ⏱️ 8 hours
**Owner:** Dev Team 1A (Backend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 1.1 (DB schema), consultation schema update

#### Tasks:

**1.3.1 Database Schema Extension** (1 hour)
```sql
ALTER TABLE consultation ADD COLUMN (
    outcome_status VARCHAR(50) DEFAULT 'pending',
    -- Values: pending, success, partial, no_result, cancelled
    outcome_notes TEXT,
    outcome_date TIMESTAMP
);

CREATE INDEX idx_consultation_outcome 
    ON consultation(outcome_status, created_at);
```
- [ ] Create migration
- [ ] Test migration on staging DB
- [ ] Update SQLAlchemy model
- [ ] Update API schema

**1.3.2 Success Criteria Configuration** (1 hour)
- [ ] Define success criteria per treatment type (in-app config or database)
- [ ] Example:
  - Fisioterapia: 80% pain reduction → success
  - Consulta: patient returns for treatment → success
  - Cirurgia: recovery within normal timeline → success
- [ ] Create `treatment_success_config` table
- [ ] Admin endpoint to edit criteria
- [ ] Test configuration loading

**1.3.3 Success Rate Calculation API** (2 hours)
```python
@router.get("/api/analytics/success")
async def get_success_metrics(
    treatment_type: Optional[str] = None,
    period: str = "month",
    include_trend: bool = True
):
    """
    Return treatment success rates.
    
    Response:
    {
        "success_rate": 72.5,  # overall %
        "by_treatment": [
            {
                "treatment": "fisio",
                "success_rate": 85.2,
                "total": 47,
                "successful": 40,
                "trending": "up"  # up, down, stable
            }
        ],
        "period_comparison": {...}  # vs last period
    }
    """
```
- [ ] GET endpoint with filters
- [ ] Calculate success % + trending
- [ ] Compare with previous period
- [ ] Pydantic schema
- [ ] Error handling

**1.3.4 Trending Calculation** (2 hours)
- [ ] Implement trend calculation (up/down/stable)
- [ ] Compare current period vs last 2 periods
- [ ] Test trend logic with sample data
- [ ] Document trending algorithm
- [ ] Add to response schema

**1.3.5 Testing** (2 hours)
- [ ] Unit tests: success calculation
- [ ] Unit tests: trending logic
- [ ] Integration tests: API endpoint
- [ ] Test with varied outcome statuses
- [ ] Edge cases: 0 successes, all successes, partial data
- [ ] Code coverage: >80%

---

### EPIC 1.4: Appointment Utilization & No-Show Rate ⏱️ 8 hours
**Owner:** Dev Team 1A (Backend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 1.1 (DB schema understanding)

#### Tasks:

**1.4.1 Utilization Metrics Calculation** (2 hours)
- [ ] Create `utilization_metrics()` function
- [ ] Calculate: (Completed appts) / (Total scheduled) × 100
- [ ] Calculate: No-show % (didn't show + didn't cancel)
- [ ] Test with various appointment statuses
- [ ] Document calculation logic

**1.4.2 Database Queries & Views** (1 hour)
```sql
CREATE VIEW appointment_metrics AS
SELECT 
    DATE(scheduled_time) as date,
    COUNT(*) as total_scheduled,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_shows,
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
    ROUND(100.0 * COUNT(CASE WHEN status = 'completed' THEN 1 END) 
        / NULLIF(COUNT(*), 0), 2) as utilization_pct,
    ROUND(100.0 * COUNT(CASE WHEN status = 'no_show' THEN 1 END)
        / NULLIF(COUNT(*), 0), 2) as no_show_pct
FROM consultation
GROUP BY DATE(scheduled_time)
ORDER BY date DESC;
```
- [ ] Create migration
- [ ] Test view query
- [ ] Add indexes on scheduled_time + status

**1.4.3 Utilization API Endpoint** (2 hours)
```python
@router.get("/api/analytics/utilization")
async def get_utilization(
    period: str = "week",  # day, week, month
    group_by: str = "date"  # date, treatment, clinician
):
    """
    Return appointment utilization metrics.
    
    Response:
    {
        "utilization_rate": 78.3,  # %
        "no_show_rate": 5.2,  # %
        "data": [
            {
                "date": "2026-06-01",
                "total_scheduled": 12,
                "completed": 9,
                "no_shows": 1,
                "cancelled": 2,
                "utilization": 75.0,
                "no_show_rate": 8.3
            }
        ],
        "trending": "up"
    }
    """
```
- [ ] GET endpoint with period + grouping options
- [ ] Response schema validation
- [ ] Error handling
- [ ] Documentation

**1.4.4 No-Show Trending** (1 hour)
- [ ] Calculate weekly/monthly no-show trends
- [ ] Compare with historical average
- [ ] Identify problem days/clinicians
- [ ] Test trending with sample data
- [ ] Add to response

**1.4.5 Testing & Optimization** (2 hours)
- [ ] Unit tests: utilization calculation
- [ ] Unit tests: no-show rate logic
- [ ] Integration tests: API + DB views
- [ ] Load test: large date ranges
- [ ] Edge cases: no appointments, all no-shows
- [ ] Code coverage: >80%

---

## FEATURE 2: MULTI-LANGUAGE SUPPORT / i18n (5 Epics)

### EPIC 2.1: i18n Infrastructure Setup ⏱️ 6 hours
**Owner:** Dev Team 2B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** None (independent)

#### Tasks:

**2.1.1 Install Dependencies** (0.5 hours)
```bash
npm install next-i18next i18next i18next-browser-languagedetector
npm install --save-dev i18next-scanner  # for key extraction
```
- [ ] Install packages
- [ ] Verify versions in package.json
- [ ] Test import statements

**2.1.2 Create i18n Configuration** (1 hour)
```javascript
// i18n.config.js
const common = require('./public/locales/pt-BR/common.json');

module.exports = {
  i18n: {
    defaultLocale: 'pt-BR',
    locales: ['pt-BR', 'en', 'es', 'fr', 'it'],
    localeDetection: false,
  },
  ns: ['common', 'appointments', 'patients', 'analytics', 'errors'],
  defaultNS: 'common',
  returnObjects: true,
};

// next.config.js
const { i18n } = require('./i18n.config');

module.exports = {
  i18n,
  // ... other config
};
```
- [ ] Create i18n.config.js
- [ ] Update next.config.js
- [ ] Test configuration loading
- [ ] Verify all namespaces recognized

**2.1.3 Locale Folder Structure** (1 hour)
```
public/locales/
├─ pt-BR/
│  ├─ common.json
│  ├─ appointments.json
│  ├─ patients.json
│  ├─ analytics.json
│  └─ errors.json
├─ en/
│  └─ (same files)
├─ es/
│  └─ (same files)
├─ fr/
│  └─ (same files)
└─ it/
   └─ (same files)
```
- [ ] Create folder structure
- [ ] Create empty JSON files for each language
- [ ] Document file naming convention
- [ ] Add .gitkeep files

**2.1.4 i18n Provider Setup (_app.tsx)** (1 hour)
```typescript
// _app.tsx
import { appWithTranslation } from 'next-i18next';
import i18n from '../i18n.config';

const MyApp = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default appWithTranslation(MyApp);

// Or in _app.tsx directly:
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n.config';

<I18nextProvider i18n={i18n}>
  <Component {...pageProps} />
</I18nextProvider>
```
- [ ] Update _app.tsx with i18nProvider
- [ ] Test app initialization
- [ ] Verify no console errors
- [ ] Test in browser dev tools

**2.1.5 Language Switcher Component** (2 hours)
```typescript
// components/LanguageSwitcher.tsx
import { useTranslation } from 'next-i18next';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const languages = [
    { code: 'pt-BR', name: 'Português', flag: '🇧🇷' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  ];

  return (
    <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
      {languages.map(lang => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.name}
        </option>
      ))}
    </select>
  );
};
```
- [ ] Create LanguageSwitcher component
- [ ] Add to header/navbar
- [ ] Add localStorage persistence
- [ ] Test language switching
- [ ] Verify no page reload on switch

---

### EPIC 2.2: Frontend String Extraction & Translation ⏱️ 10 hours
**Owner:** Dev Team 2B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 2.1 (i18n setup)

#### Tasks:

**2.2.1 String Extraction from Components** (3 hours)
- [ ] Audit all pages: /app/dashboard, /app/appointments, /app/patients, /app/settings, etc.
- [ ] Identify hardcoded strings (labels, buttons, headings, placeholders)
- [ ] Extract to translation keys: `key = "menu.appointments.title"`
- [ ] Create master list of all keys (estimate 200-300 keys)
- [ ] Document extraction rules and naming convention

**2.2.2 Portuguese (PT-BR) Master Translation File** (2 hours)
```json
// public/locales/pt-BR/common.json
{
  "app": {
    "title": "OrthoClinic",
    "subtitle": "Gestão de Consultório Ortopédico"
  },
  "menu": {
    "dashboard": "Dashboard",
    "appointments": "Agendamentos",
    "patients": "Pacientes",
    "analytics": "Análise",
    "settings": "Configurações",
    "logout": "Sair"
  },
  "buttons": {
    "save": "Salvar",
    "cancel": "Cancelar",
    "delete": "Deletar",
    "edit": "Editar",
    "back": "Voltar"
  },
  "messages": {
    "success": "Operação realizada com sucesso",
    "error": "Erro ao processar requisição",
    "loading": "Carregando..."
  }
}
```
- [ ] Create all PT-BR JSON files (common, appointments, patients, analytics, errors)
- [ ] Complete all extracted keys with Portuguese translations
- [ ] Verify no duplicate keys
- [ ] Review for tone/consistency

**2.2.3 Component Refactoring with useTranslation()** (3 hours)
```typescript
// Before:
export const Appointments = () => {
  return (
    <div>
      <h1>Appointments</h1>
      <button>New Appointment</button>
    </div>
  );
};

// After:
import { useTranslation } from 'next-i18next';

export const Appointments = () => {
  const { t } = useTranslation('appointments');

  return (
    <div>
      <h1>{t('title')}</h1>
      <button>{t('new_button')}</button>
    </div>
  );
};
```
- [ ] Update all components with useTranslation()
- [ ] Remove hardcoded strings
- [ ] Test each component in PT-BR
- [ ] Verify strings load correctly

**2.2.4 Translation for Other Languages** (2 hours)
- [ ] Create EN (English) translations
- [ ] Create ES (Spanish) translations
- [ ] Create FR (French) translations
- [ ] Create IT (Italian) translations
- [ ] Use professional translators for accuracy (budget: 4-5 hours per language at cost)
- [ ] Verify all keys exist in all language files

**2.2.5 Testing & Validation** (2 hours)
- [ ] Switch language in UI: verify all strings change
- [ ] Test each language: PT-BR, EN, ES, FR, IT
- [ ] Check for missing translations (use i18next scanner)
- [ ] Verify no placeholder text visible
- [ ] Test in different browsers

---

### EPIC 2.3: Backend Locale Support ⏱️ 7 hours
**Owner:** Dev Team 2A (Backend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 2.1 (frontend i18n setup)

#### Tasks:

**2.3.1 User Model Extension** (1 hour)
```python
# models/user.py
class Staff(Base):
    __tablename__ = "staff"
    
    id: int = Column(Integer, primary_key=True)
    email: str = Column(String, unique=True, index=True)
    name: str = Column(String)
    
    # NEW:
    preferred_language: str = Column(String(10), default='pt-BR')
    
    created_at: datetime = Column(DateTime, default=datetime.utcnow)
```
- [ ] Add preferred_language column to Staff model
- [ ] Create migration
- [ ] Test migration
- [ ] Update API schema

**2.3.2 Locale Detection Middleware** (2 hours)
```python
# middleware/locale.py
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class LocaleMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 1. Try user's preferred_language (if logged in)
        # 2. Try Accept-Language header
        # 3. Default to pt-BR
        
        user = request.scope.get("user")
        locale = 'pt-BR'
        
        if user:
            locale = user.preferred_language or 'pt-BR'
        else:
            accept_lang = request.headers.get('accept-language', '')
            locale = extract_language(accept_lang)
        
        request.scope['locale'] = locale
        response = await call_next(request)
        return response

# app.py
app.add_middleware(LocaleMiddleware)
```
- [ ] Create LocaleMiddleware
- [ ] Add middleware to app
- [ ] Test locale detection from header
- [ ] Test locale detection from user preference
- [ ] Verify fallback to PT-BR

**2.3.3 Translation Service** (1.5 hours)
```python
# services/i18n_service.py
class I18nService:
    def __init__(self, locale: str = 'pt-BR'):
        self.locale = locale
        self.translations = self._load_translations()
    
    def get_translation(self, key: str) -> str:
        # Load from JSON or cache
        keys = key.split('.')
        value = self.translations
        for k in keys:
            value = value.get(k)
        return value
    
    def translate_status(self, status: str) -> str:
        # Translate appointment status, treatment type, etc.
        return self.get_translation(f'enums.appointment_status.{status}')
```
- [ ] Create I18nService class
- [ ] Load translation JSON files from /backend/locales
- [ ] Implement getTranslation() method
- [ ] Test translation lookups

**2.3.4 Localization Endpoint** (1.5 hours)
```python
@router.get("/api/locales/{language}/enums")
async def get_localized_enums(language: str):
    """
    Return localized enums for dropdowns, status labels, etc.
    
    Response:
    {
        "appointment_status": {
            "scheduled": "Agendado",
            "completed": "Concluído",
            "cancelled": "Cancelado",
            "no_show": "Não Compareceu"
        },
        "treatment_types": {
            "consultation": "Consulta",
            "rehabilitation": "Reabilitação",
            "surgery": "Cirurgia"
        }
    }
    """
```
- [ ] Create GET /api/locales/{language}/enums endpoint
- [ ] Return localized appointment statuses
- [ ] Return localized treatment types
- [ ] Return localized error messages
- [ ] Cache response (24-hour TTL)
- [ ] Document endpoint

**2.3.5 Error Message Localization** (1 hour)
```python
# middleware/error_handler.py
async def error_handler(request: Request, exc: Exception):
    locale = request.scope.get('locale', 'pt-BR')
    i18n = I18nService(locale)
    
    if isinstance(exc, ValueError):
        msg = i18n.get_translation('errors.invalid_data')
    elif isinstance(exc, NotFoundException):
        msg = i18n.get_translation('errors.not_found')
    else:
        msg = i18n.get_translation('errors.generic')
    
    return {"error": msg, "locale": locale}
```
- [ ] Create error handler middleware
- [ ] Translate common error messages
- [ ] Test with various exceptions
- [ ] Return localized responses

**2.3.6 Testing** (1 hour)
- [ ] Unit tests: I18nService translation lookup
- [ ] Integration tests: locale detection middleware
- [ ] Integration tests: localized enums endpoint
- [ ] Test different locales: PT-BR, EN, ES, FR, IT
- [ ] Code coverage: >80%

---

### EPIC 2.4: Date/Time Localization ⏱️ 6 hours
**Owner:** Dev Team 2B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 2.1 (i18n setup), EPIC 2.3 (locale middleware)

#### Tasks:

**2.4.1 date-fns Locale Setup** (1 hour)
```typescript
// lib/dateUtils.ts
import { format, parse } from 'date-fns';
import { pt-BR as ptBR, enUS as enUS, es, fr, it } from 'date-fns/locale';

const locales = {
  'pt-BR': ptBR,
  'en': enUS,
  'es': es,
  'fr': fr,
  'it': it,
};

export const formatDate = (date: Date, locale: string, formatStr: string = 'PP') => {
  return format(date, formatStr, { locale: locales[locale] });
};

export const parseDate = (dateStr: string, locale: string) => {
  return parse(dateStr, 'PP', new Date(), { locale: locales[locale] });
};
```
- [ ] Import all date-fns locales
- [ ] Create formatDate() utility
- [ ] Create parseDate() utility
- [ ] Test with multiple locales
- [ ] Verify date formatting

**2.4.2 Timezone Picker Component** (2 hours)
```typescript
// components/TimezoneSelector.tsx
import { useEffect, useState } from 'react';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

const TimezoneSelector = ({ onChange }) => {
  const timezones = [
    'America/Sao_Paulo',
    'America/New_York',
    'Europe/London',
    'Europe/Paris',
    'Europe/Rome',
  ];

  return (
    <select onChange={(e) => onChange(e.target.value)}>
      {timezones.map(tz => (
        <option key={tz} value={tz}>
          {tz}
        </option>
      ))}
    </select>
  );
};
```
- [ ] Create TimezoneSelector component
- [ ] Display current time in selected timezone
- [ ] Implement onChange handler
- [ ] Add to Settings page
- [ ] Test timezone changes

**2.4.3 Date Format Localization** (1 hour)
- [ ] PT-BR format: DD/MM/YYYY (14/06/2026)
- [ ] EN format: MM/DD/YYYY (06/14/2026)
- [ ] ES format: DD/MM/YYYY (14/06/2026)
- [ ] FR format: DD/MM/YYYY (14/06/2026)
- [ ] IT format: DD/MM/YYYY (14/06/2026)
- [ ] Apply formatting to all appointment dates, patient birthdates, etc.

**2.4.4 Appointment Date/Time Display** (1 hour)
```typescript
// components/AppointmentCard.tsx
import { formatDate, formatTime } from '@/lib/dateUtils';
import { useSettings } from '@/context/SettingsContext';

const AppointmentCard = ({ appointment }) => {
  const { locale, timezone } = useSettings();
  
  const zonedDate = utcToZonedTime(appointment.scheduled_time, timezone);
  
  return (
    <div>
      <p>{formatDate(zonedDate, locale)}</p>
      <p>{formatTime(zonedDate, locale)}</p>
    </div>
  );
};
```
- [ ] Update appointment display to use user's locale + timezone
- [ ] Test with different timezones
- [ ] Test with different date formats
- [ ] Verify times display correctly

**2.4.5 Testing** (1 hour)
- [ ] Unit tests: formatDate() with different locales
- [ ] Unit tests: parseDate() with different formats
- [ ] Integration tests: appointment dates display correctly
- [ ] Test daylight saving time handling
- [ ] Test with 5+ timezones
- [ ] Code coverage: >80%

---

### EPIC 2.5: Translation File Management ⏱️ 4 hours
**Owner:** Dev Team 2B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 2.2 (all strings extracted)

#### Tasks:

**2.5.1 Translation Key Naming Convention** (1 hour)
```
Naming Convention:
  menu.{module}.{item}
  buttons.{action}
  messages.{type}
  validation.{field}
  enums.{entity}.{value}
  
Examples:
  menu.appointments.title
  buttons.save
  messages.success
  validation.email_required
  enums.appointment_status.scheduled
```
- [ ] Document naming convention
- [ ] Review all current keys for compliance
- [ ] Fix non-compliant keys
- [ ] Create linting rule (optional)

**2.5.2 CI/CD Language Key Validation** (1.5 hours)
```bash
# scripts/validate-translations.js
const fs = require('fs');

const locales = ['pt-BR', 'en', 'es', 'fr', 'it'];
const reference = loadJson('public/locales/pt-BR/common.json');

for (const locale of locales) {
  const lang = loadJson(`public/locales/${locale}/common.json`);
  const keys = getKeys(reference);
  const langKeys = getKeys(lang);
  
  const missing = keys.filter(k => !langKeys.includes(k));
  if (missing.length > 0) {
    console.error(`Missing keys in ${locale}: ${missing.join(', ')}`);
    process.exit(1);
  }
}
```
- [ ] Create validation script
- [ ] Add to pre-commit hook or CI pipeline
- [ ] Test with intentionally broken file
- [ ] Document validation rules

**2.5.3 Translation Completeness Dashboard** (1 hour)
```
Translation Status:
  PT-BR: 100% (300/300 keys) ✓
  EN:    95%  (285/300 keys) - Missing: menu.new_feature, ...
  ES:    92%  (276/300 keys)
  FR:    88%  (264/300 keys)
  IT:    85%  (255/300 keys)
```
- [ ] Create translation completeness report
- [ ] Identify missing keys per language
- [ ] Prioritize translation work
- [ ] Track progress over time

**2.5.4 Documentation & Handoff** (0.5 hours)
- [ ] Document translation process for future updates
- [ ] Create guide for adding new strings (dev guide)
- [ ] Create guide for translating strings (translator guide)
- [ ] Document translation vendor/process (if applicable)

---

## FEATURE 3: NOTIFICATION SYSTEM (5 Epics)

### EPIC 3.1: Email Service Integration ⏱️ 8 hours
**Owner:** Dev Team 2A (Backend Lead)  
**Status:** Not Started  
**Dependencies:** None (independent)

#### Tasks:

**3.1.1 SMTP Credentials & Setup** (1 hour)
```bash
# .env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=clinic@example.com
SMTP_PASSWORD=app_specific_password
SMTP_FROM_EMAIL=clinic@example.com
SMTP_FROM_NAME=OrthoClinic

# OR SendGrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@orthoclinic.com
SENDGRID_FROM_NAME=OrthoClinic
```
- [ ] Configure SMTP or SendGrid account
- [ ] Get credentials from clinic
- [ ] Test credentials with simple email send
- [ ] Add to .env file
- [ ] Document setup process

**3.1.2 Email Service Class** (2 hours)
```python
# services/email_service.py
from aiosmtplib import SMTP
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

class EmailService:
    def __init__(self, host, port, username, password):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
    
    async def send(self, to: str, subject: str, body_html: str, 
                   body_text: str = None, retry_count: int = 0):
        """Send email with automatic retry on failure."""
        try:
            async with SMTP(hostname=self.host, port=self.port) as smtp:
                await smtp.login(self.username, self.password)
                
                msg = MIMEMultipart('alternative')
                msg['Subject'] = subject
                msg['From'] = self.from_email
                msg['To'] = to
                
                if body_text:
                    msg.attach(MIMEText(body_text, 'plain'))
                msg.attach(MIMEText(body_html, 'html'))
                
                await smtp.send_message(msg)
                return {"status": "sent", "email": to}
        except Exception as e:
            if retry_count < 3:
                await asyncio.sleep(2 ** retry_count)  # exponential backoff
                return await self.send(to, subject, body_html, body_text, retry_count + 1)
            else:
                logging.error(f"Email send failed after 3 retries: {to}")
                raise
```
- [ ] Create EmailService class
- [ ] Implement async send method
- [ ] Add retry logic with exponential backoff
- [ ] Test SMTP connection
- [ ] Test actual email delivery

**3.1.3 Email Template System (Jinja2)** (2 hours)
```python
# services/template_service.py
from jinja2 import Environment, FileSystemLoader

class TemplateService:
    def __init__(self):
        self.env = Environment(loader=FileSystemLoader('templates/emails'))
    
    def render(self, template_name: str, context: dict) -> str:
        """Render email template with context variables."""
        template = self.env.get_template(f"{template_name}.html")
        return template.render(**context)

# Usage:
template_service = TemplateService()
body_html = template_service.render('appointment_reminder', {
    'clinic_name': 'OrthoClinic',
    'patient_name': 'João',
    'appointment_date': '14/06/2026',
    'appointment_time': '09:00',
    'clinician_name': 'Dra. Maria Silva'
})

await email_service.send(
    to='john@example.com',
    subject='Lembrete de Agendamento',
    body_html=body_html
)
```
- [ ] Create template directory structure
- [ ] Create appointment_reminder.html template
- [ ] Create prescription_ready.html template
- [ ] Create follow_up.html template
- [ ] Test template rendering
- [ ] Verify HTML emails display correctly

**3.1.4 Email Bounce & Unsubscribe Handling** (2 hours)
- [ ] Track bounce emails (hard bounce, soft bounce)
- [ ] Mark bounced emails as invalid (update patient.email)
- [ ] Implement unsubscribe link in emails
- [ ] Track unsubscribe requests (update notification_preferences)
- [ ] Test bounce detection
- [ ] Document bounce handling

**3.1.5 Testing & Validation** (1 hour)
- [ ] Unit tests: template rendering
- [ ] Integration tests: email send
- [ ] Test with real email address (send to clinic admin)
- [ ] Test with invalid email (verify error handling)
- [ ] Test retry logic (simulate SMTP failure)
- [ ] Code coverage: >80%

---

### EPIC 3.2: In-App Toast Notifications ⏱️ 5 hours
**Owner:** Dev Team 2B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 2.1 (i18n setup for translated messages)

#### Tasks:

**3.2.1 Toast UI Component** (1.5 hours)
```typescript
// components/Toast.tsx
import { Toaster, toast } from 'sonner';

export const ToastProvider = ({ children }) => {
  return (
    <>
      <Toaster 
        position="top-right"
        expand={false}
        richColors
        closeButton
      />
      {children}
    </>
  );
};

// Usage:
toast.success('Agendamento confirmado!');
toast.error('Erro ao salvar agendamento');
toast.loading('Carregando...');
```
- [ ] Setup Toaster component in root layout
- [ ] Configure toast position + styling
- [ ] Test toast display
- [ ] Verify toast auto-dismiss (5 seconds default)
- [ ] Test close button

**3.2.2 Notification Context & Hook** (1.5 hours)
```typescript
// context/NotificationContext.tsx
import { createContext, useContext } from 'react';
import { toast } from 'sonner';

const NotificationContext = createContext();

export const useNotification = () => {
  return useContext(NotificationContext);
};

export const NotificationProvider = ({ children }) => {
  const notify = {
    success: (message: string) => toast.success(message),
    error: (message: string) => toast.error(message),
    info: (message: string) => toast.info(message),
    warning: (message: string) => toast.warning(message),
  };
  
  return (
    <NotificationContext.Provider value={notify}>
      {children}
    </NotificationContext.Provider>
  );
};

// Usage in component:
const { success } = useNotification();
success('Operação realizada!');
```
- [ ] Create NotificationContext
- [ ] Create useNotification() hook
- [ ] Wrap app with NotificationProvider
- [ ] Test context usage
- [ ] Test in multiple components

**3.2.3 Toast Types & Styling** (1 hour)
```typescript
// Toast types: success, error, info, warning
const toastStyles = {
  success: {
    icon: '✓',
    color: 'green',
    bgColor: 'bg-green-100'
  },
  error: {
    icon: '✕',
    color: 'red',
    bgColor: 'bg-red-100'
  },
  info: {
    icon: 'ℹ',
    color: 'blue',
    bgColor: 'bg-blue-100'
  },
  warning: {
    icon: '⚠',
    color: 'yellow',
    bgColor: 'bg-yellow-100'
  }
};
```
- [ ] Define toast types
- [ ] Create consistent styling
- [ ] Test each toast type
- [ ] Verify colors match brand guidelines

**3.2.4 Localization of Toast Messages** (1 hour)
```typescript
// hooks/useLocalizedToast.ts
import { useTranslation } from 'next-i18next';
import { useNotification } from '@/context/NotificationContext';

export const useLocalizedToast = () => {
  const { t } = useTranslation('messages');
  const notification = useNotification();
  
  return {
    successSave: () => notification.success(t('save_success')),
    errorSave: () => notification.error(t('save_error')),
    errorNetwork: () => notification.error(t('network_error')),
  };
};
```
- [ ] Create localized toast hook
- [ ] Add all common toast messages to translations
- [ ] Update components to use localized toasts
- [ ] Test in multiple languages

**3.2.5 Testing** (0.5 hours)
- [ ] Test toast appears when triggered
- [ ] Test auto-dismiss timer
- [ ] Test close button
- [ ] Test in different browsers
- [ ] Test toast stacking (multiple toasts)

---

### EPIC 3.3: Notification Scheduling & Queue ⏱️ 8 hours
**Owner:** Dev Team 2A (Backend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 3.1 (email service)

#### Tasks:

**3.3.1 Database Schema for Notification Queue** (1 hour)
```sql
CREATE TABLE notification_queue (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES staff(id),
    patient_id INT REFERENCES patient(id) NULL,
    notification_type VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    body TEXT,
    email_template_id VARCHAR(100),
    email_context JSONB,
    scheduled_time TIMESTAMP,
    sent_time TIMESTAMP NULL,
    status VARCHAR(50) DEFAULT 'pending',
    delivery_response TEXT,
    retry_count INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notification_scheduled 
    ON notification_queue(scheduled_time, status);
```
- [ ] Create migration
- [ ] Test migration on staging DB
- [ ] Verify indexes created
- [ ] Update SQLAlchemy model

**3.3.2 Notification Queue API** (1.5 hours)
```python
@router.post("/api/notifications/queue")
async def create_notification(notification: NotificationCreate):
    """Add notification to queue for later sending."""
    queued = NotificationQueue(
        user_id=notification.user_id,
        patient_id=notification.patient_id,
        notification_type=notification.type,
        recipient_email=notification.email,
        title=notification.title,
        body=notification.body,
        email_template_id=notification.template_id,
        email_context=notification.context,
        scheduled_time=notification.scheduled_time,
        status='pending'
    )
    db.add(queued)
    db.commit()
    return {"id": queued.id, "scheduled_time": queued.scheduled_time}
```
- [ ] Create NotificationCreate schema
- [ ] Implement POST /api/notifications/queue endpoint
- [ ] Validate input (email format, template exists)
- [ ] Return notification ID + scheduled time
- [ ] Test endpoint

**3.3.3 Background Scheduler (Notification Sender)** (2.5 hours)
```python
# background_jobs/notification_scheduler.py
import asyncio
from datetime import datetime

class NotificationScheduler:
    def __init__(self, email_service, db):
        self.email_service = email_service
        self.db = db
    
    async def send_scheduled_notifications(self):
        """Run every 5 minutes to send due notifications."""
        pending = self.db.query(NotificationQueue).filter(
            NotificationQueue.scheduled_time <= datetime.utcnow(),
            NotificationQueue.status == 'pending',
            NotificationQueue.retry_count < 3
        ).all()
        
        for notification in pending:
            try:
                # Render template
                body_html = await self.render_template(
                    notification.email_template_id,
                    notification.email_context
                )
                
                # Send email
                await self.email_service.send(
                    to=notification.recipient_email,
                    subject=notification.title,
                    body_html=body_html
                )
                
                # Mark as sent
                notification.status = 'sent'
                notification.sent_time = datetime.utcnow()
                self.db.commit()
                
            except Exception as e:
                notification.retry_count += 1
                notification.last_error = str(e)
                
                if notification.retry_count >= 3:
                    notification.status = 'failed'
                
                self.db.commit()

# Startup event:
@app.on_event("startup")
async def schedule_notifications():
    scheduler = NotificationScheduler(email_service, db)
    
    loop = asyncio.get_event_loop()
    loop.create_task(run_scheduler(scheduler))

async def run_scheduler(scheduler):
    while True:
        await scheduler.send_scheduled_notifications()
        await asyncio.sleep(300)  # Run every 5 minutes
```
- [ ] Create NotificationScheduler class
- [ ] Implement send_scheduled_notifications() method
- [ ] Add background task to app startup
- [ ] Test with sample notifications
- [ ] Verify retry logic
- [ ] Log all sent/failed notifications

**3.3.4 Event Triggers** (1.5 hours)
```python
# event_handlers.py
async def on_appointment_created(appointment):
    """Trigger notification 24 hours before appointment."""
    reminder_time = appointment.scheduled_time - timedelta(hours=24)
    
    await notification_queue.create(
        user_id=appointment.staff_id,
        patient_id=appointment.patient_id,
        type='appointment_reminder',
        email=appointment.patient.email,
        title='Lembrete de Agendamento',
        template_id='appointment_reminder',
        context={
            'patient_name': appointment.patient.name,
            'appointment_date': appointment.scheduled_time.strftime('%d/%m/%Y'),
            'appointment_time': appointment.scheduled_time.strftime('%H:%M'),
        },
        scheduled_time=reminder_time
    )

# Hooks in endpoints:
@router.post("/api/appointments")
async def create_appointment(appointment: AppointmentCreate):
    appt = Appointment(**appointment.dict())
    db.add(appt)
    db.commit()
    
    # Trigger notification
    await on_appointment_created(appt)
    
    return appt
```
- [ ] Create event handlers for: appointment_created, prescription_created, appointment_completed
- [ ] Integrate handlers into existing endpoints
- [ ] Test each trigger
- [ ] Verify notifications queued correctly

**3.3.5 Idempotency & Deduplication** (1.5 hours)
- [ ] Add idempotency key to notification creation
- [ ] Prevent duplicate notifications for same event
- [ ] Implement deduplication logic
- [ ] Test with concurrent requests
- [ ] Document idempotency approach

---

### EPIC 3.4: Notification Preferences & Opt-Out ⏱️ 6 hours
**Owner:** Dev Team 2B (Frontend Lead) + Team 2A (Backend)  
**Status:** Not Started  
**Dependencies:** EPIC 3.1 (email service), EPIC 2.3 (user settings)

#### Tasks:

**3.4.1 Database Schema for Preferences** (0.5 hours)
```sql
ALTER TABLE user_settings ADD COLUMN (
    notification_preferences JSONB DEFAULT '{
        "appointment_reminder": true,
        "appointment_reminder_hours": 24,
        "prescription_alerts": true,
        "treatment_updates": true,
        "marketing_emails": false,
        "email_digest": "never",
        "in_app_toasts": true
    }'::jsonb
);
```
- [ ] Create migration
- [ ] Test migration
- [ ] Update SQLAlchemy model
- [ ] Verify default values

**3.4.2 Notification Preferences UI** (2 hours)
```typescript
// components/NotificationPreferences.tsx
import { useSettings } from '@/context/SettingsContext';
import { useTranslation } from 'next-i18next';

const NotificationPreferences = () => {
  const { t } = useTranslation('settings');
  const { updateSettings } = useSettings();
  const [prefs, setPrefs] = useState({
    appointment_reminder: true,
    appointment_reminder_hours: 24,
    prescription_alerts: true,
    treatment_updates: true,
    marketing_emails: false,
    email_digest: 'never'
  });

  const handleChange = (field, value) => {
    setPrefs({ ...prefs, [field]: value });
  };

  const handleSave = async () => {
    await updateSettings({ notification_preferences: prefs });
    toast.success(t('preferences_saved'));
  };

  return (
    <div className="space-y-4">
      <label>
        <input 
          type="checkbox" 
          checked={prefs.appointment_reminder}
          onChange={(e) => handleChange('appointment_reminder', e.target.checked)}
        />
        {t('appointment_reminders')}
      </label>

      {prefs.appointment_reminder && (
        <select 
          value={prefs.appointment_reminder_hours}
          onChange={(e) => handleChange('appointment_reminder_hours', parseInt(e.target.value))}
        >
          <option value={24}>24 horas antes</option>
          <option value={48}>48 horas antes</option>
          <option value={72}>3 dias antes</option>
        </select>
      )}

      <label>
        <input 
          type="checkbox" 
          checked={prefs.prescription_alerts}
          onChange={(e) => handleChange('prescription_alerts', e.target.checked)}
        />
        {t('prescription_alerts')}
      </label>

      <label>
        {t('email_digest')}
        <select value={prefs.email_digest} onChange={(e) => handleChange('email_digest', e.target.value)}>
          <option value="never">Nunca</option>
          <option value="daily">Diário</option>
          <option value="weekly">Semanal</option>
        </select>
      </label>

      <button onClick={handleSave}>{t('save')}</button>
    </div>
  );
};
```
- [ ] Create NotificationPreferences component
- [ ] Add to Settings page
- [ ] Implement onChange handlers
- [ ] Implement Save functionality
- [ ] Test preference toggling
- [ ] Test in mobile view

**3.4.3 Backend Preference Validation & Respecting** (1.5 hours)
```python
# services/notification_service.py
async def should_send_notification(user_id: int, type: str) -> bool:
    """Check if user has opted in to this notification type."""
    user = db.query(Staff).filter_by(id=user_id).first()
    prefs = user.settings.notification_preferences
    
    if type == 'appointment_reminder':
        return prefs.get('appointment_reminder', True)
    elif type == 'prescription_alert':
        return prefs.get('prescription_alerts', True)
    elif type == 'marketing':
        return prefs.get('marketing_emails', False)
    
    return True

# Updated notification creation:
async def create_notification(...):
    if not await should_send_notification(user_id, notification_type):
        # Skip notification creation
        return None
    
    # Create notification as normal
```
- [ ] Implement preference checking
- [ ] Update notification creation to respect preferences
- [ ] Test opt-out for each notification type
- [ ] Verify opted-out users don't receive notifications

**3.4.4 Unsubscribe Link in Emails** (1 hour)
```html
<!-- Email template footer -->
<p>
  <a href="https://clinic.orthoclinic.com/notifications/unsubscribe?token=xyz">
    Desinscrever-se
  </a>
</p>
```
- [ ] Add unsubscribe link to all email templates
- [ ] Create unsubscribe endpoint
- [ ] Generate unsubscribe token
- [ ] Test unsubscribe flow
- [ ] Verify preferences updated

**3.4.5 Testing** (1 hour)
- [ ] Test preference toggling
- [ ] Test opted-out users don't receive notifications
- [ ] Test opted-in users receive notifications
- [ ] Test unsubscribe link
- [ ] Test with multiple notification types
- [ ] Code coverage: >80%

---

### EPIC 3.5: Notification Audit Log ⏱️ 5 hours
**Owner:** Dev Team 2A (Backend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 3.3 (notification queue)

#### Tasks:

**3.5.1 Notification Log Database Table** (0.5 hours)
```sql
CREATE TABLE notification_log (
    id SERIAL PRIMARY KEY,
    queue_id INT REFERENCES notification_queue(id),
    user_id INT REFERENCES staff(id),
    patient_id INT REFERENCES patient(id) NULL,
    notification_type VARCHAR(50),
    recipient_email VARCHAR(255),
    subject VARCHAR(255),
    sent_at TIMESTAMP,
    delivery_status VARCHAR(50),  -- sent, bounced, failed, unsubscribed
    delivery_code INT,
    bounce_reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notification_log_sent 
    ON notification_log(sent_at);
CREATE INDEX idx_notification_log_user 
    ON notification_log(user_id);
```
- [ ] Create migration
- [ ] Test migration
- [ ] Update SQLAlchemy model
- [ ] Verify indexes

**3.5.2 Logging Notification Sends** (1.5 hours)
```python
# services/notification_service.py
async def log_notification(queue_id, status, code=None, reason=None):
    """Log sent notification to audit trail."""
    queue = db.query(NotificationQueue).filter_by(id=queue_id).first()
    
    log_entry = NotificationLog(
        queue_id=queue.id,
        user_id=queue.user_id,
        patient_id=queue.patient_id,
        notification_type=queue.notification_type,
        recipient_email=queue.recipient_email,
        subject=queue.title,
        sent_at=datetime.utcnow(),
        delivery_status=status,
        delivery_code=code,
        bounce_reason=reason
    )
    
    db.add(log_entry)
    db.commit()

# Update scheduler to log:
await self.log_notification(
    notification.id, 
    'sent', 
    code=200
)
```
- [ ] Add logging to notification scheduler
- [ ] Log sent status
- [ ] Log failed status
- [ ] Log bounce status
- [ ] Test logging

**3.5.3 Notification Reporting API** (1.5 hours)
```python
@router.get("/api/analytics/notifications")
async def get_notification_metrics(
    start_date: date,
    end_date: date,
    notification_type: Optional[str] = None
):
    """Return notification delivery metrics."""
    logs = db.query(NotificationLog).filter(
        NotificationLog.sent_at >= start_date,
        NotificationLog.sent_at <= end_date
    )
    
    if notification_type:
        logs = logs.filter_by(notification_type=notification_type)
    
    logs = logs.all()
    
    return {
        "total_sent": len(logs),
        "delivered": len([l for l in logs if l.delivery_status == 'sent']),
        "bounced": len([l for l in logs if l.delivery_status == 'bounced']),
        "failed": len([l for l in logs if l.delivery_status == 'failed']),
        "by_type": group_by_type(logs),
        "delivery_rate": calculate_delivery_rate(logs)
    }
```
- [ ] Create GET /api/analytics/notifications endpoint
- [ ] Return delivery metrics
- [ ] Calculate delivery rate %
- [ ] Test endpoint with sample data

**3.5.4 GDPR Compliance - Notification Retention** (1 hour)
- [ ] Define retention policy (e.g., keep logs 1 year)
- [ ] Create scheduled task to archive old logs
- [ ] Create scheduled task to delete logs older than policy
- [ ] Document retention policy
- [ ] Test archival process

**3.5.5 Testing** (0.5 hours)
- [ ] Test logging on send
- [ ] Test metrics calculation
- [ ] Test delivery rate calculation
- [ ] Test with multiple notification types
- [ ] Code coverage: >80%

---

## FEATURE 4: MOBILE RESPONSIVENESS (5 Epics)

### EPIC 4.1: Responsive Grid System ⏱️ 8 hours
**Owner:** Dev Team 3A (Lead)  
**Status:** Not Started  
**Dependencies:** None (can work in parallel)

#### Tasks:

**4.1.1 Breakpoint Audit** (1.5 hours)
- [ ] Document all pages + current layout
- [ ] Identify components that need breakpoint tweaks
- [ ] Create breakpoint audit spreadsheet:
  | Page | Component | Current Layout | Mobile <640px | Tablet 640-1024px | Desktop >1024px |
  |------|-----------|---|---|---|---|
  | Dashboard | Cards | 3-col | 1-col | 2-col | 3-col |
  | Appointments | Table | ... | ... | ... | ... |
- [ ] Review with design lead (if applicable)

**4.1.2 Mobile Layout (<640px)** (2 hours)
```typescript
// Example: Dashboard cards
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Mobile: 1 column
      Tablet: 2 columns
      Desktop: 3 columns */}
</div>

// Example: Sidebar navigation
<div className="flex flex-col sm:flex-row">
  <aside className="hidden sm:block w-full sm:w-64">
    {/* Sidebar (hidden on mobile, shown on tablet+) */}
  </aside>
  <main className="flex-1">
    {/* Main content full-width on mobile */}
  </main>
</div>
```
- [ ] Update dashboard layout for mobile
- [ ] Update appointments page for mobile
- [ ] Update patients page for mobile
- [ ] Update analytics dashboard for mobile
- [ ] Update settings page for mobile
- [ ] Test on mobile emulator (375px width)

**4.1.3 Tablet Layout (640-1024px)** (1.5 hours)
- [ ] Update components for tablet breakpoint
- [ ] 2-column layouts where appropriate
- [ ] Test on iPad emulator (768px)
- [ ] Test on medium-sized phones

**4.1.4 Desktop Layout (>1024px)** (1.5 hours)
- [ ] Verify desktop layouts unchanged
- [ ] Multi-column layouts optimal
- [ ] Sidebar navigation visible
- [ ] Test on desktop (1440px)
- [ ] Test on ultrawide (1920px+)

**4.1.5 Navigation Responsive Design** (1.5 hours)
```typescript
// Hamburger menu for mobile
<nav className="flex items-center justify-between p-4">
  <div className="sm:hidden">
    <button onClick={() => setMenuOpen(!menuOpen)}>☰</button>
  </div>
  <div className="hidden sm:flex gap-4">
    {/* Desktop navigation */}
  </div>
</nav>

{/* Mobile menu (hidden by default) */}
{menuOpen && (
  <div className="sm:hidden bg-gray-100">
    {/* Mobile menu items */}
  </div>
)}
```
- [ ] Create hamburger menu for mobile
- [ ] Implement menu toggle
- [ ] Test on mobile
- [ ] Hide on tablet+

---

### EPIC 4.2: Touch-Friendly UI Components ⏱️ 7 hours
**Owner:** Dev Team 3A (Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 4.1 (layout)

#### Tasks:

**4.2.1 Button & Link Sizing** (1.5 hours)
```typescript
// Base button styles (44x44px minimum)
<button className="px-4 py-3 min-h-[44px] min-w-[44px] rounded-lg">
  Save
</button>

// Updated TailwindCSS config (if needed):
theme: {
  extend: {
    spacing: {
      'touch': '44px',  // Touch target size
    }
  }
}
```
- [ ] Audit all buttons for 44x44px minimum
- [ ] Update button padding/height
- [ ] Update link styling
- [ ] Test on mobile
- [ ] Verify no buttons too small

**4.2.2 Form Input Sizing & Focus States** (1.5 hours)
```typescript
<input 
  className="w-full h-12 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
  placeholder="Email"
/>

// Styles:
- Height: 48-56px (not 40px)
- Padding: 12px 16px
- Focus ring: 2-4px
- Font size: 16px (prevents iOS zoom)
```
- [ ] Update input height to 48px
- [ ] Increase padding
- [ ] Improve focus states
- [ ] Test on mobile
- [ ] Verify tap-friendly

**4.2.3 Form Input Types (Native Mobile Controls)** (2 hours)
```typescript
// Email input (mobile shows email keyboard)
<input type="email" />

// Phone input (mobile shows numeric keyboard)
<input type="tel" />

// Date input (mobile shows date picker)
<input type="date" />

// Time input (mobile shows time picker)
<input type="time" />

// Number input (mobile shows numeric keyboard)
<input type="number" />
```
- [ ] Update appointment date inputs to type="date"
- [ ] Update phone inputs to type="tel"
- [ ] Update email inputs to type="email"
- [ ] Update time inputs to type="time"
- [ ] Test on iOS
- [ ] Test on Android

**4.2.4 Spacing & Touch Padding** (1.5 hours)
```typescript
// Mobile-first spacing scale
<div className="p-3 sm:p-4 md:p-6 lg:p-8">
  {/* Mobile: 12px padding
      Tablet: 16px padding
      Desktop: 24-32px padding */}
</div>

// Gap between interactive elements
<div className="flex gap-3 sm:gap-4 md:gap-6">
  {/* Minimum gap: 12px on mobile */}
</div>
```
- [ ] Update spacing scale
- [ ] Ensure min 12px gap between touch targets on mobile
- [ ] Test with finger taps (not mouse)

**4.2.5 Hover vs Tap Feedback** (1 hour)
```typescript
// Remove hover effects on mobile (use focus + active instead)
<button 
  className="active:bg-blue-700 focus:ring-2 focus:ring-blue-400"
>
  Tap feedback
</button>

// Optional: detect touch device
const isTouchDevice = () => {
  return (('ontouchstart' in window) ||
          (navigator.maxTouchPoints > 0) ||
          (navigator.msMaxTouchPoints > 0));
};
```
- [ ] Update focus states (better than hover on touch)
- [ ] Add active states
- [ ] Remove hover-only interactions
- [ ] Test on touch device

---

### EPIC 4.3: Mobile Navigation & UX ⏱️ 6 hours
**Owner:** Dev Team 3A (Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 4.1 (layout)

#### Tasks:

**4.3.1 Mobile Menu Component** (2 hours)
```typescript
// components/MobileMenu.tsx
import { useState } from 'react';

const MobileMenu = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="sm:hidden">
      <button onClick={() => setIsOpen(!isOpen)} className="p-4">
        {isOpen ? '✕' : '☰'}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-white z-40">
          <ul className="space-y-4 p-4">
            <li><Link href="/dashboard">Dashboard</Link></li>
            <li><Link href="/appointments">Agendamentos</Link></li>
            <li><Link href="/patients">Pacientes</Link></li>
            <li><Link href="/analytics">Análise</Link></li>
            <li><Link href="/settings">Configurações</Link></li>
            <li><LogoutButton /></li>
          </ul>
        </div>
      )}
    </nav>
  );
};
```
- [ ] Create MobileMenu component
- [ ] Implement toggle functionality
- [ ] Style menu (full-screen slide-in)
- [ ] Add close button
- [ ] Test on mobile

**4.3.2 Sticky Header on Mobile** (1.5 hours)
```typescript
<header className="sticky top-0 bg-white shadow z-50">
  <div className="flex items-center justify-between p-4">
    <h1 className="text-lg font-bold">OrthoClinic</h1>
    <div className="flex gap-2">
      <button>🔔</button> {/* Notifications */}
      <button>👤</button> {/* Profile */}
      <MobileMenu /> {/* Hamburger menu */}
    </div>
  </div>
</header>
```
- [ ] Create sticky header
- [ ] Position notification + profile icons
- [ ] Add hamburger menu toggle
- [ ] Test scrolling behavior

**4.3.3 Breadcrumb Collapse on Mobile** (1 hour)
```typescript
<nav className="hidden sm:flex text-sm">
  {/* Full breadcrumb: Dashboard > Appointments > Details */}
  <a href="/">Dashboard</a> / <a href="/appointments">Agendamentos</a> / Detalhes
</nav>

<nav className="sm:hidden text-sm">
  {/* Mobile: Show only "< Back" or current page */}
  <button onClick={() => router.back()}>← Voltar</button>
</nav>
```
- [ ] Create responsive breadcrumbs
- [ ] Collapse to "Back" button on mobile
- [ ] Test on mobile + desktop

**4.3.4 Bottom Navigation (Optional)** (1 hour)
```typescript
// For apps with frequent bottom-nav jumping (optional)
<nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t">
  <div className="flex justify-around">
    <a href="/dashboard">📊</a>
    <a href="/appointments">📅</a>
    <a href="/patients">👥</a>
    <a href="/settings">⚙️</a>
  </div>
</nav>
```
- [ ] Optional: add bottom navigation
- [ ] Test with main content (leave space at bottom)
- [ ] Hide on tablet+

**4.3.5 Page Transitions & Mobile UX** (0.5 hours)
- [ ] Smooth page transitions
- [ ] Loading indicators
- [ ] Scroll-to-top on navigation
- [ ] Test page transitions on mobile

---

### EPIC 4.4: Performance Optimization ⏱️ 7 hours
**Owner:** Dev Team 3B (Support)  
**Status:** Not Started  
**Dependencies:** EPIC 4.1, 4.2, 4.3 (mobile features)

#### Tasks:

**4.4.1 Image Optimization** (2 hours)
```typescript
// Before: plain img tag
<img src="/dashboard.png" alt="Dashboard" />

// After: next/image
import Image from 'next/image';

<Image
  src="/dashboard.png"
  alt="Dashboard"
  width={1200}
  height={600}
  priority  // if above fold
  responsive={true}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px"
/>
```
- [ ] Convert all img tags to next/image
- [ ] Set width/height attributes
- [ ] Add responsive sizes
- [ ] Use WebP format
- [ ] Test on mobile (verify smaller images loaded)

**4.4.2 Lazy Loading & Code Splitting** (2 hours)
```typescript
// Dynamic import for large components
import dynamic from 'next/dynamic';

const AnalyticsDashboard = dynamic(
  () => import('@/components/AnalyticsDashboard'),
  { 
    loading: () => <Skeleton />,
    ssr: false  // Don't server-render (mobile-heavy)
  }
);

// Usage:
<AnalyticsDashboard /> // Lazy-loaded on demand
```
- [ ] Identify large components (>100KB)
- [ ] Convert to dynamic imports
- [ ] Add loading skeletons
- [ ] Test lazy loading in DevTools

**4.4.3 Bundle Size Audit** (1.5 hours)
```bash
npm install --save-dev @next/bundle-analyzer

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  // ... config
})

# Run:
ANALYZE=true npm run build
```
- [ ] Install bundle analyzer
- [ ] Run bundle analysis
- [ ] Identify large chunks
- [ ] Target: main bundle <180KB gzipped
- [ ] Document bundle breakdown

**4.4.4 Lighthouse Performance Audit** (1.5 hours)
```bash
# Install Lighthouse CLI
npm install --save-dev lighthouse

# Run audit on mobile
lighthouse https://clinic.orthoclinic.com/app/dashboard --view

# Target scores:
# - Performance: 85+ (mobile), 90+ (desktop)
# - Accessibility: 95+
# - Best Practices: 95+
# - SEO: 100
```
- [ ] Run Lighthouse on all pages
- [ ] Create baseline report
- [ ] Fix performance issues
- [ ] Target scores: 85+ mobile, 90+ desktop

---

### EPIC 4.5: Mobile Forms & Input Handling ⏱️ 6 hours
**Owner:** Dev Team 3B (Support)  
**Status:** Not Started  
**Dependencies:** EPIC 4.2 (touch-friendly UI)

#### Tasks:

**4.5.1 Native Mobile Input Types** (1.5 hours)
```typescript
// Email input (shows email keyboard)
<input 
  type="email" 
  placeholder="Email"
  autoComplete="email"
/>

// Phone input (shows numeric keyboard)
<input 
  type="tel" 
  placeholder="+55 11 98765-4321"
  autoComplete="tel"
/>

// Date input (shows date picker on mobile)
<input 
  type="date" 
  placeholder="DD/MM/YYYY"
/>

// Time input (shows time picker on mobile)
<input 
  type="time" 
  placeholder="HH:MM"
/>

// Autocomplete hints
<input 
  type="text" 
  autoComplete="given-name"  // First name
/>
<input 
  type="text" 
  autoComplete="family-name"  // Last name
/>
```
- [ ] Update all form inputs with correct type attributes
- [ ] Add autoComplete attributes
- [ ] Test on iOS (verify native inputs appear)
- [ ] Test on Android (verify native inputs appear)

**4.5.2 Autocomplete & Patient Search** (1.5 hours)
```typescript
// Patient autocomplete
<input
  type="text"
  placeholder="Nome do paciente..."
  value={searchTerm}
  onChange={(e) => searchPatients(e.target.value)}
  list="patients-list"
/>

<datalist id="patients-list">
  {patients.map(p => (
    <option key={p.id} value={p.name} />
  ))}
</datalist>

// Or custom dropdown:
<Autocomplete
  options={patients}
  getOptionLabel={(p) => p.name}
  onSelect={(p) => setSelectedPatient(p)}
/>
```
- [ ] Create autocomplete for patient search
- [ ] Create autocomplete for address
- [ ] Create autocomplete for treatment type
- [ ] Test on mobile
- [ ] Test keyboard navigation (arrow keys, enter)

**4.5.3 Real-Time Form Validation** (1.5 hours)
```typescript
const [form, setForm] = useState({ email: '', phone: '' });
const [errors, setErrors] = useState({});

const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const handleChange = (field, value) => {
  setForm({ ...form, [field]: value });
  
  // Real-time validation
  if (field === 'email' && !validateEmail(value)) {
    setErrors({ ...errors, email: 'Email inválido' });
  } else {
    const newErrors = { ...errors };
    delete newErrors[field];
    setErrors(newErrors);
  }
};
```
- [ ] Add real-time validation to forms
- [ ] Show error messages immediately
- [ ] Disable submit if errors
- [ ] Test with invalid data
- [ ] Verify UX feedback

**4.5.4 Keyboard Management** (1 hour)
```typescript
// Dismiss keyboard on submit
const handleSubmit = async (e) => {
  e.preventDefault();
  
  // Blur input (dismiss keyboard)
  e.target.blur();
  
  // Submit form
  await submitForm();
};

// Next input focus (for multi-field forms)
<input
  onSubmitEditing={() => ref.current?.focus()}  // iOS
  returnKeyType="next"  // iOS
  blurOnSubmit={false}
/>
```
- [ ] Implement keyboard dismissal on submit
- [ ] Focus next field on return key (multi-field forms)
- [ ] Test on iOS + Android
- [ ] Verify smooth keyboard transitions

**4.5.5 Testing** (0.5 hours)
- [ ] Test all forms on mobile (iPhone + Android)
- [ ] Test autocomplete functionality
- [ ] Test real-time validation
- [ ] Test keyboard appearing/dismissing
- [ ] Test form submission

---

## FEATURE 5: USER SETTINGS PAGE (5 Epics)

### EPIC 5.1: Settings Page Infrastructure ⏱️ 5 hours
**Owner:** Dev Team 1B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 2.1 (i18n setup)

#### Tasks:

**5.1.1 Settings Route & Layout** (1 hour)
```typescript
// app/settings/layout.tsx
export default function SettingsLayout({ children }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <aside className="w-full sm:w-48">
        <nav className="space-y-2">
          <Link href="/settings" className="block px-4 py-2 rounded">
            Gerais
          </Link>
          <Link href="/settings/language" className="block px-4 py-2 rounded">
            Idioma
          </Link>
          <Link href="/settings/notifications" className="block px-4 py-2 rounded">
            Notificações
          </Link>
          <Link href="/settings/appearance" className="block px-4 py-2 rounded">
            Aparência
          </Link>
          <Link href="/settings/account" className="block px-4 py-2 rounded">
            Conta
          </Link>
        </nav>
      </aside>
      
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

// app/settings/page.tsx
export default function SettingsPage() {
  return (
    <div>
      <h1>Configurações</h1>
      {/* Tab navigation or content */}
    </div>
  );
}
```
- [ ] Create /app/settings route
- [ ] Create /app/settings/layout.tsx
- [ ] Create sidebar navigation
- [ ] Create child pages (language, notifications, etc.)
- [ ] Test routing

**5.1.2 Settings Database Schema** (1 hour)
```sql
CREATE TABLE user_settings (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES staff(id),
    
    preferred_language VARCHAR(10) DEFAULT 'pt-BR',
    timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    time_format VARCHAR(20) DEFAULT '24h',
    currency VARCHAR(3) DEFAULT 'BRL',
    
    theme_preference VARCHAR(20) DEFAULT 'light',
    
    notification_preferences JSONB DEFAULT '{}',
    
    font_size VARCHAR(20) DEFAULT 'normal',
    sidebar_collapsed BOOLEAN DEFAULT false,
    compact_mode BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```
- [ ] Create migration
- [ ] Test migration
- [ ] Update SQLAlchemy model
- [ ] Document schema

**5.1.3 Settings API (GET/POST)** (1.5 hours)
```python
@router.get("/api/users/{user_id}/settings")
async def get_user_settings(user_id: int):
    """Get user settings."""
    settings = db.query(UserSettings).filter_by(user_id=user_id).first()
    return settings or UserSettings(user_id=user_id)

@router.post("/api/users/{user_id}/settings")
async def update_user_settings(user_id: int, settings: SettingsUpdate):
    """Update user settings."""
    user_settings = db.query(UserSettings).filter_by(user_id=user_id).first()
    
    if not user_settings:
        user_settings = UserSettings(user_id=user_id)
        db.add(user_settings)
    
    for field, value in settings.dict(exclude_unset=True).items():
        setattr(user_settings, field, value)
    
    db.commit()
    return user_settings
```
- [ ] Create GET endpoint
- [ ] Create POST endpoint
- [ ] Add Pydantic schemas
- [ ] Test endpoints

**5.1.4 Settings Context & Hook** (1 hour)
```typescript
// context/SettingsContext.tsx
import { createContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export const useSettings = () => {
  return useContext(SettingsContext);
};

export const SettingsProvider = ({ children, userId }) => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, [userId]);

  const fetchSettings = async () => {
    const res = await fetch(`/api/users/${userId}/settings`);
    const data = await res.json();
    setSettings(data);
    setLoading(false);
  };

  const updateSettings = async (updates) => {
    await fetch(`/api/users/${userId}/settings`, {
      method: 'POST',
      body: JSON.stringify(updates)
    });
    setSettings({ ...settings, ...updates });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
```
- [ ] Create SettingsContext
- [ ] Create SettingsProvider
- [ ] Create useSettings() hook
- [ ] Wrap app with provider
- [ ] Test context

**5.1.5 Settings Page Layout** (1.5 hours)
```typescript
// app/settings/page.tsx
import { useState } from 'react';
import { useSettings } from '@/context/SettingsContext';

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (field, value) => {
    setIsSaving(true);
    await updateSettings({ [field]: value });
    setIsSaving(false);
    toast.success('Configurações salvas!');
  };

  if (!settings) return <Skeleton />;

  return (
    <div>
      <h1>Configurações</h1>
      
      <div className="space-y-6">
        {/* Tabs or sections for each category */}
        <LanguageSettings onSave={handleSave} />
        <NotificationSettings onSave={handleSave} />
        <AppearanceSettings onSave={handleSave} />
        <AccountSettings onSave={handleSave} />
      </div>
    </div>
  );
}
```
- [ ] Create main settings page
- [ ] Add form sections
- [ ] Implement save handlers
- [ ] Add loading states
- [ ] Test page layout

---

### EPIC 5.2: Language & Localization Settings ⏱️ 4 hours
**Owner:** Dev Team 1B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 2.1 (i18n setup), EPIC 5.1 (settings infrastructure)

#### Tasks:

**5.2.1 Language Selector Component** (1 hour)
```typescript
// components/LanguageSelector.tsx
import { useTranslation } from 'next-i18next';
import { useSettings } from '@/context/SettingsContext';

const LanguageSelector = ({ onChange }) => {
  const { t, i18n } = useTranslation('settings');
  const languages = [
    { code: 'pt-BR', name: t('lang_pt'), flag: '🇧🇷' },
    { code: 'en', name: t('lang_en'), flag: '🇺🇸' },
    { code: 'es', name: t('lang_es'), flag: '🇪🇸' },
    { code: 'fr', name: t('lang_fr'), flag: '🇫🇷' },
    { code: 'it', name: t('lang_it'), flag: '🇮🇹' },
  ];

  return (
    <select 
      defaultValue={i18n.language}
      onChange={(e) => {
        i18n.changeLanguage(e.target.value);
        onChange(e.target.value);
      }}
    >
      {languages.map(lang => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.name}
        </option>
      ))}
    </select>
  );
};
```
- [ ] Create LanguageSelector component
- [ ] Add flag icons
- [ ] Add language names in current language
- [ ] Test language switching
- [ ] Verify no page reload needed

**5.2.2 Language Settings Component** (1.5 hours)
```typescript
// components/LanguageSettings.tsx
import { LanguageSelector } from './LanguageSelector';
import { useSettings } from '@/context/SettingsContext';

const LanguageSettings = ({ onSave }) => {
  const { settings } = useSettings();

  return (
    <div className="space-y-4">
      <h2>Idioma & Localização</h2>
      
      <div>
        <label>Idioma Principal</label>
        <LanguageSelector 
          onChange={(lang) => onSave('preferred_language', lang)}
        />
        <p className="text-sm text-gray-500">
          Selecione seu idioma preferido
        </p>
      </div>

      <div>
        <label>Formato de Data</label>
        <select 
          defaultValue={settings.date_format}
          onChange={(e) => onSave('date_format', e.target.value)}
        >
          <option value="DD/MM/YYYY">14/06/2026 (PT-BR)</option>
          <option value="MM/DD/YYYY">06/14/2026 (EN)</option>
        </select>
      </div>

      <div>
        <label>Formato de Hora</label>
        <select 
          defaultValue={settings.time_format}
          onChange={(e) => onSave('time_format', e.target.value)}
        >
          <option value="24h">24 horas (09:30)</option>
          <option value="12h">12 horas (9:30 AM)</option>
        </select>
      </div>
    </div>
  );
};
```
- [ ] Create LanguageSettings component
- [ ] Add language selector
- [ ] Add date format selector
- [ ] Add time format selector
- [ ] Add preview of selected formats
- [ ] Test component

**5.2.3 Settings Persistence** (1 hour)
- [ ] On language change: save to user_settings
- [ ] On date format change: save to user_settings
- [ ] On time format change: save to user_settings
- [ ] Verify localStorage persistence (optional)
- [ ] Test persistence across page reload

**5.2.4 Testing** (0.5 hours)
- [ ] Test language switching
- [ ] Test date format change
- [ ] Test time format change
- [ ] Verify app uses selected language
- [ ] Verify dates format correctly

---

### EPIC 5.3: Notification Preferences ⏱️ 4 hours
**Owner:** Dev Team 1B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 3.4 (notification prefs), EPIC 5.1 (settings infrastructure)

#### Tasks:

**5.3.1 Notification Preferences Component** (1.5 hours)
```typescript
// components/NotificationSettings.tsx
import { useState } from 'react';
import { useSettings } from '@/context/SettingsContext';

const NotificationSettings = ({ onSave }) => {
  const { settings } = useSettings();
  const [prefs, setPrefs] = useState(settings.notification_preferences);

  const handleToggle = (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    onSave('notification_preferences', updated);
  };

  const handleSelectChange = (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    onSave('notification_preferences', updated);
  };

  return (
    <div className="space-y-4">
      <h2>Notificações</h2>

      <label className="flex items-center gap-2">
        <input 
          type="checkbox" 
          checked={prefs.appointment_reminder}
          onChange={() => handleToggle('appointment_reminder')}
        />
        <span>Lembretes de Agendamento</span>
      </label>

      {prefs.appointment_reminder && (
        <select 
          value={prefs.appointment_reminder_hours}
          onChange={(e) => handleSelectChange('appointment_reminder_hours', parseInt(e.target.value))}
        >
          <option value={24}>24 horas antes</option>
          <option value={48}>48 horas antes</option>
          <option value={72}>3 dias antes</option>
        </select>
      )}

      <label className="flex items-center gap-2">
        <input 
          type="checkbox" 
          checked={prefs.prescription_alerts}
          onChange={() => handleToggle('prescription_alerts')}
        />
        <span>Alertas de Prescrição</span>
      </label>

      <label className="flex items-center gap-2">
        <input 
          type="checkbox" 
          checked={prefs.treatment_updates}
          onChange={() => handleToggle('treatment_updates')}
        />
        <span>Atualizações de Tratamento</span>
      </label>

      <label className="flex items-center gap-2">
        <input 
          type="checkbox" 
          checked={prefs.marketing_emails}
          onChange={() => handleToggle('marketing_emails')}
        />
        <span>Emails de Marketing</span>
      </label>

      <div>
        <label>Email Digest (Resumo)</label>
        <select 
          value={prefs.email_digest}
          onChange={(e) => handleSelectChange('email_digest', e.target.value)}
        >
          <option value="never">Nunca</option>
          <option value="daily">Diário</option>
          <option value="weekly">Semanal</option>
        </select>
      </div>
    </div>
  );
};
```
- [ ] Create NotificationSettings component
- [ ] Add checkbox for appointment reminders
- [ ] Add hours dropdown (24, 48, 72)
- [ ] Add checkbox for prescription alerts
- [ ] Add checkbox for marketing emails
- [ ] Add email digest frequency selector
- [ ] Test component

**5.3.2 In-App Toast Preferences** (0.5 hours)
- [ ] Add toggle: in_app_toasts (enable/disable toasts)
- [ ] Add toggle: sound_enabled (sound on toast)
- [ ] Test disabling toasts
- [ ] Test sound toggle

**5.3.3 Unsubscribe Management** (1 hour)
- [ ] Display unsubscribe link
- [ ] Show list of notification types user can unsubscribe from
- [ ] Implement bulk unsubscribe
- [ ] Test unsubscribe flows

**5.3.4 Testing** (1 hour)
- [ ] Test preference toggles
- [ ] Test email digest selection
- [ ] Verify preferences persist
- [ ] Test notification delivery respects preferences
- [ ] Test in mobile view

---

### EPIC 5.4: Theme & Appearance Settings ⏱️ 3 hours
**Owner:** Dev Team 1B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 5.1 (settings infrastructure), next-themes (already in dependencies)

#### Tasks:

**5.4.1 Dark Mode Toggle Component** (1 hour)
```typescript
// components/ThemeToggle.tsx
import { useTheme } from 'next-themes';
import { useSettings } from '@/context/SettingsContext';

const ThemeToggle = ({ onSave }) => {
  const { theme, setTheme } = useTheme();
  const { settings } = useSettings();

  const themes = [
    { value: 'light', label: '☀️ Light' },
    { value: 'dark', label: '🌙 Dark' },
    { value: 'system', label: '🖥️ System' },
  ];

  const handleChange = (newTheme) => {
    setTheme(newTheme);
    onSave('theme_preference', newTheme);
  };

  return (
    <div className="space-y-2">
      <label>Tema</label>
      <div className="flex gap-2">
        {themes.map(t => (
          <button
            key={t.value}
            onClick={() => handleChange(t.value)}
            className={`px-4 py-2 rounded ${
              theme === t.value 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
};
```
- [ ] Setup next-themes in _app.tsx (if not already)
- [ ] Create ThemeToggle component
- [ ] Add light/dark/system options
- [ ] Test theme switching
- [ ] Verify CSS updates

**5.4.2 Appearance Settings Component** (1 hour)
```typescript
// components/AppearanceSettings.tsx
const AppearanceSettings = ({ onSave }) => {
  return (
    <div className="space-y-4">
      <h2>Aparência</h2>

      <ThemeToggle onSave={onSave} />

      <div>
        <label>Tamanho de Fonte</label>
        <select 
          onChange={(e) => onSave('font_size', e.target.value)}
        >
          <option value="small">Pequeno (14px)</option>
          <option value="normal">Normal (16px)</option>
          <option value="large">Grande (18px)</option>
        </select>
      </div>

      <label className="flex items-center gap-2">
        <input 
          type="checkbox"
          onChange={(e) => onSave('compact_mode', e.target.checked)}
        />
        <span>Modo Compacto</span>
      </label>

      <label className="flex items-center gap-2">
        <input 
          type="checkbox"
          onChange={(e) => onSave('sidebar_collapsed', e.target.checked)}
        />
        <span>Sidebar Colapsada</span>
      </label>
    </div>
  );
};
```
- [ ] Create AppearanceSettings component
- [ ] Add font size selector
- [ ] Add compact mode toggle
- [ ] Add sidebar collapse toggle
- [ ] Test settings

**5.4.3 Testing** (1 hour)
- [ ] Test dark mode toggle
- [ ] Test font size change
- [ ] Test compact mode
- [ ] Test sidebar collapse
- [ ] Verify settings persist
- [ ] Test in mobile view

---

### EPIC 5.5: Timezone & Regional Settings ⏱️ 4 hours
**Owner:** Dev Team 1B (Frontend Lead)  
**Status:** Not Started  
**Dependencies:** EPIC 5.1 (settings infrastructure), EPIC 2.4 (date-fns-tz)

#### Tasks:

**5.5.1 Timezone Selector Component** (1.5 hours)
```typescript
// components/TimezoneSelector.tsx
import { utcToZonedTime, format } from 'date-fns-tz';
import { useSettings } from '@/context/SettingsContext';

const TimezoneSelector = ({ onChange }) => {
  const { settings } = useSettings();
  const [selectedTz, setSelectedTz] = useState(settings.timezone);

  const timezones = [
    'America/Sao_Paulo',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Rome',
    'Asia/Tokyo',
    'Australia/Sydney',
  ];

  const currentTime = utcToZonedTime(new Date(), selectedTz);

  return (
    <div>
      <label>Timezone</label>
      <select 
        value={selectedTz}
        onChange={(e) => {
          setSelectedTz(e.target.value);
          onChange(e.target.value);
        }}
      >
        {timezones.map(tz => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>

      <p className="text-sm text-gray-500 mt-2">
        Hora atual: {format(currentTime, 'HH:mm:ss')}
      </p>
    </div>
  );
};
```
- [ ] Create TimezoneSelector component
- [ ] List timezones (5+ major zones)
- [ ] Show current time in selected timezone
- [ ] Test timezone selection
- [ ] Verify time updates correctly

**5.5.2 Regional Settings Component** (1.5 hours)
```typescript
// components/RegionalSettings.tsx
const RegionalSettings = ({ onSave }) => {
  const { settings } = useSettings();

  return (
    <div className="space-y-4">
      <h2>Configurações Regionais</h2>

      <TimezoneSelector 
        onChange={(tz) => onSave('timezone', tz)}
      />

      <div>
        <label>Formato de Data</label>
        <select 
          defaultValue={settings.date_format}
          onChange={(e) => onSave('date_format', e.target.value)}
        >
          <option value="DD/MM/YYYY">14/06/2026 (PT-BR)</option>
          <option value="MM/DD/YYYY">06/14/2026 (EN)</option>
          <option value="YYYY-MM-DD">2026-06-14 (ISO)</option>
        </select>
      </div>

      <div>
        <label>Formato de Hora</label>
        <select 
          defaultValue={settings.time_format}
          onChange={(e) => onSave('time_format', e.target.value)}
        >
          <option value="24h">24 horas (09:30)</option>
          <option value="12h">12 horas (9:30 AM)</option>
        </select>
      </div>

      <div>
        <label>Moeda</label>
        <select 
          defaultValue={settings.currency}
          onChange={(e) => onSave('currency', e.target.value)}
        >
          <option value="BRL">BRL (R$)</option>
          <option value="USD">USD ($)</option>
          <option value="EUR">EUR (€)</option>
        </select>
      </div>
    </div>
  );
};
```
- [ ] Create RegionalSettings component
- [ ] Add timezone selector
- [ ] Add date format selector
- [ ] Add time format selector
- [ ] Add currency selector
- [ ] Test settings

**5.5.3 Daylight Saving Time Handling** (0.5 hours)
- [ ] Test timezone switching during DST transition
- [ ] Verify times adjust correctly
- [ ] Document DST behavior
- [ ] Test with dates spanning DST

**5.5.4 Testing** (0.5 hours)
- [ ] Test timezone selection
- [ ] Test date format change
- [ ] Test time format change
- [ ] Test currency selection
- [ ] Verify persistence across sessions

---

## SUMMARY TABLE

| Epic | Feature | Owner | Hours | Status | Dependencies |
|------|---------|-------|-------|--------|--------------|
| 1.1 | Revenue Trends | Team 1A | 8 | Not Started | None |
| 1.2 | Patient Funnel | Team 1A | 8 | Not Started | 1.1 |
| 1.3 | Success Metrics | Team 1A | 8 | Not Started | 1.1 |
| 1.4 | Utilization | Team 1A | 8 | Not Started | 1.1 |
| 2.1 | i18n Setup | Team 2B | 6 | Not Started | None |
| 2.2 | String Extraction | Team 2B | 10 | Not Started | 2.1 |
| 2.3 | Backend Locale | Team 2A | 7 | Not Started | 2.1 |
| 2.4 | Date/Time Localization | Team 2B | 6 | Not Started | 2.1, 2.3 |
| 2.5 | Translation Management | Team 2B | 4 | Not Started | 2.2 |
| 3.1 | Email Service | Team 2A | 8 | Not Started | None |
| 3.2 | Toast Notifications | Team 2B | 5 | Not Started | 2.1 |
| 3.3 | Notification Queue | Team 2A | 8 | Not Started | 3.1 |
| 3.4 | Notification Prefs | Team 2B + 2A | 6 | Not Started | 3.1, 2.3 |
| 3.5 | Notification Audit | Team 2A | 5 | Not Started | 3.3 |
| 4.1 | Responsive Grids | Team 3A | 8 | Not Started | None |
| 4.2 | Touch-Friendly UI | Team 3A | 7 | Not Started | 4.1 |
| 4.3 | Mobile Navigation | Team 3A | 6 | Not Started | 4.1 |
| 4.4 | Performance | Team 3B | 7 | Not Started | 4.1-4.3 |
| 4.5 | Mobile Forms | Team 3B | 6 | Not Started | 4.2 |
| 5.1 | Settings Infrastructure | Team 1B | 5 | Not Started | 2.1 |
| 5.2 | Language Settings | Team 1B | 4 | Not Started | 2.1, 5.1 |
| 5.3 | Notification Prefs | Team 1B | 4 | Not Started | 3.4, 5.1 |
| 5.4 | Theme & Appearance | Team 1B | 3 | Not Started | 5.1 |
| 5.5 | Timezone & Regional | Team 1B | 4 | Not Started | 5.1, 2.4 |
| | | **TOTAL** | **154 hours** | | |

**Total with testing & buffer:** 225 hours (6 developers × 37.5 hours each over 3 weeks)

---

**Document Version:** 1.0  
**Last Updated:** Julho 2, 2026

