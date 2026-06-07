# SPRINT 3 E2E TEST SCENARIOS
**OrthoClinic v1.3 - End-to-End Test Cases (50+ Scenarios)**

**Document Version:** 1.0  
**Created:** June 7, 2026  
**Test Framework:** Playwright  
**Total Scenarios:** 64 scenarios

---

## 🎭 TEST SCENARIO STRUCTURE

Each scenario follows this format:

```
[Scenario #][Feature] - [Description]

PREREQUISITES:
- [Setup requirements]
- [Test data needed]

STEPS:
1. [Action]
2. [Verification]
3. [Action]

EXPECTED RESULT:
- [Outcome 1]
- [Outcome 2]

DEVICE COVERAGE:
- Desktop ✓ / Mobile ✓ / Tablet ✓

ACCESSIBILITY:
- [A11y considerations]
```

---

## 📊 FEATURE 1: ANALYTICS DASHBOARD (12 scenarios)

### Scenario 1.1: Analytics Dashboard Loads with Default Metrics

**PREREQUISITES:**
- User logged in as clinic admin
- At least 30 days of historical data in system
- Clinic has completed appointments

**STEPS:**
1. Navigate to `/analytics`
2. Wait for page to load completely
3. Verify dashboard title displays "Analytics Dashboard"
4. Verify all four chart sections visible: Revenue, Funnel, Success, Utilization
5. Verify date range defaults to "Last 30 days"
6. Verify clinic filter defaults to current clinic

**EXPECTED RESULT:**
- Dashboard loads in <2 seconds
- All four chart panels display
- Charts contain data points (not empty)
- Default date range shows last 30 days
- No console errors or warnings

**DEVICE COVERAGE:**
- Desktop ✓ Chrome, Firefox, Safari, Edge
- Mobile ✓ iPhone 12, Pixel 5
- Tablet ✓ iPad

**ACCESSIBILITY:**
- Heading hierarchy correct (h1 > h2)
- Charts have proper ARIA labels
- Filters accessible via keyboard
- Focus indicators visible on interactive elements

---

### Scenario 1.2: Revenue Trend Chart Renders with Data

**PREREQUISITES:**
- At least 10 completed appointments with payments
- Dashboard loaded and visible

**STEPS:**
1. Locate "Revenue Trends" chart section
2. Verify chart type is line chart
3. Hover over first data point
4. Verify tooltip shows: date, revenue amount, currency symbol
5. Verify Y-axis shows currency values (R$, $, €, etc. based on locale)
6. Verify X-axis shows dates
7. Verify trend line is smooth (not jagged)

**EXPECTED RESULT:**
- Line chart displays correctly
- Data points clickable/hoverable
- Tooltip shows correct values
- Currency formatted based on user locale
- Rendering time <500ms

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓ (tooltip becomes tap)
- Tablet ✓

**ACCESSIBILITY:**
- Chart data accessible via data table
- Color contrast meets 4.5:1 ratio
- No color-only distinction (includes patterns)

---

### Scenario 1.3: Patient Funnel Chart Shows Conversion Rates

**PREREQUISITES:**
- At least 100 leads in system
- Conversion pipeline data available

**STEPS:**
1. Locate "Patient Funnel" chart section
2. Verify chart displays stages: Leads → Consultations → Treatments → Success
3. Verify each stage shows: count and conversion percentage
4. Click on "Consultations" stage
5. Verify breakdown shows (e.g., "45/100 consultations booked")
6. Verify percentage calculation is correct

**EXPECTED RESULT:**
- Funnel chart displays all stages
- Conversion rates accurate (leads → consultations → treatments)
- Stage percentages sum to 100% (relative to previous stage)
- Click on stage shows detailed breakdown
- Rendering time <500ms

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓ (may scroll horizontally)
- Tablet ✓

**ACCESSIBILITY:**
- Stage labels clearly readable
- Percentages announced by screen reader
- Touch targets > 44px on mobile

---

### Scenario 1.4: Success Metrics Display Correct Percentages

**PREREQUISITES:**
- At least 50 completed treatments in database
- Treatment outcomes recorded

**STEPS:**
1. Locate "Success Metrics" section
2. Verify displays: Overall Success Rate, Orthontics Success, General Dentistry Success
3. Click on "Orthontics Success" metric
4. Verify shows breakdown: successful treatments / total treatments
5. Verify percentage calculation: (successful / total) * 100
6. Verify expected values within reasonable range (0-100%)

**EXPECTED RESULT:**
- Metrics display as percentages
- Values accurate based on treatment data
- Each metric shows treatment count
- Success rate within logical range
- No null/undefined values displayed

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- Metric names clear and distinct
- Percentages announced correctly
- Metric cards keyboard navigable

---

### Scenario 1.5: Utilization Chart Shows Appointment Metrics

**PREREQUISITES:**
- At least 20 appointments in selected period
- Appointment duration data recorded

**STEPS:**
1. Locate "Utilization" chart section
2. Verify chart shows appointment hours over time
3. Verify includes: Total Hours, Scheduled Hours, Utilized Hours
4. Verify utilization percentage: (Utilized / Scheduled) * 100
5. Verify chart updates for selected date range
6. Verify no bars exceed 24 hours per day

**EXPECTED RESULT:**
- Bar chart displays daily utilization
- Stacked bars show scheduled vs. utilized
- Percentage accurate
- Y-axis shows hours (0-24)
- X-axis shows dates

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓ (may scroll)
- Tablet ✓

**ACCESSIBILITY:**
- Stacked bar chart has legend
- Legend identifies each color
- Tooltip shows breakdown

---

### Scenario 1.6: Date Range Filter Updates All Charts

**PREREQUISITES:**
- Dashboard loaded with default data

**STEPS:**
1. Locate date range filter (e.g., "Last 30 days" dropdown)
2. Click filter dropdown
3. Verify options: Last 7 days, Last 30 days, Last 90 days, Custom
4. Select "Last 7 days"
5. Verify all four charts update within 1 second
6. Verify data points match expected 7-day range
7. Verify filter displays "Last 7 days" (not revert to default)

**EXPECTED RESULT:**
- Dropdown opens with all options
- Charts update immediately on selection
- Data displayed matches selected range
- Filter value persists in UI
- No loading state >2 seconds

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓ (dropdown may expand full screen)
- Tablet ✓

**ACCESSIBILITY:**
- Dropdown keyboard accessible (arrow keys)
- Selected option announced
- Close dropdown with Escape key

---

### Scenario 1.7: Clinic Filter Updates All Visualizations

**PREREQUISITES:**
- User has access to multiple clinics
- Each clinic has distinct data

**STEPS:**
1. Locate clinic filter (e.g., "Clinic: Main Clinic" dropdown)
2. Click clinic dropdown
3. Verify all accessible clinics listed
4. Select "Branch Clinic"
5. Verify all charts update within 1 second
6. Verify data matches Branch Clinic only
7. Verify filter displays "Branch Clinic"
8. Verify patient funnel shows Branch Clinic numbers

**EXPECTED RESULT:**
- Dropdown lists all clinics user can access
- Charts update immediately on selection
- Data isolated to selected clinic
- Filter persists until changed
- No data leakage between clinics

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- Clinic names readable
- Dropdown keyboard navigable
- Selected clinic announced

---

### Scenario 1.8: Export CSV Downloads Correct Data

**PREREQUISITES:**
- Dashboard loaded with data
- Date range set to "Last 30 days"

**STEPS:**
1. Locate "Export CSV" button
2. Click button
3. Verify file download initiates
4. Wait for download to complete
5. Open downloaded CSV file
6. Verify file contains headers: Date, Revenue, Appointments, Utilization
7. Verify first row matches displayed data
8. Verify all rows match date range (last 30 days)

**EXPECTED RESULT:**
- CSV downloads successfully
- File named appropriately (e.g., `analytics-2026-06-07.csv`)
- File contains correct headers
- Data matches dashboard display
- File is valid CSV (can open in Excel)

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✗ (may have platform limitations)
- Tablet ✓

**ACCESSIBILITY:**
- Button labeled "Export CSV" (not just icon)
- File download accessible via keyboard

---

### Scenario 1.9: Export PDF Generates Valid File

**PREREQUISITES:**
- Dashboard loaded with data
- Date range set to "Last 30 days"

**STEPS:**
1. Locate "Export PDF" button
2. Click button
3. Verify file download initiates
4. Wait for PDF generation (<5 seconds)
5. Open downloaded PDF file
6. Verify PDF contains all four charts as images
7. Verify charts are readable and clear
8. Verify header shows clinic name, date range
9. Verify footer shows generation date and time

**EXPECTED RESULT:**
- PDF downloads successfully
- File named appropriately (e.g., `analytics-2026-06-07.pdf`)
- PDF opens without errors
- Charts displayed as images
- Text readable at 100% zoom
- File size <5MB

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✗ (may have platform limitations)
- Tablet ✓

**ACCESSIBILITY:**
- Button labeled "Export PDF"
- File download accessible via keyboard
- PDF contains text alternatives to charts

---

### Scenario 1.10: Unauthorized User Cannot Access Analytics

**PREREQUISITES:**
- User logged in as receptionist (non-admin)
- Receptionist role has limited permissions

**STEPS:**
1. Navigate directly to `/analytics` URL
2. Verify redirect to unauthorized page or dashboard
3. Verify no analytics data displayed
4. Verify error message: "You don't have permission to access this page"
5. Verify no console errors

**EXPECTED RESULT:**
- User redirected away from `/analytics`
- Error message displayed
- No data leak to unauthorized user
- Redirect happens <1 second

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- Error message clear and readable
- Link to home page provided

---

### Scenario 1.11: Mobile Dashboard Layout Is Responsive

**PREREQUISITES:**
- Dashboard loaded on mobile device (iPhone 12, 390px width)
- Date range set to "Last 30 days"

**STEPS:**
1. Verify all four charts stack vertically (not side-by-side)
2. Verify chart width matches screen width (no horizontal scroll)
3. Verify chart height is appropriate for mobile (not <100px)
4. Verify filter dropdowns are full width or appropriate size
5. Verify touch targets are >44px tall
6. Scroll down to verify all charts accessible
7. Verify fonts readable without zoom

**EXPECTED RESULT:**
- Charts stack in single column
- No horizontal scrolling
- All elements touch-friendly
- Content readable without zoom (16px+ font)
- Charts adjust proportions but remain visible

**DEVICE COVERAGE:**
- Mobile ✓ iPhone 12, Pixel 5
- Tablet ✓ iPad (may use different layout)

**ACCESSIBILITY:**
- Text readable at 200% zoom
- Touch targets accessible
- Focus indicators visible

---

### Scenario 1.12: Dashboard Performance Acceptable (<2s load)

**PREREQUISITES:**
- Dashboard with 30 days of data
- Clear browser cache
- Network conditions: 4G speed

**STEPS:**
1. Open DevTools (F12)
2. Open Network tab
3. Navigate to `/analytics`
4. Wait for page complete load
5. Verify Time to Interactive (TTI) <3 seconds
6. Verify Largest Contentful Paint (LCP) <2.5 seconds
7. Verify First Contentful Paint (FCP) <1.5 seconds
8. Verify total bundle size <500KB
9. Run Lighthouse audit
10. Verify Lighthouse score ≥85 on mobile

**EXPECTED RESULT:**
- Page loads completely <3 seconds
- All metrics within targets
- Lighthouse score ≥85 mobile, ≥90 desktop
- No console errors
- No layout shift after load

**DEVICE COVERAGE:**
- Desktop ✓ (Lighthouse desktop score)
- Mobile ✓ (Lighthouse mobile score)
- Tablet ✓

**ACCESSIBILITY:**
- Cumulative Layout Shift (CLS) <0.1
- Animations disabled for users with prefers-reduced-motion

---

## 🌍 FEATURE 2: i18n SYSTEM (15 scenarios)

### Scenario 2.1: Language Selector Displays All 5 Languages

**PREREQUISITES:**
- App is accessible
- User is on any page

**STEPS:**
1. Locate language selector (typically in header or settings)
2. Click language selector
3. Verify dropdown/menu opens
4. Count available languages
5. Verify all 5 languages present: PT-BR, EN, ES, FR, IT
6. Verify each language name displayed in native language:
   - PT-BR: "Português (Brasil)"
   - EN: "English"
   - ES: "Español"
   - FR: "Français"
   - IT: "Italiano"
7. Verify current language is marked/highlighted

**EXPECTED RESULT:**
- Dropdown displays all 5 languages
- Languages shown in native language names
- Current language highlighted or marked with checkmark
- Dropdown closes on selection
- No visual glitches

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Language names readable
- Dropdown keyboard accessible (Tab, arrow keys)
- Current language announced

---

### Scenario 2.2: Selecting Language Updates Entire App UI

**PREREQUISITES:**
- App loaded in PT-BR (default for Brazil clinic)
- User is on dashboard or main page

**STEPS:**
1. Note current UI text (e.g., "Pacientes", "Agenda", "Financeiro")
2. Open language selector
3. Select "English"
4. Wait <1 second for UI to update
5. Verify all visible text updated to English:
   - "Patients" instead of "Pacientes"
   - "Appointments" instead of "Agenda"
   - "Financial" instead of "Financeiro"
6. Navigate to different page (e.g., from Appointments to Patients)
7. Verify new page also in English
8. Verify no mixed language (English + Portuguese) on same page

**EXPECTED RESULT:**
- All UI text updates immediately
- Update happens <500ms
- No page refresh needed
- All pages update (not just current page)
- Translations are complete (no missing strings)

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- ARIA labels updated
- Form labels updated
- Tooltips updated
- Error messages updated

---

### Scenario 2.3: PT-BR Displays Correctly (Special Characters)

**PREREQUISITES:**
- Language set to PT-BR
- Browser font supports Brazilian Portuguese

**STEPS:**
1. Navigate to patient page
2. Verify special characters display correctly:
   - Tilde: "ã", "õ" in words like "Atendimento"
   - Acute: "á", "é", "í", "ó", "ú"
   - Cedilla: "ç" in "paciente"
3. Verify form labels display correctly
4. Verify button text displays correctly
5. Verify menu items display correctly
6. Verify page title displays correctly

**EXPECTED RESULT:**
- All special characters render correctly
- Text is readable and not corrupted
- No character replacement (e.g., "?" instead of "ã")
- Font-family supports Latin Extended-A
- No console encoding errors

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Characters announced correctly by screen reader
- Font size adequate for character rendering

---

### Scenario 2.4: EN Displays Correctly (All Pages)

**PREREQUISITES:**
- Language set to EN
- User is admin with access to all pages

**STEPS:**
1. Navigate to each main page:
   - Dashboard
   - Patients
   - Appointments
   - Financial
   - Settings
   - Analytics
2. For each page, verify:
   - Page title is in English
   - All buttons in English
   - All form labels in English
   - All menu items in English
3. Check for completeness (no "i18n.key.missing" messages)
4. Check for readability (no encoding issues)

**EXPECTED RESULT:**
- All pages 100% translated to English
- No untranslated keys visible
- No "i18n" prefix in UI
- Professional English translations
- Consistent terminology across app

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- English text readable
- Pronunciation guide available if needed

---

### Scenario 2.5: ES Displays Correctly (Accent Marks)

**PREREQUISITES:**
- Language set to ES
- Browser supports Spanish characters

**STEPS:**
1. Navigate to patient page
2. Verify accent marks display:
   - Acute: "á", "é", "í", "ó", "ú"
   - Diaeresis: "ü"
3. Verify Spanish-specific features work:
   - Pluralization rules correct
   - Gender agreement in forms
4. Verify form placeholder text in Spanish
5. Verify error messages in Spanish
6. Check dropdown options in Spanish

**EXPECTED RESULT:**
- All Spanish characters render correctly
- Accent marks display properly
- Pluralization rules correct for Spanish
- All text understandable by Spanish speaker
- No corruption or replacement characters

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Spanish characters pronounced correctly
- Spanish vocabulary standard and clear

---

### Scenario 2.6: FR Displays Correctly (Special Characters)

**PREREQUISITES:**
- Language set to FR
- Browser supports French characters

**STEPS:**
1. Navigate to patient page
2. Verify French special characters:
   - Acute: "é" (très, été)
   - Grave: "è", "ù" (première, où)
   - Circumflex: "ê", "ô" (tête, côté)
   - Cedilla: "ç" (français)
3. Verify French spacing rules:
   - Space before ":" and "!" (optional, check style guide)
4. Verify form labels in French
5. Verify button text in French

**EXPECTED RESULT:**
- All French characters render correctly
- Text follows French typographical rules
- No character corruption
- Readable by French speaker
- Professional French translations

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- French text pronounced correctly
- Character encoding UTF-8 verified

---

### Scenario 2.7: IT Displays Correctly (All Features)

**PREREQUISITES:**
- Language set to IT
- Browser supports Italian characters

**STEPS:**
1. Navigate to multiple pages
2. Verify Italian characters:
   - Accented vowels: "à", "è", "é", "ì", "ò", "ù"
3. Verify Italian grammar:
   - Gender-specific adjectives
   - Article agreement
4. Verify form validation messages in Italian
5. Verify success/error messages in Italian
6. Verify tooltips in Italian

**EXPECTED RESULT:**
- All Italian characters display correctly
- Italian grammar rules applied correctly
- Translations are natural Italian (not literal)
- No untranslated keys
- Professional quality Italian text

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Italian text pronounced correctly
- Readable to Italian speaker

---

### Scenario 2.8: Language Preference Persists on Refresh

**PREREQUISITES:**
- User changed language to "Español"
- User currently viewing app in Spanish

**STEPS:**
1. Note current language is ES
2. Refresh page (F5 or Ctrl+R)
3. Wait for page to reload
4. Verify UI is still in Spanish
5. Navigate to different page
6. Verify page still in Spanish
7. Verify language selector shows ES as current

**EXPECTED RESULT:**
- Page reloads in same language
- Language preference persists
- No revert to default language
- Language stored in browser storage (localStorage/cookie)
- Persistence works across multiple pages

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Language change announcements (if screen reader)

---

### Scenario 2.9: Language Preference Saved to Database

**PREREQUISITES:**
- User is logged in as clinic staff
- User changed language to "Italiano"
- User currently viewing app in Italian

**STEPS:**
1. Open browser DevTools (F12)
2. Open Application tab
3. Check localStorage for language preference key
4. Verify key exists and value is "it"
5. Logout from app
6. Login with same user credentials
7. Verify app still displays in Italian
8. Verify language preference was retrieved from database

**EXPECTED RESULT:**
- Language preference stored in user database record
- Preference persists across logout/login
- Correct language loaded on login
- localStorage synced with database
- Multi-device consistency (if user logs in from different device)

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Setting stored accessibly (not device-specific)

---

### Scenario 2.10: Date Format Changes with Language (DD/MM vs MM/DD)

**PREREQUISITES:**
- Financial page or patient page with dates loaded
- Test with PT-BR and EN languages

**STEPS:**
1. Set language to PT-BR
2. Navigate to Financial page
3. Note date format (should be DD/MM/YYYY, e.g., "07/06/2026")
4. Set language to EN
5. Verify date format changes to MM/DD/YYYY (e.g., "06/07/2026")
6. Set language to ES
7. Verify date format is DD/MM/YYYY
8. Verify format consistent across all date fields on page

**EXPECTED RESULT:**
- PT-BR: DD/MM/YYYY (e.g., 07/06/2026)
- EN: MM/DD/YYYY (e.g., 06/07/2026)
- ES: DD/MM/YYYY
- FR: DD/MM/YYYY
- IT: DD/MM/YYYY
- Format applies to all dates on page
- Calendar pickers respect locale format

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Dates readable and unambiguous

---

### Scenario 2.11: Time Format Changes with Language (24h vs 12h)

**PREREQUISITES:**
- Appointments page or financial page with times loaded
- Test with PT-BR and EN languages

**STEPS:**
1. Set language to PT-BR
2. Navigate to Appointments page
3. Note time format (should be 24-hour, e.g., "14:30")
4. Set language to EN
5. Verify time format changes to 12-hour with AM/PM (e.g., "2:30 PM")
6. Set language to ES
7. Verify time format is 24-hour (e.g., "14:30")
8. Verify format consistent across all times on page

**EXPECTED RESULT:**
- PT-BR: 24-hour format (e.g., 14:30)
- EN: 12-hour format with AM/PM (e.g., 2:30 PM)
- ES: 24-hour format
- FR: 24-hour format
- IT: 24-hour format
- Time picker respects locale format
- Timezone offset displayed if applicable

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Time format clear and unambiguous
- AM/PM announced by screen reader

---

### Scenario 2.12: Number Format Changes with Language (1,234.56 vs 1.234,56)

**PREREQUISITES:**
- Financial page with revenue numbers loaded
- Test with PT-BR and EN languages

**STEPS:**
1. Set language to PT-BR
2. Navigate to Financial page or Analytics
3. Note number format (should be 1.234,56 format)
4. Set language to EN
5. Verify number format changes to 1,234.56 format
6. Set language to ES
7. Verify number format is 1.234,56 format
8. Verify format consistent across all numbers

**EXPECTED RESULT:**
- PT-BR: Uses comma for decimal, period for thousands (1.234,56)
- EN: Uses period for decimal, comma for thousands (1,234.56)
- ES: Uses comma for decimal, period for thousands (1.234,56)
- FR: Uses comma for decimal, space for thousands (1 234,56)
- IT: Uses comma for decimal, period for thousands (1.234,56)
- Format applies to all numeric values
- Currency symbols positioned correctly

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Numbers readable and not ambiguous

---

### Scenario 2.13: Currency Formatting Correct Per Language

**PREREQUISITES:**
- Financial page with money amounts loaded
- Test with multiple languages

**STEPS:**
1. Set language to PT-BR
2. Navigate to Financial page
3. Verify currency format: "R$ 1.234,56" or "1.234,56 R$"
4. Set language to EN
5. Verify currency format: "$1,234.56"
6. Set language to ES
7. Verify currency format: "1.234,56 €" or "€1.234,56"
8. Check if multiple currencies supported

**EXPECTED RESULT:**
- PT-BR: R$ format with Brazilian thousands/decimal
- EN: $ format with English thousands/decimal
- ES: € format with Spanish thousands/decimal
- FR: € format with French thousands/decimal
- IT: € format with Italian thousands/decimal
- Currency symbol and position culturally correct
- No ambiguity in amount

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Currency format understandable
- Symbol announced by screen reader

---

### Scenario 2.14: Pluralization Rules Correct for Each Language

**PREREQUISITES:**
- Notifications or messages with plural forms
- Test with multiple languages

**STEPS:**
1. Set language to EN
2. Create appointment list with 1, 2, 5 appointments
3. Verify singular: "1 appointment" (not "1 appointments")
4. Verify plural: "2 appointments", "5 appointments"
5. Set language to PT-BR
6. Repeat test with Portuguese pluralization rules
7. Set language to ES
8. Verify Spanish pluralization is correct
9. Repeat for FR and IT

**EXPECTED RESULT:**
- EN: "1 appointment" / "2 appointments" (singular/plural)
- PT-BR: "1 consulta" / "2 consultas"
- ES: "1 cita" / "2 citas"
- FR: "1 rendez-vous" / "2 rendez-vous"
- IT: "1 appuntamento" / "2 appuntamenti"
- Pluralization rules correct for each language
- Context understood correctly

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Pluralization announced correctly

---

### Scenario 2.15: Missing Translations Fallback to Default Language

**PREREQUISITES:**
- Temporarily remove a translation key from a language file
- App configured with EN as fallback language

**STEPS:**
1. Remove PT-BR translation for key "appointment.confirm"
2. Set language to PT-BR
3. Navigate to page that displays this key
4. Verify English text displays (fallback)
5. Check console for warning about missing translation
6. Restore translation
7. Verify Portuguese text now displays

**EXPECTED RESULT:**
- Missing translation triggers fallback to default (EN)
- User sees English instead of error message
- Console logs warning about missing key
- Fallback is seamless and user-friendly
- No broken UI or missing text

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Fallback text readable and understandable

---

## 🔔 FEATURE 3: NOTIFICATION SYSTEM (12 scenarios)

### Scenario 3.1: In-App Toast Notification Displays on Trigger Event

**PREREQUISITES:**
- User logged in
- User on dashboard
- Notifications enabled in settings

**STEPS:**
1. Perform action that triggers notification (e.g., create appointment)
2. Verify toast notification appears
3. Verify toast position (typically bottom-right or top-right)
4. Verify toast displays:
   - Success icon (checkmark)
   - Message text ("Appointment created successfully")
   - Close button (X)
5. Verify toast color matches notification type (green for success)

**EXPECTED RESULT:**
- Toast appears immediately (<200ms)
- Toast is visible and readable
- Toast at expected position on screen
- Close button functional
- No overlapping with other UI elements

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices (adjust position for mobile)
- Tablet ✓

**ACCESSIBILITY:**
- Toast has role="alert"
- Message announced by screen reader
- Toast is not hidden behind other elements

---

### Scenario 3.2: Toast Notification Auto-Dismisses After 3 Seconds

**PREREQUISITES:**
- In-app notification displayed
- Browser DevTools open (to measure time)

**STEPS:**
1. Create action that triggers toast (e.g., save patient)
2. Note timestamp when toast appears
3. Watch toast for auto-dismiss
4. Note timestamp when toast disappears
5. Calculate elapsed time
6. Verify time is approximately 3 seconds (±0.5s)

**EXPECTED RESULT:**
- Toast auto-dismisses after ~3 seconds
- Dismissal is smooth (fade out or slide away)
- Dismissed toast doesn't leave blank space
- Other content doesn't shift when toast disappears

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Auto-dismiss doesn't interrupt user interaction
- Enough time to read message (3 seconds for typical message length)

---

### Scenario 3.3: Toast Notification Can Be Manually Dismissed

**PREREQUISITES:**
- In-app notification displayed
- Toast has close button (X)

**STEPS:**
1. Create action that triggers toast
2. Verify close button visible (typically "X")
3. Click close button immediately (before auto-dismiss)
4. Verify toast disappears immediately
5. Verify no delay in dismissal
6. Verify click was registered (not slow)

**EXPECTED RESULT:**
- Toast dismisses on button click
- Dismissal is immediate (<100ms)
- No animation delay (or brief animation <300ms)
- Click target is at least 44px for mobile

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices (ensure touch target size)
- Tablet ✓

**ACCESSIBILITY:**
- Close button accessible via keyboard (Tab, Enter)
- Close button labeled (screen reader friendly)

---

### Scenario 3.4: Email Notification Received After Appointment Confirmation

**PREREQUISITES:**
- User set to receive email notifications
- Email service configured (SMTP or SendGrid)
- Test email address configured
- Appointment creation form accessible

**STEPS:**
1. Create new appointment
2. Fill in appointment details
3. Select clinic, patient, time
4. Click "Confirm Appointment"
5. Wait 5 seconds for email queue processing
6. Check test email inbox
7. Verify email received (subject line matches)
8. Verify email contains appointment details

**EXPECTED RESULT:**
- Email received within 5 seconds
- Email subject: "New Appointment Confirmation"
- Email from: clinic name
- Email contains: patient name, date, time, clinic
- Email is HTML formatted and readable
- Email includes link to view appointment

**DEVICE COVERAGE:**
- Desktop ✓ (email verification)
- Mobile ✓ (email visible on mobile)
- Tablet ✓

**ACCESSIBILITY:**
- Email readable in email client
- Links are understandable
- Text-only version available

---

### Scenario 3.5: Email Contains Correct Clinic/Appointment Details

**PREREQUISITES:**
- Email notification received (from Scenario 3.4)
- Email open in email client

**STEPS:**
1. Open email notification
2. Verify subject line correct: "Appointment Confirmation - [Clinic Name]"
3. Verify email content includes:
   - Patient name: matches appointment
   - Appointment date: matches booked date
   - Appointment time: matches booked time
   - Clinic name: matches selected clinic
   - Clinic address: matches clinic details
   - Provider name: if applicable
4. Verify no placeholder text (e.g., {{patient_name}})
5. Verify no truncated content

**EXPECTED RESULT:**
- All details accurate and complete
- No template variables visible
- Email formatted professionally
- All required information present
- No data inconsistencies

**DEVICE COVERAGE:**
- Desktop ✓ (email client)
- Mobile ✓ (mobile email app)
- Tablet ✓

**ACCESSIBILITY:**
- Email content readable at default size
- No critical information in images only
- Alt text on images

---

### Scenario 3.6: Email From Address Is Clinic Name

**PREREQUISITES:**
- Email notification received

**STEPS:**
1. Open email notification
2. Check "From" address
3. Verify displays: "OrthoClinic Clinic <noreply@orthoclinic.com.br>"
4. Verify clinic name is readable (not just email address)
5. Verify no generic "noreply" as display name

**EXPECTED RESULT:**
- From address shows clinic name
- Email recognizable as from clinic
- Display name matches clinic name
- Professional appearance
- No generic or confusing sender

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- Sender name readable
- Clinic identity clear

---

### Scenario 3.7: Email Subject Line Is Readable

**PREREQUISITES:**
- Email notification received

**STEPS:**
1. Open email client (Gmail, Outlook, etc.)
2. Locate email from clinic in inbox
3. Check subject line
4. Verify subject is clear and descriptive:
   - Good: "Appointment Confirmation - June 7, 2026"
   - Bad: "notification_appt_confirm_12345"
5. Verify subject <60 characters (displays fully on mobile)
6. Verify no special characters that render incorrectly

**EXPECTED RESULT:**
- Subject line clear and professional
- Subject describes purpose of email
- No truncation on mobile email clients
- No encoding issues with special characters
- User can identify email purpose from subject alone

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓ (mobile email clients have limited width)
- Tablet ✓

**ACCESSIBILITY:**
- Subject understandable at glance
- Professional tone

---

### Scenario 3.8: Notification Preferences Page Loads

**PREREQUISITES:**
- User logged in
- User navigated to Settings page

**STEPS:**
1. Click on "Settings" in navigation menu
2. Locate "Notifications" section
3. Verify page loads completely
4. Verify title: "Notification Preferences"
5. Verify notification toggle switches present
6. Verify each toggle has label (e.g., "Email Notifications")
7. Verify toggles show current state (on/off)

**EXPECTED RESULT:**
- Settings page loads <1 second
- Notification preferences section visible
- All toggles rendered correctly
- Current state displayed accurately
- No console errors

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Settings title clear
- Toggles keyboard accessible
- Toggle state announced by screen reader

---

### Scenario 3.9: Toggling Email Notifications Works

**PREREQUISITES:**
- Notification Preferences page loaded
- Email notifications currently enabled

**STEPS:**
1. Locate "Email Notifications" toggle
2. Verify toggle is currently ON
3. Click toggle switch
4. Verify toggle switches to OFF
5. Verify visual feedback (toggle slides/changes color)
6. Wait for save (should auto-save or show "Saved" message)
7. Verify email notifications no longer sent (perform action that triggers email)
8. Toggle ON again
9. Verify email notifications resume

**EXPECTED RESULT:**
- Toggle switches state on click
- Visual feedback provided
- Setting persists (refresh page, still off)
- Notifications respected (emails not sent when toggled off)
- Toggle back ON works correctly

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices (ensure 44px touch target)
- Tablet ✓

**ACCESSIBILITY:**
- Toggle keyboard accessible
- Toggle state announced (ON/OFF)
- Change announced when toggled

---

### Scenario 3.10: Toggling In-App Notifications Works

**PREREQUISITES:**
- Notification Preferences page loaded
- In-app notifications currently enabled

**STEPS:**
1. Locate "In-App Notifications" toggle
2. Verify toggle is currently ON
3. Click toggle switch
4. Verify toggle switches to OFF
5. Close settings page
6. Perform action that would trigger in-app notification
7. Verify no toast notification appears
8. Return to settings
9. Toggle ON again
10. Perform action again
11. Verify toast notification now appears

**EXPECTED RESULT:**
- Toggle switches state on click
- Setting persists after page navigation
- Notifications disabled when OFF
- Notifications enabled when ON again
- No toggle state issues after multiple toggles

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Toggle keyboard accessible
- State changes announced

---

### Scenario 3.11: Notification Preferences Persist After Refresh

**PREREQUISITES:**
- User disabled email notifications in settings
- Settings page still open

**STEPS:**
1. Disable "Email Notifications" toggle
2. Refresh page (F5)
3. Verify settings page still shows toggle OFF
4. Navigate to different page
5. Navigate back to settings
6. Verify toggle still shows OFF
7. Log out and log back in
8. Navigate to settings
9. Verify toggle still shows OFF

**EXPECTED RESULT:**
- Toggle state persists after page refresh
- Toggle state persists after navigation
- Toggle state persists after logout/login
- Setting stored in database (not just browser)
- User preferences honored across sessions

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Persistent settings user-friendly

---

### Scenario 3.12: Notification Audit Log Shows Sent Notifications

**PREREQUISITES:**
- Admin user access
- Settings page loaded
- Email notifications enabled
- At least 1 email notification sent previously

**STEPS:**
1. Click on "Notification History" or "Audit Log" (if available)
2. Verify page loads with list of notifications
3. Verify each row shows:
   - Notification type (email/in-app)
   - Recipient user
   - Date and time sent
   - Subject/message preview
   - Status (Sent/Failed)
4. Verify most recent notification at top of list
5. Click on specific notification
6. Verify details view shows full message body

**EXPECTED RESULT:**
- Audit log loads with all sent notifications
- Each notification logged accurately
- Timestamps correct
- Status field updated (Sent/Failed/Pending)
- Details view available for inspection
- Admin can view full notification content

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓ (scroll for long lists)
- Tablet ✓

**ACCESSIBILITY:**
- Audit log table headers clear
- Sortable columns labeled
- Pagination controls accessible

---

## 📱 FEATURE 4: MOBILE RESPONSIVENESS (15 scenarios)

### Scenario 4.1: Agenda Page Responsive on All Devices

**PREREQUISITES:**
- Test on 6 devices: iPhone 12, iPhone SE, iPad, Pixel 5, Galaxy S21, Desktop
- Appointments data loaded

**STEPS:**
1. Navigate to Agenda page on iPhone 12 (390px)
2. Verify calendar view or list view displays
3. Verify no horizontal scroll (content fits width)
4. Verify touch targets >44px
5. Verify fonts readable without zoom
6. Scroll through appointments
7. Repeat on each device (adjust width each time)

**EXPECTED RESULT:**
- Content fits within viewport on all devices
- No horizontal scrolling required
- All elements accessible via touch
- Text readable at default size
- Layout adjusts based on screen width

**DEVICE COVERAGE:**
- iPhone 12 ✓ (390×844)
- iPhone SE ✓ (375×667)
- iPad ✓ (1024×1366)
- Pixel 5 ✓ (393×851)
- Galaxy S21 ✓ (360×800)
- Desktop ✓ (1920×1080)

**ACCESSIBILITY:**
- Touch targets > 44×44 px
- Focus indicators visible on all devices

---

### Scenario 4.2: Patients Page Responsive on All Devices

**PREREQUISITES:**
- Patients page accessible
- Test on all 6 devices

**STEPS:**
1. Navigate to Patients page
2. Verify patient list displays
3. On mobile: verify list layout (single column)
4. On desktop: verify table layout works
5. On tablet: verify appropriate layout (may be 2-column)
6. Verify search bar accessible on all devices
7. Verify patient row clickable and full-width on mobile
8. Verify action buttons accessible (edit, delete)

**EXPECTED RESULT:**
- Layout adapts to screen size
- Mobile: single column list
- Desktop: table format
- Tablet: flexible layout (2 columns or responsive table)
- All interactive elements accessible

**DEVICE COVERAGE:**
- All 6 devices ✓

**ACCESSIBILITY:**
- Interactive elements clearly defined
- Selection checkboxes accessible

---

### Scenario 4.3: Patient Detail Page Responsive on Mobile

**PREREQUISITES:**
- Patient selected from list
- Patient detail page opens on mobile device (iPhone 12)

**STEPS:**
1. Click on patient name
2. Verify detail page loads
3. Verify page displays:
   - Patient photo/avatar
   - Patient name, age, phone
   - Treatment history
   - Appointment history
4. Scroll through content
5. Verify all sections readable
6. Verify no horizontal scroll
7. Repeat on other mobile devices

**EXPECTED RESULT:**
- Patient details display in single column
- Content fits within mobile width
- Sections stack vertically
- Images scale appropriately
- No truncation of important information

**DEVICE COVERAGE:**
- iPhone 12 ✓
- iPhone SE ✓
- Pixel 5 ✓
- Galaxy S21 ✓

**ACCESSIBILITY:**
- Heading hierarchy correct
- Images have alt text
- Focus order logical

---

### Scenario 4.4: Appointment Creation Form Fits Mobile

**PREREQUISITES:**
- Mobile device (iPhone 12)
- Navigate to appointment creation page

**STEPS:**
1. Open appointment creation form
2. Verify form fields visible:
   - Patient selection
   - Date picker
   - Time picker
   - Service type
   - Provider selection
   - Notes (optional)
3. Verify form fields accessible without horizontal scroll
4. Verify date picker opens as mobile-appropriate interface (calendar or date input)
5. Verify form submission button accessible and large enough
6. Scroll through entire form
7. Submit form successfully

**EXPECTED RESULT:**
- All form fields fit mobile width
- Form doesn't require horizontal scroll
- Form controls appropriate for mobile (date/time pickers)
- Submit button easily clickable (>44px)
- Form submits successfully from mobile

**DEVICE COVERAGE:**
- iPhone 12 ✓
- Pixel 5 ✓
- Other mobile devices ✓

**ACCESSIBILITY:**
- Form labels clear
- Required fields marked
- Error messages readable
- Form inputs keyboard accessible

---

### Scenario 4.5: Analytics Dashboard Responsive on Mobile

**PREREQUISITES:**
- Mobile device (iPhone 12)
- Navigate to Analytics page

**STEPS:**
1. Load Analytics dashboard on mobile
2. Verify charts display (not side-by-side)
3. Verify charts stack vertically
4. Verify chart height appropriate for mobile
5. Verify filters accessible
6. Verify no chart extends beyond screen width
7. Verify chart interactivity works (tap to see data)
8. Scroll through all charts

**EXPECTED RESULT:**
- Charts stack in single column
- Chart size readable on mobile
- No horizontal scroll
- All four charts accessible
- Filters work on mobile

**DEVICE COVERAGE:**
- Mobile devices ✓
- Tablet: may use 2-column layout ✓

**ACCESSIBILITY:**
- Chart data accessible via alternate format
- Touch-friendly interaction

---

### Scenario 4.6: Settings Page Responsive on Mobile

**PREREQUISITES:**
- Mobile device (iPhone 12)
- Navigate to Settings page

**STEPS:**
1. Load Settings page on mobile
2. Verify settings sections visible
3. Verify toggle switches accessible
4. Verify form inputs fit mobile width
5. Verify dropdown menus work on mobile
6. Verify save button accessible
7. Make setting change and save from mobile
8. Verify setting persists

**EXPECTED RESULT:**
- Settings form displays correctly on mobile
- All toggle switches touch-friendly (>44px)
- Form inputs have appropriate keyboard (date picker for dates, etc.)
- Save/submit button accessible
- Settings save successfully from mobile

**DEVICE COVERAGE:**
- Mobile devices ✓
- Tablet ✓

**ACCESSIBILITY:**
- Form labels readable
- Toggle state announced
- Error messages readable

---

### Scenario 4.7: Navigation Menu Works on Mobile (Hamburger)

**PREREQUISITES:**
- Mobile device (iPhone 12)
- App home page loaded

**STEPS:**
1. Look for hamburger menu icon (three horizontal lines)
2. Verify icon visible on mobile
3. Tap hamburger menu
4. Verify menu opens (slide from left or modal)
5. Verify all menu items visible:
   - Agenda
   - Patients
   - Financial
   - Settings
   - Analytics
   - etc.
6. Click menu item (e.g., "Patients")
7. Verify menu closes
8. Verify page navigates to selected item
9. Tap hamburger again
10. Verify menu reopens

**EXPECTED RESULT:**
- Hamburger menu visible on mobile
- Menu opens smoothly
- All navigation items present
- Click item navigates correctly
- Menu closes after navigation
- Menu can be reopened

**DEVICE COVERAGE:**
- Mobile devices ✓
- Tablet: may not show hamburger (wide enough for top nav)

**ACCESSIBILITY:**
- Hamburger button labeled
- Menu has role="navigation"
- Menu can close with Escape key
- Focus management correct

---

### Scenario 4.8: Touch Interactions Work (Buttons, Links)

**PREREQUISITES:**
- Mobile device (iPhone 12 or Pixel 5)
- App page loaded

**STEPS:**
1. Identify touch targets (buttons, links, form inputs)
2. Tap on button (e.g., "Create Appointment")
3. Verify tap response <300ms
4. Verify action triggers (page navigates, form opens, etc.)
5. Tap on link
6. Verify link navigation works
7. Tap on form input
8. Verify keyboard appears
9. Tap outside keyboard
10. Verify keyboard dismisses

**EXPECTED RESULT:**
- Touch response immediate (<300ms)
- All buttons clickable
- Links navigate correctly
- Form inputs activate keyboard
- Keyboard management works
- Double-tap zoom works (if enabled)

**DEVICE COVERAGE:**
- Mobile devices ✓
- Tablet ✓

**ACCESSIBILITY:**
- Touch targets > 44×44 px minimum
- Disabled buttons not tappable
- Form validation after input

---

### Scenario 4.9: Keyboard Input Works on Mobile (Patient Search)

**PREREQUISITES:**
- Mobile device (iPhone 12)
- Patients page loaded
- Search field visible

**STEPS:**
1. Tap on patient search field
2. Verify keyboard appears (not blocks entire screen)
3. Type patient name (e.g., "João")
4. Verify text input works correctly
5. Verify special characters appear (ã, ç, etc.)
6. Verify search results filter as typing
7. Verify delete/backspace works
8. Verify keyboard dismisses when tapping elsewhere

**EXPECTED RESULT:**
- Keyboard opens appropriately
- Text input works correctly
- Special characters supported (Portuguese)
- Search filters work while typing
- Keyboard not blocking search results
- Keyboard dismisses smoothly

**DEVICE COVERAGE:**
- Mobile devices ✓
- Tablet ✓

**ACCESSIBILITY:**
- Keyboard doesn't block critical content
- Text input announced
- Search results updated and announced

---

### Scenario 4.10: Modals Close on Mobile (Swipe Down)

**PREREQUISITES:**
- Mobile device (iPhone 12)
- Modal open (e.g., appointment details modal)

**STEPS:**
1. Open modal by clicking element
2. Verify modal displays full screen or overlay
3. Swipe down from top of modal
4. Verify modal closes on swipe
5. Alternatively, verify close button (X) at top of modal
6. Tap close button
7. Verify modal closes
8. Verify page below modal is visible

**EXPECTED RESULT:**
- Modal opens when triggered
- Swipe-down gesture closes modal (if implemented)
- Close button closes modal
- Modal closes smoothly
- Focus returns to element that opened modal

**DEVICE COVERAGE:**
- Mobile devices ✓
- Tablet: may not implement swipe-down on iPad

**ACCESSIBILITY:**
- Close button keyboard accessible
- Modal has proper aria-modal attribute
- Focus trapped in modal (not escape to background)

---

### Scenario 4.11: Images Scale Correctly on Mobile

**PREREQUISITES:**
- Mobile device (iPhone 12)
- Page with images (patient photo, clinic logo, etc.)

**STEPS:**
1. Navigate to page with images
2. Verify image displays without horizontal scroll
3. Verify image quality readable
4. Tap image to zoom (if available)
5. Verify image zoom works
6. Verify zoom closes by tapping elsewhere
7. Verify images scale on rotation (portrait ↔ landscape)

**EXPECTED RESULT:**
- Images fit within mobile width
- Image quality maintained (not pixelated)
- Images responsive (resize with screen)
- Zoom functionality works (if implemented)
- Images scale on orientation change

**DEVICE COVERAGE:**
- Mobile devices ✓
- Tablet ✓

**ACCESSIBILITY:**
- Images have alt text
- Alt text describes content
- Images not essential for page function

---

### Scenario 4.12: Tables Have Horizontal Scroll on Mobile

**PREREQUISITES:**
- Mobile device (iPhone 12)
- Page with data table (appointments, financial, etc.)

**STEPS:**
1. Navigate to page with table
2. Verify table displays on mobile (may be full-width)
3. If table wider than screen:
   - Verify horizontal scroll bar appears (or swipe-to-scroll)
   - Swipe table left/right
   - Verify table scrolls smoothly
   - Verify table content readable as you scroll
4. If table converted to card/list view:
   - Verify list view displays all data
   - Verify data grouped logically

**EXPECTED RESULT:**
- Tables accessible on mobile (via scroll or converted to list)
- Horizontal scroll smooth and intuitive
- No data truncation (either scroll or convert to list)
- User can access all table columns
- Performance acceptable (<200ms scroll)

**DEVICE COVERAGE:**
- Mobile devices ✓
- Tablet: may show table as-is if wide enough ✓

**ACCESSIBILITY:**
- Table headers sticky (stay visible when scrolling)
- Row headers identifiable

---

### Scenario 4.13: Forms Have Proper Spacing on Mobile

**PREREQUISITES:**
- Mobile device (iPhone 12)
- Page with form (appointment, patient, settings)

**STEPS:**
1. Navigate to form page
2. Verify form fields have adequate spacing (not cramped)
3. Verify form field height >44px (minimum touch target)
4. Verify labels are above fields (not inline)
5. Verify input fields have good padding (easy to tap)
6. Verify validation error messages visible below field
7. Verify form doesn't require zooming to interact
8. Scroll through form
9. Verify submit button has adequate spacing

**EXPECTED RESULT:**
- Form fields have vertical spacing (gap between fields)
- Form field height > 44px
- Labels visible above/beside input
- Padding within fields adequate
- Error messages don't overlap fields
- Form usable without zoom

**DEVICE COVERAGE:**
- Mobile devices ✓
- Tablet ✓

**ACCESSIBILITY:**
- Form labels associated with inputs
- Required field indicators clear
- Error messages linked to fields

---

### Scenario 4.14: No Horizontal Scrollbar on Any Device

**PREREQUISITES:**
- Test on all 6 devices
- Navigate through all main pages

**STEPS:**
1. Navigate to each main page:
   - Agenda
   - Patients
   - Financial
   - Settings
   - Analytics
2. For each page and device:
   - Check for horizontal scrollbar
   - Verify no hidden content requiring scroll
3. Note any page/device combination with horizontal scroll

**EXPECTED RESULT:**
- Zero pages with horizontal scrollbar on any device
- All content fits within viewport width
- Text wraps appropriately
- No overflow content
- Images and elements scale appropriately

**DEVICE COVERAGE:**
- All 6 devices ✓

**ACCESSIBILITY:**
- Mobile users don't struggle with horizontal scroll
- Desktop users have full experience without scroll

---

### Scenario 4.15: Performance Acceptable on 3G Network

**PREREQUISITES:**
- Mobile device (iPhone 12 or Pixel 5)
- Browser DevTools available
- Network throttling available

**STEPS:**
1. Open browser DevTools
2. Open Network tab
3. Enable network throttling (set to "3G")
4. Navigate to main pages (Agenda, Patients, Analytics)
5. Measure load times
6. Verify:
   - Page starts rendering <3 seconds
   - Page fully interactive <5 seconds
   - No timeout errors
   - Content displays progressively (not blank)
7. Interact with page (click buttons, filters)
8. Verify interactions responsive (<1 second)

**EXPECTED RESULT:**
- Page load <3s on 3G (First Contentful Paint)
- Page interactive <5s on 3G
- No network timeout errors
- Progressive content loading (shows something early)
- App usable even on slow network
- No data loss or corruption

**DEVICE COVERAGE:**
- Mobile devices (emulated 3G) ✓
- Test with actual 3G if possible

**ACCESSIBILITY:**
- Loading indicators present
- Partial content accessible
- User knows page is loading

---

## 🎨 FEATURE 5: USER SETTINGS (10 scenarios)

### Scenario 5.1: Settings Page Loads with Current User Preferences

**PREREQUISITES:**
- User logged in
- User has previously set preferences (language: EN, theme: dark)

**STEPS:**
1. Click on user profile icon or Settings menu
2. Navigate to Settings page
3. Verify page loads completely
4. Verify title: "Settings" or "User Preferences"
5. Verify Language field shows current selection: "English"
6. Verify Theme field shows current selection: "Dark Mode"
7. Verify all other preferences shown (notifications, timezone)
8. Verify no default values overwriting user preferences

**EXPECTED RESULT:**
- Settings page loads <1 second
- All user preferences displayed accurately
- Current selections highlighted/selected
- No reset to defaults
- Page layout appropriate for all fields

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Settings title clear
- Form labels visible
- Current values announced by screen reader

---

### Scenario 5.2: Language Setting Displays Current Selection

**PREREQUISITES:**
- Settings page loaded
- User language is currently "English"

**STEPS:**
1. Locate Language setting field
2. Verify dropdown shows "English" as selected
3. Verify field is labeled clearly: "Language" or "Display Language"
4. Verify no other language marked as selected
5. Click dropdown to view all options
6. Verify "English" has checkmark or highlight

**EXPECTED RESULT:**
- Language field shows current selection
- Selection is accurate
- Visual indication of current choice (checkmark, highlight, etc.)
- Dropdown properly labeled
- No ambiguity about current setting

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- Field label clear
- Selected option announced
- Dropdown keyboard accessible

---

### Scenario 5.3: Changing Language Updates App Immediately

**PREREQUISITES:**
- Settings page loaded
- Language currently "Portuguese (Brazil)"

**STEPS:**
1. Click Language dropdown
2. Select "English"
3. Verify UI language changes immediately:
   - Settings page title changes to English
   - All labels change to English
   - Navigation menu changes to English
4. Verify app entire UI updated (not just settings page)
5. Navigate to another page
6. Verify page also in English
7. Return to Settings
8. Verify Language field still shows "English"

**EXPECTED RESULT:**
- Language changes immediately (<500ms)
- All UI text updates
- Change applies across entire app
- Change persists when navigating
- No page refresh needed
- Language selector correctly updated

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- Language change announced
- ARIA labels updated

---

### Scenario 5.4: Notification Email Preference Can Be Toggled

**PREREQUISITES:**
- Settings page loaded
- Notification settings visible
- Email notifications currently enabled

**STEPS:**
1. Locate "Email Notifications" toggle
2. Verify toggle is currently ON
3. Click toggle
4. Verify toggle switches to OFF
5. Verify visual feedback (color change, text update)
6. Wait for save (auto-save or explicit save button)
7. Close settings page
8. Open settings again
9. Verify toggle still shows OFF

**EXPECTED RESULT:**
- Toggle switches state on click
- Visual feedback clear
- Setting persists after close/reopen
- Setting saved to database (not just browser)
- Toggle can switch back and forth

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices (ensure 44px touch target)
- Tablet ✓

**ACCESSIBILITY:**
- Toggle keyboard accessible
- Toggle state announced (ON/OFF)
- State change announced when toggled

---

### Scenario 5.5: Notification In-App Preference Can Be Toggled

**PREREQUISITES:**
- Settings page loaded
- In-app notification settings visible
- In-app notifications currently enabled

**STEPS:**
1. Locate "In-App Notifications" toggle
2. Verify toggle is currently ON
3. Click toggle
4. Verify toggle switches to OFF
5. Close settings
6. Perform action that would trigger notification (create appointment)
7. Verify no toast notification appears
8. Open settings again
9. Toggle "In-App Notifications" back ON
10. Perform action again
11. Verify toast notification appears

**EXPECTED RESULT:**
- Toggle switches state correctly
- Setting persists across sessions
- Notifications disabled when toggled OFF
- Notifications enabled when toggled ON
- Preference honored by notification system

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- Toggle state changes announced

---

### Scenario 5.6: Theme Selection (Light/Dark) Works

**PREREQUISITES:**
- Settings page loaded
- Theme selector visible

**STEPS:**
1. Locate Theme setting
2. Verify current selection (Light or Dark)
3. Click on opposite theme option
4. Verify entire app changes to new theme:
   - Background color changes
   - Text color changes
   - Component colors update
5. Verify theme applies to:
   - Sidebar/navigation
   - Main content area
   - Modals/dialogs
   - Form elements
6. Navigate to another page
7. Verify theme persists

**EXPECTED RESULT:**
- Theme selector shows current choice
- Theme changes immediately on selection
- All app components update colors
- Theme applies site-wide
- No white flash or loading delay
- Theme persists across navigation

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Theme options clearly labeled
- High contrast maintained in both themes
- Color not only method of distinction
- ARIA attributes updated if theme affects state

---

### Scenario 5.7: Theme Preference Persists on Refresh

**PREREQUISITES:**
- User selected Dark theme
- Settings page or any app page open

**STEPS:**
1. User is viewing dark theme
2. Refresh page (F5)
3. Verify dark theme still applied (no white flash)
4. Navigate to different page
5. Verify dark theme still applied
6. Close browser completely
7. Reopen browser
8. Navigate to app
9. Login if needed
10. Verify dark theme still applied

**EXPECTED RESULT:**
- Theme persists after refresh
- Theme persists after navigation
- Theme persists after browser close/reopen
- Theme stored in localStorage and database
- No flashing of wrong theme on load

**DEVICE COVERAGE:**
- Desktop ✓ All browsers
- Mobile ✓ Both devices
- Tablet ✓

**ACCESSIBILITY:**
- Persistent theme user-friendly
- No flashing content

---

### Scenario 5.8: Timezone Selection Works

**PREREQUISITES:**
- Settings page loaded
- Timezone selector visible

**STEPS:**
1. Locate Timezone setting
2. Verify current timezone displayed (e.g., "America/Sao_Paulo")
3. Click timezone dropdown
4. Search for different timezone (e.g., "America/New_York")
5. Select new timezone
6. Verify selection saved
7. Navigate to Appointments page
8. Verify appointment times adjusted to new timezone
9. Note: if appointment shows "2:00 PM" in São Paulo, it should show "1:00 PM" in New York

**EXPECTED RESULT:**
- Timezone dropdown lists all IANA timezones
- Timezone selection works
- Selected timezone saved
- Times throughout app adjust to timezone
- Timezone stored for user

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- Timezone search/filter works
- Current timezone announced
- Selected timezone confirmed

---

### Scenario 5.9: Timezone Affects Date/Time Display

**PREREQUISITES:**
- User timezone set to "America/Sao_Paulo"
- Appointment at "14:00 Brazil time"

**STEPS:**
1. Note timezone in settings
2. Navigate to Agenda/Appointments page
3. View appointment time (should show 14:00)
4. Return to Settings
5. Change timezone to "America/New_York" (3 hours behind)
6. Return to Appointments page
7. Verify appointment now shows "11:00" (14:00 - 3 hours)
8. All other appointments also adjusted
9. Financial reports also show times in new timezone

**EXPECTED RESULT:**
- Appointment times adjust based on timezone
- Calculation correct (accounts for daylight saving if applicable)
- All date/time fields reflect timezone
- Historical appointments adjusted appropriately
- Timezone difference applied correctly

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- Timezone changes are transparent to user
- Appointments still make sense in user's timezone

---

### Scenario 5.10: All Settings Saved Correctly to Database

**PREREQUISITES:**
- User on Settings page
- Multiple settings available to change

**STEPS:**
1. Change Language to "Español"
2. Change Theme to "Dark"
3. Toggle Email Notifications OFF
4. Change Timezone to "Europe/London"
5. Wait for save (or click Save button if exists)
6. Close settings page
7. Logout from app
8. Login with same credentials
9. Navigate to Settings
10. Verify all changes persisted:
    - Language: Español
    - Theme: Dark
    - Email: OFF
    - Timezone: Europe/London

**EXPECTED RESULT:**
- All settings save to database
- Settings persist across logout/login
- No settings reverted to defaults
- Settings available on subsequent login
- Settings isolated per user (other users not affected)

**DEVICE COVERAGE:**
- Desktop ✓
- Mobile ✓
- Tablet ✓

**ACCESSIBILITY:**
- User preferences respected
- Persistent settings provide good UX

---

## 📋 CROSS-FEATURE INTEGRATION SCENARIOS (6 scenarios)

### Scenario 6.1: Language Setting Affects i18n Across All Features

**Test:** Change language to FR, verify all features (analytics, notifications, settings, mobile) display in French

### Scenario 6.2: Timezone Affects Analytics Dashboard Date Range

**Test:** Change timezone, verify analytics date ranges correctly offset to user's timezone

### Scenario 6.3: Notification Preferences Respected Across Settings

**Test:** Disable email notifications in settings, verify no emails sent for appointments, verify in-app toasts still work if enabled

### Scenario 6.4: Mobile Responsiveness Works with Dark Theme

**Test:** Enable dark theme on mobile, verify all pages readable and styled correctly on all 6 devices in dark mode

### Scenario 6.5: Settings Changes Persist Across Feature Changes

**Test:** Change multiple settings, use features that depend on those settings, verify settings maintain integrity

### Scenario 6.6: Analytics Dashboard Respects User Locale Preferences

**Test:** Set locale to ES, verify analytics charts use Spanish number/currency formatting, date formats, etc.

---

## 📊 TEST CASE SUMMARY

| Feature | E2E Scenarios | Covered |
|---------|---------------|---------|
| Analytics Dashboard | 12 | 100% |
| i18n System | 15 | 100% |
| Notification System | 12 | 100% |
| Mobile Responsiveness | 15 | 100% |
| User Settings | 10 | 100% |
| Cross-Feature | 6 | 100% |
| **TOTAL** | **64** | **100%** |

---

**Document Version:** 1.0  
**Last Updated:** June 7, 2026  
**Framework:** Playwright  
**Total Scenarios:** 64

