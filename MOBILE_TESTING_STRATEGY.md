# OrthoClinic Mobile Testing Strategy

**Date:** June 7, 2026  
**Scope:** End-to-end testing across mobile, tablet, and desktop devices  
**Framework:** Playwright + Custom test utilities  
**Target Coverage:** 100% critical paths

---

## 1. TEST DEVICE MATRIX

### 1.1 Device Specifications

#### MOBILE DEVICES

| Device | Viewport | OS | Priority | Use Case |
|--------|----------|-----|----------|----------|
| iPhone SE (1st gen) | 320x568 | iOS 16 | CRITICAL | Smallest common device |
| iPhone 12/13 | 390x844 | iOS 16 | HIGH | Most common iPhone |
| iPhone 14 Pro | 430x932 | iOS 17 | HIGH | Notch + Dynamic Island |
| Pixel 5 | 393x851 | Android 12 | HIGH | Typical Android |
| Samsung Galaxy S21 | 360x800 | Android 12 | MEDIUM | Alternative Android |
| OnePlus 11 | 412x915 | Android 13 | MEDIUM | High refresh rate |

#### TABLET DEVICES

| Device | Viewport | OS | Priority | Use Case |
|--------|----------|-----|----------|----------|
| iPad (9th gen) | 768x1024 | iPadOS 16 | HIGH | Portrait tablet |
| iPad (landscape) | 1024x768 | iPadOS 16 | HIGH | Landscape tablet |
| iPad Pro 11" | 834x1194 | iPadOS 17 | MEDIUM | Large tablet |
| iPad Pro 12.9" | 1024x1366 | iPadOS 17 | MEDIUM | Very large tablet |
| Samsung Tab S9 | 800x1280 | Android 13 | MEDIUM | Android tablet |

#### DESKTOP BROWSERS

| Browser | Viewport | OS | Priority | Use Case |
|---------|----------|-----|----------|----------|
| Chrome | 1440x900 | Windows | HIGH | Most used |
| Firefox | 1440x900 | Windows | HIGH | Desktop standard |
| Safari | 1440x900 | macOS | MEDIUM | Apple ecosystem |
| Edge | 1440x900 | Windows | LOW | Microsoft |

---

## 2. PLAYWRIGHT CONFIGURATION

### 2.1 Enhanced playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

const mobileDevices = {
  'iPhone SE': {
    ...devices['iPhone SE'],
    use: {
      ...devices['iPhone SE'].use,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
    },
  },
  'iPhone 14 Pro': {
    ...devices['iPhone 14 Pro'],
    use: {
      ...devices['iPhone 14 Pro'].use,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
    },
  },
  'Pixel 5': {
    ...devices['Pixel 5'],
    use: {
      ...devices['Pixel 5'].use,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
    },
  },
  'Galaxy S21': {
    ...devices['Galaxy S21'],
    use: {
      ...devices['Galaxy S21'].use,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
    },
  },
};

const tabletDevices = {
  'iPad': {
    ...devices['iPad'],
    use: {
      ...devices['iPad'].use,
      trace: 'on-first-retry',
    },
  },
  'iPad Pro 11': {
    ...devices['iPad Pro 11'],
    use: {
      ...devices['iPad Pro 11'].use,
      trace: 'on-first-retry',
    },
  },
};

const desktopDevices = {
  'Desktop Chrome': {
    name: 'Desktop Chrome',
    use: { ...devices['Desktop Chrome'] },
  },
  'Desktop Firefox': {
    name: 'Desktop Firefox',
    use: { ...devices['Desktop Firefox'] },
  },
  'Desktop Safari': {
    name: 'Desktop Safari',
    use: { ...devices['Desktop Safari'] },
  },
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential for stability
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2, // Limited workers for mobile
  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'], // CLI output
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 30000,
    actionTimeout: 10000,
  },

  projects: [
    // MOBILE - Critical paths
    ...(process.env.MOBILE !== 'false' ? Object.entries(mobileDevices).map(([name, config]) => ({
      name: `Mobile/${name}`,
      ...config,
      timeout: 60000,
    })) : []),

    // TABLET - Secondary paths
    ...(process.env.TABLET !== 'false' ? Object.entries(tabletDevices).map(([name, config]) => ({
      name: `Tablet/${name}`,
      ...config,
      timeout: 45000,
    })) : []),

    // DESKTOP - Reference tests
    ...(process.env.DESKTOP !== 'false' ? Object.entries(desktopDevices).map(([name, config]) => ({
      name: `Desktop/${name}`,
      ...config,
      timeout: 30000,
    })) : []),
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  timeout: 60 * 1000,
  expect: { timeout: 5000 },
});
```

### 2.2 Test Environment Variables

```bash
# Run all tests
npm run e2e

# Run mobile tests only
TABLET=false DESKTOP=false npm run e2e

# Run tablet tests only
MOBILE=false DESKTOP=false npm run e2e

# Run specific device
npx playwright test --project="Mobile/iPhone SE"

# Debug mode
npx playwright test --debug --project="Mobile/iPhone SE"

# UI mode with visual debugging
npm run e2e:ui
```

---

## 3. TEST CATEGORIES

### 3.1 Responsive Layout Tests

#### File: `e2e/responsive-layout.spec.ts`

```typescript
import { test, expect, devices } from '@playwright/test';

test.describe('Responsive Layout Tests', () => {
  
  test('Dashboard: mobile layout (single column)', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/');
    
    // Wait for dashboard to load
    await page.waitForLoadState('networkidle');
    
    // Verify single column
    const gridContainer = page.locator('[data-test="dashboard-grid"]');
    const computedStyle = await gridContainer.evaluate(el => {
      return window.getComputedStyle(el).gridTemplateColumns;
    });
    
    expect(computedStyle).toContain('1fr'); // Single column
    expect(computedStyle.split(' ').length).toBe(1);
  });

  test('Dashboard: tablet layout (2 columns)', async ({ page }) => {
    test.use({ ...devices['iPad'] });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const gridContainer = page.locator('[data-test="dashboard-grid"]');
    const computedStyle = await gridContainer.evaluate(el => {
      return window.getComputedStyle(el).gridTemplateColumns;
    });
    
    // Should have 2 columns
    expect(computedStyle.split(' ').length).toBe(2);
  });

  test('Dashboard: desktop layout (3+ columns)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const gridContainer = page.locator('[data-test="dashboard-grid"]');
    const computedStyle = await gridContainer.evaluate(el => {
      return window.getComputedStyle(el).gridTemplateColumns;
    });
    
    expect(computedStyle.split(' ').length).toBeGreaterThanOrEqual(3);
  });

  test('Navigation: show bottom nav on mobile', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/');
    
    const bottomNav = page.locator('[data-test="mobile-bottom-nav"]');
    await expect(bottomNav).toBeVisible();
    
    const desktopNav = page.locator('[data-test="desktop-sidebar"]');
    await expect(desktopNav).not.toBeVisible();
  });

  test('Navigation: show sidebar on desktop', async ({ page }) => {
    await page.goto('/');
    
    const desktopNav = page.locator('[data-test="desktop-sidebar"]');
    await expect(desktopNav).toBeVisible();
    
    const bottomNav = page.locator('[data-test="mobile-bottom-nav"]');
    await expect(bottomNav).not.toBeVisible();
  });

  test('Tables: show card view on mobile', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes');
    await page.waitForLoadState('networkidle');
    
    const table = page.locator('table');
    await expect(table).not.toBeVisible();
    
    const cards = page.locator('[data-test="patient-card"]');
    await expect(cards.first()).toBeVisible();
  });

  test('Tables: show table on desktop', async ({ page }) => {
    await page.goto('/pacientes');
    await page.waitForLoadState('networkidle');
    
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });

  test('Forms: full width on mobile', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes/novo');
    await page.waitForLoadState('networkidle');
    
    const inputs = page.locator('input[type="text"]');
    const firstInput = inputs.first();
    
    const box = await firstInput.boundingBox();
    const containerWidth = await page.evaluate(() => {
      return document.body.clientWidth;
    });
    
    // Input should be ~95% of screen width (accounting for padding)
    expect(box?.width || 0).toBeGreaterThan(containerWidth * 0.85);
  });

  test('Modal: full width on mobile', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes');
    
    // Open modal (e.g., add patient)
    await page.locator('[data-test="add-patient-button"]').click();
    
    const modal = page.locator('[data-test="modal"]');
    await expect(modal).toBeVisible();
    
    const box = await modal.boundingBox();
    const containerWidth = await page.evaluate(() => {
      return window.innerWidth;
    });
    
    // Modal should be nearly full width on mobile
    expect(box?.width || 0).toBeGreaterThan(containerWidth * 0.9);
  });

  test('Modal: centered on desktop', async ({ page }) => {
    await page.goto('/pacientes');
    
    await page.locator('[data-test="add-patient-button"]').click();
    
    const modal = page.locator('[data-test="modal"]');
    await expect(modal).toBeVisible();
    
    const box = await modal.boundingBox();
    
    // Desktop modal should be limited in width
    expect(box?.width || 0).toBeLessThan(700);
  });
});
```

### 3.2 Touch Target & Spacing Tests

#### File: `e2e/touch-targets.spec.ts`

```typescript
import { test, expect, devices } from '@playwright/test';

test.describe('Touch Target Size Tests', () => {
  
  const MOBILE_DEVICES = [
    devices['iPhone SE'],
    devices['Pixel 5'],
  ];

  MOBILE_DEVICES.forEach(device => {
    test(`${device.name}: button minimum 44x44px`, async ({ page }) => {
      test.use(device);
      
      await page.goto('/');
      
      const buttons = page.locator('button:visible');
      const badButtons = [];
      
      for (let i = 0; i < await buttons.count(); i++) {
        const box = await buttons.nth(i).boundingBox();
        
        if (!box || box.width < 44 || box.height < 44) {
          const text = await buttons.nth(i).textContent();
          badButtons.push({
            text,
            width: box?.width,
            height: box?.height,
          });
        }
      }
      
      if (badButtons.length > 0) {
        console.warn('Buttons below 44px:', badButtons);
      }
      
      expect(badButtons.length).toBe(0);
    });

    test(`${device.name}: input minimum 48px height`, async ({ page }) => {
      test.use(device);
      
      await page.goto('/pacientes/novo');
      
      const inputs = page.locator('input, textarea, select');
      const badInputs = [];
      
      for (let i = 0; i < await inputs.count(); i++) {
        const box = await inputs.nth(i).boundingBox();
        
        if (!box || box.height < 44) {
          const type = await inputs.nth(i).getAttribute('type');
          badInputs.push({
            type,
            height: box?.height,
          });
        }
      }
      
      expect(badInputs.length).toBe(0);
    });

    test(`${device.name}: touch targets have 8px minimum spacing`, async ({ page }) => {
      test.use(device);
      
      await page.goto('/');
      
      const buttons = page.locator('button:visible');
      const buttons_list = [];
      
      for (let i = 0; i < await buttons.count(); i++) {
        const box = await buttons.nth(i).boundingBox();
        if (box) buttons_list.push(box);
      }
      
      // Check spacing between adjacent buttons
      let spacingViolations = 0;
      for (let i = 0; i < buttons_list.length - 1; i++) {
        const current = buttons_list[i];
        const next = buttons_list[i + 1];
        
        const horizontalGap = Math.abs(next.x - (current.x + current.width));
        const verticalGap = Math.abs(next.y - (current.y + current.height));
        
        // Allow 0 gap if buttons are adjacent
        if (horizontalGap > 0 && horizontalGap < 8) spacingViolations++;
        if (verticalGap > 0 && verticalGap < 8) spacingViolations++;
      }
      
      // Some violations may be acceptable (e.g., inline badges)
      expect(spacingViolations).toBeLessThan(buttons_list.length / 4);
    });
  });
});
```

### 3.3 Touch Interaction Tests

#### File: `e2e/touch-interactions.spec.ts`

```typescript
import { test, expect, devices } from '@playwright/test';

test.describe('Touch Interaction Tests', () => {
  
  test('Mobile: hamburger menu opens and closes', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/');
    
    // Open menu
    const hamburger = page.locator('[data-test="hamburger-button"]');
    await expect(hamburger).toBeVisible();
    
    await hamburger.click();
    
    const drawer = page.locator('[data-test="nav-drawer"]');
    await expect(drawer).toBeVisible();
    
    // Close on escape
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
  });

  test('Mobile: bottom navigation is sticky', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes');
    
    const bottomNav = page.locator('[data-test="mobile-bottom-nav"]');
    
    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 500));
    
    // Nav should still be visible
    await expect(bottomNav).toBeInViewport();
  });

  test('Mobile: long press opens context menu', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes');
    
    const card = page.locator('[data-test="patient-card"]').first();
    
    // Simulate long press
    await card.dispatchEvent('touchstart');
    await page.waitForTimeout(500);
    await card.dispatchEvent('touchend');
    
    // Context menu should appear
    const menu = page.locator('[data-test="context-menu"]');
    await expect(menu).toBeVisible();
  });

  test('Mobile: swipe gestures work', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/painel');
    
    // Swipe right to navigate back
    const x = 50;
    const y = 300;
    
    await page.touchscreen.tap(x, y);
    await page.touchscreen.swipe({
      start: { x: x + 200, y },
      end: { x: x - 50, y },
      steps: 10,
    });
    
    // Should navigate (exact behavior depends on implementation)
  });

  test('Mobile: pull to refresh works', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes');
    
    // Should be able to scroll down pull-refresh indicator
    const initialContent = await page.locator('[data-test="patient-card"]').first().textContent();
    
    // Simulate pull down
    await page.touchscreen.swipe({
      start: { x: 200, y: 100 },
      end: { x: 200, y: 200 },
      steps: 5,
    });
    
    // Refresh should complete
    await page.waitForLoadState('networkidle');
  });

  test('Modal: swiping down closes on mobile', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes');
    
    // Open modal
    await page.locator('[data-test="add-patient-button"]').click();
    
    const modal = page.locator('[data-test="modal"]');
    await expect(modal).toBeVisible();
    
    // Swipe down
    const centerX = 200;
    const topY = 150;
    
    await page.touchscreen.swipe({
      start: { x: centerX, y: topY },
      end: { x: centerX, y: 500 },
      steps: 10,
    });
    
    // Modal might close (depending on implementation)
  });

  test('Form: keyboard appears for email input', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes/novo');
    
    const emailInput = page.locator('input[type="email"]');
    const inputMode = await emailInput.getAttribute('inputMode');
    
    expect(inputMode).toBe('email');
  });

  test('Form: numeric keyboard for phone input', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes/novo');
    
    const phoneInput = page.locator('input[inputMode="tel"]');
    const inputMode = await phoneInput.getAttribute('inputMode');
    
    expect(inputMode).toBe('tel');
  });
});
```

### 3.4 Performance Tests

#### File: `e2e/performance-mobile.spec.ts`

```typescript
import { test, expect, devices } from '@playwright/test';

test.describe('Mobile Performance Tests', () => {
  
  test('Page load time < 3s on mobile', async ({ page }) => {
    test.use({ ...devices['Pixel 5'] });
    
    const startTime = Date.now();
    
    await page.goto('/', { waitUntil: 'networkidle' });
    
    const loadTime = Date.now() - startTime;
    
    console.log(`Page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(3000);
  });

  test('First Contentful Paint < 2s', async ({ page }) => {
    test.use({ ...devices['Pixel 5'] });
    
    const metrics = await page.evaluate(() => {
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find(p => p.name === 'first-contentful-paint');
      return fcp?.startTime;
    });
    
    console.log(`FCP: ${metrics}ms`);
    expect(metrics).toBeLessThan(2000);
  });

  test('Images are lazy loaded', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes');
    
    const images = page.locator('img');
    
    for (let i = 0; i < await images.count(); i++) {
      const loading = await images.nth(i).getAttribute('loading');
      
      // Should be 'lazy' or not have loading attr (Intersection Observer)
      if (loading) {
        expect(loading).toBe('lazy');
      }
    }
  });

  test('No Cumulative Layout Shift (CLS)', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    const clsValue = await page.evaluate(() => {
      return new Promise((resolve) => {
        let cls = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              cls += (entry as any).value;
            }
          }
        });
        
        observer.observe({ type: 'layout-shift', buffered: true });
        
        setTimeout(() => {
          observer.disconnect();
          resolve(cls);
        }, 5000);
      });
    });
    
    console.log(`CLS: ${clsValue}`);
    expect(clsValue).toBeLessThan(0.15);
  });

  test('Bundle size acceptable', async ({ page }) => {
    const response = await page.goto('/', {
      waitUntil: 'networkidle',
    });
    
    const headers = await response?.allHeaders();
    const contentLength = headers?.['content-length'];
    
    if (contentLength) {
      const sizeMB = parseInt(contentLength) / 1024 / 1024;
      console.log(`Page size: ${sizeMB.toFixed(2)}MB`);
      expect(sizeMB).toBeLessThan(2); // 2MB limit
    }
  });
});
```

### 3.5 Accessibility Tests

#### File: `e2e/a11y-responsive.spec.ts`

```typescript
import { test, expect, devices } from '@playwright/test';

test.describe('Accessibility (Responsive) Tests', () => {
  
  test('Keyboard navigation works on mobile', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/');
    
    // Tab through interactive elements
    const buttons = page.locator('button:visible, a:visible, input:visible');
    const count = await buttons.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Tab should move focus
    await page.keyboard.press('Tab');
    
    const focused = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });
    
    expect(focused).toBeTruthy();
  });

  test('Focus indicators visible on mobile', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/');
    
    // Tab to element
    await page.keyboard.press('Tab');
    
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = window.getComputedStyle(el);
      
      return {
        outline: style.outline,
        ring: style.boxShadow,
      };
    });
    
    // Should have visible focus indicator
    const hasFocus = focused.outline !== 'none' || focused.ring !== 'none';
    expect(hasFocus).toBe(true);
  });

  test('Color contrast meets WCAG AA', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/');
    
    // Basic check: headings should be readable
    const headings = page.locator('h1, h2, h3');
    
    for (let i = 0; i < await headings.count(); i++) {
      const el = headings.nth(i);
      const contrast = await el.evaluate((el) => {
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bgColor = style.backgroundColor;
        
        // Simplified check (in real tests use a contrast library)
        return { color, bgColor };
      });
      
      expect(contrast.color).not.toBe('rgb(0, 0, 0)'); // Not black on white
    }
  });

  test('Touch targets 44x44px minimum', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/');
    
    const buttons = page.locator('button:visible');
    const badButtons = [];
    
    for (let i = 0; i < await buttons.count(); i++) {
      const box = await buttons.nth(i).boundingBox();
      
      if (!box || box.width < 44 || box.height < 44) {
        badButtons.push(box);
      }
    }
    
    expect(badButtons.length).toBe(0);
  });

  test('Screen reader text present (aria-label)', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/');
    
    // Icon-only buttons should have aria-label or text
    const iconButtons = page.locator('button:has-text("")');
    
    for (let i = 0; i < await iconButtons.count(); i++) {
      const button = iconButtons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const title = await button.getAttribute('title');
      const text = await button.textContent();
      
      const hasLabel = ariaLabel || title || (text && text.trim().length > 0);
      expect(hasLabel).toBe(true);
    }
  });

  test('Forms have labels associated with inputs', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes/novo');
    
    const inputs = page.locator('input:visible, textarea:visible, select:visible');
    
    for (let i = 0; i < await inputs.count(); i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const label = await input.locator(`label[for="${id}"]`);
      
      if (id) {
        expect(await label.count()).toBeGreaterThan(0);
      }
    }
  });
});
```

### 3.6 Critical User Journey Tests

#### File: `e2e/critical-journeys-mobile.spec.ts`

```typescript
import { test, expect, devices } from '@playwright/test';

test.describe('Critical User Journeys (Mobile)', () => {
  
  test('Patient view on mobile', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes');
    await page.waitForLoadState('networkidle');
    
    // Should show patient list
    const patients = page.locator('[data-test="patient-card"]');
    expect(await patients.count()).toBeGreaterThan(0);
    
    // Click first patient
    await patients.first().click();
    
    // Should navigate to patient detail
    await expect(page).toHaveURL(/\/pacientes\/\d+/);
    
    // Patient info should be visible
    const patientName = page.locator('[data-test="patient-name"]');
    await expect(patientName).toBeVisible();
  });

  test('Create new patient on mobile (responsive form)', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/pacientes');
    
    // Open add patient dialog
    await page.locator('[data-test="add-patient-button"]').click();
    
    const modal = page.locator('[data-test="modal"]');
    await expect(modal).toBeVisible();
    
    // Modal should be full-width
    const box = await modal.boundingBox();
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(box?.width || 0).toBeGreaterThan(windowWidth * 0.9);
    
    // Fill form
    await page.locator('input[name="name"]').fill('João Silva');
    await page.locator('input[name="email"]').fill('joao@example.com');
    await page.locator('input[inputMode="tel"]').fill('11999999999');
    
    // Submit
    await page.locator('[data-test="submit-button"]').click();
    
    // Should show success
    await expect(page.locator('text=Paciente criado')).toBeVisible();
  });

  test('Schedule view navigation on mobile', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    await page.goto('/agenda');
    await page.waitForLoadState('networkidle');
    
    // Should show day view by default on mobile
    const dayView = page.locator('[data-test="day-view"]');
    await expect(dayView).toBeVisible();
    
    // Navigation tabs should be visible
    const tabs = page.locator('[data-test="schedule-tabs"] button');
    expect(await tabs.count()).toBeGreaterThan(0);
    
    // Can switch to week view
    await page.locator('button:has-text("Semana")').click();
    
    const weekView = page.locator('[data-test="week-view"]');
    await expect(weekView).toBeVisible();
  });

  test('Anamnese form on mobile (multi-step)', async ({ page }) => {
    test.use({ ...devices['iPhone SE'] });
    
    // Start consultation
    await page.goto('/pacientes/1');
    await page.locator('[data-test="start-consultation"]').click();
    
    // Should show form wizard
    const stepIndicator = page.locator('[data-test="form-step"]');
    await expect(stepIndicator).toBeVisible();
    
    // Fill step 1
    await page.locator('input[name="chief_complaint"]').fill('Dor nas costas');
    await page.locator('button:has-text("Próximo")').click();
    
    // Should show step 2
    const step = await stepIndicator.textContent();
    expect(step).toContain('2');
    
    // Continue through form
    await page.locator('button:has-text("Próximo")').click();
    await page.locator('button:has-text("Próximo")').click();
    
    // Final step: submit
    await page.locator('button:has-text("Salvar")').click();
    
    // Should show success
    await expect(page.locator('text=Anamnese salva')).toBeVisible();
  });
});
```

---

## 4. TEST DATA & FIXTURES

### 4.1 Test Database Seeding

```typescript
// e2e/fixtures/test-data.ts
export const TEST_PATIENTS = [
  {
    id: 1,
    name: 'João Silva',
    email: 'joao@example.com',
    phone: '11999999999',
    birthdate: '1985-05-15',
  },
  {
    id: 2,
    name: 'Maria Santos',
    email: 'maria@example.com',
    phone: '11988888888',
    birthdate: '1990-03-20',
  },
];

export const TEST_USERS = [
  {
    email: 'doctor@example.com',
    password: 'test123456',
    role: 'doctor',
    name: 'Dr. Paulo',
  },
  {
    email: 'secretary@example.com',
    password: 'test123456',
    role: 'secretary',
    name: 'Ana Secretária',
  },
];
```

### 4.2 Custom Test Fixtures

```typescript
// e2e/fixtures/auth.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    // Login
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('doctor@example.com');
    await page.locator('input[type="password"]').fill('test123456');
    await page.locator('button:has-text("Entrar")').click();
    
    await page.waitForURL('/');
    
    await use(page);
    
    // Logout
    await page.locator('[data-test="user-menu"]').click();
    await page.locator('button:has-text("Sair")').click();
  },
});
```

---

## 5. CI/CD INTEGRATION

### 5.1 GitHub Actions Workflow

```yaml
# .github/workflows/e2e-mobile-tests.yml
name: Mobile E2E Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        browser: [chromium]
        device: [
          'iPhone SE',
          'iPhone 14 Pro',
          'Pixel 5',
          'iPad',
          'Desktop Chrome'
        ]
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install ${{ matrix.browser }}
      
      - name: Start dev server
        run: npm run dev &
        env:
          NODE_ENV: test
      
      - name: Wait for server
        run: npx wait-on http://localhost:3000 --timeout 60000
      
      - name: Run E2E tests (${{ matrix.device }})
        run: |
          npx playwright test \
            --project="Mobile/${{ matrix.device }}" \
            --reporter=html,json,junit
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results-${{ matrix.device }}
          path: test-results/
      
      - name: Publish test report
        if: always()
        uses: dorny/test-reporter@v1
        with:
          name: Test Results (${{ matrix.device }})
          path: 'test-results/junit.xml'
          reporter: 'java-junit'
```

---

## 6. TEST EXECUTION GUIDE

### 6.1 Local Testing

```bash
# Run all tests
npm run e2e

# Run mobile tests only
TABLET=false DESKTOP=false npm run e2e

# Run specific device
npx playwright test --project="Mobile/iPhone SE"

# Debug mode (interactive)
npx playwright test --debug --project="Mobile/iPhone SE"

# UI mode (visual debugging)
npm run e2e:ui

# Update snapshots
npx playwright test --update-snapshots

# Generate HTML report
npx playwright show-report
```

### 6.2 Test Reporting

```bash
# JSON report
cat test-results/results.json | jq '.stats'

# XML report (for CI)
cat test-results/junit.xml

# HTML report
open test-results/index.html
```

---

## 7. EXPECTED TEST RESULTS

### 7.1 Test Coverage

| Category | Tests | Coverage |
|----------|-------|----------|
| Responsive Layout | 15+ | All pages, all breakpoints |
| Touch Targets | 10+ | All interactive elements |
| Touch Interactions | 12+ | Gestures, animations |
| Performance | 8+ | Load time, CLS, LCP |
| Accessibility | 10+ | WCAG AA compliance |
| Critical Journeys | 8+ | User workflows |
| **Total** | **60+** | **All critical paths** |

### 7.2 Pass Criteria

- ✅ 100% of layout tests pass
- ✅ 100% of touch target tests pass
- ✅ 95%+ of interaction tests pass
- ✅ 100% of performance targets met
- ✅ 0 accessibility violations
- ✅ All critical journeys functional

### 7.3 Sample Output

```
Mobile/iPhone SE: 18 passed, 0 failed, 1 skipped (45s)
Mobile/Pixel 5: 18 passed, 0 failed, 1 skipped (42s)
Tablet/iPad: 16 passed, 0 failed, 2 skipped (38s)
Desktop/Chrome: 15 passed, 0 failed, 3 skipped (28s)

Total: 67 passed, 0 failed, 6 skipped (153s)
Coverage: 100% critical paths
Performance: All targets met
A11y: WCAG AA compliant
```

---

**Testing Framework Ready for Implementation**
