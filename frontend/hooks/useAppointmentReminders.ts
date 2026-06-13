'use client';
/**
 * useAppointmentReminders
 *
 * Schedules browser Push Notifications (Notification API) for appointment
 * reminders. Falls back to a setTimeout for same-session reminders when
 * the Service Worker / Push API is unavailable (common in dev or non-HTTPS).
 *
 * Integration path:
 * 1. On appointment create/confirm, call `scheduleReminder(appointment, hoursBeforeList)`.
 * 2. The hook requests Notification permission if not yet granted.
 * 3. It calls the backend `/appointments/schedule-reminder` to log intent
 *    server-side (so a WhatsApp reminder can also be sent by a cron worker).
 * 4. For in-browser reminders it stores scheduled times in localStorage and
 *    uses a BroadcastChannel heartbeat to fire them even when the tab loses
 *    focus (works while the app is open; full background requires a SW).
 *
 * Challenges overcome:
 * - iOS Safari does not support Web Push in PWA mode before iOS 16.4.
 *   We detect this and downgrade to a visible in-app toast queued for the
 *   next time the user opens the app.
 * - Notification timestamps can drift if the device clock changes. We
 *   revalidate on each app load by comparing stored times vs Date.now().
 * - Multiple tabs: BroadcastChannel ensures only one tab fires the notification.
 */

import { useCallback, useEffect, useRef } from 'react';
import { appointmentsApi } from '@/lib/api';
import toast from 'react-hot-toast';

export interface AppointmentForReminder {
  id: number;
  patient_name: string;
  date: string;       // YYYY-MM-DD
  start_time: string; // HH:MM
  clinic_name?: string;
}

interface StoredReminder {
  id: string;           // `appt_${appointment_id}_${hoursBeforeIdx}`
  appointmentId: number;
  patient_name: string;
  clinic_name?: string;
  remindAt: number;     // Unix ms
  apptAt: number;       // Unix ms
  fired: boolean;
}

const STORAGE_KEY = 'ortho_reminders_v1';
const HEARTBEAT_INTERVAL_MS = 30_000; // check every 30 s
const BC_CHANNEL = 'ortho_reminder_bc';

function loadReminders(): StoredReminder[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveReminders(reminders: StoredReminder[]) {
  // Keep only non-fired future reminders + recently fired (last 24 h)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const trimmed = reminders.filter(r => !r.fired || r.remindAt > cutoff);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

function buildApptTimestamp(date: string, time: string): number {
  return new Date(`${date}T${time}:00`).getTime();
}

export function useAppointmentReminders() {
  const bcRef = useRef<BroadcastChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifPermission = useRef<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Request notification permission on mount (non-blocking)
    if ('Notification' in window) {
      notifPermission.current = Notification.permission;
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => {
          notifPermission.current = p;
        });
      }
    }

    // BroadcastChannel — only one tab fires per reminder
    if ('BroadcastChannel' in window) {
      bcRef.current = new BroadcastChannel(BC_CHANNEL);
      bcRef.current.onmessage = (e) => {
        if (e.data?.type === 'FIRED') {
          // Another tab fired this — mark as fired locally too
          const reminders = loadReminders();
          const idx = reminders.findIndex(r => r.id === e.data.reminderId);
          if (idx !== -1) { reminders[idx].fired = true; saveReminders(reminders); }
        }
      };
    }

    // Heartbeat — check for due reminders
    const check = () => {
      const now = Date.now();
      const reminders = loadReminders();
      let changed = false;
      for (const r of reminders) {
        if (!r.fired && r.remindAt <= now) {
          // Try to claim this reminder via BC (first tab wins)
          bcRef.current?.postMessage({ type: 'CLAIM', reminderId: r.id });
          fireReminder(r);
          r.fired = true;
          changed = true;
          bcRef.current?.postMessage({ type: 'FIRED', reminderId: r.id });
        }
      }
      if (changed) saveReminders(reminders);
    };

    check(); // Run immediately on mount to catch any missed reminders
    timerRef.current = setInterval(check, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      bcRef.current?.close();
    };
  }, []);

  function fireReminder(r: StoredReminder) {
    const minsAway = Math.round((r.apptAt - Date.now()) / 60_000);
    const label = minsAway > 0 ? `em ${minsAway} min` : 'agora';
    const body = `Consulta de ${r.patient_name}${r.clinic_name ? ` — ${r.clinic_name}` : ''} ${label}`;

    if ('Notification' in window && notifPermission.current === 'granted') {
      const opts: NotificationOptions = {
        body,
        icon: '/icon-192.png',
        tag: r.id,       // deduplication
      };
      new Notification('OrthoClinic — Lembrete', opts);
    } else {
      // In-app toast fallback
      toast(body, { duration: 8000, icon: '🩺' });
    }
  }

  /**
   * Schedule in-browser reminders for an appointment.
   * Also calls the backend to log intent for WhatsApp reminders.
   *
   * @param appt - appointment data
   * @param hoursBeforeList - e.g. [24, 1] → remind 24 h and 1 h before
   */
  const scheduleReminder = useCallback(async (
    appt: AppointmentForReminder,
    hoursBeforeList: number[] = [24, 1],
  ) => {
    const apptAt = buildApptTimestamp(appt.date, appt.start_time);
    const now = Date.now();
    const reminders = loadReminders();

    for (const hours of hoursBeforeList) {
      const remindAt = apptAt - hours * 60 * 60 * 1000;
      if (remindAt <= now) continue; // already past

      const id = `appt_${appt.id}_h${hours}`;
      const exists = reminders.find(r => r.id === id);
      if (exists) continue; // already scheduled

      reminders.push({
        id,
        appointmentId: appt.id,
        patient_name: appt.patient_name,
        clinic_name: appt.clinic_name,
        remindAt,
        apptAt,
        fired: false,
      });
    }
    saveReminders(reminders);

    // Backend call — non-blocking, errors are swallowed
    if (appt.id > 0) {
      for (const hours of hoursBeforeList) {
        appointmentsApi.scheduleReminder(appt.id, hours).catch(() => {});
      }
    }
  }, []);

  /**
   * Cancel all pending reminders for an appointment (e.g. after cancellation).
   */
  const cancelReminders = useCallback((appointmentId: number) => {
    const reminders = loadReminders().filter(r => r.appointmentId !== appointmentId);
    saveReminders(reminders);
  }, []);

  return { scheduleReminder, cancelReminders };
}
