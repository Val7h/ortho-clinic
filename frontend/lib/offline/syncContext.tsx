'use client';
/**
 * offline/syncContext.tsx
 *
 * React context that:
 *  1. Monitors online/offline status with a real connectivity probe.
 *  2. Drives the sync engine on reconnection.
 *  3. Runs a background interval sync every 30 s while online.
 *  4. Exposes sync state + queue info for UI components.
 *
 * Usage: wrap your app in <SyncProvider> once (in providers.tsx).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  runSyncPass,
  runSyncPassIdle,
  pruneQueue,
  getAllQueueItems,
  SyncResult,
} from './syncEngine';
import {
  SyncQueueItem,
} from './db';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | 'idle'        // nothing happening
  | 'syncing'     // sync pass in progress
  | 'upToDate'    // last pass clean
  | 'pending'     // items waiting to be sent
  | 'conflict'    // at least one conflict
  | 'offline';    // no connectivity

export interface SyncContextValue {
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  conflictCount: number;
  errorCount: number;
  lastSyncAt: number | null;    // ms timestamp
  lastSyncResult: SyncResult | null;
  queueItems: SyncQueueItem[];
  triggerSync: () => Promise<void>;
  resolveConflict: (itemId: string, useServer: boolean) => Promise<void>;
  removeQueueItem: (itemId: string) => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used within SyncProvider');
  return ctx;
}

// ── Connectivity probe ─────────────────────────────────────────────────────

const API_PROBE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'https://ortho-clinic-ldcd.onrender.com') + '/health';

async function probeConnectivity(): Promise<boolean> {
  try {
    const res = await fetch(API_PROBE_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

// Reconferência enquanto estivermos "offline" (Valth 13/08): o navegador
// dispara 'offline' em qualquer piscada de wi-fi e nem sempre dispara
// 'online' de volta — a tarja amarela ficava presa com a internet boa.
// Agora o estado offline se cura sozinho.
const RECHECK_OFFLINE_MS = 10_000;

// ── Provider ──────────────────────────────────────────────────────────────────

const BACKGROUND_SYNC_INTERVAL_MS = 30_000; // 30 s

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const syncingRef = useRef(false);
  const bgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Refresh queue state ──────────────────────────────────────────────────
  const refreshQueue = useCallback(async () => {
    const items = await getAllQueueItems();
    setQueueItems(items);
  }, []);

  // ── Derived counts ───────────────────────────────────────────────────────
  const pendingCount = queueItems.filter(
    (i) => i.status === 'pending' || i.status === 'error'
  ).length;
  const conflictCount = queueItems.filter((i) => i.status === 'conflict').length;
  const errorCount = queueItems.filter((i) => i.status === 'error').length;

  // ── Status derivation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOnline) { setSyncStatus('offline'); return; }
    if (syncingRef.current) { setSyncStatus('syncing'); return; }
    if (conflictCount > 0) { setSyncStatus('conflict'); return; }
    if (pendingCount > 0) { setSyncStatus('pending'); return; }
    setSyncStatus(lastSyncAt ? 'upToDate' : 'idle');
  }, [isOnline, pendingCount, conflictCount, lastSyncAt]);

  // ── Main sync trigger ────────────────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return;
    if (!isOnline) return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    try {
      const result = await runSyncPass();
      setLastSyncAt(Date.now());
      setLastSyncResult(result);
      await pruneQueue();
    } finally {
      syncingRef.current = false;
      await refreshQueue();
    }
  }, [isOnline, refreshQueue]);

  // ── Connectivity listeners ───────────────────────────────────────────────
  useEffect(() => {
    const onOnline = async () => {
      // Do a real connectivity probe first
      const reachable = await probeConnectivity();
      setIsOnline(reachable);
      if (reachable) {
        setTimeout(triggerSync, 1500); // small delay to let connection stabilise
      }
    };
    // Não acreditamos no evento 'offline' de cara: confirmamos com o servidor.
    const onOffline = async () => {
      const reachable = await probeConnectivity();
      setIsOnline(reachable);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Initial probe
    probeConnectivity().then(setIsOnline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [triggerSync]);

  // Enquanto estivermos offline, reconfere a cada 10 s e volta sozinho.
  useEffect(() => {
    if (isOnline) return;
    const t = setInterval(async () => {
      if (await probeConnectivity()) {
        setIsOnline(true);
        setTimeout(triggerSync, 1000);
      }
    }, RECHECK_OFFLINE_MS);
    return () => clearInterval(t);
  }, [isOnline, triggerSync]);

  // ── Background sync ──────────────────────────────────────────────────────
  // Uses runSyncPassIdle so the 30s background sync never steals a frame
  // during scroll or animation. Wrapped in triggerSync for status tracking.
  useEffect(() => {
    bgIntervalRef.current = setInterval(() => {
      if (isOnline && !syncingRef.current) {
        // Use idle-scheduled pass for background work; manual triggerSync
        // (from button press) can use the direct path for responsiveness.
        syncingRef.current = true;
        setSyncStatus('syncing');
        runSyncPassIdle()
          .then(async (result) => {
            setLastSyncAt(Date.now());
            setLastSyncResult(result);
            await pruneQueue();
          })
          .finally(async () => {
            syncingRef.current = false;
            await refreshQueue();
          });
      }
    }, BACKGROUND_SYNC_INTERVAL_MS);
    return () => { if (bgIntervalRef.current) clearInterval(bgIntervalRef.current); };
  }, [isOnline, refreshQueue]);

  // ── Initial hydration ────────────────────────────────────────────────────
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // ── Conflict resolution UI action ────────────────────────────────────────
  const resolveConflict = useCallback(async (itemId: string, _useServer: boolean) => {
    // For appointments: server already won (persisted in resolveAppointmentConflict).
    // For notes: client already won via resolveNoteConflict.
    // This just removes the conflict item from the queue display.
    const { dbDelete } = await import('./db');
    await dbDelete('syncQueue', itemId);
    await refreshQueue();
  }, [refreshQueue]);

  const removeQueueItem = useCallback(async (itemId: string) => {
    const { dbDelete } = await import('./db');
    await dbDelete('syncQueue', itemId);
    await refreshQueue();
  }, [refreshQueue]);

  const value: SyncContextValue = {
    isOnline,
    syncStatus,
    pendingCount,
    conflictCount,
    errorCount,
    lastSyncAt,
    lastSyncResult,
    queueItems,
    triggerSync,
    resolveConflict,
    removeQueueItem,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
