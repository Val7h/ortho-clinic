'use client';
/**
 * SyncStatusBanner
 *
 * Sticky top banner that shows offline/sync state to the user.
 * - Offline: amber bar with WiFi-off icon
 * - Pending: blue bar with upload icon + count
 * - Syncing: animated blue bar with spinner
 * - Conflict: red bar with alert icon + count
 * - Up to date: brief green flash that auto-hides after 3 s
 */

import React, { useEffect, useState } from 'react';
import { useSyncContext, SyncStatus } from '@/lib/offline/syncContext';
import { WifiOff, RefreshCw, CheckCircle, AlertTriangle, Upload } from 'lucide-react';

function Banner({
  color,
  icon,
  message,
  actions,
}: {
  color: string;
  icon: React.ReactNode;
  message: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium shadow-md ${color}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span>{message}</span>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SyncStatusBanner() {
  const { syncStatus, pendingCount, conflictCount, lastSyncAt, triggerSync } =
    useSyncContext();
  const [showUpToDate, setShowUpToDate] = useState(false);
  const prevStatus = React.useRef<SyncStatus>('idle');

  // Flash "up to date" banner for 3 s when sync completes
  useEffect(() => {
    if (
      prevStatus.current === 'syncing' &&
      syncStatus === 'upToDate'
    ) {
      setShowUpToDate(true);
      const t = setTimeout(() => setShowUpToDate(false), 3000);
      return () => clearTimeout(t);
    }
    prevStatus.current = syncStatus;
  }, [syncStatus]);

  if (syncStatus === 'offline') {
    return (
      <Banner
        color="bg-amber-500 text-white"
        icon={<WifiOff size={16} />}
        message="Sem conexão — dados salvos localmente"
      />
    );
  }

  if (syncStatus === 'conflict') {
    return (
      <Banner
        color="bg-red-600 text-white"
        icon={<AlertTriangle size={16} />}
        message={`${conflictCount} conflito${conflictCount > 1 ? 's' : ''} detectado${conflictCount > 1 ? 's' : ''} — verifique a agenda`}
      />
    );
  }

  if (syncStatus === 'pending') {
    return (
      <Banner
        color="bg-blue-500 text-white"
        icon={<Upload size={16} />}
        message={`${pendingCount} operaç${pendingCount > 1 ? 'ões pendentes' : 'ão pendente'}`}
        actions={
          <button
            onClick={() => triggerSync()}
            className="rounded bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30 transition"
          >
            Sincronizar agora
          </button>
        }
      />
    );
  }

  if (showUpToDate) {
    return (
      <Banner
        color="bg-emerald-500 text-white"
        icon={<CheckCircle size={16} />}
        message="Sincronizado"
      />
    );
  }

  return null; // idle / upToDate (after flash) — no banner
}
