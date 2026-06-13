'use client';

/**
 * useAccessibility — centralises OS-level accessibility preference detection.
 *
 * Detects:
 *  - prefersReducedMotion  (prefers-reduced-motion: reduce)
 *  - prefersHighContrast   (prefers-contrast: more | forced-colors: active)
 *  - prefersDark           (prefers-color-scheme: dark)
 *  - fontScale             (relative to the browser base 16px)
 *
 * All values are reactive — the component re-renders whenever the OS
 * setting changes (e.g., user enables dark mode while the app is open).
 *
 * Usage:
 *   const { prefersReducedMotion, prefersHighContrast } = useAccessibility();
 */

import { useEffect, useState } from 'react';

export interface AccessibilityPreferences {
  /** True when the user has enabled "Reduce Motion" in OS accessibility. */
  prefersReducedMotion: boolean;
  /** True when the user has enabled "Increase Contrast" or system is in forced-colors mode. */
  prefersHighContrast: boolean;
  /** True when the OS color scheme is dark. Independent of the app theme override. */
  prefersDark: boolean;
  /**
   * Font scale relative to the browser default (1.0 = 16px).
   * Accessibility users often set 1.25–2.0.
   * Read-only — controlled by the user's OS/browser.
   */
  fontScale: number;
}

function getPreferences(): AccessibilityPreferences {
  if (typeof window === 'undefined') {
    return {
      prefersReducedMotion: false,
      prefersHighContrast: false,
      prefersDark: false,
      fontScale: 1,
    };
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const highContrast =
    window.matchMedia('(prefers-contrast: more)').matches ||
    window.matchMedia('(forced-colors: active)').matches;
  const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Derive font scale by reading the computed root font-size vs the CSS spec default (16px).
  let fontScale = 1;
  try {
    const rootFontSize = parseFloat(
      window.getComputedStyle(document.documentElement).fontSize
    );
    if (rootFontSize > 0) fontScale = rootFontSize / 16;
  } catch {
    fontScale = 1;
  }

  return {
    prefersReducedMotion: reducedMotion,
    prefersHighContrast: highContrast,
    prefersDark: darkMode,
    fontScale,
  };
}

export function useAccessibility(): AccessibilityPreferences {
  const [prefs, setPrefs] = useState<AccessibilityPreferences>(getPreferences);

  useEffect(() => {
    const queries = [
      window.matchMedia('(prefers-reduced-motion: reduce)'),
      window.matchMedia('(prefers-contrast: more)'),
      window.matchMedia('(forced-colors: active)'),
      window.matchMedia('(prefers-color-scheme: dark)'),
    ];

    const update = () => setPrefs(getPreferences());
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);

  return prefs;
}
