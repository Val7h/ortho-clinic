# OrthoClinic Mobile-First Responsive Design Strategy

**Document Date:** June 7, 2026  
**Sprint Duration:** 6 Days  
**Stack:** Next.js 14 + TailwindCSS + Playwright  
**Target:** Healthcare clinic management system with mobile-first approach

---

## 1. EXECUTIVE SUMMARY

This document outlines the comprehensive strategy for transforming OrthoClinic from a desktop-oriented application into a fully responsive, mobile-first healthcare management system. The project encompasses design audit, responsive system implementation, component updates, performance optimization, and rigorous testing across multiple devices.

**Key Objectives:**
- Ensure usability across mobile (320px-640px), tablet (768px-1024px), and desktop (1280px+)
- Maintain healthcare UX standards while optimizing for touch interaction
- Achieve 90+ Lighthouse mobile score
- Enable offline functionality via Service Workers
- Implement progressive enhancement for reliability

---

## 2. CURRENT STATE AUDIT

### 2.1 Existing Infrastructure

**Frontend Stack:**
- Framework: Next.js 14 (App Router)
- Styling: TailwindCSS 3.3.5 (NOT mobile-first configured)
- Testing: Playwright (only Desktop Chrome + 1 mobile device)
- UI Libraries: NextUI, Radix UI, Lucide Icons
- State: Zustand
- Theming: next-themes (dark mode support)

**Current Breakpoints in tailwind.config.ts:**
- Tailwind **defaults** used (sm: 640px, md: 768px, lg: 1024px, xl: 1280px)
- **No custom mobile-first breakpoints** defined
- **No Tailwind custom configuration** for medical/healthcare-specific needs

**Key Findings:**
1. ✅ TailwindCSS already configured with dark mode
2. ✅ Color system in place (brand, accent, success, warning, error)
3. ✅ Playwright setup exists but lacks mobile viewports
4. ❌ No mobile-specific layout components (hamburger, bottom nav)
5. ❌ Large components not optimized for touch (buttons, form inputs)
6. ❌ Images not responsive (next/image remotePatterns incomplete)
7. ❌ No Service Worker for offline support
8. ❌ Pages lack mobile-first structure
9. ❌ Navigation assumes desktop (top nav, dropdown menus)
10. ❌ Forms and modals not touch-friendly

### 2.2 Critical Pages Audit

**Pages Identified:**
- Dashboard (`/`) — Portfolio overview
- Pacientes (`/pacientes`) — Patient list, needs horizontal scroll tables
- Painel (`/painel`) — Call panel, timer interface
- Agenda (`/agenda`) — Schedule, complex layout
- Anamnese (`/anamnese`) — Long forms, multi-step
- Financeiro (`/financeiro`) — Financial data, charts
- Usuarios (`/usuarios`) — Admin users
- Settings pages — Multiple sections

**Mobile-Critical Issues:**
- Long tables without responsive redesign
- Multi-column layouts (agenda, dashboard)
- Form validation not mobile-optimized
- Charts not zoomable on small screens
- Modal dialogs overflow on mobile
- Navigation menus not touch-optimized

---

## 3. RESPONSIVE DESIGN SYSTEM

### 3.1 Mobile-First Breakpoint Architecture

```typescript
// Enhanced tailwind.config.ts breakpoints
const breakpoints = {
  // MOBILE FIRST
  xs: '320px',   // Extra small: iPhone SE, old devices
  sm: '480px',   // Small: iPhone 12/13 portrait
  md: '640px',   // Medium: iPhone landscape, small tablets
  
  // TABLET
  lg: '768px',   // Large: iPad portrait
  xl: '1024px',  // Extra large: iPad landscape
  
  // DESKTOP
  '2xl': '1280px',  // Desktop: MacBook Air, standard displays
  '3xl': '1536px',  // Ultra-wide: 4K monitors
};
```

**Tailwind Default vs. Custom:**
- Tailwind provides: sm (640px), md (768px), lg (1024px), xl (1280px)
- **We add:** xs (320px) for smallest devices, md (640px) refined, 2xl/3xl for large displays
- **Apply:** Mobile-first means default styles apply to 320px, then override at breakpoints

### 3.2 Touch-Friendly Specifications

**Button/Tap Targets:**
```
Mobile (< 768px):
  - Minimum tap size: 48x48px (Apple/Android standard)
  - Minimum padding: 12px vertical, 16px horizontal
  - Icon-only buttons: 44x44px minimum

Desktop (>= 768px):
  - Can reduce to 40x40px
  - Standard padding: 10px vertical, 16px horizontal
```

**Form Inputs:**
```
Mobile (< 768px):
  - Height: 48px (touch-friendly)
  - Padding: 12px vertical, 16px horizontal
  - Font size: 16px+ (prevents zoom on iOS)
  - Spacing between fields: 16px

Desktop (>= 768px):
  - Height: 40px
  - Padding: 10px vertical, 12px horizontal
  - Font size: 14px acceptable
  - Spacing: 12px
```

**Spacing Scale (Mobile-First):**
```
Default (320px):  px-3 py-2  (12px/8px)
md+:              px-4 py-3  (16px/12px)
lg+:              px-6 py-4  (24px/16px)
```

### 3.3 Responsive Font Scale

```typescript
// Updated fontSize in tailwind.config.ts
fontSize: {
  // Mobile first (smaller)
  xs: ['12px', { lineHeight: '16px' }],    // 320px+
  sm: ['13px', { lineHeight: '18px' }],    // 320px+
  base: ['14px', { lineHeight: '21px' }],  // 320px+
  lg: ['16px', { lineHeight: '24px' }],    // md: 17px, lg: 18px
  xl: ['18px', { lineHeight: '28px' }],    // md: 20px, lg: 22px
  '2xl': ['20px', { lineHeight: '32px' }], // md: 24px, lg: 28px
  '3xl': ['24px', { lineHeight: '36px' }], // md: 30px, lg: 32px
  '4xl': ['32px', { lineHeight: '40px' }], // md: 40px, lg: 48px
},
```

**Usage Pattern:**
```jsx
<h1 className="text-2xl md:text-3xl lg:text-4xl">Título</h1>
<p className="text-base md:text-lg lg:text-xl">Parágrafo</p>
```

---

## 4. MOBILE-FIRST NAVIGATION STRATEGY

### 4.1 Navigation Architecture by Breakpoint

**Mobile (< 768px) - Bottom Navigation + Hamburger Menu:**
```
┌─────────────────────────┐
│   Page Title  (NavBar)  │
├─────────────────────────┤
│                         │
│  Main Content Area      │
│  (scrollable)           │
│                         │
├─────────────────────────┤
│ Home │ Search │ User │ │  ← Bottom Nav (sticky)
└─────────────────────────┘
```

**Tablet (768px - 1024px) - Collapsed Sidebar + Top Bar:**
```
┌────────────────────────┐
│ ≡  Title    Search  🔔 │
├────────────────────────┤
│ │                      │
│ │  Main Content Area   │
│ │  (responsive grid)   │
│ │                      │
└────────────────────────┘
```

**Desktop (1024px+) - Full Sidebar + Top Bar:**
```
┌──────────────────────────────────┐
│  OrthoClinic  Breadcrumb  User 🔔 │
├──────┬───────────────────────────┤
│      │                           │
│ Nav  │  Main Content Area        │
│      │  (multi-column layout)    │
│      │                           │
└──────┴───────────────────────────┘
```

### 4.2 Navigation Components (New)

**1. MobileBottomNav.tsx**
- 4-5 primary actions (Home, Patients, Schedule, Profile, Menu)
- Icon + label (mobile), icon-only when space constrained
- Active state indicator
- Safe area padding for notches

**2. MobileHamburgerMenu.tsx**
- Slide-in drawer from left
- Full navigation tree
- Close on escape or backdrop click
- Touch-optimized padding and spacing

**3. ResponsiveNavBar.tsx (Enhanced)**
- Hamburger on mobile
- Title in center/left on mobile
- Conditional right-side actions
- Sticky positioning

**4. CollapsedSidebar.tsx**
- Icon-only on tablet
- Hover to expand labels
- Tooltip labels on mouse-over

### 4.3 Navigation Structure

```tsx
// app/components/MobileBottomNav.tsx
export default function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 
                     bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800
                     h-16 px-2">
      {/* 4-5 nav items */}
    </nav>
  );
}

// app/components/MobileHamburgerMenu.tsx
export default function MobileHamburgerMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="lg:hidden">
        {/* Hamburger icon */}
      </button>
      {open && <DrawerMenu onClose={() => setOpen(false)} />}
    </>
  );
}

// In layout or page
<div className="flex flex-col h-screen">
  <ResponsiveNavBar />
  <main className="flex-1 overflow-auto lg:ml-64 pb-16 lg:pb-0">
    {children}
  </main>
  <MobileBottomNav />
</div>
```

---

## 5. RESPONSIVE COMPONENT REDESIGN CHECKLIST

### 5.1 Core Components to Update

| Component | Current | Mobile Change | Priority |
|-----------|---------|----------------|----------|
| **PatientCard** | 2-line layout | 1 line + stacked meta | HIGH |
| **NavBar** | Top fixed, multi-button | Hamburger menu, title center | HIGH |
| **Tables** | Multi-column | Horizontal scroll or card view | HIGH |
| **Forms** | Side-by-side fields | Full-width stacked | HIGH |
| **Charts** | Fixed width | Responsive, zoomable | MEDIUM |
| **Modals** | Fixed width 500px | Full mobile width with padding | HIGH |
| **Dashboard** | 4-column grid | 1-column mobile, 2 tablet, 3+ desktop | HIGH |
| **Buttons** | 32-40px | 48px min on mobile | MEDIUM |
| **Input Fields** | 32px | 48px on mobile | MEDIUM |
| **Badges** | Small text | Minimum 10px height | LOW |

### 5.2 Component Update Pattern

**Example: PatientCard.tsx**

```tsx
// Before (Desktop-only)
export default function PatientCard({ patient }) {
  return (
    <div className="card p-4 flex items-center gap-3.5">
      <Avatar /> {/* 48px */}
      <div className="flex-1">
        <p className="font-semibold text-slate-900">{patient.name}</p>
        <div className="flex gap-3 mt-1">
          {/* metadata in row */}
        </div>
      </div>
      <ChevronRight />
    </div>
  );
}

// After (Mobile-first)
export default function PatientCard({ patient }) {
  return (
    <Link href={`/pacientes/${patient.id}`}>
      <div className="card card-hover p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 cursor-pointer group">
        
        {/* Avatar - same size both */}
        <div className="w-12 h-12 sm:w-12 sm:h-12 rounded-2xl flex-shrink-0 flex items-center justify-center">
          {/* ... */}
        </div>

        {/* Info - full width on mobile, flex-1 on desktop */}
        <div className="flex-1 min-w-0 w-full">
          <p className="font-semibold text-sm sm:text-[15px] text-slate-900 dark:text-slate-50">
            {patient.name}
          </p>
          <div className="flex flex-wrap gap-2 sm:gap-3 mt-2 text-xs">
            {/* metadata */}
          </div>
        </div>

        {/* Right side - show on sm+ only or mobile variant */}
        <ChevronRight className="hidden sm:block w-4 h-4 flex-shrink-0" />
        
      </div>
    </Link>
  );
}
```

**Pattern:**
1. Add mobile class first (default)
2. Override with breakpoint class for larger screens
3. Use `flex-col` → `sm:flex-row` for layout changes
4. Add `w-full` on mobile if needed
5. Adjust padding/sizing for breakpoints
6. Hide/show elements conditionally

### 5.3 Data Display Responsiveness

**Tables → Cards on Mobile:**
```tsx
// Desktop: Table
<table className="hidden md:table w-full">
  <thead>
    <tr>
      <th>Patient</th>
      <th>Date</th>
      <th>Type</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {/* rows */}
  </tbody>
</table>

// Mobile: Card list
<div className="md:hidden space-y-3">
  {items.map(item => (
    <div key={item.id} className="card p-4">
      <div className="font-semibold">{item.name}</div>
      <div className="flex justify-between text-sm text-slate-500 mt-2">
        <span>{item.date}</span>
        <span>{item.status}</span>
      </div>
    </div>
  ))}
</div>
```

---

## 6. PERFORMANCE OPTIMIZATION FOR MOBILE

### 6.1 Performance Budget

**Target Metrics (Lighthouse Mobile):**
- Performance: 90+
- First Contentful Paint (FCP): < 2s
- Largest Contentful Paint (LCP): < 2.5s
- Cumulative Layout Shift (CLS): < 0.1
- Time to Interactive (TTI): < 3.8s

**Mobile Bundle Size Limits:**
- JS (gzip): < 150KB (core)
- CSS (gzip): < 30KB
- Images (per page): < 300KB
- Total HTML: < 50KB

### 6.2 Code Splitting Strategy

```typescript
// next.config.mjs - updated
export default {
  output: "standalone",
  swcMinify: true,
  
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "*.example.com" }
    ],
    formats: ['image/webp', 'image/avif'],  // Modern formats
    deviceSizes: [320, 480, 640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  
  // Route-based code splitting
  experimental: {
    // Optimize bundle
  }
};
```

**Route-Level Code Splitting:**
```typescript
// Use dynamic imports for heavy components
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('./Chart'), {
  loading: () => <ChartSkeleton />,
  ssr: false  // Don't render on server if not needed
});

const AnamneseForm = dynamic(() => import('./AnamneseForm'), {
  loading: () => <FormSkeleton />
});
```

### 6.3 Image Optimization

**next/image Configuration:**
```tsx
import Image from 'next/image';

// Patient avatar with responsive sizing
<Image
  src={patient.photo_url}
  alt={patient.name}
  width={48}
  height={48}
  className="rounded-xl object-cover"
  priority={isVisible}  // Lazy load by default
  sizes="(max-width: 640px) 40px, 48px"  // Responsive sizes
/>

// Dashboard hero image
<Image
  src="/hero.jpg"
  alt="Clinic"
  width={1200}
  height={400}
  responsive={true}
  className="w-full h-auto"
  sizes="(max-width: 640px) 100vw,
         (max-width: 1024px) 90vw,
         1200px"
/>
```

### 6.4 Service Worker & Offline Support

**Offline Strategy:**
```typescript
// public/service-worker.js
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('orthoclinic-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/styles.css',
        '/app-shell.html'  // Minimal page structure
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Network first, fallback to cache for GET
  if (event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
  }
});
```

**app/providers.tsx:**
```typescript
export default function Providers() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js');
    }
  }, []);
  
  return (/* providers */);
}
```

### 6.5 Lazy Loading & Progressive Enhancement

```tsx
// Lazy load heavy components
<Suspense fallback={<Skeleton />}>
  <Chart data={data} />
</Suspense>

// Infinite scroll for patient lists
import { useInView } from 'react-intersection-observer';

export function PatientList({ items }) {
  const { ref, inView } = useInView();
  
  useEffect(() => {
    if (inView) loadMore();
  }, [inView]);
  
  return (
    <>
      {items.map(item => <PatientCard key={item.id} patient={item} />)}
      <div ref={ref}>
        {loading && <Spinner />}
      </div>
    </>
  );
}
```

---

## 7. MOBILE-SPECIFIC INTERACTIONS

### 7.1 Touch Gestures

**Swipe Navigation (Mobile):**
```typescript
// hooks/useSwipe.ts
export function useSwipe(onLeft?: () => void, onRight?: () => void) {
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  const handleTouchStart = (e: TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: TouchEvent) => {
    setTouchEnd(e.changedTouches[0].clientX);
    handleSwipe();
  };

  const handleSwipe = () => {
    const distance = touchStart - touchEnd;
    if (Math.abs(distance) > 50) {
      if (distance > 0 && onLeft) onLeft();
      if (distance < 0 && onRight) onRight();
    }
  };

  return { handleTouchStart, handleTouchEnd };
}

// Usage
export default function PanelPage() {
  const { handleTouchStart, handleTouchEnd } = useSwipe(
    () => setMobileView('semana'),
    () => setMobileView('dia')
  );

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* content */}
    </div>
  );
}
```

**Pinch-to-Zoom for Charts:**
```typescript
// Mobile charts should support pinch zoom
// Using recharts with ResponsiveContainer + custom handlers
```

**Pull-to-Refresh (Mobile):**
```typescript
// hooks/usePullToRefresh.ts
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const startY = useRef(0);

  const handleTouchStart = (e: TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    
    if (diff > 80 && window.scrollY === 0) {
      setPulling(true);
    }
  };

  const handleTouchEnd = async () => {
    if (pulling) {
      await onRefresh();
      setPulling(false);
    }
  };

  return { handleTouchStart, handleTouchMove, handleTouchEnd, pulling };
}
```

### 7.2 Mobile Form Interactions

**Auto-focus & Keyboard Handling:**
```tsx
export function MobileForm() {
  // Auto-focus first input on mobile
  const firstInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile && firstInputRef.current) {
      setTimeout(() => firstInputRef.current?.focus(), 300);
    }
  }, []);

  return (
    <form className="space-y-4 md:space-y-6">
      <input
        ref={firstInputRef}
        type="text"
        placeholder="Nome"
        className="input h-12 text-base"  // 16px+ for mobile
        inputMode="text"
      />
      
      {/* inputMode: 'numeric', 'tel', 'email', 'url' */}
      <input
        type="tel"
        placeholder="Telefone"
        className="input h-12 text-base"
        inputMode="tel"
      />
      
      <input
        type="email"
        placeholder="Email"
        className="input h-12 text-base"
        inputMode="email"
      />
      
      <textarea
        placeholder="Observações"
        className="input h-20 md:h-24 text-base resize-none"
      />
    </form>
  );
}
```

**Date Picker Mobile Optimization:**
```tsx
// Use native <input type="date"> on mobile
export function MobileDatePicker({ value, onChange, label }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  if (isMobile) {
    return (
      <div className="flex flex-col">
        <label className="label">{label}</label>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input h-12 text-base"
        />
      </div>
    );
  }
  
  return <CustomDatePicker value={value} onChange={onChange} label={label} />;
}
```

---

## 8. RESPONSIVE TESTING STRATEGY

### 8.1 Device Coverage Matrix

**Playwright Configuration (Enhanced):**
```typescript
// frontend/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  
  projects: [
    // MOBILE
    {
      name: 'iPhone SE',
      use: { ...devices['iPhone SE'], ...customMobile },
    },
    {
      name: 'iPhone 14 Pro',
      use: { ...devices['iPhone 14 Pro'], ...customMobile },
    },
    {
      name: 'Pixel 5',
      use: { ...devices['Pixel 5'], ...customMobile },
    },
    {
      name: 'Samsung Galaxy S21',
      use: { ...devices['Galaxy S21'], ...customMobile },
    },
    
    // TABLET
    {
      name: 'iPad',
      use: { ...devices['iPad'], ...customTablet },
    },
    {
      name: 'iPad Pro',
      use: { ...devices['iPad Pro'], ...customTablet },
    },
    
    // DESKTOP
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Desktop Firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'Desktop Safari',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

### 8.2 Test Categories

**1. Responsive Layout Tests**
```typescript
// e2e/responsive-layout.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Mobile Layout - Dashboard', () => {
  test.use({ ...devices['iPhone SE'] });
  
  test('should stack columns vertically on mobile', async ({ page }) => {
    await page.goto('/');
    
    // Verify mobile layout
    const cards = page.locator('[data-test="dashboard-card"]');
    const boundingBox = await cards.nth(0).boundingBox();
    
    expect(boundingBox?.width).toBeLessThan(400); // Mobile width
  });

  test('navigation should show bottom nav on mobile', async ({ page }) => {
    await page.goto('/');
    
    const bottomNav = page.locator('[data-test="mobile-bottom-nav"]');
    await expect(bottomNav).toBeVisible();
    
    const topNav = page.locator('[data-test="desktop-nav"]');
    await expect(topNav).not.toBeVisible();
  });

  test('buttons should be min 48px touch target', async ({ page }) => {
    await page.goto('/pacientes');
    
    const buttons = page.locator('button');
    for (let i = 0; i < await buttons.count(); i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('Tablet Layout - Agenda', () => {
  test.use({ ...devices['iPad'] });
  
  test('should show 2-column layout on tablet', async ({ page }) => {
    await page.goto('/agenda');
    
    const columns = page.locator('[data-test="agenda-column"]');
    expect(await columns.count()).toBe(2);
  });
});

test.describe('Desktop Layout - All Pages', () => {
  test.use({ ...devices['Desktop Chrome'] });
  
  test('should show sidebar navigation on desktop', async ({ page }) => {
    await page.goto('/');
    
    const sidebar = page.locator('[data-test="desktop-sidebar"]');
    await expect(sidebar).toBeVisible();
  });
});
```

**2. Touch Interaction Tests**
```typescript
// e2e/touch-interactions.spec.ts
test('should close menu on backdrop click (mobile)', async ({ page }) => {
  await page.goto('/');
  
  // Open menu
  await page.locator('[data-test="hamburger"]').click();
  await expect(page.locator('[data-test="nav-drawer"]')).toBeVisible();
  
  // Click backdrop
  await page.locator('[data-test="nav-backdrop"]').click();
  await expect(page.locator('[data-test="nav-drawer"]')).not.toBeVisible();
});

test('swipe gesture should navigate', async ({ page }) => {
  test.use({ ...devices['iPhone SE'] });
  
  await page.goto('/painel');
  
  // Simulate swipe left
  await page.touchStart();
  await page.move(100, 100);
  await page.touchMove(0, 0);
  await page.touchEnd();
  
  // Verify navigation occurred
});
```

**3. Performance Tests**
```typescript
// e2e/performance.spec.ts
test('mobile page load should be < 2s', async ({ page }) => {
  test.use({ ...devices['Pixel 5'] });
  
  const startTime = Date.now();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const loadTime = Date.now() - startTime;
  
  expect(loadTime).toBeLessThan(2000);
});

test('images should be lazy loaded', async ({ page }) => {
  await page.goto('/pacientes');
  
  const images = page.locator('img');
  for (let i = 0; i < await images.count(); i++) {
    const loading = await images.nth(i).getAttribute('loading');
    expect(loading).toBe('lazy');
  }
});
```

**4. Form Tests (Mobile)**
```typescript
// e2e/mobile-forms.spec.ts
test('form input should be 48px on mobile', async ({ page }) => {
  test.use({ ...devices['iPhone SE'] });
  
  await page.goto('/pacientes/novo');
  
  const input = page.locator('input[type="text"]').first();
  const box = await input.boundingBox();
  
  expect(box?.height).toBeGreaterThanOrEqual(48);
});

test('should show numeric keyboard for phone input', async ({ page }) => {
  test.use({ ...devices['iPhone SE'] });
  
  await page.goto('/pacientes/novo');
  
  const phoneInput = page.locator('input[inputMode="tel"]');
  const inputMode = await phoneInput.getAttribute('inputMode');
  
  expect(inputMode).toBe('tel');
});
```

### 8.3 Accessibility + Responsive Tests

```typescript
// e2e/accessibility-responsive.spec.ts
test('should maintain color contrast on mobile', async ({ page }) => {
  test.use({ ...devices['iPhone SE'] });
  
  await page.goto('/');
  
  // Verify WCAG AA contrast ratios
  const heading = page.locator('h1');
  expect(await heading.evaluate(el => {
    const style = window.getComputedStyle(el);
    // Calculate contrast ratio
  })).toBeGreaterThanOrEqual(4.5);
});

test('focus indicators should be visible on mobile', async ({ page }) => {
  test.use({ ...devices['iPhone SE'] });
  
  await page.goto('/');
  
  // Tab navigation
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    return document.activeElement?.getAttribute('data-focus-visible');
  });
  
  expect(focused).toBeTruthy();
});
```

---

## 9. IMPLEMENTATION ROADMAP (6 Days)

### Day 1: Audit + Design System
- [ ] Complete mobile readiness audit
- [ ] Define and document breakpoint strategy
- [ ] Update tailwind.config.ts with custom breakpoints
- [ ] Create design tokens for mobile (spacing, sizing)
- [ ] Document touch-friendly specifications

**Deliverables:**
- Design System Document (this file)
- Updated tailwind.config.ts
- Design Token Reference

### Day 2: Navigation + Layout Components
- [ ] Create MobileBottomNav component
- [ ] Create MobileHamburgerMenu component
- [ ] Update NavBar for responsive behavior
- [ ] Create responsive layout shell
- [ ] Update layout.tsx with mobile navigation

**Deliverables:**
- MobileBottomNav.tsx
- MobileHamburgerMenu.tsx
- Updated NavBar.tsx
- Updated app/layout.tsx
- E2E tests for navigation

### Day 3: Component Updates (Batch 1)
- [ ] Update PatientCard for mobile
- [ ] Update DashboardAnalytics responsive layout
- [ ] Convert tables to card-view on mobile
- [ ] Update form components (input sizing)
- [ ] Test on 4+ device profiles

**Deliverables:**
- Updated PatientCard.tsx
- Updated DashboardAnalytics.tsx
- Table→Card conversion pattern
- Responsive form utilities
- Mobile test results

### Day 4: Component Updates (Batch 2) + Performance
- [ ] Update modal components (full-width mobile)
- [ ] Implement Service Worker
- [ ] Configure next/image optimization
- [ ] Add lazy loading to lists
- [ ] Implement pull-to-refresh pattern

**Deliverables:**
- Updated Modal components
- Service Worker implementation
- next.config.mjs optimization
- Performance baseline metrics
- Browser DevTools screenshots

### Day 5: Mobile-Specific Features + Testing
- [ ] Implement touch gesture handlers
- [ ] Add mobile date/time pickers
- [ ] Configure Playwright for all devices
- [ ] Write responsive layout tests
- [ ] Write touch interaction tests

**Deliverables:**
- useSwipe, usePullToRefresh hooks
- Mobile input components
- Updated playwright.config.ts
- E2E test suite (30+ tests)
- Test coverage report

### Day 6: Optimization + Documentation
- [ ] Performance audit & optimization
- [ ] Accessibility audit (mobile)
- [ ] Write responsive guidelines
- [ ] Create component migration guide
- [ ] Performance budget enforcement

**Deliverables:**
- Performance audit report
- Accessibility audit report
- Component Migration Guide
- Mobile Design Guidelines
- Performance budget config
- Final Lighthouse scores

---

## 10. COMPONENT MIGRATION GUIDE

### 10.1 PatientCard Pattern

**Before (Desktop-focused):**
```tsx
// No responsive behavior
<div className="card p-4 flex items-center gap-3.5">
  {/* Content */}
</div>
```

**After (Mobile-first):**
```tsx
<div className="card card-hover p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 cursor-pointer group">
  {/* Mobile: column, no gap bottom | sm+: row, left-aligned */}
</div>
```

**Key Changes:**
1. `p-3` (default) → `sm:p-4` (larger screens)
2. `flex-col` (default) → `sm:flex-row` (stack mobile, row on tablet+)
3. `items-start` (mobile top) → `sm:items-center` (desktop centered)
4. Conditional visibility: `hidden sm:block` for right side

### 10.2 Form Pattern

**Before:**
```tsx
<input className="input" type="text" />
```

**After:**
```tsx
<input 
  className="input h-12 sm:h-10 text-base sm:text-sm" 
  type="text"
  // Mobile: 48px, 16px font
  // sm+: 40px, 14px font
/>
```

### 10.3 Grid/Layout Pattern

**Before:**
```tsx
<div className="grid grid-cols-4 gap-4">
  {/* Always 4 columns */}
</div>
```

**After:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
  {/* 1 col mobile, 2 tablet, 3 mid-desktop, 4 large desktop */}
</div>
```

---

## 11. ACCESSIBILITY CONSIDERATIONS

### 11.1 Mobile Accessibility

**Touch Target Size:**
- ✅ Minimum 48x48px for interactive elements
- ✅ At least 8px padding between targets
- ✅ Use `aria-label` for icon-only buttons

**Font Size:**
- ✅ Minimum 16px for inputs (prevents zoom on iOS)
- ✅ Readable line-height: 1.5+ on mobile
- ✅ Line length: 30-40 characters max

**Color & Contrast:**
- ✅ WCAG AA minimum (4.5:1 text, 3:1 graphics)
- ✅ Don't rely on color alone (use icons, patterns)
- ✅ Test with dark mode enabled

**Keyboard Navigation:**
- ✅ All interactive elements focusable
- ✅ Logical tab order (left-to-right, top-to-bottom)
- ✅ Focus indicators visible (default + enhanced)
- ✅ Escape key closes modals/menus

**Screen Reader:**
- ✅ Semantic HTML (buttons, links, forms)
- ✅ `role` attributes for custom controls
- ✅ `aria-label` for ambiguous elements
- ✅ `aria-live` regions for dynamic updates

### 11.2 Responsive Accessibility Tests

```typescript
// e2e/a11y-responsive.spec.ts
test('should pass WCAG AA on mobile', async ({ page }) => {
  test.use({ ...devices['iPhone SE'] });
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2aa'])
    .analyze();
  
  expect(results.violations).toEqual([]);
});

test('touch targets should be 48x48px minimum', async ({ page }) => {
  test.use({ ...devices['Pixel 5'] });
  
  const buttons = page.locator('button, a[role="button"]');
  for (let i = 0; i < await buttons.count(); i++) {
    const box = await buttons.nth(i).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});
```

---

## 12. PERFORMANCE METRICS & MONITORING

### 12.1 Lighthouse Mobile Targets

**Current (Estimated):** Performance ~60-70  
**Target:** Performance 90+

**Key Metrics:**
| Metric | Target | Tool |
|--------|--------|------|
| FCP | < 2.0s | Lighthouse |
| LCP | < 2.5s | Lighthouse |
| CLS | < 0.1 | Lighthouse |
| TTI | < 3.8s | Lighthouse |
| TTFB | < 600ms | Network tab |

### 12.2 Bundle Analysis

```bash
# Analyze bundle size
npm run build
npx next-bundle-analyzer

# Performance budgeting
npx size-limit
```

**size-limit.json:**
```json
{
  "path": "frontend/.next/static/chunks/main-*.js",
  "limit": "150 KB",
  "gzip": true
}
```

### 12.3 Continuous Monitoring

**GitHub Actions workflow:**
```yaml
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v9
  with:
    configPath: './lighthouserc.json'
    uploadArtifacts: true
```

---

## 13. EXPECTED OUTCOMES

### 13.1 Success Metrics

- ✅ 95%+ pages responsive across mobile/tablet/desktop
- ✅ Lighthouse mobile score 90+
- ✅ <2s FCP on mobile (4G LTE)
- ✅ All 50+ E2E tests passing on mobile devices
- ✅ WCAG AA accessibility compliance
- ✅ 0 layout shifts (CLS < 0.1)
- ✅ Service Worker offline functionality
- ✅ Touch gestures working on all pages

### 13.2 Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Desktop regression | Comprehensive E2E tests desktop + mobile |
| Performance degradation | Bundle analysis, Lighthouse CI |
| Mobile UX issues | User testing on real devices |
| Accessibility failures | Automated + manual a11y audits |
| Browser inconsistencies | Multi-browser testing (Chrome, Safari, Firefox) |

---

## 14. RESOURCES & REFERENCES

**Documentation:**
- [Tailwind CSS Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [Next.js Image Optimization](https://nextjs.org/docs/api-reference/next/image)
- [Web.dev Mobile Optimization](https://web.dev/responsive-web-design-basics/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

**Tools:**
- Chrome DevTools (Device Emulation)
- Lighthouse (Performance Audit)
- Playwright (E2E Testing)
- axe DevTools (Accessibility)

**Design Inspiration:**
- Apple Human Interface Guidelines (iOS)
- Material Design 3 (Android)
- Healthcare UX best practices

---

## 15. SIGN-OFF & NEXT STEPS

**Document Version:** 1.0  
**Last Updated:** June 7, 2026  
**Author:** Senior Full-Stack Developer  
**Status:** Ready for Implementation

**Next Actions:**
1. Schedule kickoff meeting with team
2. Set up development environment
3. Create feature branches per day
4. Daily standup (15 min)
5. EOD code review + merge

---

**Approved for Implementation** ✓
