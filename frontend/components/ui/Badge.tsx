'use client';

import React from 'react';

export type BadgeVariant = 'brand' | 'accent' | 'success' | 'warning' | 'error' | 'neutral';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  outline?: boolean;
}

const variantStyles: Record<BadgeVariant, { filled: string; outlined: string }> = {
  brand: {
    filled: 'bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200',
    outlined: 'border border-brand-300 dark:border-brand-700 bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300',
  },
  accent: {
    filled: 'bg-accent-100 dark:bg-accent-900/40 text-accent-800 dark:text-accent-200',
    outlined: 'border border-accent-300 dark:border-accent-700 bg-white dark:bg-slate-900 text-accent-700 dark:text-accent-300',
  },
  success: {
    filled: 'bg-success-100 dark:bg-success-900/40 text-success-800 dark:text-success-200',
    outlined: 'border border-success-300 dark:border-success-700 bg-white dark:bg-slate-900 text-success-700 dark:text-success-300',
  },
  warning: {
    filled: 'bg-warning-100 dark:bg-warning-900/40 text-warning-800 dark:text-warning-200',
    outlined: 'border border-warning-300 dark:border-warning-700 bg-white dark:bg-slate-900 text-warning-700 dark:text-warning-300',
  },
  error: {
    filled: 'bg-error-100 dark:bg-error-900/40 text-error-800 dark:text-error-200',
    outlined: 'border border-error-300 dark:border-error-700 bg-white dark:bg-slate-900 text-error-700 dark:text-error-300',
  },
  neutral: {
    filled: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200',
    outlined: 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300',
  },
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs font-medium rounded',
  md: 'px-3 py-1 text-sm font-medium rounded-md',
  lg: 'px-4 py-1.5 text-base font-medium rounded-lg',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'brand', size = 'md', outline = false, className = '', ...props }, ref) => {
    const style = outline ? variantStyles[variant].outlined : variantStyles[variant].filled;

    return (
      <span
        ref={ref}
        className={`inline-flex items-center gap-1 font-medium transition-colors ${sizeStyles[size]} ${style} ${className}`}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';
