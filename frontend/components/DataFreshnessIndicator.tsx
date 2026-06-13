'use client';
/**
 * DataFreshnessIndicator
 *
 * Small pill that shows how fresh a piece of data is.
 * If the record is optimistic (not yet confirmed by server) it shows
 * a "pendente" badge instead of a timestamp.
 *
 * Props:
 *   updatedAt  — ms timestamp of last local update
 *   optimistic — true if the record hasn't been confirmed by server yet
 *   stale      — explicit override to force stale styling
 */

import React from 'react';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { freshnessLabel, isFresh } from '@/hooks/useOfflineFirst';

interface Props {
  updatedAt: number;
  optimistic?: boolean;
  stale?: boolean;
  className?: string;
}

export function DataFreshnessIndicator({ updatedAt, optimistic, stale, className = '' }: Props) {
  if (optimistic) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-300 ${className}`}
      >
        <AlertCircle size={10} />
        Pendente sincronização
      </span>
    );
  }

  const fresh = !stale && isFresh(updatedAt);
  const label = freshnessLabel(updatedAt);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        fresh
          ? 'bg-emerald-500/10 text-emerald-400'
          : 'bg-amber-500/10 text-amber-400'
      } ${className}`}
    >
      {fresh ? <CheckCircle size={10} /> : <Clock size={10} />}
      {label}
    </span>
  );
}
