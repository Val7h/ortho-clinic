'use client';

/**
 * Input — accessible text input (WCAG 2.1 AA)
 *
 * Accessibility:
 *  - <label> always associated via htmlFor ↔ id (auto-generated via useId)
 *  - aria-required from required prop
 *  - aria-invalid when error is present
 *  - aria-describedby wired to error and helper messages
 *  - Required asterisk has screen-reader label "(obrigatório)"
 *  - Focus ring uses CSS variable — visible in forced-colors / high-contrast mode
 *  - Icons are aria-hidden
 *  - Error message uses role="alert" for assertive announcement
 */

import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  /** Explicit element id — auto-generated via useId() if omitted */
  inputId?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helper,
      icon,
      iconPosition = 'left',
      fullWidth = true,
      className = '',
      disabled,
      type = 'text',
      inputId,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const id = inputId ?? props.id ?? autoId;
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
              <>
                <span className="ms-0.5 text-error-600 dark:text-error-400" aria-hidden="true">
                  *
                </span>
                <span className="sr-only">(obrigatório)</span>
              </>
            )}
          </label>
        )}

        <div className="relative">
          {icon && iconPosition === 'left' && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            >
              {icon}
            </div>
          )}

          <input
            ref={ref}
            id={id}
            type={type}
            disabled={disabled}
            aria-required={props.required}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className={[
              'w-full rounded-lg border px-3.5 py-2.5 text-sm',
              'bg-white dark:bg-slate-900',
              'text-slate-900 dark:text-slate-50',
              /* Placeholder: slate-500 = 4.76:1 on white ✓; slate-400 = 6.96:1 on dark-900 ✓ */
              'placeholder:text-slate-500 dark:placeholder:text-slate-400',
              'transition-colors duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              'dark:focus-visible:ring-offset-slate-950',
              'focus-visible:ring-[var(--oc-focus-ring)]',
              'disabled:bg-slate-100 dark:disabled:bg-slate-800',
              'disabled:text-slate-400 dark:disabled:text-slate-500',
              'disabled:cursor-not-allowed',
              error
                ? 'border-error-400 dark:border-error-600 focus-visible:ring-[var(--oc-focus-ring-err)]'
                : 'border-slate-300 dark:border-slate-700 focus-visible:border-brand-500 dark:focus-visible:border-brand-400',
              icon && iconPosition === 'left' ? 'ps-10' : '',
              icon && iconPosition === 'right' ? 'pe-10' : '',
              className,
            ].join(' ')}
            {...props}
          />

          {icon && iconPosition === 'right' && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            >
              {icon}
            </div>
          )}
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

Input.displayName = 'Input';
