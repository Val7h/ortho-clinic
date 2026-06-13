'use client';

import { ThemeProvider } from 'next-themes';
import { ReactNode } from 'react';
import { SyncProvider } from '@/lib/offline/syncContext';
import { SyncStatusBanner } from '@/components/SyncStatusBanner';
import { AccessibilityProvider } from '@/components/AccessibilityProvider';
import { usePrefetchRoutes } from '@/hooks/usePrefetchRoutes';

/**
 * RouteWarmer — pre-fetches the most visited routes in idle time.
 * Separated into its own component so it can use hooks without
 * bloating the Providers component.
 */
function RouteWarmer() {
  usePrefetchRoutes();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    /*
     * ThemeProvider config:
     *   attribute="class"  — adds/removes .dark class on <html>
     *   defaultTheme="system" — follows OS on first visit (WCAG 1.4.3 compliant)
     *   enableSystem        — auto-detects prefers-color-scheme
     *   disableTransitionOnChange — prevents FOUC flicker when theme switches
     *     (without this, all Tailwind transition-* classes fire on theme change)
     */
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {/*
       * AccessibilityProvider bridges OS prefs (reduced-motion, high-contrast,
       * font-scale) into data-* attributes on <html> and React context.
       * Must be inside ThemeProvider so useTheme() is available to children.
       */}
      <AccessibilityProvider>
        <SyncProvider>
          {/* Pre-fetch critical route chunks in idle time */}
          <RouteWarmer />
          {/* Global offline/sync status banner — renders above all content */}
          <SyncStatusBanner />
          {children}
        </SyncProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}
