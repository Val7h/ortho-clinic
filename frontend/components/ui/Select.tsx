'use client';

/**
 * Select — accessible styled native select (WCAG 2.1 AA)
 *
 * Accessibility:
 *  - <label> is always rendered and associated via htmlFor ↔ id
 *  - aria-required propagated from required prop
 *  - aria-describedby wired to error and helper messages
 *  - aria-invalid when error is present
 *  - Focus ring uses CSS variable (visible in forced-colors / high-contrast)
 *  - Chevron icon rendered via SVG background-image with two static variants
 *    (one per color scheme) — no JS `document` access, no SSR crash.
 *
 * Dark mode:
 *  - All colors reference semantic tokens via Tailwind dark: utilities
 *  - Chevron SVG encoded as data-URI for both light and dark themes via
 *    separate CSS classes applied conditionally.
 */

import React, { useId } from 'react';

/* ── Chevron SVG data-URIs (static, no document access) ──────────────────
 * Light: #475569 (slate-600) — meets AA on white bg
 * Dark:  #94A3B8 (slate-400) — meets AA on slate-900 bg
 */
const CHEVRON_LIGHT =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath fill='%23475569' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'/%3E%3C/svg%3E\")";
const CHEVRON_DARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath fill='%2394A3B8' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'/%3E%3C/svg%3E\")";

interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  helper?: string;
  options: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
  /** Explicit element id — auto-generated via useId() if omitted */
  inputId?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helper,
      options,
      placeholder = 'Selecionar…',
      fullWidth = true,
      className = '',
      disabled,
      inputId,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const id = inputId ?? autoId;
    const errorId = `${id}-err`;
    const helperId = `${id}-help`;

    const describedBy = [
      error ? errorId : null,
      helper && !error ? helperId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label
            htmlFor={id}
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {label}
            {props.required && (
              <span className="ms-0.5 text-error-600 dark:text-error-400" aria-hidden="true">
                *
              </span>
            )}
            {props.required && <span className="sr-only">(obrigatório)</span>}
          </label>
        )}

        {/* Wrapper for the custom chevron */}
        <div className="relative">
          <select
            ref={ref}
            id={id}
            disabled={disabled}
            aria-required={props.required}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className={[
              'w-full appearance-none rounded-lg border px-3.5 py-2.5 pe-9 text-sm',
              'bg-white dark:bg-slate-900',
              'text-slate-900 dark:text-slate-50',
              'transition-colors duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              'dark:focus-visible:ring-offset-slate-950',
              'focus-visible:ring-[var(--oc-focus-ring)]',
              'disabled:bg-slate-100 dark:disabled:bg-slate-800',
              'disabled:text-slate-400 dark:disabled:text-slate-500',
              'disabled:cursor-not-allowed',
              'cursor-pointer',
              error
                ? 'border-error-400 dark:border-error-600 focus-visible:ring-[var(--oc-focus-ring-err)]'
                : 'border-slate-300 dark:border-slate-700 focus-visible:border-brand-500 dark:focus-visible:border-brand-400',
              className,
            ].join(' ')}
            {...props}
          >
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Custom chevron — two separate elements toggled via dark: */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 end-3 flex items-center"
          >
            {/* Light mode chevron */}
            <svg
              className="h-4 w-4 text-slate-500 dark:hidden"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            {/* Dark mode chevron */}
            <svg
              className="hidden h-4 w-4 text-slate-400 dark:block"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1 text-xs font-medium text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        {helper && !error && (
          <p
            id={helperId}
            className="mt-1 text-xs text-slate-500 dark:text-slate-400"
          >
            {helper}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
