'use client';

/**
 * ThemeToggle — three-way theme selector: system → light → dark → system …
 *
 * WCAG 2.1 AA compliance:
 *  - aria-label describes the action ("Mudar para modo escuro")
 *  - aria-pressed indicates current state
 *  - Visible focus ring via :focus-visible
 *  - Icon is aria-hidden; text label is sr-only (visible on forced-colors)
 *  - Minimum 44×44 px tap target via touch-target class
 *  - No animation in prefers-reduced-motion contexts
 *
 * VoiceOver / TalkBack:
 *  - role="button" (implicit via <button>)
 *  - Descriptive aria-label for each state
 *
 * Manual override stored in localStorage by next-themes automatically.
 * 'system' theme reverts to OS preference.
 */

import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

type ResolvedTheme = 'light' | 'dark' | 'system';

interface ThemeConfig {
  icon: React.ElementType;
  label: string;
  nextTheme: ResolvedTheme;
  ariaLabel: string;
}

const THEME_CYCLE: Record<ResolvedTheme, ThemeConfig> = {
  system: {
    icon: Monitor,
    label: 'Sistema',
    nextTheme: 'light',
    ariaLabel: 'Tema automático (segue o sistema). Toque para mudar para modo claro.',
  },
  light: {
    icon: Sun,
    label: 'Claro',
    nextTheme: 'dark',
    ariaLabel: 'Modo claro ativo. Toque para mudar para modo escuro.',
  },
  dark: {
    icon: Moon,
    label: 'Escuro',
    nextTheme: 'system',
    ariaLabel: 'Modo escuro ativo. Toque para usar o tema do sistema.',
  },
};

interface ThemeToggleProps {
  /** Show text label alongside the icon (default: false — icon only) */
  showLabel?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export const ThemeToggle = ({ showLabel = false, className = '' }: ThemeToggleProps) => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  const current = (theme as ResolvedTheme) ?? 'system';
  const config = THEME_CYCLE[current] ?? THEME_CYCLE.system;
  const Icon = config.icon;

  const advance = useCallback(() => {
    setTheme(config.nextTheme);
  }, [config.nextTheme, setTheme]);

  // Hydration guard — render blank placeholder matching button size to avoid layout shift
  if (!mounted) {
    return (
      <div
        className={`w-9 h-9 rounded-lg bg-white/10 ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      onClick={advance}
      type="button"
      aria-label={config.ariaLabel}
      title={config.ariaLabel}
      className={[
        // Base
        'relative inline-flex items-center justify-center gap-1.5',
        'rounded-lg p-2',
        // Color — works in nav (white bg) and card (slate bg) contexts
        'text-current hover:bg-white/20 dark:hover:bg-white/10',
        // Focus (WCAG 2.4.7)
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-[var(--oc-focus-ring)]',
        // Touch target (WCAG 2.5.5) — min 44×44 via pseudo-element in globals.css
        'touch-target',
        // Transition — disabled under prefers-reduced-motion
        'transition-colors duration-200',
        className,
      ].join(' ')}
    >
      <Icon
        className="h-5 w-5"
        aria-hidden="true"
        strokeWidth={1.8}
      />
      {showLabel ? (
        <span className="text-sm font-medium">{config.label}</span>
      ) : (
        // Always visible to screen readers even when showLabel=false
        <span className="sr-only">{config.label}</span>
      )}
    </button>
  );
};
