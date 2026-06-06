'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  errorId?: string;
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
      errorId,
      ...props
    },
    ref
  ) => {
    // Generate unique ID for error messages if not provided
    const generatedErrorId = errorId || `${props.id || 'input'}-error`;
    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-50">
            {label}
            {props.required && <span className="text-error-600">*</span>}
          </label>
        )}

        <div className="relative">
          {icon && iconPosition === 'left' && (
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
              {icon}
            </div>
          )}

          <input
            ref={ref}
            type={type}
            disabled={disabled}
            aria-required={props.required}
            aria-describedby={error ? generatedErrorId : helper ? `${generatedErrorId}-helper` : undefined}
            className={`
              w-full rounded-lg border bg-white dark:bg-slate-900 px-4 py-2 text-sm text-slate-900 dark:text-slate-50
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-950
              disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed
              ${error
                ? 'border-error-300 dark:border-error-700 focus:border-error-500 focus:ring-error-200 dark:focus:ring-error-900'
                : 'border-slate-300 dark:border-slate-700 focus:border-brand-500 focus:ring-brand-200 dark:focus:ring-brand-900'
              }
              ${icon && iconPosition === 'left' ? 'pl-10' : ''}
              ${icon && iconPosition === 'right' ? 'pr-10' : ''}
              ${className}
            `}
            {...props}
          />

          {icon && iconPosition === 'right' && (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
              {icon}
            </div>
          )}
        </div>

        {error && <p id={generatedErrorId} className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">{error}</p>}
        {helper && !error && <p id={`${generatedErrorId}-helper`} className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
