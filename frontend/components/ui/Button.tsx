'use client';

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  ariaLabel?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:text-slate-500 dark:disabled:text-slate-400',
  secondary:
    'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 dark:active:bg-slate-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500',
  tertiary:
    'bg-transparent text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 active:bg-brand-100 dark:active:bg-brand-900/40 disabled:text-slate-400',
  danger:
    'bg-error-600 text-white hover:bg-error-700 active:bg-error-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:text-slate-500 dark:disabled:text-slate-400',
  success:
    'bg-success-600 text-white hover:bg-success-700 active:bg-success-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:text-slate-500 dark:disabled:text-slate-400',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm font-medium h-8',
  md: 'px-4 py-2 text-base font-medium h-10',
  lg: 'px-6 py-3 text-lg font-semibold h-12',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      fullWidth = false,
      icon,
      iconPosition = 'left',
      disabled,
      className = '',
      children,
      ariaLabel,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-label={ariaLabel}
        className={`
          rounded-lg font-medium transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-950 focus:ring-brand-500
          disabled:cursor-not-allowed disabled:opacity-60
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${isLoading ? 'opacity-70 cursor-wait' : ''}
          ${className}
        `}
        {...props}
      >
        <span className="flex items-center justify-center gap-2">
          {isLoading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path
                fill="currentColor"
                d="M4 12a8 8 0 018-8v0a8 8 0 100 16v0a8 8 0 01-8-8z"
                opacity="0.75"
              />
            </svg>
          ) : icon && iconPosition === 'left' ? (
            icon
          ) : null}
          {children}
          {!isLoading && icon && iconPosition === 'right' ? icon : null}
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';
