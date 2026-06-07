# SPRINT 3 CHARTER - OrthoClinic v1.3
**Advanced Analytics, Internationalization, Notifications & Mobile UX**

---

## EXECUTIVE SUMMARY

Sprint 3 introduces enterprise-grade features to OrthoClinic, focusing on **data-driven decision making**, **global accessibility**, **real-time engagement**, and **mobile-first UX**. This sprint elevates the platform from clinic management to strategic analytics and professional multi-language support.

**Current Status:** v1.2 (Production Ready)  
**Target Release:** v1.3 (Julho 16-23, 2026)  
**Duration:** 14-21 days  
**Start Date:** Julho 2, 2026  
**Team Size:** 6 Developers + 2 QAs + 1 PM

---

## SPRINT 3 OBJECTIVES (18 Total Features)

### Objective 1: Advanced Analytics Dashboard (4 Features)
Enable clinic leaders to make data-driven decisions with revenue trends, patient demographics, treatment outcomes, and appointment efficiency metrics.

**Key Metrics:**
- Revenue by treatment type (YTD trending)
- Patient acquisition funnel (leads → consultations → treatments)
- Treatment success rates by procedure
- Appointment utilization & no-shows

### Objective 2: Multi-Language Support / i18n (5 Languages + Framework)
Support Portuguese (PT-BR), English (EN), Spanish (ES), French (FR), and Italian (IT) with runtime language switching.

**Languages:** PT-BR (primary), EN, ES, FR, IT  
**Framework:** next-i18next + backend locale support

### Objective 3: Notification System (Email + Real-Time)
Automated patient communications via email + in-app toast notifications for appointments, prescriptions, and clinic updates.

**Channels:** Email (SMTP), In-app notifications, SMS foundation (Phase 2)

### Objective 4: Mobile Responsiveness (Responsive Design)
Full mobile-first redesign for tablets (iPad) and smartphones, ensuring 100% functionality on screens <768px.

**Breakpoints:** Mobile (<640px), Tablet (640-1024px), Desktop (>1024px)

### Objective 5: User Settings Page (Preferences)
Clinic staff preferences: language, timezone, notification preferences, email digest frequency, UI theme.

**Scope:** Dark mode toggle, language selector, timezone picker, notification opt-in/opt-out, email digest frequency

---

## ARCHITECTURE OVERVIEW

### System Context (High-Level)

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                     │
├──────────────────┬──────────────────┬──────────────────┐    │
│   Analytics UI   │   Multi-Language │  Settings Page   │    │
│   (Recharts)     │   (next-i18next) │  (User Prefs)    │    │
├──────────────────┼──────────────────┼──────────────────┤    │
│  Mobile-First Responsive Design (TailwindCSS)             │    │
└─────────────────────────────────────────────────────────────┘
                          ↓ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│               BACKEND (FastAPI Python)                      │
├──────────────────┬──────────────────┬──────────────────┐    │
│  Analytics API   │  Notification    │  Settings API    │    │
│  (SQLAlchemy)    │  Service (Email) │  (User Prefs)    │    │
├──────────────────┼──────────────────┼──────────────────┤    │
│  DB: PostgreSQL (analytics views, notification logs)       │    │
│  Cache: Redis (notification queue, i18n strings)          │    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│            EXTERNAL SERVICES                                 │
├──────────────────┬──────────────────┬──────────────────┐    │
│   SendGrid/SMTP  │   Cloudinary     │   PostgreSQL     │    │
│   (Email)        │   (Media)        │   (Storage)      │    │
└──────────────────┴──────────────────┴──────────────────┘    │
```

### Technology Stack

**Frontend Additions:**
- `next-i18next` + `i18next` (Multi-language)
- `recharts` (Already installed - Analytics charts)
- `react-hook-form` (Settings form management)
- `clsx` (Already installed - Responsive CSS classes)
- `date-fns` + `date-fns-tz` (Already installed - Timezone support)

**Backend Additions:**
- `FastAPI` (Already installed)
- `SQLAlchemy` (Already installed - ORM for analytics views)
- `Pydantic` (Already installed - Data validation)
- `aiosmtplib` or `sendgrid-python` (Email service)
- `celery` (Optional: async notification tasks)

**Database Schema Additions:**
- `analytics_snapshots` (Daily aggregations)
- `user_settings` (Staff preferences)
- `notification_logs` (Email + in-app history)
- `notification_queue` (Pending messages)

---

## FEATURE BREAKDOWN & EPICS

### FEATURE 1: Revenue Analytics Dashboard

**Epic 1.1: Revenue Trends by Treatment Type**
- Backend: Create monthly revenue aggregation API endpoint
- Frontend: Build revenue trend chart (line/area chart)
- Database: Create `analytics_snapshots` table with daily revenue roll-ups
- Query optimization: Index treatment_id + created_at on financial table

**Epic 1.2: Patient Acquisition Funnel**
- Backend: Create funnel metrics API (leads → consultations → treatments)
- Frontend: Build funnel visualization (waterfall chart)
- Database: Add `patient_stage` tracking (lead → consult → treating)
- Calculation: SQL conversion rates

**Epic 1.3: Treatment Success Metrics**
- Backend: Define "success" criteria per treatment type (in-app config)
- Frontend: Success rate card + detailed breakdown by procedure
- Database: Add `treatment_outcome` field to consultation schema
- Validation: Success % calculation + trending

**Epic 1.4: Appointment Utilization & No-Show Rate**
- Backend: Create utilization metrics API
- Frontend: Gauge chart for utilization, no-show trends
- Database: Track scheduled vs. completed vs. no-show status
- Calculation: Daily/weekly/monthly no-show % trending

---

### FEATURE 2: Multi-Language Support (i18n Framework)

**Epic 2.1: i18n Infrastructure Setup**
- Install `next-i18next` + configure loader
- Create `/locales` folder structure: `pt-BR/`, `en/`, `es/`, `fr/`, `it/`
- Setup language switcher component in header
- Configure `i18n.config.js` with language detection

**Epic 2.2: Frontend String Extraction & Translation**
- Extract all hardcoded strings from components
- Create translation JSON files for each language
- Setup fallback to PT-BR (default)
- Test language switching on all pages

**Epic 2.3: Backend Locale Support**
- Add `preferred_language` field to User/Staff model
- Create translation endpoint for shared strings (enums, status labels)
- Setup locale middleware to auto-detect from request headers
- Translate error messages + API responses

**Epic 2.4: Date/Time Localization**
- Setup `date-fns` locale support for date formatting
- Implement timezone picker in User Settings
- Format dates according to locale (PT-BR: DD/MM/YYYY, EN: MM/DD/YYYY)
- Test with patient appointment timestamps

**Epic 2.5: Translation File Management**
- Document translation key naming convention
- Create translation checklist (4 languages + PT-BR reference)
- Setup CI check: ensure all keys exist in all languages
- Create translation management dashboard for future updates

---

### FEATURE 3: Notification System

**Epic 3.1: Email Service Integration**
- Setup SMTP credentials (SendGrid or clinic's SMTP)
- Create EmailService class (async, with retry logic)
- Template system for: appointment reminders, prescription ready, treatment updates
- Test email delivery + bounce handling

**Epic 3.2: In-App Toast Notifications**
- Integrate `sonner` or `react-hot-toast` (already installed)
- Create notification context for app-wide alerts
- Toast types: success, error, info, warning
- Auto-dismiss + dismiss button

**Epic 3.3: Notification Scheduling & Queue**
- Create notification queue API + database table
- Implement background job: send scheduled notifications
- Support: immediate, 24h before appointment, 7 days post-treatment
- Idempotency: prevent duplicate notifications

**Epic 3.4: Notification Preferences & Opt-Out**
- Add notification settings to User Settings page
- Options: appointment reminders, prescription alerts, marketing
- Email digest frequency: daily, weekly, never
- Per-patient opt-in/opt-out tracking

**Epic 3.5: Notification Audit Log**
- Track all sent notifications (email, in-app, SMS foundation)
- Log delivery status (sent, bounced, read)
- Reporting: notification metrics + delivery rates
- GDPR compliance: notification history retention

---

### FEATURE 4: Mobile Responsiveness

**Epic 4.1: Responsive Grid System**
- Audit all pages for mobile layouts
- Update TailwindCSS breakpoints: `sm:`, `md:`, `lg:` classes
- Test on iPhone (375px), iPad (768px), desktop (1024px+)
- Navigation: mobile hamburger menu + desktop nav

**Epic 4.2: Touch-Friendly UI Components**
- Increase touch targets to min 44x44px (WCAG standard)
- Update form inputs for mobile (date picker, dropdown, etc.)
- Improve spacing on mobile (padding, margins)
- Test button/link tappability on actual devices

**Epic 4.3: Mobile Navigation & UX**
- Implement bottom navigation for mobile (if applicable)
- Hamburger menu for desktop nav collapse on mobile
- Sticky header on mobile with search/actions
- Breadcrumb collapse on small screens

**Epic 4.4: Performance Optimization**
- Lazy-load images + implement next/image optimization
- Code splitting: dynamic imports for large components
- Mobile-specific bundle: exclude desktop-only components
- Lighthouse audit: target 90+ score on mobile

**Epic 4.5: Mobile Forms & Input Handling**
- Input types: email, tel, date (native mobile inputs)
- Autocomplete: patient search, address, prescription lookup
- Validation: real-time feedback without form submission
- Keyboard dismissal: proper focus management

---

### FEATURE 5: User Settings Page

**Epic 5.1: Settings Page Infrastructure**
- Create `/settings` route + layout
- Tab-based navigation: Language, Notifications, Theme, Account
- Save to database: User/Staff settings table
- Load settings on app initialization

**Epic 5.2: Language & Localization Settings**
- Language selector dropdown (5 languages)
- Real-time language switching
- Persist preference to database
- Show flag icons + language names

**Epic 5.3: Notification Preferences**
- Checkbox toggles: appointment reminders, prescription alerts, marketing
- Dropdown: email digest frequency (daily, weekly, never)
- Per-notification-type toggle
- Save immediately on change (optimistic update)

**Epic 5.4: Theme & Appearance Settings**
- Dark/light mode toggle (use next-themes)
- Font size selector (optional enhancement)
- Color theme picker (optional enhancement)
- Persist to localStorage + sync with backend

**Epic 5.5: Timezone & Regional Settings**
- Timezone picker (from `date-fns-tz`)
- Format preferences: date format, time format, currency
- Regional settings sync across app
- Test daylight saving time handling

---

## TEAM ASSIGNMENTS & WORKLOAD

### DEV TEAM 1: Analytics + User Settings (2 Developers)
**Primary Features:** Analytics Dashboard (Feature 1) + User Settings (Feature 5)

**Developer 1A (Backend Lead):**
- Epics: 1.1, 1.2, 1.3, 1.4 (Analytics APIs)
- Deliverables: 4 API endpoints + database schema + aggregation queries
- Estimated Effort: 40 hours (8 hours per epic)

**Developer 1B (Frontend Lead):**
- Epics: 5.1, 5.2, 5.4, 5.5 (Settings UI)
- Epic 1: Build analytics UI components + charts
- Deliverables: Analytics dashboard layout, 4 chart components, settings page
- Estimated Effort: 40 hours

### DEV TEAM 2: i18n + Notifications (2 Developers)
**Primary Features:** Multi-Language Support (Feature 2) + Notifications (Feature 3)

**Developer 2A (Backend Lead):**
- Epics: 2.3, 3.1, 3.2, 3.3, 3.5 (i18n backend + email service)
- Deliverables: Locale middleware, email service, notification queue + scheduler
- Estimated Effort: 42 hours

**Developer 2B (Frontend Lead):**
- Epics: 2.1, 2.2, 2.4, 3.4 (i18n frontend + notification UI)
- Deliverables: i18next setup, translation extraction, language switcher, pref UI
- Estimated Effort: 38 hours

### DEV TEAM 3: Mobile & Responsive Design (2 Developers)
**Primary Features:** Mobile Responsiveness (Feature 4)

**Developer 3A (Lead):**
- Epics: 4.1, 4.2, 4.3 (Responsive design)
- Deliverables: TailwindCSS breakpoints audit, mobile nav, touch-friendly UI
- Estimated Effort: 35 hours

**Developer 3B (Support):**
- Epics: 4.4, 4.5 (Performance + mobile forms)
- Deliverables: Image optimization, lazy loading, form mobile handling
- Estimated Effort: 30 hours

**Total Dev Effort:** 225 hours (6 developers × ~37.5 hours each over 3 weeks)

### QA TEAM (2 QAs)
**Primary Responsibilities:**
- Cross-browser testing (Chrome, Safari, Firefox, Edge)
- Mobile device testing (iOS iPhone + Android)
- Accessibility testing (WCAG 2.1 AA)
- Performance testing (Lighthouse, WebPageTest)
- Notification delivery testing (email + in-app)
- Internationalization testing (language switching, RTL if needed)
- Regression testing on existing features

**QA 1 (Backend/API QA):**
- API endpoint testing (Analytics, notifications, settings)
- Database query validation + performance
- Email delivery verification
- Estimated Effort: 40 hours

**QA 2 (Frontend/UI QA):**
- UI responsiveness testing (3 breakpoints × 5 features)
- Mobile device testing (real devices + emulators)
- Language switching + i18n validation
- Estimated Effort: 40 hours

---

## DEPENDENCY MAP & CRITICAL PATH

```
DEPENDENCIES (→ means "blocks")

FEATURE 1 (Analytics):
  └─ Database Schema (analytics_snapshots table) → API → UI Charts
  └─ Critical Path: ~6 days (Day 1-6)

FEATURE 2 (i18n):
  ├─ i18next Setup → String extraction → Translation
  └─ Backend locale middleware → Frontend language switcher
  └─ Critical Path: ~5 days (can start Day 1, but blocks Features 3, 4, 5)

FEATURE 3 (Notifications):
  ├─ Email service setup → Template system → Queue scheduler
  └─ (depends on FEATURE 2 for i18n support in email templates)
  └─ Critical Path: ~6 days (Day 4-9, blocked by i18n)

FEATURE 4 (Mobile):
  └─ TailwindCSS audit → Component refactor → Testing
  └─ Can start Day 1 in parallel, but should not block other features
  └─ Critical Path: ~7 days

FEATURE 5 (User Settings):
  ├─ Database schema (user_settings table)
  ├─ Settings UI page
  └─ (depends on FEATURE 2 for language selector, FEATURE 3 for notification prefs)
  └─ Critical Path: ~4 days (Day 8-11, blocked by Features 2 & 3)

START DAY 1:
  ├─ FEATURE 2: i18n infrastructure (Team 2A + 2B)
  ├─ FEATURE 1: Analytics DB schema (Team 1A)
  ├─ FEATURE 4: Mobile audit (Team 3A)
  └─ FEATURE 1: Analytics API build (Team 1A, Day 2+)

START DAY 4:
  ├─ FEATURE 3: Email service (Team 2A)
  └─ FEATURE 5: Settings DB schema (Team 1A)

START DAY 7:
  ├─ FEATURE 5: Settings UI (Team 1B, depends on i18n + notifications ready)
  └─ FEATURE 3: Notification UI (Team 2B, depends on i18n ready)

BLOCKING ISSUES TO MONITOR:
  1. i18n infrastructure must complete by Day 3 (blocks 3 features)
  2. Email service credentials must be provided by Day 4 (blocks notifications)
  3. Database migrations must be tested by Day 5 (blocks API development)
```

---

## RISK ASSESSMENT & MITIGATION

### Risk 1: Email Service Delays (SMTP/SendGrid Setup)
**Likelihood:** Medium | **Impact:** High  
**Mitigation:**
- Pre-configure test email account by Day 0 (before sprint starts)
- Have fallback option (local SMTP test server)
- Use mock email service during early dev, swap in production service later

### Risk 2: Translation Coverage Incomplete (Scope Creep)
**Likelihood:** High | **Impact:** Medium  
**Mitigation:**
- Define MVP translation scope: core UI only (not help docs initially)
- Lock translation keys by Day 5
- Use native speakers for QA review (1-2 hours each language)
- Plan post-launch translation review as v1.3.1 patch

### Risk 3: Mobile Testing Device Availability
**Likelihood:** Medium | **Impact:** Medium  
**Mitigation:**
- Use BrowserStack or Firebase Test Lab for device testing
- Prioritize iOS (primary clinic) + high-volume Android (Samsung, Motorola)
- Use Chrome DevTools mobile emulation for initial testing

### Risk 4: Analytics Query Performance (Large Datasets)
**Likelihood:** Medium | **Impact:** Medium  
**Mitigation:**
- Add database indexes on Day 1 (treatment_id + created_at)
- Use materialized views or snapshots for aggregations
- Implement query result caching (30-minute TTL)
- Load test with 5+ years of sample data

### Risk 5: Team Member Illness/Absence
**Likelihood:** Low | **Impact:** High  
**Mitigation:**
- Cross-train teams on Day 1 (all devs understand i18n setup)
- Document all API contracts + database schemas by Day 3
- Pair programming on critical paths (analytics APIs, email service)

### Risk 6: Responsive Design Regression (Breaking Existing Desktop)
**Likelihood:** Medium | **Impact:** High  
**Mitigation:**
- Snapshot desktop layouts before responsive refactor
- Use TailwindCSS mobile-first approach (no desktop-first changes)
- Regression testing suite ready by Day 5
- QA sign-off on all pages before Day 14

### Risk 7: i18n Performance (Loading All Language Files)
**Likelihood:** Low | **Impact:** Medium  
**Mitigation:**
- Use lazy loading for language files (only load on-demand)
- Implement language file caching in next.js
- Monitor bundle size impact (target <50KB per language)

---

## DAILY STANDUP SCHEDULE & CADENCE

### Standup Format
- **Time:** 09:00 AM - 09:15 AM (15 minutes max)
- **Attendees:** All 6 devs + 2 QAs + PM
- **Format:** 
  - What did you accomplish yesterday?
  - What will you work on today?
  - Any blockers?

### Standup Schedule (Monday-Friday)

**Week 1 (Julho 2-6):**
- Monday 09:00 (Sprint kick-off + full planning)
- Tuesday 09:00
- Wednesday 09:00
- Thursday 09:00 + **Mid-week check-in** (4 PM, PM + leads)
- Friday 09:00 + **Sprint review** (4 PM, team + stakeholders)

**Week 2 (Julho 9-13):**
- Monday 09:00 (Dependency check + i18n handoff)
- Tuesday 09:00
- Wednesday 09:00
- Thursday 09:00 + **Mid-week check-in**
- Friday 09:00 + **Progress review**

**Week 3 (Julho 16-20):**
- Monday 09:00 (Final push)
- Tuesday 09:00
- Wednesday 09:00
- Thursday 09:00 + **Feature freeze** (no new code, bug fixes only)
- Friday 09:00 + **Sprint planning + Release prep**

**Week 4 (Julho 23) - Optional:**
- Monday 09:00 (Hotfix window, if needed)
- Target Release: Julho 23, 2026 (end of day)

### Additional Sync Meetings

| Meeting | Owner | Frequency | Duration | Attendees |
|---------|-------|-----------|----------|-----------|
| Dependency Sync | PM | 2x weekly (Tue, Thu) | 30 min | Team leads only |
| i18n Review | 2B + 2A | Daily | 15 min | Team 2 only |
| QA Readiness | QA Lead | Daily | 15 min | QA + latest deployer |
| PM Office Hours | PM | On-demand | 30 min | Any team member |

---

## DEPLOYMENT & RELEASE STRATEGY

### Pre-Release Checkpoints

**Day 10 (Julho 12):** Feature Freeze
- All major features code-complete
- QA begins full regression testing
- Bug severity levels: P0 (blocker), P1 (high), P2 (medium), P3 (low)

**Day 14 (Iulie 16):** Release Candidate Build
- All P0 + P1 bugs fixed
- Smoke test on staging environment
- Performance baseline: Lighthouse 85+, API p95 <500ms

**Day 16-21 (Iulie 18-23):** Release Window
- Soft launch to 10% of clinics (canary)
- Monitor error rates, performance, user feedback
- Full launch if all metrics green
- Hotfix team on standby (24h support, first week)

### Version Strategy
- **Version:** v1.3.0 (Major feature release)
- **Changelog:** Organized by feature + breaking changes (if any)
- **Documentation:** Updated README, DEPLOYMENT guide, feature walkthroughs
- **Backup Plan:** v1.2 rollback (DB migration reversibility confirmed)

---

## SUCCESS METRICS & DEFINITION OF DONE

### v1.3 Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Feature Completion | 100% | All 18 features shipped + tested |
| Code Quality | >80% coverage | Jest + Playwright test suites |
| Performance | Lighthouse 85+ | Mobile + desktop |
| Accessibility | WCAG 2.1 AA | Axe DevTools audit |
| Mobile Responsiveness | 100% | All pages tested at 3 breakpoints |
| i18n Coverage | 100% | All core UI strings translated (5 languages) |
| Email Delivery | 99.5% | SendGrid/SMTP bounce <0.5% |
| Support Documentation | 100% | All features documented + video tutorials |
| Team Velocity | 225 hours | On-time delivery (6 devs × 37.5h) |
| User Adoption | N/A (internal) | Clinic staff can enable languages + settings |

### Definition of Done (Per Feature)

A feature is DONE when:
1. ✅ Code complete (all epics)
2. ✅ Unit tests written + passing (>80% coverage)
3. ✅ Integration tests written + passing
4. ✅ Code review approved by tech lead
5. ✅ Deployed to staging environment
6. ✅ QA tested (functional + regression)
7. ✅ Performance baseline met (Lighthouse, API latency)
8. ✅ Documentation updated (README, API docs, user guide)
9. ✅ Security review complete (OWASP top 10, data protection)
10. ✅ Accessible (WCAG 2.1 AA, Axe audit)

### QA Acceptance Criteria

**Analytics Dashboard:**
- [ ] All 4 charts render correctly
- [ ] Data accurate for 1+ years of test data
- [ ] Charts responsive on mobile/tablet/desktop
- [ ] Drill-down interactions work
- [ ] Export to CSV/PDF works (optional)

**Multi-Language Support:**
- [ ] Language switcher visible + functional
- [ ] All 100% of core UI translated in 5 languages
- [ ] No untranslated strings visible in any language
- [ ] Date formatting correct per locale
- [ ] Email templates translated

**Notifications:**
- [ ] Test email delivers to inbox
- [ ] In-app toast appears + dismisses
- [ ] Notification preferences save correctly
- [ ] Email digest sends at scheduled time
- [ ] Bounce handling works (undeliverable emails)

**Mobile Responsiveness:**
- [ ] All pages render correctly at <640px
- [ ] Touch targets min 44x44px
- [ ] Forms usable on mobile (no horizontal scroll)
- [ ] Mobile menu works (hamburger nav)
- [ ] Lighthouse mobile score 85+

**User Settings:**
- [ ] All settings persist after page reload
- [ ] Language changes apply immediately
- [ ] Timezone picker works + formats dates correctly
- [ ] Notification prefs toggle correctly
- [ ] Theme toggle works (light/dark mode)

---

## TEAM READINESS CHECKLIST

Before sprint kickoff (Day 0), confirm:

### Infrastructure (PM)
- [ ] Database environments ready (dev, staging, production)
- [ ] Email service account provisioned (SendGrid or clinic SMTP)
- [ ] CI/CD pipelines ready for sprint releases
- [ ] Staging environment deployed + accessible to all
- [ ] Error tracking (Sentry) + analytics (DataDog) ready
- [ ] Feature flag system ready (for gradual rollout)

### Development (Tech Leads)
- [ ] All repositories cloned + local envs working
- [ ] Node.js 18+, Python 3.11+, PostgreSQL 14+ installed
- [ ] Development database seeded with test data (1+ years)
- [ ] API documentation template ready
- [ ] Code style guide reviewed (ESLint, Prettier, Black)
- [ ] Git workflow documented (PR requirements, review process)

### Team Knowledge (PM + Leads)
- [ ] All 6 devs understand i18n architecture
- [ ] All 6 devs understand analytics data model
- [ ] All 6 devs understand responsive design strategy
- [ ] Team familiar with notification system architecture
- [ ] QAs trained on test devices + frameworks (Playwright, Cypress)

### Testing (QA Lead)
- [ ] Test environments ready (dev, staging)
- [ ] Test devices provisioned (iOS + Android)
- [ ] Playwright test suite setup + working
- [ ] Test data fixtures created
- [ ] Lighthouse + WebPageTest accounts ready
- [ ] BrowserStack account provisioned (device testing)

### Documentation (PM)
- [ ] Epic templates ready (Jira/Linear)
- [ ] Release notes template ready
- [ ] Architecture diagrams created
- [ ] API contract specifications ready
- [ ] Database schema documentation ready

---

## COMMUNICATION PLAN

### Internal (Daily)
- **#sprint-3-dev** Slack channel (dev discussion)
- **#sprint-3-qa** Slack channel (QA findings)
- **#sprint-3-urgent** Slack channel (blockers only)
- Standup notes in shared doc (Notion/Confluence)

### Stakeholders (Weekly)
- **Friday 4 PM:** Sprint progress update (email or meeting)
- **Release week:** Daily deployment status

### External (Post-Launch)
- **Release notes** on GitHub + in-app
- **Video tutorials** (1-2 min per feature)
- **Support docs** in knowledge base
- **User webinar** (optional, Julho 30)

---

## CONTINGENCY & FALLBACK PLANS

### Scenario 1: 20% Scope Miss (14 out of 18 features)
**Fallback Priority:** 1.1, 1.4, 2 (i18n), 3 (notifications), 4 (mobile), 5.1-5.3  
**Defer to v1.3.1:** Advanced analytics (1.2, 1.3), advanced settings (5.4, 5.5)  
**Timeline Impact:** No change, release on Julho 23

### Scenario 2: Email Service Not Available (Day 5)
**Fallback:** Use mock email service + log to database  
**Mitigation:** Deploy with "email preview" mode in UI  
**Target:** Integrate production email by Day 10  
**Impact:** Delay notifications to v1.3.1 (notifications UI only works in-app)

### Scenario 3: Mobile Testing Devices Unavailable
**Fallback:** Use emulators (iOS Simulator + Android Emulator) + BrowserStack  
**Testing Priority:** iPhone 12 (375px) + iPad (768px) + Chrome desktop  
**Impact:** Release on-time with reduced real device testing  
**Post-launch:** Device-specific testing before any mobile updates

### Scenario 4: Key Developer Unavailable (Week 2+)
**Fallback:** Pair programming with remaining team member  
**Reallocation:** PM reassigns lower-priority epics to other teams  
**Buffer:** 2-3 spare capacity hours per developer (contingency reserve)

### Scenario 5: Performance Issues Discovered (Week 3)
**Fallback:** 
- Reduce analytics chart granularity (daily → weekly)
- Implement aggressive caching (Redis, 1-hour TTL)
- Defer real-time features to v1.3.1
**Impact:** Minor UX change, no functionality loss

---

## APPENDIX: EPIC CHECKLIST (By Team)

### Team 1 - Analytics Dashboard & User Settings

**Epic 1.1: Revenue Trends by Treatment Type**
- [ ] Database: Create `analytics_snapshots` table (id, date, treatment_type, revenue, consultation_count)
- [ ] Backend: GET `/api/analytics/revenue?start_date=2026-01-01&end_date=2026-06-07` endpoint
- [ ] Frontend: Build `<RevenueChart />` component (line/area chart with recharts)
- [ ] Query: Monthly aggregation + trending calculation
- [ ] Test: Verify with 5+ years test data

**Epic 1.2: Patient Acquisition Funnel**
- [ ] Backend: GET `/api/analytics/funnel?period=month` (leads → consult → treatment)
- [ ] Frontend: Build `<FunnelChart />` component (waterfall visualization)
- [ ] Calculation: Conversion % at each stage
- [ ] Test: Verify with sample patient cohorts

**Epic 1.3: Treatment Success Metrics**
- [ ] Database: Add `outcome_status` field to consultation table (success/partial/no-result)
- [ ] Backend: GET `/api/analytics/success?treatment_type=X` endpoint
- [ ] Frontend: Build `<SuccessCard />` component with % + trending
- [ ] Definition: Success criteria per treatment documented
- [ ] Test: Validate calculation logic

**Epic 1.4: Appointment Utilization**
- [ ] Backend: GET `/api/analytics/utilization?period=week` endpoint
- [ ] Frontend: Build `<UtilizationGauge />` component + no-show trend
- [ ] Calculation: (Completed appts) / (Total scheduled) × 100
- [ ] Test: Edge cases (cancellations, rescheduling)

**Epic 5.1: Settings Page Infrastructure**
- [ ] Frontend: Create `/app/settings` route + layout
- [ ] UI: Tab navigation (Language, Notifications, Theme, Account)
- [ ] Backend: GET/POST `/api/users/{user_id}/settings` endpoint
- [ ] Database: Create `user_settings` table (language, timezone, theme, etc.)
- [ ] Test: Settings persist after page reload

**Epic 5.2: Language Settings**
- [ ] Frontend: Build `<LanguageSelector />` dropdown with 5 languages + flags
- [ ] Backend: Persist `preferred_language` to user_settings table
- [ ] UX: Real-time language switch (no page reload required)
- [ ] Test: Language preference persists across sessions

**Epic 5.4: Theme & Appearance**
- [ ] Frontend: Integrate `next-themes` dark mode toggle
- [ ] Backend: Persist `theme_preference` (light/dark/system) to user_settings
- [ ] UX: Toggle in settings + header
- [ ] Test: Theme applies to all pages immediately

**Epic 5.5: Timezone & Regional Settings**
- [ ] Frontend: Build `<TimezoneSelector />` with `date-fns-tz` locales
- [ ] Backend: Persist `timezone`, `date_format`, `time_format`
- [ ] Logic: Auto-detect timezone on first load + allow override
- [ ] Test: Format dates per user's timezone + locale

---

### Team 2 - i18n & Notifications

**Epic 2.1: i18n Infrastructure Setup**
- [ ] Install: `next-i18next`, `i18next`, `i18next-browser-languagedetector`
- [ ] Create: `/public/locales/{pt-BR,en,es,fr,it}/` folder structure
- [ ] Config: `i18n.config.js` with 5 languages + PT-BR default
- [ ] Frontend: Add I18nProvider to `_app.tsx` + configure next.config.js
- [ ] Test: Language detection works + can switch manually

**Epic 2.2: Frontend String Extraction & Translation**
- [ ] Extract all hardcoded strings from 8+ pages
- [ ] Create: `/public/locales/pt-BR/common.json` (all keys in Portuguese)
- [ ] Translate: Extract keys to `en/`, `es/`, `fr/`, `it/` JSON files
- [ ] Use: `useTranslation()` hook in all components
- [ ] Test: No untranslated strings visible in any language

**Epic 2.3: Backend Locale Support**
- [ ] Add: `preferred_language` field to Staff/User model
- [ ] Middleware: Auto-detect locale from request header or user pref
- [ ] API: GET `/api/locales/{language}/enums` (status labels, treatment types, etc.)
- [ ] Translate: Error messages, validation messages
- [ ] Test: API responses in different languages

**Epic 2.4: Date/Time Localization**
- [ ] Setup: `date-fns` locale import for all 5 languages
- [ ] Format: Patient appointment dates per user's locale
- [ ] Timezone: Support in date picker + display
- [ ] Test: Date formatting PT-BR (14/06/2026) vs. EN (06/14/2026)

**Epic 2.5: Translation File Management**
- [ ] Documentation: Key naming convention (e.g., `menu.appointments.title`)
- [ ] CI Check: Ensure all keys exist in all 5 language files
- [ ] Checklist: Translation completion tracking
- [ ] Dashboard: (Optional) Translation completeness percentage

**Epic 3.1: Email Service Integration**
- [ ] Setup: SMTP credentials (SendGrid or clinic SMTP account)
- [ ] Service: Create `EmailService` class with async send
- [ ] Retry Logic: 3x retry with exponential backoff on failure
- [ ] Templates: Create HTML email templates (Jinja2)
- [ ] Test: Test email delivers to inbox

**Epic 3.2: In-App Toast Notifications**
- [ ] Setup: Integrate `sonner` or `react-hot-toast` (already in deps)
- [ ] Context: Create `NotificationContext` for app-wide alerts
- [ ] Types: success, error, warning, info (with icons + colors)
- [ ] Auto-dismiss: 4-5 seconds default + manual close button
- [ ] Test: Toast appears + dismisses correctly

**Epic 3.3: Notification Scheduling & Queue**
- [ ] Database: Create `notification_queue` table (type, user_id, scheduled_time, content)
- [ ] Backend: Background job (FastAPI background tasks or Celery) every 5 minutes
- [ ] Logic: Dequeue notifications scheduled for now, send via email/in-app
- [ ] Idempotency: Track sent notifications, prevent duplicates
- [ ] Test: Notifications send at correct time

**Epic 3.4: Notification Preferences**
- [ ] Frontend: Add toggles in User Settings
  - [ ] Appointment reminders (on/off)
  - [ ] Prescription alerts (on/off)
  - [ ] Marketing emails (on/off)
  - [ ] Email digest frequency (daily/weekly/never)
- [ ] Backend: Save to `user_settings.notification_preferences` (JSON)
- [ ] Logic: Respect preferences when sending notifications
- [ ] Test: Opt-out works, no emails sent for disabled prefs

**Epic 3.5: Notification Audit Log**
- [ ] Database: Create `notification_log` table (sent_at, email, status, delivery_response)
- [ ] Backend: Log all notifications sent + delivery status (bounced, failed, etc.)
- [ ] Reporting: GET `/api/analytics/notifications?start_date=X&end_date=Y`
- [ ] Test: Verify logs + delivery rates

---

### Team 3 - Mobile Responsiveness

**Epic 4.1: Responsive Grid System**
- [ ] Audit: Document all pages + current breakpoint behavior
- [ ] Refactor: Update TailwindCSS classes for mobile (<640px), tablet (640-1024px), desktop (>1024px)
- [ ] Navigation: Hamburger menu on mobile, horizontal nav on desktop
- [ ] Containers: Use `max-w-*` classes to ensure readability on all screens
- [ ] Test: All pages render correctly at 3 breakpoints

**Epic 4.2: Touch-Friendly UI Components**
- [ ] Button/Link size: Min 44x44px (WCAG standard)
- [ ] Spacing: Increase padding/margin on mobile (touch targets)
- [ ] Form inputs: Date picker, dropdown, select with native mobile controls
- [ ] Hover states: Adjust for touch (remove hover tooltips, use tap feedback)
- [ ] Test: All interactive elements tappable on real devices

**Epic 4.3: Mobile Navigation & UX**
- [ ] Mobile menu: Hamburger → slide-in navigation (or bottom nav)
- [ ] Header: Sticky on mobile with primary action (e.g., "New Appointment")
- [ ] Breadcrumbs: Collapse to icon/count on mobile
- [ ] Tabs: Stack vertically on mobile, horizontal on desktop
- [ ] Test: Navigation usable on iPhone 12 (375px)

**Epic 4.4: Performance Optimization**
- [ ] Images: Use `next/image` + responsive image sizes
- [ ] Lazy Loading: Dynamic imports for off-screen components
- [ ] Bundle: Code splitting per route (Next.js automatic)
- [ ] Lighthouse: Target 85+ on mobile, 90+ on desktop
- [ ] Test: Lighthouse audit pass before release

**Epic 4.5: Mobile Forms & Input Handling**
- [ ] Input types: Use native mobile inputs (email, tel, date, time)
- [ ] Autocomplete: Patient/address search on mobile
- [ ] Validation: Real-time feedback + error messages
- [ ] Keyboard: Proper focus management + dismiss keyboard on submit
- [ ] Test: All forms usable on mobile without horizontal scroll

---

## NEXT STEPS

1. **Day 0 (Today, Julho 1):** 
   - [ ] Review this charter with team (1 hour)
   - [ ] Confirm team readiness (infrastructure, tools, knowledge)
   - [ ] Assign epic owners + schedule kickoff

2. **Day 1 (Julho 2):**
   - [ ] Sprint kickoff meeting (2 hours)
   - [ ] i18n infrastructure setup (Team 2)
   - [ ] Analytics DB schema (Team 1A)
   - [ ] Mobile audit (Team 3A)

3. **Day 2-3:**
   - [ ] API endpoint development (Teams 1, 2)
   - [ ] String extraction (Team 2B)
   - [ ] Component refactoring (Team 3)

---

**Document Version:** 1.0  
**Last Updated:** Julho 2, 2026  
**Sprint PM:** [Your Name]  
**Approval:** Tech Lead, Product Owner, Clinic Lead

