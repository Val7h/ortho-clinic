'use client';

import React from 'react';

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
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helper,
      options,
      placeholder = 'Selecionar...',
      fullWidth = true,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-50">
            {label}
            {props.required && <span className="text-error-600">*</span>}
          </label>
        )}

        <select
          ref={ref}
          disabled={disabled}
          aria-required={props.required}
          className={`
            w-full rounded-lg border bg-white dark:bg-slate-900 px-4 py-2 text-sm text-slate-900 dark:text-slate-50 appearance-none
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-950
            disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed
            cursor-pointer
            ${error
              ? 'border-error-300 dark:border-error-700 focus:border-error-500 focus:ring-error-200 dark:focus:ring-error-900'
              : 'border-slate-300 dark:border-slate-700 focus:border-brand-500 focus:ring-brand-200 dark:focus:ring-brand-900'
            }
            ${className}
          `}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath fill='%23${document.documentElement.classList.contains('dark') ? '94A3B8' : '475569'}' d='M10 3a1 1 0 01.707.293l7 7a1 1 0 01-1.414 1.414L10 5.414 3.707 11.707a1 1 0 01-1.414-1.414l7-7A1 1 0 0110 3z' transform='rotate(180 10 10)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            backgroundSize: '20px',
            paddingRight: '32px',
          }}
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

        {error && <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">{error}</p>}
        {helper && !error && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
