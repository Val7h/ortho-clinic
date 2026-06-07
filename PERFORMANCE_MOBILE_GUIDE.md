# OrthoClinic Mobile Performance Optimization Guide

**Date:** June 7, 2026  
**Target:** 90+ Lighthouse Score on Mobile  
**Network:** 4G LTE simulated (typical mobile conditions)

---

## 1. PERFORMANCE BUDGET ENFORCEMENT

### 1.1 Lighthouse Mobile Targets

| Metric | Target | Current (Est.) | Gap |
|--------|--------|-----------------|-----|
| **Performance Score** | 90+ | 65 | -25 |
| **First Contentful Paint (FCP)** | < 2.0s | 3.5s | -1.5s |
| **Largest Contentful Paint (LCP)** | < 2.5s | 4.2s | -1.7s |
| **Cumulative Layout Shift (CLS)** | < 0.1 | 0.15 | -0.05 |
| **Time to Interactive (TTI)** | < 3.8s | 6.0s | -2.2s |
| **Total Blocking Time (TBT)** | < 200ms | 450ms | -250ms |

### 1.2 Bundle Size Limits

**JavaScript (gzip):**
```
Total JS: < 200 KB
Core bundle: < 100 KB
Page bundle: < 50 KB per route
```

**CSS (gzip):**
```
Total CSS: < 40 KB
Critical CSS (inline): < 15 KB
```

**Images (per page):**
```
Above the fold: < 100 KB
Total images: < 300 KB
Individual image: < 100 KB
```

**HTML:**
```
Initial HTML: < 50 KB
```

**Total Page Size:**
```
Target: < 1 MB total
Initial load: < 500 KB
```

### 1.3 size-limit Configuration

```json
// size-limit.json
[
  {
    "name": "JS Bundle (gzip)",
    "path": "frontend/.next/static/chunks/main*.js",
    "limit": "100 KB",
    "gzip": true
  },
  {
    "name": "CSS Bundle (gzip)",
    "path": "frontend/app/globals.css",
    "limit": "40 KB",
    "gzip": true
  },
  {
    "name": "Core page (gzip)",
    "path": "frontend/.next/**/*.js",
    "limit": "500 KB",
    "gzip": true,
    "webpack": true
  }
]
```

**Monitoring:**
```bash
npm install --save-dev size-limit

# Check bundle size
npx size-limit

# Watch for regressions
npx size-limit --why
```

---

## 2. IMAGE OPTIMIZATION

### 2.1 Next.js Image Configuration

```typescript
// next.config.mjs
export default {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com', // If using S3
      },
    ],
    // Device widths for responsive images
    deviceSizes: [320, 480, 640, 768, 1024, 1280, 1536],
    // Image sizes for responsive placeholders
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Cache optimized images
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
};
```

### 2.2 Image Implementation Patterns

**Responsive Patient Avatar:**
```tsx
import Image from 'next/image';

export function PatientAvatar({ patient }) {
  return (
    <div className="relative w-10 h-10 sm:w-12 sm:h-12">
      <Image
        src={patient.photo_url || '/default-avatar.png'}
        alt={patient.name}
        fill
        sizes="(max-width: 640px) 40px, 48px"
        className="rounded-xl object-cover"
        priority={false}
        loading="lazy"
      />
    </div>
  );
}
```

**Dashboard Hero Image:**
```tsx
import Image from 'next/image';

export function DashboardHero() {
  return (
    <div className="relative h-40 sm:h-56 md:h-72 w-full">
      <Image
        src="/dashboard-hero.jpg"
        alt="Clinic"
        fill
        sizes="(max-width: 640px) 100vw,
               (max-width: 1024px) 90vw,
               1200px"
        className="object-cover"
        priority={true}
        quality={75} // Mobile: lower quality
      />
    </div>
  );
}
```

**Consultation Report Image:**
```tsx
import Image from 'next/image';

export function ConsultationImage({ imageUrl }) {
  return (
    <div className="relative w-full aspect-square md:aspect-auto md:h-96">
      <Image
        src={imageUrl}
        alt="Consultation image"
        fill
        sizes="(max-width: 640px) 100vw,
               (max-width: 1024px) 85vw,
               800px"
        className="object-contain"
        loading="lazy"
        quality={80}
      />
    </div>
  );
}
```

### 2.3 Image Optimization Tools

```bash
# Compress images before upload
npm install --save-dev imagemin imagemin-webp

# Analyze image sizes
npm install --save-dev next-bundle-analyzer

# Generate WebP versions
imagemin app/public/images --use=imagemin-webp --extension=webp
```

---

## 3. CODE SPLITTING & LAZY LOADING

### 3.1 Route-Level Code Splitting

```typescript
// app/agenda/page.tsx
import dynamic from 'next/dynamic';

const AgendaView = dynamic(() => import('@/components/AgendaView'), {
  loading: () => <AgendaSkeleton />,
  ssr: true,
});

const AgendaChart = dynamic(() => import('@/components/AgendaChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false, // Heavy component, render only on client
});

export default function AgendaPage() {
  return (
    <>
      <AgendaView />
      <Suspense fallback={<ChartSkeleton />}>
        <AgendaChart />
      </Suspense>
    </>
  );
}
```

### 3.2 Component-Level Code Splitting

```typescript
// Lazy load modal content
const AnamneseModal = dynamic(
  () => import('@/components/AnamneseModal'),
  {
    loading: () => <ModalSkeleton />,
    ssr: false,
  }
);

// Lazy load chart
const PortfolioChart = dynamic(
  () => import('@/components/PortfolioChart'),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);

// Usage
<Suspense fallback={<ModalSkeleton />}>
  <AnamneseModal isOpen={open} />
</Suspense>
```

### 3.3 Bundle Analysis

```bash
# Analyze bundle
ANALYZE=true npm run build

# Interactive report
npx next-bundle-analyzer

# Webpack visualizer
npm install --save-dev webpack-bundle-analyzer
```

**Output analysis:**
```
Initial page load: 145 KB
- React/ReactDOM: 42 KB
- Next.js runtime: 35 KB
- UI components: 38 KB
- App code: 30 KB

Per-route chunks:
- /: 25 KB (dashboard specific)
- /pacientes: 28 KB (patient list specific)
- /agenda: 32 KB (schedule specific)
```

---

## 4. RENDERING OPTIMIZATION

### 4.1 Static Generation (SSG)

```typescript
// app/page.tsx - Dashboard
// Rebuild every 60 seconds if changed
export const revalidate = 60; // ISR

export default function HomePage() {
  // Cached for 60s, then revalidated
}
```

```typescript
// app/pacientes/page.tsx
// Revalidate on-demand
export const revalidate = 'force-dynamic'; // Always fresh

// Or revalidate every 5 minutes
export const revalidate = 300;
```

### 4.2 Streaming (Progressive Enhancement)

```typescript
// app/pacientes/page.tsx
import { Suspense } from 'react';

function PatientListHeader() {
  return <h1>Pacientes</h1>;
}

async function PatientList() {
  const patients = await fetchPatients();
  return patients.map(p => <PatientCard key={p.id} patient={p} />);
}

function PatientListFallback() {
  return <PatientSkeleton count={10} />;
}

export default function PatientsPage() {
  return (
    <>
      <PatientListHeader />
      <Suspense fallback={<PatientListFallback />}>
        <PatientList />
      </Suspense>
    </>
  );
}
```

### 4.3 React Server Components (RSC)

```typescript
// app/components/PatientList.tsx (Server Component by default)
import { PatientCard } from '@/components/PatientCard';

export async function PatientList() {
  const patients = await db.patients.list();
  
  return (
    <div className="space-y-3">
      {patients.map(patient => (
        <PatientCard key={patient.id} patient={patient} />
      ))}
    </div>
  );
}
```

```typescript
// app/components/PatientCard.tsx (Client Component for interactivity)
'use client';

export function PatientCard({ patient }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div onClick={() => setExpanded(!expanded)}>
      {/* Card content */}
    </div>
  );
}
```

---

## 5. SERVICE WORKER & CACHING

### 5.1 Service Worker Implementation

```typescript
// public/service-worker.js
const CACHE_NAME = 'orthoclinic-v1';
const urlsToCache = [
  '/',
  '/styles.css',
  '/app-shell.html',
  '/icons/home.svg',
  '/icons/patients.svg',
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Fetch event - Network First strategy
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        const clonedResponse = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clonedResponse);
        });
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request)
          .then(response => {
            return response || new Response('Offline', {
              status: 503,
              statusText: 'Offline',
            });
          });
      })
  );
});

// Update event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
```

### 5.2 Service Worker Registration

```typescript
// app/providers.tsx
'use client';

import { useEffect } from 'react';

export function ServiceWorkerProvider() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js', {
          scope: '/',
        })
        .then(registration => {
          console.log('SW registered:', registration);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                // Notify user of update
                console.log('New version available');
              }
            });
          });
        })
        .catch(error => {
          console.log('SW registration failed:', error);
        });
    }
  }, []);

  return null;
}
```

### 5.3 Caching Strategy

**Static Assets (CSS, JS, fonts):**
```
Cache-Control: public, max-age=31536000, immutable
```

**Images:**
```
Cache-Control: public, max-age=2592000
// 30 days for patient photos
```

**API Responses:**
```
Cache-Control: private, max-age=300
// 5 minutes for patient list
// Network first, then cache
```

**HTML Pages:**
```
Cache-Control: public, max-age=0, must-revalidate
// Always fresh, use Service Worker for offline
```

---

## 6. JAVASCRIPT OPTIMIZATION

### 6.1 Minimize JavaScript

**Reduce dependencies:**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "next": "^14.0.4",
    "tailwindcss": "^3.3.5",
    "lucide-react": "^0.294.0",
    "zustand": "^4.4.7"
  },
  "devDependencies": {
    "typescript": "^5.3.2"
  }
}
```

**Remove unused libraries:**
```bash
# Audit unused dependencies
npm audit
npm ls # Check dependencies tree

# Remove duplicates
npm dedupe
```

### 6.2 Tree Shaking

```typescript
// ❌ Bad - imports entire library
import * as lucide from 'lucide-react';
const Icon = lucide.Phone;

// ✅ Good - imports only needed export
import { Phone } from 'lucide-react';
```

**Ensure Next.js tree-shaking in next.config.mjs:**
```javascript
export default {
  swcMinify: true, // Enable SWC minification
  productionBrowserSourceMaps: false, // Disable source maps in prod
};
```

### 6.3 Third-Party Script Optimization

```typescript
// app/layout.tsx
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        {/* Analytics - low priority */}
        <Script
          src="https://analytics.example.com/script.js"
          strategy="lazyOnload"
          async
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## 7. CSS OPTIMIZATION

### 7.1 Critical CSS Inlining

```typescript
// app/layout.tsx
// Critical styles automatically inlined by Next.js
import './critical.css'; // Small, critical styles only

// Rest loaded asynchronously
import './globals.css'; // Loaded async
```

**critical.css (< 15 KB):**
```css
/* Only include styles needed for LCP */
@tailwind base;
@layer base {
  * { box-sizing: border-box; }
  html { font-family: 'Inter', sans-serif; }
  body { 
    @apply bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-50;
  }
}

/* Navigation and header */
.nav { /* essential styles */ }

/* Buttons and form inputs */
.btn-primary, .input { /* essential styles */ }

/* Cards */
.card { /* essential styles */ }
```

### 7.2 CSS-in-JS Optimization

```typescript
// Use TailwindCSS (static generation) instead of styled-components
// ✅ TailwindCSS: 0 JS runtime cost
// ❌ styled-components: JS runtime cost

// Prefer CSS classes over inline styles
// ✅ className="text-base sm:text-lg"
// ❌ style={{ fontSize: isMobile ? '14px' : '16px' }}
```

### 7.3 Unused CSS Removal

```javascript
// next.config.mjs
export default {
  // PurgeCSS is built into TailwindCSS
  // Ensure proper content configuration
};
```

**tailwind.config.ts:**
```typescript
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Unused styles automatically purged
};
```

---

## 8. CORE WEB VITALS OPTIMIZATION

### 8.1 Largest Contentful Paint (LCP) < 2.5s

**Target:** Main dashboard stat cards or hero image loads by 2.5s

**Optimizations:**
1. Preload critical resources
2. Prioritize images above fold
3. Minimize server response time
4. Avoid render-blocking resources

```typescript
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        {/* Preload critical font */}
        <link
          rel="preload"
          href="/fonts/inter.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        
        {/* Preload critical image */}
        <link
          rel="preload"
          href="/dashboard-hero.jpg"
          as="image"
          media="(min-width: 768px)"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### 8.2 First Input Delay (FID) / Interaction to Next Paint (INP) < 200ms

**Avoid long main thread blocking:**
```typescript
// ❌ Bad - blocks main thread
const expensiveCalc = () => {
  for (let i = 0; i < 1000000000; i++) {
    Math.sqrt(i);
  }
};

// ✅ Good - use requestIdleCallback
requestIdleCallback(() => {
  expensiveCalc();
});

// ✅ Better - use Web Worker
const worker = new Worker('/workers/calc.js');
worker.postMessage({ data });
```

### 8.3 Cumulative Layout Shift (CLS) < 0.1

**Prevent layout shifts:**
```tsx
// ❌ Bad - image causes layout shift
<img src="/patient.jpg" alt="Patient" className="w-full" />

// ✅ Good - reserve space with aspect ratio
<div className="relative w-full aspect-square">
  <Image
    src="/patient.jpg"
    alt="Patient"
    fill
    className="object-cover"
  />
</div>

// ❌ Bad - loading indicator appears, pushes content
{loading && <Spinner />}
<Content />

// ✅ Good - reserve space for loading state
<div className="h-8">
  {loading && <Spinner />}
</div>
<Content />
```

---

## 9. NETWORK OPTIMIZATION

### 9.1 HTTP/2 Server Push

```typescript
// next.config.mjs
export default {
  // Next.js 14 uses HTTP/2 by default
  // Server automatically pushes critical assets
};
```

### 9.2 Compression & Minification

```bash
# Gzip compression (automatic with Next.js)
# Verify in browser DevTools > Network > Transfer Size

# Brotli compression (better than gzip)
npm install --save-dev compression
```

**Verify compression:**
```bash
# Check response headers
curl -H "Accept-Encoding: gzip" http://localhost:3000 -I

# Should see:
# Content-Encoding: gzip
# Transfer-Encoding: chunked
```

### 9.3 Connection Optimization

```typescript
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        {/* DNS prefetch for external services */}
        <link rel="dns-prefetch" href="https://api.example.com" />
        
        {/* Preconnect to API */}
        <link rel="preconnect" href="https://api.example.com" />
        
        {/* Reduce connection overhead */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## 10. MONITORING & MEASUREMENT

### 10.1 Lighthouse CI Configuration

```json
// lighthouserc.json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/"],
      "numberOfRuns": 3,
      "settings": {
        "configPath": "./lighthouse-config.json"
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:seo": ["error", { "minScore": 0.9 }]
      }
    }
  }
}
```

```json
// lighthouse-config.json
{
  "extends": "lighthouse:default",
  "settings": {
    "emulatedFormFactor": "mobile",
    "throttling": {
      "rttMs": 150,
      "throughputKbps": 1.6 * 1024,
      "cpuSlowdownMultiplier": 4
    }
  }
}
```

### 10.2 Web Vitals Monitoring

```typescript
// app/layout.tsx
'use client';

import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

export default function RootLayout({ children }) {
  useEffect(() => {
    getCLS(console.log);
    getFID(console.log);
    getFCP(console.log);
    getLCP(console.log);
    getTTFB(console.log);
  }, []);

  return (/* ... */);
}
```

### 10.3 Real User Monitoring (RUM)

```typescript
// lib/analytics.ts
export function trackWebVital(metric: any) {
  // Send to analytics service
  navigator.sendBeacon('/api/analytics/vitals', JSON.stringify(metric));
}
```

---

## 11. OPTIMIZATION CHECKLIST

- [ ] Image optimization (WebP, responsive sizes)
- [ ] Route-level code splitting implemented
- [ ] Dynamic imports for heavy components
- [ ] Service Worker registered and caching configured
- [ ] Critical CSS inlined
- [ ] Unused CSS removed
- [ ] JavaScript minimized (tree-shaking enabled)
- [ ] Third-party scripts lazy-loaded
- [ ] Fonts preloaded
- [ ] API endpoints optimized
- [ ] Database queries optimized
- [ ] Lighthouse score 90+
- [ ] FCP < 2.0s
- [ ] LCP < 2.5s
- [ ] CLS < 0.1
- [ ] TTI < 3.8s
- [ ] Bundle size < 200 KB (gzip)
- [ ] Offline functionality working
- [ ] Performance monitoring in place

---

## 12. PERFORMANCE REGRESSION DETECTION

### 12.1 GitHub Actions Workflow

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          configPath: './lighthouserc.json'
          uploadArtifacts: true
          temporaryPublicStorage: true
      
      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            // Post Lighthouse score as PR comment
```

---

## 13. PERFORMANCE TARGETS SUMMARY

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Lighthouse Score | 90 | 65 | ⏳ In Progress |
| FCP | < 2.0s | 3.5s | ⏳ In Progress |
| LCP | < 2.5s | 4.2s | ⏳ In Progress |
| CLS | < 0.1 | 0.15 | ⏳ In Progress |
| Bundle Size | < 200 KB | 280 KB | ⏳ In Progress |
| Images | < 300 KB/page | 450 KB | ⏳ In Progress |
| Offline | Working | Not yet | ⏳ TODO |

---

**Performance Guide Ready for Implementation**
