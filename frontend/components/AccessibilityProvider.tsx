'use client';

/**
 * AccessibilityProvider — bridges OS accessibility settings into the DOM.
 *
 * Responsibilities:
 *  1. Reads prefers-reduced-motion and sets data-reduced-motion on <html>
 *  2. Reads prefers-contrast:more / forced-colors and sets data-high-contrast
 *  3. Reads prefers-color-scheme (for system theme indication)
 *  4. Exposes AccessibilityContext so components can read prefs without
 *     re-creating matchMedia listeners.
 *
 * This runs client-side only (no SSR) to avoid hydration mismatches —
 * all data-* attributes on <html> are set after mount.
 *
 * Usage:
 *   Wrap inside <Providers> in app/providers.tsx.
 *   Components use: const { prefersReducedMotion } = useAccessibilityContext()
 */

import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAccessibility, type AccessibilityPreferences } from '@/hooks/useAccessibility';

const AccessibilityContext = createContext<AccessibilityPreferences>({
  prefersReducedMotion: false,
  prefersHighContrast: false,
  prefersDark: false,
  fontScale: 1,
});

export function useAccessibilityContext() {
  return useContext(AccessibilityContext);
}

interface AccessibilityProviderProps {
  children: ReactNode;
}

export function AccessibilityProvider({ children }: AccessibilityProviderProps) {
  const prefs = useAccessibility();

  useEffect(() => {
    const html = document.documentElement;

    // data-reduced-motion="true" → consumed by CSS [data-reduced-motion] selectors
    // as a complement to @media (prefers-reduced-motion) which isn't always
    // available inside CSS-in-JS contexts.
    html.dataset.reducedMotion = prefs.prefersReducedMotion ? 'true' : 'false';

    // data-high-contrast="true" → extra border / outline rules in globals.css
    html.dataset.highContrast = prefs.prefersHighContrast ? 'true' : 'false';

    // data-font-scale — available for CSS calc() and JS consumers
    html.dataset.fontScale = String(prefs.fontScale.toFixed(2));
  }, [prefs]);

  return (
    <AccessibilityContext.Provider value={prefs}>
      {children}
    </AccessibilityContext.Provider>
  );
}
