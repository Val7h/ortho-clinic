'use client';

import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'card' | 'avatar' | 'line' | 'input' | 'button';
  width?: string | number;
  height?: string | number;
  count?: number;
  circle?: boolean;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      variant = 'text',
      width,
      height,
      count = 1,
      circle = false,
      className = '',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'animate-pulse bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200';

    const variantStyles = {
      text: 'h-4 w-full rounded',
      card: 'h-48 w-full rounded-lg',
      avatar: 'h-10 w-10 rounded-full',
      line: 'h-2 w-full rounded',
      input: 'h-10 w-full rounded-lg',
      button: 'h-10 w-32 rounded-lg',
    };

    const style: React.CSSProperties = {};
    if (width) style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) style.height = typeof height === 'number' ? `${height}px` : height;
    if (circle) style.borderRadius = '9999px';

    const skeletons = Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        ref={i === 0 ? ref : null}
        className={`${baseStyles} ${variantStyles[variant]} ${className}`}
        style={style}
        {...props}
      />
    ));

    return count === 1 ? skeletons[0] : <div className="space-y-2">{skeletons}</div>;
  }
);

Skeleton.displayName = 'Skeleton';

// ── Common skeleton patterns ──────────────────────────────

export const CardSkeleton = () => (
  <div className="space-y-4 rounded-lg border border-slate-200 p-6">
    <Skeleton variant="text" width="60%" />
    <div className="space-y-2">
      <Skeleton variant="line" />
      <Skeleton variant="line" width="90%" />
      <Skeleton variant="line" width="75%" />
    </div>
    <Skeleton variant="button" />
  </div>
);

export const ListSkeleton = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 rounded-lg border border-slate-200 p-4">
        <Skeleton variant="avatar" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="line" width="80%" />
        </div>
      </div>
    ))}
  </div>
);

export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-2 rounded-lg border border-slate-200 p-4">
    <div className="flex gap-4">
      <Skeleton width="20%" height={20} />
      <Skeleton width="30%" height={20} />
      <Skeleton width="30%" height={20} />
      <Skeleton width="20%" height={20} />
    </div>
    <div className="space-y-2 border-t border-slate-200 pt-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton variant="line" width="20%" />
          <Skeleton variant="line" width="30%" />
          <Skeleton variant="line" width="30%" />
          <Skeleton variant="line" width="20%" />
        </div>
      ))}
    </div>
  </div>
);
