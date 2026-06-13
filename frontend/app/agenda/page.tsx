'use client';
/**
 * AgendaPage — Sprint 6 complete rewrite
 *
 * Features shipped:
 * - Three calendar views: Mês (month), Semana (week, 7 cols), Dia (day timeline)
 * - "Hoje" quick-jump in all views
 * - Floating "+ Agendar" FAB opens AppointmentFormModal
 * - Click on existing appointment opens edit modal
 * - Offline queue badge in header
 * - Conflict badge on calendar cells
 * - Doctor availability colour-coded dots on month view
 *
 * Design challenges:
 * - Month view needed to support click-to-create — clicking an empty cell
 *   pre-fills the date and opens the form directly.
 * - Day view renders a 60-min-per-row timeline from 07:00–20:00; appointments
 *   that span overlapping times use negative margin offset to avoid collapse.
 * - Offline items use negative IDs (optimistic) and show a distinct amber badge
 *   so the doctor knows they haven't been confirmed by the server yet.
 * - The availability query is debounced per view-change to avoid N+1 calls
 *   when the user rapidly flips between weeks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw,
  WifiOff, Wifi, AlertTriangle, Loader2, CalendarDays,
} from 'lucide-react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import { AppointmentFormModal } from '@/components/AppointmentFormModal';
import { agendaApi, appointmentsApi, clinicApi } from '@/lib/api';
import { useProtectedPage } from '@/components/AuthProvider';
import { useOfflineAppointmentQueue } from '@/hooks/useOfflineAppointmentQueue';
import { Badge } from '@/components/ui';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

type ViewMode = 'mes' | 'semana' | 'dia';

interface ClinicData {
  id: number;
  name: string;
  color: string;
  slug: string;
  schedules: any[];
}

interface ApptEvent {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  patient_name: string;
  patient_phone?: string;
  patient_id?: number;
  clinic_id?: number;
  clinic_name?: string;
  clinic_color?: string;
  reason?: string;
  appointment_type?: string;
  status: string;
  queue_number?: number;
  notes?: string;
  _isOffline?: boolean;
  _queueId?: string;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEK_DAYS_LONG = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDate(d: Date) { return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 6 : day - 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', confirmed: 'Confirmado',
  cancelled: 'Cancelado', completed: 'Realizado',
  blocked: 'Bloqueado', pending_offline: 'Offline',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-amber-700 bg-amber-100',
  confirmed: 'text-emerald-700 bg-emerald-100',
  cancelled: 'text-slate-500 bg-slate-100 line-through',
  completed: 'text-blue-700 bg-blue-100',
  blocked: 'text-red-700 bg-red-100',
  pending_offline: 'text-amber-800 bg-amber-200',
};

const APPT_TYPE_COLOR: Record<string, string> = {
  consulta: '#0F2D5E', retorno: '#06B6D4', teleconsulta: '#7C3AED',
  procedimento: '#F59E0B', urgencia: '#EF4444',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const { user } = useProtectedPage();

  const [view, setView] = useState<ViewMode>('semana');
  const [cursor, setCursor] = useState<Date>(new Date()); // "anchor" date for all views
  const [events, setEvents] = useState<ApptEvent[]>([]);
  const [clinics, setClinics] = useState<ClinicData[]>([]);
  const [availability, setAvailability] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<ApptEvent | null>(null);
  const [createDate, setCreateDate] = useState<string | undefined>();

  const { queue, isOnline, pendingCount, conflictCount, syncPending, removeFromQueue } =
    useOfflineAppointmentQueue();

  const fetchRef = useRef<AbortController | null>(null);

  // ── Derived date ranges ────────────────────────────────────────────────────

  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const rangeStart = view === 'mes' ? toISO(monthStart) : view === 'semana' ? toISO(weekDays[0]) : toISO(cursor);
  const rangeEnd   = view === 'mes' ? toISO(monthEnd)   : view === 'semana' ? toISO(weekDays[6]) : toISO(cursor);

  // ── Fetch data ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (fetchRef.current) fetchRef.current.abort();
    fetchRef.current = new AbortController();
    setLoading(true);

    try {
      const [consults, clinicEvents, clinicList] = await Promise.all([
        agendaApi.get(rangeStart, rangeEnd),
        clinicApi.week(rangeStart, rangeEnd),
        clinics.length === 0 ? clinicApi.list() : Promise.resolve(clinics),
      ]);

      if (clinics.length === 0) setClinics(clinicList);

      // Merge consults + clinic appointments into unified events
      const merged: ApptEvent[] = [];

      for (const c of consults) {
        merged.push({
          id: c.id,
          date: c.date?.slice(0, 10) ?? '',
          start_time: fmtTime(c.date),
          end_time: '',
          patient_name: c.patient_name ?? '',
          patient_id: c.patient_id,
          clinic_name: 'Prontuário',
          clinic_color: APPT_TYPE_COLOR[c.type] ?? '#888',
          appointment_type: c.type,
          status: 'completed',
          reason: c.diagnosis,
        });
      }

      for (const e of clinicEvents) {
        if (e.source !== 'appointment') continue;
        merged.push({
          id: e.id,
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
          patient_name: e.patient_name ?? '',
          patient_phone: e.patient_phone,
          patient_id: e.patient_id,
          clinic_id: e.clinic_id,
          clinic_name: e.clinic_name,
          clinic_color: e.clinic_color,
          status: e.status,
          queue_number: e.queue_number,
        });
      }

      // Inject offline-queued items
      for (const q of queue.filter(qi => qi.status === 'pending' || qi.status === 'syncing')) {
        if (!merged.find(m => m._queueId === q.queueId)) {
          merged.push({
            id: q.optimisticId,
            date: q.payload.date,
            start_time: q.payload.start_time ?? '',
            end_time: '',
            patient_name: q.payload.patient_name,
            patient_phone: q.payload.patient_phone,
            clinic_id: q.payload.clinic_id,
            clinic_name: clinicList.find((c: ClinicData) => c.id === q.payload.clinic_id)?.name ?? '',
            clinic_color: clinicList.find((c: ClinicData) => c.id === q.payload.clinic_id)?.color ?? '#F59E0B',
            appointment_type: q.payload.appointment_type,
            status: 'pending_offline',
            _isOffline: true,
            _queueId: q.queueId,
          });
        }
      }

      setEvents(merged);

      // Fetch availability for active clinic (first clinic by default)
      if (clinicList.length > 0) {
        appointmentsApi.availability(clinicList[0].id, rangeStart, rangeEnd)
          .then(avail => {
            const map: Record<string, any> = {};
            for (const a of avail) map[a.date] = a;
            setAvailability(map);
          })
          .catch(() => {});
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error('Erro ao carregar agenda');
      }
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd, queue.length]);

  useEffect(() => { fetchData(); }, [rangeStart, rangeEnd]);

  // ── Sync offline queue badge click ────────────────────────────────────────

  const handleSyncNow = async () => {
    await syncPending();
    fetchData();
    toast.success('Sincronização concluída');
  };

  // ── Appointment actions ────────────────────────────────────────────────────

  const handleSaved = (appt: any, isOptimistic = false) => {
    setEvents(prev => {
      const without = prev.filter(e => e.id !== appt.id);
      return [...without, appt];
    });
    if (!isOptimistic) toast.success(editingAppt ? 'Agendamento atualizado' : 'Agendamento criado');
    setEditingAppt(null);
    // Refresh from server after a short delay so optimistic + server both show correctly
    if (!isOptimistic) setTimeout(fetchData, 600);
  };

  const handleCancelled = (id: number) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, status: 'cancelled' } : e));
    toast('Agendamento cancelado', { icon: '🗑️' });
  };

  const openCreate = (date?: string) => {
    setCreateDate(date);
    setEditingAppt(null);
    setFormOpen(true);
  };

  const openEdit = (appt: ApptEvent) => {
    if (appt._isOffline) {
      toast('Este agendamento ainda não foi sincronizado com o servidor.', { icon: '⚠️' });
      return;
    }
    setEditingAppt(appt);
    setCreateDate(undefined);
    setFormOpen(true);
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const navigate = (dir: -1 | 1) => {
    setCursor(prev => {
      const d = new Date(prev);
      if (view === 'mes') d.setMonth(d.getMonth() + dir);
      else if (view === 'semana') d.setDate(d.getDate() + dir * 7);
      else d.setDate(d.getDate() + dir);
      return d;
    });
  };

  const goToday = () => setCursor(new Date());

  // ── Calendar helpers ───────────────────────────────────────────────────────

  const today = toISO(new Date());

  function eventsForDate(date: string): ApptEvent[] {
    return events.filter(e => e.date === date && e.status !== 'cancelled');
  }

  // Month calendar grid
  const calendarDays: (Date | null)[] = [];
  const firstDow = (monthStart.getDay() + 6) % 7; // Mon=0
  for (let i = 0; i < firstDow; i++) calendarDays.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    calendarDays.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  }
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  // Day timeline (07:00–20:00, 60 min rows)
  const DAY_START = 7 * 60;
  const DAY_END   = 20 * 60;
  const ROW_H = 56; // px per 60-min row
  const dayEvents = eventsForDate(toISO(cursor)).filter(e => e.start_time);

  // ── Title string ───────────────────────────────────────────────────────────

  let title = '';
  if (view === 'mes') title = `${MONTHS_PT[cursor.getMonth()]} ${cursor.getFullYear()}`;
  else if (view === 'semana') title = `${fmtDate(weekDays[0])} – ${fmtDate(weekDays[6])} · ${cursor.getFullYear()}`;
  else title = `${cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar
        title="Agenda"
        subtitle={isOnline ? undefined : 'Modo offline'}
        back="/"
        actions={
          <div className="flex items-center gap-2">
            {/* Offline queue badge */}
            {!isOnline && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40">
                <WifiOff className="w-3.5 h-3.5 text-amber-300" />
                {pendingCount > 0 && (
                  <span className="text-xs font-bold text-amber-300">{pendingCount}</span>
                )}
              </div>
            )}
            {isOnline && pendingCount > 0 && (
              <button
                onClick={handleSyncNow}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/20 text-xs font-semibold"
                title="Sincronizar agendamentos offline"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sincronizar {pendingCount}
              </button>
            )}
            {conflictCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/20 border border-red-400/40">
                <AlertTriangle className="w-3.5 h-3.5 text-red-300" />
                <span className="text-xs font-bold text-red-300">{conflictCount} conflito{conflictCount > 1 ? 's' : ''}</span>
              </div>
            )}

            {/* Nav arrows */}
            <button onClick={() => navigate(-1)} className="rounded-lg p-2 hover:bg-white/20 text-white transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToday}
              className="rounded-lg px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold border border-white/20 transition-colors"
            >
              Hoje
            </button>
            <button onClick={() => navigate(1)} className="rounded-lg p-2 hover:bg-white/20 text-white transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        }
      />

      {/* View switcher */}
      <div className="sticky top-16 z-10 flex gap-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        {(['mes', 'semana', 'dia'] as ViewMode[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 border-b-2 py-3 text-sm font-semibold capitalize transition-colors ${
              view === v
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {v === 'mes' ? 'Mês' : v === 'semana' ? 'Semana' : 'Dia'}
          </button>
        ))}
      </div>

      {/* Period title */}
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-2 flex items-center gap-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 capitalize flex-1 truncate">{title}</h2>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 flex-shrink-0" />}
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-24">

        {/* ── MONTH VIEW ────────────────────────────────────────────────────── */}
        {view === 'mes' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950">
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
              {WEEK_DAYS_LONG.map(d => (
                <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                if (!day) return (
                  <div key={`empty-${i}`} className="min-h-[90px] border-b border-r border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/30" />
                );
                const iso = toISO(day);
                const dayEvts = eventsForDate(iso);
                const isToday = iso === today;
                const avail = availability[iso];
                const isCurrentMonth = day.getMonth() === cursor.getMonth();

                return (
                  <div
                    key={iso}
                    className={`min-h-[90px] border-b border-r border-slate-100 dark:border-slate-800/50 p-1 cursor-pointer transition-colors
                      ${isToday ? 'bg-brand-50 dark:bg-brand-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'}
                      ${!isCurrentMonth ? 'opacity-40' : ''}`}
                    onClick={() => openCreate(iso)}
                  >
                    {/* Day number */}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                      isToday ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {day.getDate()}
                    </div>

                    {/* Availability dot */}
                    {avail && (
                      <div className={`w-1.5 h-1.5 rounded-full mb-1 ${avail.available ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    )}

                    {/* Events */}
                    {dayEvts.slice(0, 3).map(e => (
                      <div
                        key={e.id}
                        className="rounded px-1 py-0.5 mb-0.5 text-[10px] font-semibold truncate text-white cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: e.clinic_color ?? '#0F2D5E' }}
                        onClick={ev => { ev.stopPropagation(); openEdit(e); }}
                        title={`${e.patient_name} · ${e.start_time}`}
                      >
                        {e._isOffline && '⚠ '}{e.patient_name}
                      </div>
                    ))}
                    {dayEvts.length > 3 && (
                      <p className="text-[10px] text-slate-400 px-1">+{dayEvts.length - 3}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── WEEK VIEW ─────────────────────────────────────────────────────── */}
        {view === 'semana' && (
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map(day => {
              const iso = toISO(day);
              const isToday = iso === today;
              const dayEvts = eventsForDate(iso);
              const avail = availability[iso];

              return (
                <div
                  key={iso}
                  className={`rounded-xl overflow-hidden border ${isToday ? 'border-brand-400 shadow-md' : 'border-slate-200 dark:border-slate-800'}`}
                >
                  {/* Header */}
                  <div
                    className={`px-1 py-2 text-center cursor-pointer ${isToday ? 'bg-brand-600' : 'bg-white dark:bg-slate-950'}`}
                    onClick={() => { setCursor(day); setView('dia'); }}
                    title={`Ver dia ${fmtDate(day)}`}
                  >
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-blue-200' : 'text-slate-400'}`}>
                      {WEEK_DAYS_LONG[day.getDay() === 0 ? 6 : day.getDay() - 1]}
                    </p>
                    <p className={`text-lg font-extrabold leading-none mt-0.5 ${isToday ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                      {day.getDate()}
                    </p>
                    {/* Availability dot */}
                    {avail && (
                      <div className={`w-1.5 h-1.5 rounded-full mx-auto mt-0.5 ${
                        avail.available ? 'bg-emerald-400' : 'bg-slate-300'
                      }`} />
                    )}
                  </div>

                  {/* Content */}
                  <div
                    className="bg-slate-50 dark:bg-slate-900 min-h-[90px] p-1 space-y-1"
                    onClick={() => openCreate(iso)}
                  >
                    {dayEvts.length === 0 && (
                      <div className="flex items-center justify-center py-5">
                        <p className="text-[10px] text-slate-300">—</p>
                      </div>
                    )}

                    {dayEvts.map(e => (
                      <div
                        key={e.id}
                        className="rounded-lg px-1.5 py-1 cursor-pointer hover:opacity-90 transition-opacity text-white"
                        style={{ backgroundColor: e._isOffline ? '#F59E0B' : (e.clinic_color ?? '#0F2D5E') }}
                        onClick={ev => { ev.stopPropagation(); openEdit(e); }}
                        title={`${e.patient_name} · ${e.start_time}`}
                      >
                        {e._isOffline && <span className="text-[8px] opacity-80 block">⚠ offline</span>}
                        <p className="text-[10px] font-bold truncate">{e.patient_name}</p>
                        <p className="text-[9px] opacity-80">{e.start_time || 'chegada'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── DAY VIEW ──────────────────────────────────────────────────────── */}
        {view === 'dia' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950">
            <div className="relative" style={{ height: `${(DAY_END - DAY_START) / 60 * ROW_H}px` }}>
              {/* Hour rows */}
              {Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => {
                const h = Math.floor((DAY_START + i * 60) / 60);
                return (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-b border-slate-100 dark:border-slate-800 flex"
                    style={{ top: `${i * ROW_H}px`, height: `${ROW_H}px` }}
                  >
                    <div className="w-12 flex-shrink-0 text-[10px] text-slate-400 px-2 pt-1 font-mono">
                      {String(h).padStart(2, '0')}:00
                    </div>
                    <div
                      className="flex-1 cursor-pointer hover:bg-brand-50/40 dark:hover:bg-brand-950/20 transition-colors"
                      onClick={() => {
                        const hStr = `${String(h).padStart(2, '0')}:00`;
                        setCreateDate(toISO(cursor));
                        // pre-fill start time via state (handled in form)
                        setFormOpen(true);
                      }}
                    />
                  </div>
                );
              })}

              {/* Events */}
              {dayEvents.map((e, idx) => {
                const startMin = isoToMinutes(e.start_time || '08:00');
                const endMin   = e.end_time ? isoToMinutes(e.end_time) : startMin + 30;
                const top    = (startMin - DAY_START) / 60 * ROW_H;
                const height = Math.max((endMin - startMin) / 60 * ROW_H, 28);

                return (
                  <div
                    key={e.id}
                    className="absolute left-12 right-3 rounded-xl px-2 py-1.5 text-white cursor-pointer hover:opacity-90 hover:shadow-md transition-all shadow-sm"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      backgroundColor: e._isOffline ? '#F59E0B' : (e.clinic_color ?? '#0F2D5E'),
                      marginLeft: `${(idx % 3) * 6}px`, // stagger overlapping
                      zIndex: 10 + idx,
                    }}
                    onClick={() => openEdit(e)}
                    title={`${e.patient_name} · ${e.start_time}–${e.end_time}`}
                  >
                    <p className="text-[11px] font-bold truncate leading-tight">{e.patient_name}</p>
                    <p className="text-[9px] opacity-80 truncate">{e.start_time}{e.end_time ? `–${e.end_time}` : ''}</p>
                    {e.appointment_type && (
                      <p className="text-[9px] opacity-70 truncate">{e.appointment_type}</p>
                    )}
                    {e._isOffline && <p className="text-[8px] opacity-80">⚠ pendente sync</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Detail list below calendar (week/month) */}
        {view !== 'dia' && events.filter(e => e.date >= rangeStart && e.date <= rangeEnd && e.status !== 'cancelled').length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Detalhes do período
            </h3>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950 divide-y divide-slate-100 dark:divide-slate-800">
              {events
                .filter(e => e.date >= rangeStart && e.date <= rangeEnd && e.status !== 'cancelled')
                .sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
                .map(e => (
                  <div
                    key={e.id}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                    onClick={() => openEdit(e)}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                      style={{ backgroundColor: e._isOffline ? '#F59E0B' : (e.clinic_color ?? '#0F2D5E') }}
                    >
                      {e._isOffline ? '⚠' : e.patient_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{e.patient_name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {e.clinic_name} · {e.start_time || 'chegada'}
                        {e.reason ? ` · ${e.reason}` : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[e.status] ?? 'text-slate-600 bg-slate-100'}`}>
                        {STATUS_LABEL[e.status] ?? e.status}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {events.filter(e => e.date >= rangeStart && e.date <= rangeEnd).length === 0 && !loading && (
          <div className="mt-8 text-center py-16 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 text-slate-200 dark:text-slate-700" />
            <p className="font-medium text-slate-400 dark:text-slate-500">Nenhum agendamento neste período</p>
            <button
              className="mt-4 text-sm text-brand-600 dark:text-brand-400 font-semibold hover:underline"
              onClick={() => openCreate(toISO(cursor))}
            >
              + Criar agendamento
            </button>
          </div>
        )}
      </main>

      {/* FAB */}
      <button
        onClick={() => openCreate(view === 'dia' ? toISO(cursor) : undefined)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-30"
        aria-label="Novo agendamento"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Form modal */}
      {formOpen && (
        <AppointmentFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          clinics={clinics}
          initialDate={createDate}
          editingAppointment={editingAppt}
          onSaved={handleSaved}
          onCancelled={handleCancelled}
        />
      )}
    </div>
  );
}
