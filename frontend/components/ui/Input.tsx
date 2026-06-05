'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
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
      ...props
    },
    ref
  ) => {
    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="mb-2 block text-sm font-medium text-slate-900">
            {label}
            {props.required && <span className="text-error-600">*</span>}
          </label>
        )}

        <div className="relative">
          {icon && iconPosition === 'left' && (
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              {icon}
            </div>
          )}

          <input
            ref={ref}
            type={type}
            disabled={disabled}
            className={`
              w-full rounded-lg border bg-white px-4 py-2 text-sm
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2
              disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed
              ${error
                ? 'border-error-300 focus:border-error-500 focus:ring-error-200'
                : 'border-slate-300 focus:border-brand-500 focus:ring-brand-200'
              }
              ${icon && iconPosition === 'left' ? 'pl-10' : ''}
              ${icon && iconPosition === 'right' ? 'pr-10' : ''}
              ${className}
            `}
            {...props}
          />

          {icon && iconPosition === 'right' && (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
              {icon}
            </div>
          )}
        </div>

        {error && <p className="mt-1 text-xs font-medium text-error-600">{error}</p>}
        {helper && !error && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
