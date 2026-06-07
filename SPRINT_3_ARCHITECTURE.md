# SPRINT 3 ARCHITECTURE DIAGRAMS
**Advanced Analytics, i18n, Notifications & Mobile UX**

---

## 1. ANALYTICS DASHBOARD ARCHITECTURE

### 1.1 Analytics Data Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │   Analytics Dashboard Page (/app/analytics)               │  │
│  │                                                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐               │  │
│  │  │ Revenue Trends  │  │ Patient Funnel  │               │  │
│  │  │ <RevenueChart>  │  │ <FunnelChart>   │               │  │
│  │  └─────────────────┘  └─────────────────┘               │  │
│  │                                                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐               │  │
│  │  │ Success Metrics │  │ Utilization     │               │  │
│  │  │ <SuccessCard>   │  │ <UtilizationGauge>              │  │
│  │  └─────────────────┘  └─────────────────┘               │  │
│  │                                                            │  │
│  │  Filters: [Date Range] [Treatment Type] [Export CSV]    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                ↓                                 │
│                     useQuery('analytics/*')                      │
│                                ↓                                 │
└────────────────────────────────────────────────────────────────┘
                          ↓ HTTP GET
┌────────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Analytics Router (/api/analytics/*)                     │  │
│  │                                                            │  │
│  │  GET /revenue                  [200 OK]                 │  │
│  │  GET /funnel                   [200 OK]                 │  │
│  │  GET /success                  [200 OK]                 │  │
│  │  GET /utilization              [200 OK]                 │  │
│  │                                                            │  │
│  │  @router.get("/revenue", response_model=RevenueData)    │  │
│  │  async def get_revenue(                                  │  │
│  │      start_date: date,                                  │  │
│  │      end_date: date,                                    │  │
│  │      treatment_type: Optional[str] = None               │  │
│  │  ):                                                      │  │
│  │      # Query analytics_snapshots table                  │  │
│  │      # Aggregate by treatment_type + date              │  │
│  │      # Return [{"date": "2026-06-01", "revenue": 2500,  │  │
│  │      #          "treatment_type": "fisio", ...}]        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Business Logic (analytics_service.py)                   │  │
│  │                                                            │  │
│  │  - Revenue aggregation (sum by treatment + month)       │  │
│  │  - Funnel calculation (conversion %)                     │  │
│  │  - Success rate trending                                │  │
│  │  - Utilization metrics                                  │  │
│  │                                                            │  │
│  │  Caching: Redis, 30-minute TTL                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                      │
└────────────────────────────────────────────────────────────────┘
                          ↓ SQL Query
┌────────────────────────────────────────────────────────────────┐
│                    DATABASE (PostgreSQL)                        │
│                                                                  │
│  Tables Used:                                                   │
│  ├─ financial (id, treatment_id, patient_id, amount, date)    │
│  ├─ consultation (id, patient_id, treatment_id, status, date) │
│  ├─ patient (id, created_at, ...)                            │
│  ├─ analytics_snapshots (id, date, treatment_id, revenue,    │
│  │                           consultation_count, success_%)   │
│  │                                                             │
│  Indexes (Critical for Performance):                           │
│  ├─ financial: (treatment_id, date) -- UNIQUE                │
│  ├─ consultation: (treatment_id, status, date)               │
│  ├─ patient: (created_at)                                    │
│  ├─ analytics_snapshots: (date, treatment_id) -- PRIMARY     │
│  │                                                             │
│  Query Example:                                               │
│  SELECT treatment_id, DATE(created_at) as date,              │
│         SUM(amount) as daily_revenue,                        │
│         COUNT(*) as consult_count                            │
│  FROM financial f                                             │
│  JOIN consultation c ON f.treatment_id = c.treatment_id      │
│  WHERE created_at >= $1 AND created_at <= $2                │
│  GROUP BY treatment_id, DATE(created_at)                     │
│  ORDER BY date DESC                                          │
│                                                             │
└────────────────────────────────────────────────────────────────┘

Caching Strategy:
  L1 Cache: Redis (30 min TTL) — full query results
  L2 Cache: analytics_snapshots table — pre-aggregated daily data
  Invalidation: New financial transaction triggers snapshot refresh
```

### 1.2 Analytics Database Schema

```sql
-- New table for daily aggregations (materialized view alternative)
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

-- Index for fast lookups
CREATE INDEX idx_analytics_date_treatment 
    ON analytics_snapshots(snapshot_date, treatment_id);

-- Modify consultation table to track outcomes
ALTER TABLE consultation ADD COLUMN (
    outcome_status VARCHAR(50) DEFAULT 'pending',
    -- Values: pending, success, partial, no_result, cancelled
    outcome_notes TEXT
);

-- Create view for funnel metrics
CREATE VIEW patient_funnel AS
SELECT 
    DATE(p.created_at) as acquisition_date,
    COUNT(DISTINCT p.id) as leads,
    COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN p.id END) as consults,
    COUNT(DISTINCT CASE WHEN f.id IS NOT NULL THEN p.id END) as treatments
FROM patient p
LEFT JOIN consultation c ON p.id = c.patient_id
LEFT JOIN financial f ON p.id = f.patient_id
GROUP BY DATE(p.created_at);
```

---

## 2. MULTI-LANGUAGE (i18n) ARCHITECTURE

### 2.1 i18n System Flow

```
┌────────────────────────────────────────────────────────────────┐
│                 FRONTEND (Next.js 14)                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  App Initialization (_app.tsx)                           │  │
│  │                                                            │  │
│  │  import { appWithTranslation } from 'next-i18next'      │  │
│  │                                                            │  │
│  │  export default appWithTranslation(App)                 │  │
│  │                                                            │  │
│  │  // Automatically wraps app with I18nextProvider        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Page Component (Any page)                               │  │
│  │                                                            │  │
│  │  const { t, i18n } = useTranslation('common')           │  │
│  │                                                            │  │
│  │  <h1>{t('appointments.title')}</h1>                     │  │
│  │  <button onClick={() => i18n.changeLanguage('en')}>     │  │
│  │    English                                              │  │
│  │  </button>                                              │  │
│  │                                                            │  │
│  │  // useTranslation automatically:                       │  │
│  │  // 1. Loads locale from /public/locales/pt-BR/...    │  │
│  │  // 2. Caches in memory                                │  │
│  │  // 3. Triggers re-render on language change           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Language Switcher Component (<LanguageSwitch />)        │  │
│  │                                                            │  │
│  │  Current Language: [PT-BR ▼] [EN] [ES] [FR] [IT]        │  │
│  │                                                            │  │
│  │  Click handler:                                         │  │
│  │  1. i18n.changeLanguage(lang)                          │  │
│  │  2. Save preference: POST /api/users/{id}/settings     │  │
│  │  3. Re-render entire app with new lang strings         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Translation Files:                                              │
│  /public/locales/                                              │
│  ├─ pt-BR/                                                    │
│  │  ├─ common.json      (UI strings, menus, labels)        │  │
│  │  ├─ appointments.json (appointment-specific strings)     │  │
│  │  ├─ patients.json    (patient module strings)           │  │
│  │  └─ errors.json      (error messages)                   │  │
│  ├─ en/                                                      │  │
│  │  ├─ common.json                                         │  │
│  │  └─ ...                                                  │  │
│  └─ [es, fr, it]/...  (same structure)                    │  │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
                          ↓ HTTP GET
┌────────────────────────────────────────────────────────────────┐
│                 BACKEND (FastAPI)                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Locale Middleware (app.py)                              │  │
│  │                                                            │  │
│  │  @app.middleware("http")                                │  │
│  │  async def locale_middleware(request, call_next):       │  │
│  │      # Detect locale:                                  │  │
│  │      # 1. Accept-Language header                       │  │
│  │      # 2. User's preferred_language in DB             │  │
│  │      # 3. Default to 'pt-BR'                          │  │
│  │      request.locale = detected_locale                  │  │
│  │      response = await call_next(request)              │  │
│  │      return response                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Locale Router (/api/locales)                            │  │
│  │                                                            │  │
│  │  GET /locales/enums/{language}                          │  │
│  │  {                                                      │  │
│  │    "appointment_status": {                             │  │
│  │      "scheduled": "Agendado",                          │  │
│  │      "completed": "Concluído",                         │  │
│  │      "cancelled": "Cancelado"                          │  │
│  │    },                                                  │  │
│  │    "treatment_types": {                                │  │
│  │      "consultation": "Consulta",                       │  │
│  │      "rehabilitation": "Reabilitação"                  │  │
│  │    },                                                  │  │
│  │    "error_messages": {                                 │  │
│  │      "not_found": "Recurso não encontrado",           │  │
│  │      "unauthorized": "Não autorizado"                 │  │
│  │    }                                                   │  │
│  │  }                                                      │  │
│  │                                                            │  │
│  │  Cache: Redis, 24-hour TTL                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  i18n Service (i18n_service.py)                          │  │
│  │                                                            │  │
│  │  def get_translation(key: str, language: str):          │  │
│  │      # Load from JSON file or cache                    │  │
│  │      return translations[language].get(key)            │  │
│  │                                                            │  │
│  │  def translate_error(error: str, locale: str):         │  │
│  │      # Convert API error to user language             │  │
│  │      return error_translations[locale][error]         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Translations Directory:                                       │
│  /backend/locales/                                             │
│  ├─ pt-BR/                                                    │
│  │  ├─ enums.json        (appointment statuses, treatment types)
│  │  ├─ errors.json       (API error messages)              │  │
│  │  └─ templates.json    (email template strings)          │  │
│  └─ [en, es, fr, it]/...  (same structure)                │  │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────────┐
│                    DATABASE                                     │
│                                                                  │
│  user_settings table:                                           │
│  ├─ user_id (FK)                                              │  │
│  ├─ preferred_language VARCHAR(10) DEFAULT 'pt-BR'           │  │
│  ├─ timezone VARCHAR(50)                                      │  │
│  └─ language_preferences JSON                                │  │
│     {                                                         │  │
│       "date_format": "DD/MM/YYYY",  // pt-BR vs MM/DD/YYYY  │  │
│       "time_format": "24h",                                 │  │
│       "currency": "BRL"                                     │  │
│     }                                                        │  │
│                                                                  │
└────────────────────────────────────────────────────────────────┘

Key Design Decisions:
1. Translations for UI strings live in frontend (/public/locales)
2. Translations for API enums/errors live in backend (/backend/locales)
3. Language switching is immediate (no page reload)
4. Default fallback is PT-BR (clinic's native language)
5. Backend returns responses in user's preferred language
```

### 2.2 Translation File Structure

```json
// /public/locales/pt-BR/common.json
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
  "appointments": {
    "title": "Agendamentos",
    "new_appointment": "Novo Agendamento",
    "schedule": "Agendar",
    "patient_name": "Nome do Paciente",
    "date": "Data",
    "time": "Hora",
    "treatment": "Tratamento"
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
    "loading": "Carregando...",
    "no_data": "Nenhum dado disponível"
  }
}

// /public/locales/en/common.json
{
  "app": {
    "title": "OrthoClinic",
    "subtitle": "Orthopedic Clinic Management"
  },
  "menu": {
    "dashboard": "Dashboard",
    "appointments": "Appointments",
    "patients": "Patients",
    "analytics": "Analytics",
    "settings": "Settings",
    "logout": "Logout"
  },
  // ... rest of translations
}

// Similar structure for es/, fr/, it/
```

---

## 3. NOTIFICATION SYSTEM ARCHITECTURE

### 3.1 Notification Flow (Complete Lifecycle)

```
┌─────────────────────────────────────────────────────────────────┐
│                 TRIGGER EVENTS                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  • Appointment Created → Schedule 24h reminder                   │
│  • Prescription Created → Notify patient "ready for pickup"      │
│  • Appointment Completed → Schedule 7-day follow-up             │
│  • Patient Birthday → Send greeting (optional)                  │
│  • Manual Admin Trigger → Send custom notification               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│         NOTIFICATION QUEUE (FastAPI Backend)                    │
│                                                                   │
│  User Action (e.g., create appointment):                        │
│  1. Save appointment to DB (consultation table)                 │
│  2. Trigger: appointment_created_event()                        │
│  3. Event handler creates notification record:                  │
│                                                                   │
│     INSERT INTO notification_queue (                            │
│       user_id, type, recipient_email, title, body, message,    │
│       scheduled_time, retry_count, status                       │
│     ) VALUES (                                                  │
│       123, 'appointment_reminder', 'john@example.com',         │
│       'Lembrete de Agendamento',                               │
│       'Agendamento em 24 horas',                               │
│       '2026-06-15 09:00:00',  -- NOW() + 24 hours            │
│       0, 'pending'                                             │
│     );                                                         │
│                                                                   │
│  Queue Table:                                                   │
│  ├─ id (PK)                                                     │
│  ├─ user_id (FK → staff)                                        │
│  ├─ patient_id (FK → patient, optional)                        │
│  ├─ type (appointment_reminder, prescription_ready, etc.)      │
│  ├─ recipient_email                                             │
│  ├─ recipient_phone (future)                                    │
│  ├─ title                                                        │
│  ├─ body (for in-app toast)                                    │
│  ├─ email_template_id                                           │
│  ├─ scheduled_time (WHEN to send)                              │
│  ├─ sent_time (NULL until sent)                                │
│  ├─ status (pending, sent, failed, bounced)                    │
│  ├─ delivery_response (SMTP response)                           │
│  ├─ retry_count                                                 │
│  └─ created_at                                                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│        NOTIFICATION SCHEDULER (Background Job)                   │
│                                                                   │
│  Runs every 5 minutes:                                          │
│                                                                   │
│  async def send_scheduled_notifications():                      │
│    # Query notifications where:                                │
│    #   scheduled_time <= NOW()                                 │
│    #   status == 'pending'                                    │
│    #   retry_count < 3                                         │
│    pending = db.query(NotificationQueue).filter(...)          │
│                                                                  │
│    for notification in pending:                               │
│        try:                                                     │
│            # Send in-app notification (immediately)            │
│            if not notification.user_id.is_offline:            │
│                await send_websocket_notification(notification)│
│                                                                  │
│            # Send email (async)                                │
│            await email_service.send(                           │
│                to=notification.recipient_email,               │
│                subject=notification.title,                     │
│                template=notification.email_template_id,       │
│                context={...}                                   │
│            )                                                    │
│                                                                  │
│            # Mark as sent                                      │
│            notification.status = 'sent'                        │
│            notification.sent_time = datetime.now()             │
│            db.commit()                                         │
│                                                                  │
│        except SMTPException as e:                             │
│            # Retry logic                                       │
│            notification.retry_count += 1                       │
│            notification.last_error = str(e)                    │
│            if notification.retry_count >= 3:                  │
│                notification.status = 'failed'                 │
│            db.commit()                                         │
│                                                                  │
│  Trigger: FastAPI BackgroundTasks or APScheduler              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        ↓ (In-App)              ↓ (Email)
   ┌─────────────┐         ┌──────────────┐
   │ WebSocket   │         │ SMTP Service │
   │ (Real-time) │         │ (SendGrid)   │
   └─────────────┘         └──────────────┘
        ↓                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                 FRONTEND (User Receives)                         │
│                                                                   │
│  In-App Notification:                                           │
│  ┌─────────────────────────────┐                               │
│  │ Appointment Reminder        │                               │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━  │                               │
│  │ Seu agendamento é amanhã    │                               │
│  │ às 09:00 com Dr. Silva      │  [✓ Dismiss] [❌ Mute]       │
│  └─────────────────────────────┘                               │
│  (Auto-disappears in 5 seconds)                                │
│                                                                   │
│  Email Notification:                                            │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ From: noreply@orthoclinic.com                           │  │
│  │ Subject: Lembrete de Agendamento                       │  │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  │
│  │ Olá Dra. Silva,                                        │  │
│  │                                                        │  │
│  │ Você tem um agendamento amanhã (14/06) às 09:00.      │  │
│  │ [Confirmar Presença] [Remarcar]                       │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Notification Database Schema

```sql
-- Notification Queue Table
CREATE TABLE notification_queue (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES staff(id),
    patient_id INT REFERENCES patient(id) NULL,
    notification_type VARCHAR(50) NOT NULL,
    -- Types: appointment_reminder, prescription_ready, follow_up,
    --        birthday_greeting, treatment_update, custom
    
    recipient_email VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(20) NULL,  -- Future: SMS support
    
    title VARCHAR(255),          -- Email subject
    body TEXT,                   -- In-app toast body
    email_template_id VARCHAR(100),
    email_context JSONB,         -- Template variables
    
    scheduled_time TIMESTAMP,    -- When to send
    sent_time TIMESTAMP NULL,
    
    status VARCHAR(50) DEFAULT 'pending',
    -- Values: pending, sent, failed, bounced, deferred
    
    delivery_response TEXT,      -- SMTP response
    retry_count INT DEFAULT 0,
    last_error TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Notification Log (Archive)
CREATE TABLE notification_log (
    id SERIAL PRIMARY KEY,
    queue_id INT REFERENCES notification_queue(id),
    user_id INT REFERENCES staff(id),
    patient_id INT REFERENCES patient(id) NULL,
    
    notification_type VARCHAR(50),
    recipient_email VARCHAR(255),
    
    sent_at TIMESTAMP,
    delivery_status VARCHAR(50),
    delivery_code INT,           -- SMTP response code
    bounce_reason VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- User Notification Preferences
ALTER TABLE user_settings ADD COLUMN (
    notification_preferences JSONB DEFAULT '{
        "appointment_reminder": true,
        "appointment_reminder_hours": 24,
        "prescription_alerts": true,
        "treatment_updates": true,
        "marketing_emails": false,
        "email_digest": "never"
    }'::jsonb
);

-- Email Templates
CREATE TABLE email_templates (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255),
    subject_template TEXT,      -- Jinja2 template
    body_html_template TEXT,    -- Jinja2 HTML template
    language VARCHAR(10) DEFAULT 'pt-BR',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notification_scheduled ON notification_queue(scheduled_time, status);
CREATE INDEX idx_notification_user ON notification_queue(user_id, status);
CREATE INDEX idx_notification_log_sent ON notification_log(sent_at);
```

### 3.3 Email Template Example

```html
<!-- templates/appointment_reminder.html (Jinja2) -->
<!DOCTYPE html>
<html lang="{{ language }}">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; border: 1px solid #ddd; }
        .button { background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; }
        .footer { text-align: center; color: #999; margin-top: 20px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{ app_name }}</h1>
        </div>
        
        <div class="content">
            <h2>{{ greeting }}</h2>
            <!-- greeting = "Olá Dra. Silva," -->
            
            <p>{{ appointment_reminder_text }}</p>
            <!-- appointment_reminder_text = "Você tem um agendamento em 24 horas (14/06 às 09:00)" -->
            
            <p><strong>{{ appointment_details }}</strong></p>
            <!-- appointment_details = "Dra. Maria Silva\nConsultório 1\nConsulta de Acompanhamento" -->
            
            <a href="{{ confirm_url }}" class="button">{{ confirm_button }}</a>
            <!-- confirm_button = "Confirmar Presença" -->
            
            <p>{{ unsubscribe_text }}</p>
        </div>
        
        <div class="footer">
            <p>{{ footer_text }}</p>
            <!-- footer_text = "OrthoClinic - Gestão de Consultório Ortopédico" -->
        </div>
    </div>
</body>
</html>

// Template is rendered with context:
context = {
    "app_name": "OrthoClinic",
    "language": "pt-BR",
    "greeting": "Olá Dra. Silva,",
    "appointment_reminder_text": "Você tem um agendamento amanhã (14/06) às 09:00 com Dr. Silva.",
    "appointment_details": "Consultório OrthoClinic\nConsultório 1\nConsulta de Acompanhamento",
    "confirm_url": "https://clinic.orthoclinic.com/appointments/confirm?token=xyz",
    "confirm_button": "Confirmar Presença",
    "unsubscribe_text": "Clique aqui para não receber mais lembretes.",
    "footer_text": "OrthoClinic - Gestão de Consultório Ortopédico\nFone: (11) 98765-4321"
}
```

---

## 4. MOBILE RESPONSIVENESS ARCHITECTURE

### 4.1 Responsive Design Breakpoints

```
Device Classes:
┌───────────────────────────────────────────────────────┐
│  MOBILE                TABLET              DESKTOP    │
│  <640px               640-1024px           >1024px    │
│                                                       │
│  • iPhone 12 (390)    • iPad (768)        • Laptop   │
│  • iPhone 14 Pro (393)• iPad Air (820)    • Monitor  │
│  • Samsung S24 (412)  • iPad Pro (1024)   • Large TV │
│  • Galaxy A12 (360)   • OnePlus Pad       • Ultrawide│
└───────────────────────────────────────────────────────┘

TailwindCSS Breakpoints:
  sm:  640px   (mobile large)
  md:  768px   (tablet)
  lg:  1024px  (desktop)
  xl:  1280px  (large desktop)
  2xl: 1536px  (extra large)

Mobile-First Approach:
  Default styles = mobile
  sm: = override for tablet+
  md: = override for tablet+
  lg: = override for desktop+

Example:
  <div className="flex flex-col sm:flex-row md:gap-4 lg:gap-8">
    <div className="w-full sm:w-1/2 md:w-1/3">
      {/* Mobile: full width → Tablet: 50% → Desktop: 33% */}
    </div>
  </div>
```

### 4.2 Navigation Architecture (Mobile-First)

```
┌─────────────────────────────────────┐
│        MOBILE (< 640px)             │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ [☰] OrthoClinic    [🔔] [👤]│   │ ← Sticky Header
│  └─────────────────────────────┘   │
│                                     │
│  Main Content Area                 │
│                                     │
│  • Full width (100%)               │
│  • No sidebar (collapse to menu)   │
│  • Touch-friendly spacing          │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ┌─────────────────────────┐ │   │
│  │ │ Dashboard               │ │   │
│  │ │ Agendamentos            │ │   │ ← Hidden Sidebar
│  │ │ Pacientes               │ │   │   (swipe to show)
│  │ │ Análise                 │ │   │
│  │ │ Configurações           │ │   │
│  │ └─────────────────────────┘ │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘

┌───────────────────────────────────────────────────┐
│        TABLET (640px - 1024px)                    │
├───────────────────────────────────────────────────┤
│                                                   │
│  ┌────────┐  ┌──────────────────────────────┐   │
│  │ Menu   │  │ OrthoClinic    [🔔] [👤] [≡]│   │
│  ├────────┤  ├──────────────────────────────┤   │
│  │ • Dash │  │                              │   │
│  │ • Agnd │  │  Main Content Area           │   │
│  │ • Pacs │  │  • Responsive width          │   │
│  │ • Anlt │  │  • Cards in 2-col layout     │   │
│  │ • Conf │  │  • Sidebar visible           │   │
│  │        │  │                              │   │
│  └────────┘  └──────────────────────────────┘   │
│                                                   │
└───────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│        DESKTOP (> 1024px)                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌────────────────────────────────────┐ │
│  │   SIDEBAR    │  │ Header: OrthoClinic  [🔔] [👤]    │ │
│  │ (Collapsed   │  ├────────────────────────────────────┤ │
│  │  toggleable) │  │                                    │ │
│  │              │  │  Main Content                      │ │
│  │ • Dashboard  │  │  • 3-column layout for cards       │ │
│  │ • Appts      │  │  • Full charts + data tables       │ │
│  │ • Patients   │  │  • Expanded features               │ │
│  │ • Analytics  │  │                                    │ │
│  │ • Settings   │  │                                    │ │
│  │              │  │                                    │ │
│  │ • Logout     │  │                                    │ │
│  │              │  │                                    │ │
│  └──────────────┘  └────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Component Sizing & Touch Targets

```
Touch Target Minimum: 44x44px (Apple HIG Standard)

Button Components:
┌──────────────────────────────────────┐
│ Mobile Button (44x44 min)            │
│                                      │
│  padding: 12px 16px                 │
│  height: 44px                       │
│  font-size: 16px                    │
│  border-radius: 8px                 │
│  ┌──────────────────────────────┐   │
│  │        Save Changes           │   │
│  └──────────────────────────────┘   │
│                                      │
│ Tablet/Desktop (48px preferred)      │
│  padding: 12px 24px                 │
│  height: 48px                       │
│                                      │
│  ┌──────────────────────────────┐   │
│  │        Save Changes           │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘

Form Inputs:
┌──────────────────────────────────────┐
│ Mobile Text Input                    │
│                                      │
│  height: 48px (not 40px, for touch) │
│  padding: 12px 16px                 │
│  font-size: 16px (avoid zoom)       │
│  border-radius: 8px                 │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ Patient Name                  │   │
│  └──────────────────────────────┘   │
│                                      │
│ Focus State:                         │
│  outline: 2px solid #007bff         │
│  outline-offset: 2px                │
│  (Visible keyboard focus)            │
│                                      │
└──────────────────────────────────────┘

Spacing Scale (TailwindCSS):
  Mobile:  p-3 (12px), p-4 (16px), gap-3 (12px)
  Tablet:  p-4 (16px), p-6 (24px), gap-4 (16px)
  Desktop: p-6 (24px), p-8 (32px), gap-6 (24px)

Use responsive classes:
  <div className="p-3 sm:p-4 md:p-6 lg:p-8">
```

### 4.4 Performance Optimization Strategy

```
Image Optimization:
┌────────────────────────────────────────┐
│ Desktop Image (1200px)                 │
│                                        │
│  Original: 500KB (JPEG)               │
│  Optimized: 120KB (WebP)              │
│  Mobile: 40KB (WebP, 400px)           │
│                                        │
│ Next.js Image Optimization:           │
│  <Image                               │
│    src="/chart-dashboard.png"         │
│    alt="Analytics Dashboard"          │
│    width={1200}                       │
│    height={600}                       │
│    responsive={true}                  │
│    sizes="(max-width: 640px) 100vw,  │
│           (max-width: 1024px) 90vw,  │
│           1200px"                     │
│  />                                   │
│                                        │
│ Generated srcset:                      │
│  /image.webp?w=400   (mobile)         │
│  /image.webp?w=768   (tablet)         │
│  /image.webp?w=1200  (desktop)        │
│                                        │
│ Browser selects appropriate size     │
└────────────────────────────────────────┘

Code Splitting:
┌────────────────────────────────────────┐
│ Dynamic imports for large components:  │
│                                        │
│ import dynamic from 'next/dynamic';   │
│                                        │
│ const Analytics = dynamic(            │
│   () => import('@/components/         │
│     analytics/AnalyticsDash'),        │
│   { loading: () => <Skeleton />,      │
│     ssr: false }  // Mobile only      │
│ );                                     │
│                                        │
│ Result:                               │
│  • Main bundle: -45KB                 │
│  • Analytics chunk: 120KB (lazy-loaded)
│  • Mobile users don't download        │
│    until visiting /analytics page    │
│                                        │
└────────────────────────────────────────┘

Bundle Analysis:
  npm install --save-dev @next/bundle-analyzer
  
  Current Bundle Size:
  ├─ main app: 180KB
  ├─ analytics: 120KB (code-split)
  ├─ i18n strings: 45KB (lazy-loaded per lang)
  ├─ charts (recharts): 85KB
  └─ Total (gzipped): 220KB target

Lighthouse Targets:
  Mobile:
    Performance: 85+ (target: 90)
    Accessibility: 95+ (WCAG AA)
    Best Practices: 95+
    SEO: 100
  
  Desktop:
    Performance: 90+
    Rest: same as mobile
```

---

## 5. USER SETTINGS PAGE ARCHITECTURE

### 5.1 Settings Page Component Structure

```
/app/settings
│
├── layout.tsx
│   ├── SettingsHeader
│   │   └── "Configurações de Usuário"
│   └── SettingsTabs (Tab Navigation)
│
├── components/
│   ├── Language/
│   │   ├── LanguageSelector.tsx
│   │   │   └── 5-language dropdown with flags
│   │   └── LanguagePreview.tsx
│   │       └── Live preview of selected language
│   │
│   ├── Notifications/
│   │   ├── NotificationToggles.tsx
│   │   │   ├─ Appointment Reminders (checkbox)
│   │   │   ├─ Prescription Alerts (checkbox)
│   │   │   ├─ Marketing Emails (checkbox)
│   │   │   └─ Email Digest (dropdown)
│   │   └── NotificationPreview.tsx
│   │       └─ Preview of upcoming notifications
│   │
│   ├── Theme/
│   │   ├── ThemeToggle.tsx
│   │   │   └─ Light/Dark mode with system default
│   │   └── ThemePreview.tsx
│   │
│   ├── Regional/
│   │   ├── TimezoneSelector.tsx
│   │   │   └─ Timezone picker with current time
│   │   ├── DateFormatSelector.tsx
│   │   │   └─ DD/MM/YYYY vs MM/DD/YYYY preview
│   │   └─ CurrencySelector.tsx
│   │
│   └── Account/
│       ├── ProfileInfo.tsx
│       │   └─ Display user name, email, role
│       ├── ChangePassword.tsx
│       │   └─ Current password + new password form
│       └─ TwoFactorAuth.tsx
│           └─ (Optional: 2FA setup)
│
└── page.tsx (Main Settings Page)
    └─ Manages state + form submission

Data Flow:
┌─────────────────────────────────┐
│ SettingsPage (state management) │
│                                 │
│ useState({                      │
│   language: 'pt-BR',            │
│   theme: 'light',               │
│   timezone: 'America/Sao_Paulo',│
│   notifications: {...},         │
│   ...                           │
│ })                              │
│                                 │
│ onChange → setState()            │
│ onSave → POST /api/settings    │
│                                 │
└─────────────────────────────────┘
      ↓ (useEffect on mount)
      ↓ (GET /api/settings)
      ↓
┌─────────────────────────────────┐
│ Backend User Settings API       │
│ GET  /api/users/{id}/settings  │
│ POST /api/users/{id}/settings  │
│                                 │
│ Response:                       │
│ {                               │
│   "language": "pt-BR",          │
│   "timezone": "...",            │
│   "theme": "...",               │
│   "notifications": {...},       │
│   ...                           │
│ }                               │
│                                 │
└─────────────────────────────────┘
```

### 5.2 Settings Database Schema

```sql
-- Extend user_settings table
CREATE TABLE user_settings (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES staff(id),
    
    -- Language & Localization
    preferred_language VARCHAR(10) DEFAULT 'pt-BR',
    timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    time_format VARCHAR(20) DEFAULT '24h',
    currency VARCHAR(3) DEFAULT 'BRL',
    
    -- Theme & Appearance
    theme_preference VARCHAR(20) DEFAULT 'light',
    -- Values: light, dark, system
    
    -- Notification Settings
    notification_preferences JSONB DEFAULT '{
        "appointment_reminder": true,
        "appointment_reminder_hours": 24,
        "prescription_alerts": true,
        "treatment_updates": true,
        "marketing_emails": false,
        "email_digest": "never",
        "in_app_toasts": true,
        "sound_enabled": true
    }'::jsonb,
    
    -- UI Preferences (optional enhancements)
    font_size VARCHAR(20) DEFAULT 'normal',
    -- Values: small (14px), normal (16px), large (18px)
    
    sidebar_collapsed BOOLEAN DEFAULT false,
    compact_mode BOOLEAN DEFAULT false,
    
    -- Account Security (future)
    two_factor_enabled BOOLEAN DEFAULT false,
    backup_email VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_settings_language 
    ON user_settings(preferred_language);
CREATE INDEX idx_user_settings_timezone 
    ON user_settings(timezone);
```

---

## 6. SYSTEM INTEGRATION DIAGRAM

### 6.1 Complete Architecture Integration

```
┌──────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Pages:                                                      │  │
│  │  ├─ /app/dashboard (Analytics Summary)                     │  │
│  │  ├─ /app/analytics (Advanced Analytics Dashboard)          │  │
│  │  ├─ /app/appointments                                      │  │
│  │  ├─ /app/patients                                          │  │
│  │  ├─ /app/settings (Language, Notifications, Theme)        │  │
│  │  └─ All pages responsive (mobile/tablet/desktop)          │  │
│  │                                                              │  │
│  │  Internationalization (next-i18next):                       │  │
│  │  ├─ useTranslation() hook in every component              │  │
│  │  └─ /public/locales/{pt-BR,en,es,fr,it}/*.json           │  │
│  │                                                              │  │
│  │  Notifications (sonner toast):                              │  │
│  │  ├─ <Toaster /> in layout                                 │  │
│  │  └─ toast.success() / error() / info()                    │  │
│  │                                                              │  │
│  │  User Settings Context:                                     │  │
│  │  ├─ SettingsContext (language, theme, timezone)           │  │
│  │  └─ useSettings() hook for consuming components           │  │
│  │                                                              │  │
│  │  Responsive Styles (TailwindCSS):                           │  │
│  │  └─ Mobile-first: sm:, md:, lg: breakpoints              │  │
│  │                                                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  State Management:                                                │
│  ├─ Zustand stores (if needed for global state)                 │
│  ├─ React Context (for settings, language, notifications)      │
│  └─ React Query (for API data + caching)                       │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
                          ↓ HTTP/REST APIs
┌──────────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  API Routes:                                                 │  │
│  │  ├─ /api/analytics/*        (Revenue, Funnel, Success,     │  │
│  │  │                            Utilization)                  │  │
│  │  ├─ /api/users/{id}/settings (GET/POST language, theme,    │  │
│  │  │                            timezone, notifications)      │  │
│  │  ├─ /api/locales/*          (Translation enums, errors)    │  │
│  │  ├─ /api/notifications/*    (Send, preferences, audit log) │  │
│  │  └─ /api/appointments       (Existing, triggers            │  │
│  │                              notifications)                 │  │
│  │                                                              │  │
│  │  Middleware:                                                 │  │
│  │  ├─ LocaleMiddleware (detect user's language preference)  │  │
│  │  ├─ AuthMiddleware (verify JWT tokens)                   │  │
│  │  └─ ErrorHandlerMiddleware (translate errors per locale) │  │
│  │                                                              │  │
│  │  Services:                                                   │  │
│  │  ├─ AnalyticsService (queries, aggregations, caching)    │  │
│  │  ├─ UserSettingsService (CRUD user preferences)          │  │
│  │  ├─ LocalizationService (translate strings, enums)       │  │
│  │  ├─ NotificationService (queue, send, retry, audit)      │  │
│  │  ├─ EmailService (SMTP sending, templates)               │  │
│  │  └─ i18nService (language file management)               │  │
│  │                                                              │  │
│  │  Background Jobs:                                            │  │
│  │  └─ NotificationScheduler (runs every 5 min)             │  │
│  │     ├─ Dequeue pending notifications                     │  │
│  │     ├─ Send emails via SMTP                              │  │
│  │     ├─ Send in-app toasts via WebSocket                  │  │
│  │     └─ Log delivery status                               │  │
│  │                                                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
                          ↓ SQL Queries
┌──────────────────────────────────────────────────────────────────┐
│                 DATABASE (PostgreSQL)                             │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Core Tables:                                               │  │
│  │  ├─ staff (user info)                                      │  │
│  │  ├─ patient (patient demographics)                        │  │
│  │  ├─ consultation (appointments)                           │  │
│  │  ├─ financial (payments, revenue)                         │  │
│  │  └─ treatment (treatment types)                           │  │
│  │                                                              │  │
│  │  NEW Tables (Sprint 3):                                     │  │
│  │  ├─ analytics_snapshots (daily aggregations for charts)   │  │
│  │  ├─ user_settings (language, theme, timezone, notif)     │  │
│  │  ├─ notification_queue (pending notifications)            │  │
│  │  ├─ notification_log (sent notifications, audit trail)    │  │
│  │  └─ email_templates (email template content)              │  │
│  │                                                              │  │
│  │  Indexes (Performance):                                     │  │
│  │  ├─ analytics_snapshots: (snapshot_date, treatment_id)   │  │
│  │  ├─ notification_queue: (scheduled_time, status)          │  │
│  │  ├─ notification_log: (sent_at, user_id)                 │  │
│  │  └─ user_settings: (user_id, preferred_language)        │  │
│  │                                                              │  │
│  │  Views & Functions:                                         │  │
│  │  ├─ patient_funnel (conversion calculation)               │  │
│  │  └─ refresh_analytics_snapshot() (trigger on new data)   │  │
│  │                                                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
                          ↓ Email
┌──────────────────────────────────────────────────────────────────┐
│          EXTERNAL SERVICES                                        │
│  ├─ SendGrid / SMTP (Email sending)                             │
│  ├─ Redis (Optional: caching, notification queue)              │  │
│  ├─ Cloudinary (Media storage — existing)                      │  │
│  └─ WebSocket Server (Optional: real-time in-app notifs)      │  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. DEPLOYMENT & ENVIRONMENT SETUP

### 7.1 Environment Variables

```bash
# .env.example

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=OrthoClinic
NEXT_PUBLIC_SUPPORTED_LANGUAGES=pt-BR,en,es,fr,it
NEXT_PUBLIC_DEFAULT_LANGUAGE=pt-BR

# Backend (.env)
## Database
DATABASE_URL=postgresql://user:pass@localhost:5432/orthoclinic_db

## Email Service (SendGrid)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@orthoclinic.com
SENDGRID_FROM_NAME=OrthoClinic

## OR SMTP (if using clinic's email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=clinic@orthoclinic.com
SMTP_PASSWORD=app_specific_password
SMTP_FROM_EMAIL=clinic@orthoclinic.com

## Cache (optional)
REDIS_URL=redis://localhost:6379

## Security
SECRET_KEY=your_secret_key_here
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

## Localization
AVAILABLE_LANGUAGES=pt-BR,en,es,fr,it
DEFAULT_LANGUAGE=pt-BR
```

### 7.2 Docker Compose Updates

```yaml
# docker-compose.yml additions for Sprint 3

version: '3.8'

services:
  # Existing services (frontend, backend, db, etc.)
  
  # NEW: Redis for caching (optional but recommended)
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # NEW: pgAdmin for database management
  pgadmin:
    image: dpage/pgadmin4:7
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - db

volumes:
  redis_data:
```

---

## Key Architectural Decisions

1. **Analytics:** Snapshot table + Redis caching (fast queries, accurate trends)
2. **i18n:** next-i18next (industry standard, easy to manage)
3. **Notifications:** Queue + scheduler pattern (reliable, retryable)
4. **Mobile:** Mobile-first responsive design (scalable, future-proof)
5. **Settings:** User preferences in database (persistent, per-user)
6. **Database:** PostgreSQL (existing), adding materialized views for analytics
7. **Caching:** Redis (optional) + in-memory caching (simple, fast)
8. **Email:** SMTP or SendGrid (flexible, can switch easily)

---

**Document Version:** 1.0  
**Last Updated:** Julho 2, 2026  
**Architect:** Tech Lead

