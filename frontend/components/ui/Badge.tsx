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
    filled: 'bg-brand-100 text-brand-800',
    outlined: 'border border-brand-300 bg-white text-brand-700',
  },
  accent: {
    filled: 'bg-accent-100 text-accent-800',
    outlined: 'border border-accent-300 bg-white text-accent-700',
  },
  success: {
    filled: 'bg-success-100 text-success-800',
    outlined: 'border border-success-300 bg-white text-success-700',
  },
  warning: {
    filled: 'bg-warning-100 text-warning-800',
    outlined: 'border border-warning-300 bg-white text-warning-700',
  },
  error: {
    filled: 'bg-error-100 text-error-800',
    outlined: 'border border-error-300 bg-white text-error-700',
  },
  neutral: {
    filled: 'bg-slate-100 text-slate-800',
    outlined: 'border border-slate-300 bg-white text-slate-700',
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
