'use client';
/**
 * SyncStatusIcon
 *
 * Small inline icon+badge for NavBar / header use.
 * Shows pending count or a spinner; clicking opens the SyncQueueDrawer.
 */

import React, { useState } from 'react';
import { useSyncContext } from '@/lib/offline/syncContext';
import { WifiOff, RefreshCw, CheckCircle, AlertTriangle, Upload } from 'lucide-react';
import { SyncQueueDrawer } from './SyncQueueDrawer';

export function SyncStatusIcon() {
  const { syncStatus, pendingCount, conflictCount } = useSyncContext();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const renderIcon = () => {
    switch (syncStatus) {
      case 'offline':
        return <WifiOff size={18} className="text-amber-400" />;
      case 'syncing':
        return <RefreshCw size={18} className="text-blue-400 animate-spin" />;
      case 'conflict':
        return <AlertTriangle size={18} className="text-red-400" />;
      case 'pending':
        return <Upload size={18} className="text-blue-400" />;
      case 'upToDate':
        return <CheckCircle size={18} className="text-emerald-400" />;
      default:
        return <CheckCircle size={18} className="text-slate-500" />;
    }
  };

  const badge = (pendingCount > 0 || conflictCount > 0)
    ? (conflictCount > 0 ? conflictCount : pendingCount)
    : null;

  return (
    <>
      <button
        onClick={() => setDrawerOpen(true)}
        className="relative p-1.5 rounded-lg hover:bg-slate-700/50 transition"
        title="Status de sincronização"
        aria-label="Status de sincronização offline"
      >
        {renderIcon()}
        {badge !== null && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
      <SyncQueueDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
