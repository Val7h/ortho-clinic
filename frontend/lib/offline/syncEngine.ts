'use client';
/**
 * offline/syncEngine.ts
 *
 * Core sync engine: processes the syncQueue, resolves conflicts, and
 * calls the server API. Run as a singleton via SyncEngineProvider.
 *
 * Conflict resolution policy (per Sprint 6 spec):
 *   - appointments  → server wins  (doctor/receptionist schedules are authoritative)
 *   - consultation notes → client wins  (doctor notes are private and local-first)
 *
 * Backoff: 2^attempt * 1000 ms, capped at 5 minutes.
 */

import {
  openDB,
  dbGet,
  dbGetAll,
  dbPut,
  dbPutMany,
  dbDelete,
  getLastSync,
  setLastSync,
  SyncQueueItem,
  LocalAppointment,
  LocalConsultationNote,
} from './db';
import { appointmentsApi, consultationsApi } from '@/lib/api';

// ── Backoff ───────────────────────────────────────────────────────────────────

const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

export function nextRetryMs(attempts: number): number {
  const delay = Math.min(Math.pow(2, attempts) * 1000, MAX_BACKOFF_MS);
  // add ±10 % jitter
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Date.now() + delay + jitter;
}

// ── Queue management ──────────────────────────────────────────────────────────

export async function enqueueOp(item: Omit<SyncQueueItem, 'attempts' | 'createdAt' | 'status'>): Promise<void> {
  const full: SyncQueueItem = {
    ...item,
    attempts: 0,
    status: 'pending',
    createdAt: Date.now(),
  };
  await dbPut<SyncQueueItem>('syncQueue', full);
}

export async function getPendingOps(): Promise<SyncQueueItem[]> {
  const all = await dbGetAll<SyncQueueItem>('syncQueue', 'status');
  const now = Date.now();
  return all.filter(
    (i) =>
      (i.status === 'pending' || i.status === 'error') &&
      (!i.nextRetry || i.nextRetry <= now)
  );
}

export async function getAllQueueItems(): Promise<SyncQueueItem[]> {
  return dbGetAll<SyncQueueItem>('syncQueue');
}

// ── Conflict resolution ───────────────────────────────────────────────────────

/**
 * For appointments: server wins.
 * If the server returns a 409, we overwrite local state with server data
 * and mark the queue item as CONFLICT for the UI to surface (not auto-resolved).
 */
async function resolveAppointmentConflict(
  item: SyncQueueItem,
  serverData: any
): Promise<void> {
  // Overwrite local record with server version
  const localAppt = await dbGet<LocalAppointment>('appointments', item.localId);
  if (localAppt && serverData) {
    const merged: LocalAppointment = {
      ...localAppt,
      ...serverData,
      serverId: serverData.id ?? localAppt.serverId,
      optimistic: false,
      updatedAt: Date.now(),
      serverUpdatedAt: serverData.updated_at,
    };
    await dbPut('appointments', merged);
  }
  const updated: SyncQueueItem = {
    ...item,
    status: 'conflict',
    conflictData: serverData,
    errorMessage: 'Horário já ocupado — servidor prevalece',
  };
  await dbPut('syncQueue', updated);
}

/**
 * For consultation notes: client wins.
 * We force-push the local version using a special override endpoint.
 * If the server still refuses, we fall back to marking as conflict.
 */
async function resolveNoteConflict(
  item: SyncQueueItem,
  serverData: any
): Promise<boolean> {
  try {
    // Force-update with client data (client wins policy)
    const note = await dbGet<LocalConsultationNote>('consultationNotes', item.localId);
    if (!note || !note.serverId) return false;
    await consultationsApi.update(note.patientId, note.serverId, {
      notes: note.content,
      force_override: true, // backend must support this flag
    } as any);
    return true;
  } catch {
    return false;
  }
}

// ── Process a single queue item ───────────────────────────────────────────────

async function processSyncItem(item: SyncQueueItem): Promise<void> {
  // Mark as syncing
  await dbPut<SyncQueueItem>('syncQueue', { ...item, status: 'syncing' });

  try {
    let serverResult: any;

    // ── appointments ─────────────────────────────────────────────────────────
    if (item.entity === 'appointment') {
      if (item.op === 'create') {
        serverResult = await appointmentsApi.create(item.payload);
        // Link local record to server id
        const local = await dbGet<LocalAppointment>('appointments', item.localId);
        if (local) {
          await dbPut<LocalAppointment>('appointments', {
            ...local,
            serverId: serverResult.id,
            optimistic: false,
            serverUpdatedAt: serverResult.updated_at,
          });
        }
      } else if (item.op === 'update') {
        serverResult = await appointmentsApi.update(item.payload.id, item.payload);
        const local = await dbGet<LocalAppointment>('appointments', item.localId);
        if (local) {
          await dbPut<LocalAppointment>('appointments', {
            ...local,
            ...serverResult,
            optimistic: false,
            serverUpdatedAt: serverResult.updated_at,
          });
        }
      } else if (item.op === 'delete') {
        await appointmentsApi.cancel(item.payload.id, item.payload.reason);
        await dbDelete('appointments', item.localId);
      }
    }

    // ── consultationNotes ────────────────────────────────────────────────────
    if (item.entity === 'consultationNote') {
      const note = await dbGet<LocalConsultationNote>('consultationNotes', item.localId);
      if (!note) throw new Error('Local note not found');

      if (item.op === 'create') {
        serverResult = await consultationsApi.create(note.patientId, item.payload);
        await dbPut<LocalConsultationNote>('consultationNotes', {
          ...note,
          serverId: serverResult.id,
          synced: true,
          serverUpdatedAt: serverResult.updated_at,
        });
      } else if (item.op === 'update') {
        serverResult = await consultationsApi.update(note.patientId, note.serverId!, item.payload);
        await dbPut<LocalConsultationNote>('consultationNotes', {
          ...note,
          synced: true,
          serverUpdatedAt: serverResult.updated_at,
        });
      }
    }

    // Mark synced
    await dbPut<SyncQueueItem>('syncQueue', { ...item, status: 'synced', attempts: item.attempts + 1 });

  } catch (err: any) {
    const statusCode: number = err?.response?.status ?? 0;
    const attempts = item.attempts + 1;

    if (statusCode === 409) {
      // Conflict
      const serverData = err?.response?.data;
      if (item.entity === 'appointment') {
        await resolveAppointmentConflict(item, serverData);
      } else if (item.entity === 'consultationNote') {
        const resolved = await resolveNoteConflict(item, serverData);
        if (!resolved) {
          await dbPut<SyncQueueItem>('syncQueue', {
            ...item,
            status: 'conflict',
            attempts,
            conflictData: serverData,
            errorMessage: 'Conflito de nota — edição local preservada',
          });
        } else {
          await dbPut<SyncQueueItem>('syncQueue', { ...item, status: 'synced', attempts });
        }
      }
    } else {
      // Retriable error
      await dbPut<SyncQueueItem>('syncQueue', {
        ...item,
        status: 'error',
        attempts,
        lastAttempt: Date.now(),
        nextRetry: nextRetryMs(attempts),
        errorMessage: err?.message ?? 'Erro de rede',
      });
    }
  }
}

// ── Full incremental pull (server → local) ────────────────────────────────────

export async function pullFromServer(collectionName: 'appointments', params: {
  clinic_id?: number;
  date_from: string;
  date_to: string;
}): Promise<number> {
  const lastSync = await getLastSync(collectionName);
  let fetched = 0;

  if (collectionName === 'appointments') {
    try {
      const rows: any[] = await appointmentsApi.availability(
        params.clinic_id ?? 0,
        params.date_from,
        params.date_to,
      );
      // Flatten availability slots into appointment-like records
      const locals: LocalAppointment[] = rows.flatMap((day) =>
        day.slots
          .filter((s: any) => !s.available)
          .map((s: any, idx: number) => ({
            localId: `srv_${day.date}_${s.time}_${idx}`,
            serverId: s.appointment_id,
            optimistic: false,
            status: 'agendado' as const,
            clinic_id: params.clinic_id ?? 0,
            date: day.date,
            start_time: s.time,
            patient_name: s.patient_name ?? '',
            updatedAt: Date.now(),
            serverUpdatedAt: s.updated_at,
          }))
      );
      await dbPutMany('appointments', locals);
      fetched = locals.length;
      await setLastSync(collectionName, Date.now());
    } catch {
      // ignore — we'll use stale local data
    }
  }

  return fetched;
}

// ── Idle-aware scheduler ──────────────────────────────────────────────────────
/**
 * Wraps a task in requestIdleCallback when available.
 * Falls back to Promise.resolve() (microtask, still non-blocking in spirit).
 *
 * WHY: The background sync loop runs every 30s. If it fires during a
 * gesture or animation, it competes for the main thread and causes jank.
 * requestIdleCallback defers the work until the browser has a free frame,
 * keeping animations at 60 fps.
 *
 * Sprint 6 target: 0 dropped frames during scroll while sync is active.
 */
function runWhenIdle<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(
        () => fn().then(resolve).catch(reject),
        { timeout: 5000 } // don't wait more than 5s — just run it
      );
    } else {
      // SSR / no rIC support → defer to next microtask
      Promise.resolve().then(() => fn().then(resolve).catch(reject));
    }
  });
}

// ── Main sync pass ────────────────────────────────────────────────────────────

export type SyncResult = {
  synced: number;
  conflicts: number;
  errors: number;
  skipped: number;
};

/**
 * Run one sync pass, scheduled in idle time to avoid main-thread jank.
 *
 * Items are processed sequentially to avoid thundering-herd on the backend,
 * but each item is wrapped in runWhenIdle so the browser can interleave
 * paint/input between items.
 */
export async function runSyncPass(): Promise<SyncResult> {
  const items = await getPendingOps();
  const result: SyncResult = { synced: 0, conflicts: 0, errors: 0, skipped: 0 };

  for (const item of items) {
    // Process each item during idle time — yields main thread between items
    await runWhenIdle(() => processSyncItem(item));
    const after = await dbGet<SyncQueueItem>('syncQueue', item.id);
    if (!after) { result.skipped++; continue; }
    if (after.status === 'synced') result.synced++;
    else if (after.status === 'conflict') result.conflicts++;
    else if (after.status === 'error') result.errors++;
    else result.skipped++;
  }

  return result;
}

/**
 * Idle-scheduled version for use from the background 30s interval.
 * Never blocks the main thread.
 */
export function runSyncPassIdle(): Promise<SyncResult> {
  return runWhenIdle(runSyncPass);
}

// ── Housekeeping ──────────────────────────────────────────────────────────────

/** Remove synced items older than 24 h from the queue. */
export async function pruneQueue(): Promise<number> {
  const all = await getAllQueueItems();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const item of all) {
    if (item.status === 'synced' && item.createdAt < cutoff) {
      await dbDelete('syncQueue', item.id);
      pruned++;
    }
  }
  return pruned;
}
