'use client';

import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  rounded?: 'sm' | 'md' | 'lg' | 'xl';
  shadow?: 'sm' | 'md' | 'lg' | 'xl' | 'none';
  padding?: 'sm' | 'md' | 'lg';
}

const roundedStyles = {
  sm: 'rounded-xs',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
};

const shadowStyles = {
  sm: 'shadow-sm',
  md: 'shadow-card',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  none: 'shadow-none',
};

const paddingStyles = {
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      hoverable = false,
      rounded = 'lg',
      shadow = 'md',
      padding = 'md',
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`
          bg-white border border-slate-200
          ${roundedStyles[rounded]}
          ${shadowStyles[shadow]}
          ${paddingStyles[padding]}
          ${hoverable ? 'cursor-pointer transition-all duration-200 hover:shadow-card-hover hover:border-slate-300' : ''}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// ── Card Sub-components ────────────────────────────────────

export const CardHeader = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`mb-4 border-b border-slate-200 pb-4 ${className}`} {...props} />
);

export const CardTitle = ({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`text-lg font-semibold text-slate-900 ${className}`} {...props} />
);

export const CardDescription = ({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-slate-600 ${className}`} {...props} />
);

export const CardContent = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={className} {...props} />
);

export const CardFooter = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`mt-6 flex items-center gap-3 border-t border-slate-200 pt-4 ${className}`} {...props} />
);
