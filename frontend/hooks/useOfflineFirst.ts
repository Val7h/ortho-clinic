'use client';
/**
 * useOfflineFirst
 *
 * Central hook for offline-first mutations and reads.
 * Replaces the old useOfflineAppointmentQueue with a broader API
 * that covers:
 *   - Appointments (create, update, delete) — optimistic, server-wins conflict
 *   - Consultation notes (create, update) — optimistic, client-wins conflict
 *   - Freshness check for cached data
 *
 * Returns helpers ready to use in UI components.
 */

import { useCallback } from 'react';
import { useSyncContext } from '@/lib/offline/syncContext';
import {
  dbGet,
  dbPut,
  dbGetAll,
  LocalAppointment,
  LocalConsultationNote,
} from '@/lib/offline/db';
import { enqueueOp as enqueueOpEngine } from '@/lib/offline/syncEngine';

// re-export for convenience
export { useSyncContext };

// ── Appointment mutations ─────────────────────────────────────────────────────

export function useOfflineAppointments() {
  const { isOnline, triggerSync } = useSyncContext();

  const createAppointment = useCallback(
    async (payload: {
      clinic_id: number;
      date: string;
      start_time?: string;
      patient_name: string;
      patient_phone?: string;
      patient_id?: number;
      reason?: string;
      appointment_type?: string;
      notes?: string;
    }): Promise<LocalAppointment> => {
      const localId = `appt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const local: LocalAppointment = {
        localId,
        optimistic: true,
        status: 'agendado',
        updatedAt: Date.now(),
        ...payload,
      };
      // Persist locally first (optimistic)
      await dbPut<LocalAppointment>('appointments', local);

      // Queue for server sync
      await enqueueOpEngine({
        id: `sq_${localId}`,
        entity: 'appointment',
        op: 'create',
        localId,
        payload,
      });

      // Attempt immediate sync if online
      if (isOnline) setTimeout(triggerSync, 200);

      return local;
    },
    [isOnline, triggerSync]
  );

  const updateAppointment = useCallback(
    async (
      localId: string,
      serverId: number,
      changes: Partial<LocalAppointment>
    ): Promise<void> => {
      const existing = await dbGet<LocalAppointment>('appointments', localId);
      if (!existing) return;
      const updated: LocalAppointment = {
        ...existing,
        ...changes,
        optimistic: true,
        updatedAt: Date.now(),
      };
      await dbPut<LocalAppointment>('appointments', updated);

      await enqueueOpEngine({
        id: `sq_upd_${localId}_${Date.now()}`,
        entity: 'appointment',
        op: 'update',
        localId,
        serverId,
        payload: { id: serverId, ...changes },
      });

      if (isOnline) setTimeout(triggerSync, 200);
    },
    [isOnline, triggerSync]
  );

  const deleteAppointment = useCallback(
    async (localId: string, serverId: number, reason?: string): Promise<void> => {
      const existing = await dbGet<LocalAppointment>('appointments', localId);
      if (!existing) return;
      // Optimistic: mark cancelled immediately
      await dbPut<LocalAppointment>('appointments', {
        ...existing,
        status: 'cancelado',
        optimistic: true,
        updatedAt: Date.now(),
      });

      await enqueueOpEngine({
        id: `sq_del_${localId}_${Date.now()}`,
        entity: 'appointment',
        op: 'delete',
        localId,
        serverId,
        payload: { id: serverId, reason },
      });

      if (isOnline) setTimeout(triggerSync, 200);
    },
    [isOnline, triggerSync]
  );

  const getLocalAppointments = useCallback(
    async (clinicId: number, date?: string): Promise<LocalAppointment[]> => {
      const all = await dbGetAll<LocalAppointment>('appointments', 'clinic_id', IDBKeyRange.only(clinicId));
      if (date) return all.filter((a) => a.date === date && a.status !== 'cancelado');
      return all.filter((a) => a.status !== 'cancelado');
    },
    []
  );

  return { createAppointment, updateAppointment, deleteAppointment, getLocalAppointments };
}

// ── Consultation note mutations ───────────────────────────────────────────────

export function useOfflineNotes() {
  const { isOnline, triggerSync } = useSyncContext();

  const saveNote = useCallback(
    async (patientId: number, consultationId: number, content: string): Promise<LocalConsultationNote> => {
      const localId = `note_${patientId}_${consultationId}`;
      const existing = await dbGet<LocalConsultationNote>('consultationNotes', localId);

      const note: LocalConsultationNote = {
        localId,
        serverId: existing?.serverId,
        patientId,
        consultationId,
        content,
        updatedAt: Date.now(),
        serverUpdatedAt: existing?.serverUpdatedAt,
        synced: false,
      };
      await dbPut<LocalConsultationNote>('consultationNotes', note);

      const op = existing?.serverId ? 'update' : 'create';
      await enqueueOpEngine({
        id: `sq_note_${localId}_${Date.now()}`,
        entity: 'consultationNote',
        op,
        localId,
        serverId: existing?.serverId,
        payload: { notes: content, consultation_id: consultationId, patient_id: patientId },
      });

      if (isOnline) setTimeout(triggerSync, 200);
      return note;
    },
    [isOnline, triggerSync]
  );

  const getNote = useCallback(
    async (patientId: number, consultationId: number): Promise<LocalConsultationNote | null> => {
      const localId = `note_${patientId}_${consultationId}`;
      return (await dbGet<LocalConsultationNote>('consultationNotes', localId)) ?? null;
    },
    []
  );

  return { saveNote, getNote };
}

// ── Data freshness ────────────────────────────────────────────────────────────

const FRESH_TTL_MS = 15 * 60 * 1000; // 15 min

export function isFresh(updatedAt: number): boolean {
  return Date.now() - updatedAt < FRESH_TTL_MS;
}

export function freshnessLabel(updatedAt: number): string {
  const age = Date.now() - updatedAt;
  if (age < 60_000) return 'Atualizado agora';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)} min atrás`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)} h atrás`;
  return `${Math.floor(age / 86_400_000)} d atrás`;
}
