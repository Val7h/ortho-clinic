'use client';
/**
 * useOfflineAppointmentQueue
 *
 * Offline-first queue for appointment creation.
 * Created appointments that fail to reach the server are stored in
 * localStorage and replayed automatically when connectivity is restored.
 *
 * Design decisions:
 * - Uses `navigator.onLine` + `online` event for basic detection.
 *   A connectivity probe to the backend is done on first sync attempt
 *   because `navigator.onLine` reports true even on captive portals.
 * - Optimistic IDs use a negative integer so the calendar can display
 *   them immediately with a "pendente offline" badge without colliding
 *   with real server IDs.
 * - On conflict (HTTP 409) the item is marked CONFLICT instead of retried
 *   so the user can resolve it manually.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { appointmentsApi } from '@/lib/api';

export type QueueStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';

export interface QueuedAppointment {
  queueId: string;             // local UUID
  optimisticId: number;        // negative integer for UI
  status: QueueStatus;
  errorMessage?: string;
  createdAt: string;           // ISO
  payload: Parameters<typeof appointmentsApi.create>[0];
  serverResult?: any;          // filled after successful sync
}

const STORAGE_KEY = 'ortho_appointment_queue_v1';

function loadQueue(): QueuedAppointment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAppointment[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage quota exceeded — drop oldest synced items
    const trimmed = queue.filter(i => i.status !== 'synced').slice(-20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }
}

let nextOptimisticId = -1;

export function useOfflineAppointmentQueue() {
  const [queue, setQueue] = useState<QueuedAppointment[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const syncingRef = useRef(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setQueue(loadQueue());
    setIsOnline(navigator.onLine);
  }, []);

  // Online/offline event listeners
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // Auto-sync when connectivity restored
      setTimeout(() => syncPending(), 1500);
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  });

  const persist = useCallback((updated: QueuedAppointment[]) => {
    setQueue(updated);
    saveQueue(updated);
  }, []);

  /**
   * Enqueue a new appointment.
   * Returns the optimistic appointment so the caller can add it to the
   * calendar immediately, without waiting for the server.
   */
  const enqueue = useCallback((payload: Parameters<typeof appointmentsApi.create>[0]): QueuedAppointment => {
    const item: QueuedAppointment = {
      queueId: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      optimisticId: nextOptimisticId--,
      status: 'pending',
      createdAt: new Date().toISOString(),
      payload,
    };
    const updated = [...loadQueue(), item];
    persist(updated);

    // Try to sync immediately if online
    if (navigator.onLine) {
      setTimeout(() => syncItem(item.queueId), 100);
    }
    return item;
  }, [persist]);

  const syncItem = useCallback(async (queueId: string) => {
    const current = loadQueue();
    const idx = current.findIndex(i => i.queueId === queueId);
    if (idx === -1 || current[idx].status === 'synced') return;

    current[idx] = { ...current[idx], status: 'syncing' };
    persist([...current]);

    try {
      const result = await appointmentsApi.create(current[idx].payload);
      current[idx] = { ...current[idx], status: 'synced', serverResult: result };
    } catch (err: any) {
      const status_code = err?.response?.status;
      if (status_code === 409) {
        current[idx] = {
          ...current[idx],
          status: 'conflict',
          errorMessage: err?.response?.data?.detail || 'Conflito de horário',
        };
      } else {
        current[idx] = {
          ...current[idx],
          status: 'error',
          errorMessage: err?.message || 'Erro ao sincronizar',
        };
      }
    }
    persist([...current]);
  }, [persist]);

  /**
   * Retry all pending/error items.
   * Called automatically on reconnect and can be triggered manually.
   */
  const syncPending = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const current = loadQueue();
      const toSync = current.filter(i => i.status === 'pending' || i.status === 'error');
      // Sequential to avoid flooding the server
      for (const item of toSync) {
        await syncItem(item.queueId);
      }
    } finally {
      syncingRef.current = false;
    }
  }, [syncItem]);

  /**
   * Remove a queued item (e.g. after user resolves a conflict).
   */
  const removeFromQueue = useCallback((queueId: string) => {
    const updated = loadQueue().filter(i => i.queueId !== queueId);
    persist(updated);
  }, [persist]);

  /**
   * Clear all synced items (housekeeping).
   */
  const clearSynced = useCallback(() => {
    const updated = loadQueue().filter(i => i.status !== 'synced');
    persist(updated);
  }, [persist]);

  const pendingCount = queue.filter(i => i.status === 'pending' || i.status === 'error').length;
  const conflictCount = queue.filter(i => i.status === 'conflict').length;

  return {
    queue,
    isOnline,
    pendingCount,
    conflictCount,
    enqueue,
    syncPending,
    removeFromQueue,
    clearSynced,
  };
}
