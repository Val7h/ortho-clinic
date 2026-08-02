'use client';
/**
 * AgendaPage — redesign aprovado pelo Dr. Valth em 02/08 (mockup "proposta-v1").
 *
 * Modelo mental: agenda de TURNOS, não de slots — 12-14 pacientes marcados no
 * mesmo horário de início, atendidos por ordem de chegada, 5 clínicas em dias
 * fixos da semana. Decisões de design (crítica UX + fluxo, 02/08):
 *
 * - Visão padrão = DIA (hoje). "Hoje" volta pra hoje NA visão atual.
 * - Barra de comando única: ‹ [Mês Ano ▾] › · Hoje · Dia/Semana/Mês.
 *   Clicar no título abre o seletor de mês/ano (2 cliques p/ qualquer data).
 * - Dia: faixa da semana (1 clique por dia), clínica como título do dia,
 *   barra de progresso atendidos/faltam, cartões de 1 linha.
 * - Status por FORMA, nunca só por cor: pendente = tracejado ⏱, confirmado =
 *   sólido, atendido = ✓ apagado, cancelado = riscado compacto (VISÍVEL — o
 *   buraco no turno é informação; antes era filtrado e escondido).
 * - Semana: a grade de 7 colunas saiu (era p/ consultório de slot de 30min);
 *   virou LISTA "Minha semana" — 1 linha por dia com confirmados/pendentes.
 * - Mês: células claras, chips por clínica com contagem + pendentes.
 * - Cor pertence à CLÍNICA (paleta fixa no banco: fundo pastel derivado +
 *   borda forte). Âmbar/vermelho reservados p/ offline/conflito.
 * - Removidos: dots de disponibilidade (5 chamadas de API por navegação p/ um
 *   pixel ilegível), clique-cria na área vazia da coluna (misclick), resíduo
 *   da timeline 07-20h, STATUS_COLOR morto.
 * - Bug corrigido: paciente SEM horário sumia da visão Dia (filtro start_time)
 *   — agora entra no grupo "Ordem de chegada".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw,
  WifiOff, AlertTriangle, Loader2, CalendarDays,
} from 'lucide-react';
import NavBar from '@/components/NavBar';
import { PageWithSidebar } from '@/components/PageWithSidebar';
import { AppointmentFormModal } from '@/components/AppointmentFormModal';
import { agendaApi, clinicApi, patientsApi } from '@/lib/api';
import { useProtectedPage } from '@/components/AuthProvider';
import { useOfflineAppointmentQueue } from '@/hooks/useOfflineAppointmentQueue';
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
const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const WEEK_DAYS_LONG = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

const FALLBACK_COLOR = '#1D4ED8';

function toISO(d: Date) {
  // Usa componentes locais (não toISOString/UTC) para não pular de dia após 21h BRT
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
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

function shortClinic(name?: string): string {
  return (name || 'Clínica').replace(/^Clínica\s+/i, '');
}

// Fundo pastel derivado da cor forte da clínica (~12% de opacidade sobre branco)
function pastel(color: string, alpha = '1F'): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alpha}` : color;
}

// M14: mesmo filtro do chat da IA — esconde/não conta nomes de teste
const TEST_NAME_RE = /\b(testes?|debug|exemplo|demo|confirm)\b/i;
function isTestName(name?: string): boolean {
  return !!name && TEST_NAME_RE.test(name);
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', confirmed: 'Confirmado',
  cancelled: 'Cancelado', completed: 'Realizado',
  blocked: 'Bloqueado', pending_offline: 'Offline',
};

const APPT_TYPE_COLOR: Record<string, string> = {
  consulta: '#1D4ED8', retorno: '#06B6D4', teleconsulta: '#7C3AED',
  procedimento: '#0891B2', urgencia: '#EF4444',
};

// Agregado de um dia: contagens + clínicas presentes (p/ faixa, lista e mês)
interface DayAgg {
  total: number;          // sem cancelados e sem bloqueios
  pend: number;
  conf: number;
  done: number;
  cancelled: number;
  blocked: ApptEvent[];   // faixas de bloqueio (férias/almoço) do dia
  clinics: { name: string; color: string; n: number; pend: number }[];
}

function aggregateDay(evts: ApptEvent[]): DayAgg {
  const blocked = evts.filter(e => e.status === 'blocked');
  const active = evts.filter(e => e.status !== 'cancelled' && e.status !== 'blocked');
  const byClinic: Record<string, { name: string; color: string; n: number; pend: number }> = {};
  for (const e of active) {
    const name = shortClinic(e.clinic_name);
    if (!byClinic[name]) byClinic[name] = { name, color: e.clinic_color || FALLBACK_COLOR, n: 0, pend: 0 };
    byClinic[name].n += 1;
    if (e.status === 'pending' || e.status === 'pending_offline') byClinic[name].pend += 1;
  }
  return {
    total: active.length,
    pend: active.filter(e => e.status === 'pending' || e.status === 'pending_offline').length,
    conf: active.filter(e => e.status === 'confirmed').length,
    done: active.filter(e => e.status === 'completed').length,
    cancelled: evts.filter(e => e.status === 'cancelled').length,
    blocked,
    clinics: Object.keys(byClinic).map(k => byClinic[k]),
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const { user } = useProtectedPage();

  // Visão padrão = DIA de hoje: a pergunta nº 1 é "e hoje?"
  const [view, setView] = useState<ViewMode>('dia');
  const [cursor, setCursor] = useState<Date>(new Date());
  const [events, setEvents] = useState<ApptEvent[]>([]);
  const [blocks, setBlocks] = useState<Record<string, any[]>>({}); // M16: blocos de funcionamento por data
  const [clinics, setClinics] = useState<ClinicData[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<ApptEvent | null>(null);
  const [createDate, setCreateDate] = useState<string | undefined>();

  // Seletor de mês/ano (popover do título)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(new Date().getFullYear());

  // Modal "Bloquear horário" (férias/almoço — 02/08)
  const [blockOpen, setBlockOpen] = useState(false);
  const [blkClinic, setBlkClinic] = useState<number | ''>('');
  const [blkDe, setBlkDe] = useState('');
  const [blkAte, setBlkAte] = useState('');
  const [blkPeriodo, setBlkPeriodo] = useState<'dia' | 'manha' | 'tarde' | 'custom'>('dia');
  const [blkIni, setBlkIni] = useState('12:00');
  const [blkFim, setBlkFim] = useState('13:00');
  const [blkMotivo, setBlkMotivo] = useState('');
  const [blkSaving, setBlkSaving] = useState(false);

  const salvarBloqueio = async () => {
    if (!blkClinic || !blkDe) { toast.error('Escolha a clínica e a data.'); return; }
    const horas =
      blkPeriodo === 'dia' ? {} :
      blkPeriodo === 'manha' ? { start_time: '07:00', end_time: '12:00' } :
      blkPeriodo === 'tarde' ? { start_time: '12:00', end_time: '19:00' } :
      { start_time: blkIni, end_time: blkFim };
    setBlkSaving(true);
    try {
      const r = await clinicApi.blockPeriod(Number(blkClinic), {
        start_date: blkDe,
        end_date: blkAte || undefined,
        reason: blkMotivo || undefined,
        ...horas,
      });
      toast.success(`${r.created} dia${r.created !== 1 ? 's' : ''} bloqueado${r.created !== 1 ? 's' : ''}`);
      setBlockOpen(false);
      setBlkDe(''); setBlkAte(''); setBlkMotivo('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Erro ao bloquear');
    } finally {
      setBlkSaving(false);
    }
  };

  const removerBloqueio = async (e: ApptEvent) => {
    if (!window.confirm(`Remover o bloqueio de ${e.start_time}–${e.end_time}?`)) return;
    try {
      await clinicApi.deleteAppointment(e.id);
      toast.success('Bloqueio removido');
      fetchData();
    } catch {
      toast.error('Erro ao remover bloqueio');
    }
  };

  const { queue, isOnline, pendingCount, conflictCount, syncPending } =
    useOfflineAppointmentQueue();

  const fetchRef = useRef<AbortController | null>(null);

  // ── Derived date ranges ────────────────────────────────────────────────────

  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  // Dia busca a SEMANA inteira: alimenta a faixa de dias e evita refetch ao
  // navegar dentro da mesma semana.
  const rangeStart = view === 'mes' ? toISO(monthStart) : toISO(weekDays[0]);
  const rangeEnd   = view === 'mes' ? toISO(monthEnd)   : toISO(weekDays[6]);

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
          clinic_color: APPT_TYPE_COLOR[c.type] ?? '#64748B',
          appointment_type: c.type,
          status: 'completed',
          reason: c.diagnosis,
        });
      }

      // M16: agrupa blocos de funcionamento (clinic_block / walk_in_block) por data
      const blockMap: Record<string, any[]> = {};

      for (const e of clinicEvents) {
        if (e.source === 'clinic_block' || e.source === 'walk_in_block') {
          (blockMap[e.date] ??= []).push(e);
          continue;
        }
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
          notes: e.notes ?? e.reason,
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

      // M14: esconde/não conta os nomes de teste (mesmo filtro do chat da IA)
      setEvents(merged.filter(m => !isTestName(m.patient_name)));
      setBlocks(blockMap); // M16
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

  // Vindo da ficha do paciente ("Agendar" → /agenda?paciente=ID): abre o modal
  // de novo agendamento já com o paciente preenchido.
  const [prefillPatient, setPrefillPatient] = useState<{ id: number; name: string; phone?: string } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pid = new URLSearchParams(window.location.search).get('paciente');
    if (!pid) return;
    patientsApi.get(Number(pid))
      .then((p: any) => {
        setPrefillPatient({ id: p.id, name: p.name, phone: p.phone ?? '' });
        setEditingAppt(null);
        setFormOpen(true);
      })
      .catch(() => toast.error('Paciente não encontrado para agendar'));
    window.history.replaceState({}, '', '/agenda');
  }, []);

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

  // "Hoje" faz o que o nome diz: volta pra hoje NA VISÃO ATUAL. Escolher um
  // dia distante é papel do seletor de mês/ano + visão Mês.
  const goToday = () => { setCursor(new Date()); };

  const openPicker = () => {
    setPickerYear(cursor.getFullYear());
    setPickerOpen(o => !o);
  };

  // Escolheu um mês no popover → mostra o MÊS pra escolher o dia (clicar no
  // dia leva pra visão Dia, como sempre).
  const pickMonth = (m: number) => {
    setCursor(new Date(pickerYear, m, 1));
    setView('mes');
    setPickerOpen(false);
  };

  // ── Calendar helpers ───────────────────────────────────────────────────────

  const today = toISO(new Date());
  const isCursorToday = toISO(cursor) === today;

  // TODOS os eventos do dia, cancelados INCLUSIVE (visão Dia mostra o buraco
  // no turno; contagens usam aggregateDay, que separa cancelados).
  function allForDate(date: string): ApptEvent[] {
    return events.filter(e => e.date === date);
  }

  function blocksForDate(date: string): any[] {
    return blocks[date] ?? [];
  }

  // Month calendar grid
  const calendarDays: (Date | null)[] = [];
  const firstDow = (monthStart.getDay() + 6) % 7; // Mon=0
  for (let i = 0; i < firstDow; i++) calendarDays.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    calendarDays.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  }
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar
        title="Agenda"
        subtitle={isOnline ? undefined : 'Modo offline'}
        back="/"
        actions={
          <div className="flex items-center gap-2">
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
          </div>
        }
      />

      {/* ── Barra de comando única: ‹ [Mês Ano ▾] › · Hoje · visões ─────────── */}
      <div className="sticky top-16 z-20 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-2 flex-wrap relative">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            onClick={openPicker}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-1.5 text-base font-bold text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            aria-label="Escolher mês e ano"
          >
            {MONTHS_PT[cursor.getMonth()]} {cursor.getFullYear()}
            <span className="text-[10px] text-brand-600">▼</span>
          </button>

          <button
            onClick={() => navigate(1)}
            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <button
            onClick={goToday}
            disabled={isCursorToday}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold border transition-colors ${
              isCursorToday
                ? 'text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-800 cursor-default'
                : 'text-brand-600 bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-900 hover:bg-brand-100'
            }`}
          >
            Hoje
          </button>

          <button
            onClick={() => { setBlkDe(toISO(cursor)); setBlkClinic(clinics[0]?.id ?? ''); setBlockOpen(true); }}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title="Bloquear período na agenda (férias, almoço, congresso)"
          >
            🚫 Bloquear
          </button>

          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}

          <div className="ml-auto inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {(['dia', 'semana', 'mes'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  view === v
                    ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {v === 'mes' ? 'Mês' : v === 'semana' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>

          {/* Popover mês/ano */}
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
              <div className="absolute left-4 top-full mt-1 z-40 w-[290px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <button
                    onClick={() => setPickerYear(y => y - 1)}
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center"
                    aria-label="Ano anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-base font-bold text-slate-900 dark:text-slate-50">{pickerYear}</span>
                  <button
                    onClick={() => setPickerYear(y => y + 1)}
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center"
                    aria-label="Próximo ano"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {MONTHS_SHORT.map((m, i) => {
                    const isCur = i === cursor.getMonth() && pickerYear === cursor.getFullYear();
                    return (
                      <button
                        key={m}
                        onClick={() => pickMonth(i)}
                        className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                          isCur
                            ? 'bg-brand-600 text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-4">

        {/* ── VISÃO DIA (padrão) ────────────────────────────────────────────── */}
        {view === 'dia' && (() => {
          const iso = toISO(cursor);
          const all = allForDate(iso);
          const active = all.filter(e => e.status !== 'cancelled' && e.status !== 'blocked');
          const cancelledEvts = all.filter(e => e.status === 'cancelled');
          const agg = aggregateDay(all);
          const domColor = agg.clinics[0]?.color || FALLBACK_COLOR;
          const clinicTitle = agg.clinics.map(c => c.name).join(' + ') || 'Sem atendimento';
          const dateLabel = cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

          // Agrupa por horário de início; SEM horário = "Ordem de chegada"
          // (antes esses pacientes eram filtrados e sumiam da visão Dia — bug).
          const grupos: Record<string, ApptEvent[]> = {};
          active.forEach(e => {
            const k = e.start_time || 'chegada';
            (grupos[k] = grupos[k] || []).push(e);
          });
          const horarios = Object.keys(grupos).sort((a, b) => {
            if (a === 'chegada') return 1;
            if (b === 'chegada') return -1;
            return a < b ? -1 : 1;
          });

          return (
            <div className="space-y-4">
              {/* Faixa da semana: 1 clique pra qualquer dia (seg=CTO, ter=M.Bento…) */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weekDays.map(day => {
                  const dIso = toISO(day);
                  const dAgg = aggregateDay(allForDate(dIso));
                  const isActive = dIso === iso;
                  const dColor = dAgg.clinics[0]?.color || FALLBACK_COLOR;
                  const label = dAgg.total > 0
                    ? `${dAgg.clinics.map(c => c.name).join('+')} · ${dAgg.total}`
                    : '—';
                  return (
                    <button
                      key={dIso}
                      onClick={() => setCursor(day)}
                      className={`min-w-[86px] flex-shrink-0 rounded-xl border px-2 py-2 text-center transition-all ${
                        isActive
                          ? 'text-white border-transparent shadow-md'
                          : dAgg.total === 0
                          ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-45'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                      style={isActive ? { backgroundColor: dColor } : undefined}
                    >
                      <p className={`text-[11px] font-bold uppercase tracking-wide ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                        {WEEK_DAYS_LONG[day.getDay() === 0 ? 6 : day.getDay() - 1]}
                      </p>
                      <p className={`text-lg font-extrabold leading-tight ${isActive ? 'text-white' : dIso === today ? 'text-brand-600' : 'text-slate-800 dark:text-slate-100'}`}>
                        {day.getDate()}
                      </p>
                      <p className={`text-[11px] font-semibold truncate ${isActive ? 'text-white/90' : 'text-slate-500'}`}>
                        {label}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Cabeçalho do dia: a CLÍNICA é o título (dia fixo = clínica) */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ backgroundColor: domColor }} />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 capitalize">
                    {clinicTitle !== 'Sem atendimento' ? `${clinicTitle} — ` : ''}{dateLabel}
                  </h2>
                  {agg.total > 0 && (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {agg.total} paciente{agg.total !== 1 ? 's' : ''}
                      {agg.done > 0 && <> · <span className="text-emerald-600 font-semibold">✓ {agg.done} atendido{agg.done !== 1 ? 's' : ''}</span> · faltam {agg.total - agg.done}</>}
                    </span>
                  )}
                  {/* M16: encaixes do dia, agora visíveis onde importam */}
                  {blocksForDate(iso).filter(b => b.schedule_type === 'walk_in').map((b, bi) => (
                    <span key={`blk-${bi}`} className="text-xs font-semibold rounded-lg px-2 py-1"
                      style={{ backgroundColor: pastel(b.clinic_color || FALLBACK_COLOR), color: b.clinic_color || FALLBACK_COLOR }}>
                      encaixes {b.walk_in_count}/{b.walk_in_max}
                    </span>
                  ))}
                </div>
                {/* Faixas de bloqueio (férias/almoço) — clicar no ✕ remove */}
                {agg.blocked.map(b => (
                  <div
                    key={`blk-${b.id}`}
                    className="mt-3 flex items-center gap-2.5 rounded-xl px-3 py-2 bg-slate-100 dark:bg-slate-800 border-l-4 border-slate-400 dark:border-slate-600"
                  >
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      🚫 Bloqueado {b.start_time}–{b.end_time}
                      {b.notes ? <span className="font-normal text-slate-500"> · {b.notes}</span> : null}
                      {b.clinic_name ? <span className="font-normal text-slate-400"> · {shortClinic(b.clinic_name)}</span> : null}
                    </span>
                    <button
                      onClick={() => removerBloqueio(b)}
                      className="ml-auto text-xs font-bold text-slate-400 hover:text-red-500 px-2 py-1"
                      aria-label="Remover bloqueio"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Placar do turno: barra de progresso */}
                {agg.total > 0 && (
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.round((agg.done / agg.total) * 100)}%` }}
                    />
                  </div>
                )}

                {agg.total === 0 && cancelledEvts.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-400">Nenhum paciente neste dia.</p>
                )}

                {/* Grupos por horário de início */}
                {horarios.map(h => {
                  const gAgg = aggregateDay(grupos[h]);
                  return (
                    <div key={h} className="mt-4">
                      <div className="flex items-baseline gap-2.5 mb-2">
                        <span className="text-[15px] font-mono font-bold text-slate-800 dark:text-slate-100">
                          {h === 'chegada' ? 'Ordem de chegada' : h}
                        </span>
                        <span className="text-xs text-slate-500">
                          {gAgg.total} paciente{gAgg.total !== 1 ? 's' : ''}
                          {gAgg.conf > 0 && ` · ${gAgg.conf} confirmado${gAgg.conf !== 1 ? 's' : ''}`}
                          {gAgg.pend > 0 && ` · ${gAgg.pend} pendente${gAgg.pend !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {grupos[h].map(e => {
                          const color = e.clinic_color || FALLBACK_COLOR;
                          const done = e.status === 'completed';
                          const pend = e.status === 'pending' || e.status === 'pending_offline';
                          return (
                            <div
                              key={e.id}
                              onClick={() => openEdit(e)}
                              className={`cursor-pointer flex items-center gap-2.5 rounded-xl px-3 py-2 min-h-[44px] transition-all hover:shadow-sm ${
                                done ? 'opacity-55' : ''
                              }`}
                              style={{
                                backgroundColor: pend ? pastel(color, '0D') : pastel(color),
                                // longhands: misturar shorthand borderLeft com a
                                // chave border no mesmo objeto faz o React descartar
                                borderLeftWidth: 4,
                                borderLeftStyle: pend ? 'dashed' : 'solid',
                                borderLeftColor: color,
                                outline: pend ? `1.5px dashed ${color}66` : undefined,
                                outlineOffset: pend ? '-1.5px' : undefined,
                              }}
                              title={`${e.patient_name} · ${STATUS_LABEL[e.status] ?? e.status}`}
                            >
                              <p className="flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {done && <span className="text-emerald-600 font-extrabold">✓ </span>}
                                {pend && <span>⏱ </span>}
                                {e._isOffline && '⚠ '}
                                {e.patient_name}
                              </p>
                              <span className="text-xs text-slate-500 flex-shrink-0">
                                {e.appointment_type || (pend ? 'pendente' : '')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Cancelados: visíveis (o buraco no turno é informação), compactos */}
                {cancelledEvts.length > 0 && (
                  <div className="mt-4 space-y-1">
                    {cancelledEvts.map(e => (
                      <div
                        key={e.id}
                        onClick={() => openEdit(e)}
                        className="cursor-pointer flex items-center gap-2.5 rounded-lg px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-l-4 border-slate-300 dark:border-slate-700 opacity-70"
                      >
                        <p className="flex-1 min-w-0 text-sm text-slate-400 line-through truncate">{e.patient_name}</p>
                        <span className="text-xs text-slate-400">cancelou</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── VISÃO SEMANA = LISTA "Minha semana" ───────────────────────────── */}
        {view === 'semana' && (
          <div className="space-y-2">
            {weekDays.map(day => {
              const dIso = toISO(day);
              const dAgg = aggregateDay(allForDate(dIso));
              const isToday = dIso === today;
              const empty = dAgg.total === 0 && dAgg.cancelled === 0;
              const stParts: string[] = [];
              if (dAgg.conf > 0) stParts.push(`${dAgg.conf} confirmado${dAgg.conf !== 1 ? 's' : ''}`);
              if (dAgg.pend > 0) stParts.push(`${dAgg.pend} pendente${dAgg.pend !== 1 ? 's' : ''}`);
              if (dAgg.done > 0) stParts.push(`✓ ${dAgg.done} atendido${dAgg.done !== 1 ? 's' : ''}`);
              if (dAgg.cancelled > 0) stParts.push(`${dAgg.cancelled} cancelado${dAgg.cancelled !== 1 ? 's' : ''}`);
              if (dAgg.blocked.length > 0) stParts.push(`🚫 bloqueio ${dAgg.blocked[0].start_time}–${dAgg.blocked[0].end_time}`);
              return (
                <button
                  key={dIso}
                  onClick={() => { setCursor(day); setView('dia'); }}
                  className={`w-full flex items-center gap-3.5 rounded-2xl border bg-white dark:bg-slate-950 px-4 py-3 text-left transition-all hover:shadow-sm ${
                    isToday
                      ? 'border-2 border-brand-500'
                      : 'border-slate-200 dark:border-slate-800'
                  } ${empty ? 'opacity-50' : ''}`}
                >
                  <span className="w-14 text-center flex-shrink-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {WEEK_DAYS_LONG[day.getDay() === 0 ? 6 : day.getDay() - 1]}
                    </span>
                    <span className={`text-xl font-extrabold ${isToday ? 'text-brand-600' : 'text-slate-800 dark:text-slate-100'}`}>
                      {day.getDate()}
                    </span>
                  </span>
                  <span className="w-1 self-stretch rounded-full flex flex-col overflow-hidden flex-shrink-0">
                    {dAgg.clinics.length > 0
                      ? dAgg.clinics.map(c => (
                          <span key={c.name} className="flex-1" style={{ backgroundColor: c.color }} />
                        ))
                      : <span className="flex-1 bg-slate-200 dark:bg-slate-700" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-bold text-slate-800 dark:text-slate-100 truncate">
                      {dAgg.clinics.map(c => c.name).join(' + ') || 'Sem atendimento'}
                    </span>
                    {stParts.length > 0 && (
                      <span className="block text-xs text-slate-500 truncate">{stParts.join(' · ')}</span>
                    )}
                  </span>
                  {dAgg.total > 0 && (
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap flex-shrink-0">
                      {dAgg.total} pac.
                    </span>
                  )}
                  <span className="text-slate-300 dark:text-slate-600 flex-shrink-0">›</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── VISÃO MÊS (planejamento / remarcação) ─────────────────────────── */}
        {view === 'mes' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950">
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
              {WEEK_DAYS_LONG.map(d => (
                <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                if (!day) return (
                  <div key={`empty-${i}`} className="min-h-[96px] border-b border-r border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/30" />
                );
                const iso = toISO(day);
                const dAgg = aggregateDay(allForDate(iso));
                const isToday = iso === today;

                return (
                  <div
                    key={iso}
                    className={`min-h-[96px] border-b border-r border-slate-100 dark:border-slate-800/50 p-1.5 cursor-pointer transition-colors space-y-1
                      ${isToday ? 'bg-brand-50 dark:bg-brand-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                    onClick={() => { setCursor(day); setView('dia'); }}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isToday ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {day.getDate()}
                    </div>

                    {/* Bloqueio do dia (férias/almoço) */}
                    {dAgg.blocked.length > 0 && (
                      <div className="rounded-md px-1.5 py-0.5 text-[11px] font-bold truncate bg-slate-100 dark:bg-slate-800 text-slate-500">
                        🚫 Bloqueado
                      </div>
                    )}

                    {/* Chips por clínica: contagem + pendentes (decide "cabe mais um?") */}
                    {dAgg.clinics.map(c => (
                      <div
                        key={c.name}
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-bold truncate flex items-baseline justify-between gap-1"
                        style={{ backgroundColor: pastel(c.color), color: c.color }}
                        title={`${c.n} paciente(s) · ${c.name}${c.pend > 0 ? ` · ${c.pend} pendente(s)` : ''}`}
                      >
                        <span className="truncate">{c.name} {c.n}</span>
                        {c.pend > 0 && <span className="text-[10px] font-semibold opacity-75 flex-shrink-0">{c.pend} pend.</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {events.filter(e => e.date >= rangeStart && e.date <= rangeEnd).length === 0 && !loading && view !== 'dia' && (
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

      {/* FAB — sempre pré-preenche uma data (dia = cursor; demais = hoje) */}
      {/* right-44: não fica atrás dos botões flutuantes de chat (IA/equipe) */}
      <button
        onClick={() => openCreate(view === 'dia' ? toISO(cursor) : today)}
        className="fixed bottom-6 right-44 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-30"
        aria-label="Novo agendamento"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Modal Bloquear período */}
      {blockOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setBlockOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-3">
            <p className="text-base font-bold text-slate-900 dark:text-slate-50">🚫 Bloquear horário</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Férias, almoço, congresso… O bot e as secretárias não conseguem marcar em cima de um bloqueio.
            </p>

            <label className="block text-xs font-semibold text-slate-500">Clínica</label>
            <select
              value={blkClinic}
              onChange={e => setBlkClinic(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm"
            >
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">De</label>
                <input type="date" value={blkDe} onChange={e => setBlkDe(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Até (opcional)</label>
                <input type="date" value={blkAte} onChange={e => setBlkAte(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
              </div>
            </div>

            <label className="block text-xs font-semibold text-slate-500">Período</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([['dia', 'Dia todo'], ['manha', 'Manhã'], ['tarde', 'Tarde'], ['custom', 'Horário']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setBlkPeriodo(k)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold border transition-colors ${
                    blkPeriodo === k
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {blkPeriodo === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <input type="time" value={blkIni} onChange={e => setBlkIni(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
                <input type="time" value={blkFim} onChange={e => setBlkFim(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
              </div>
            )}

            <label className="block text-xs font-semibold text-slate-500">Motivo (opcional)</label>
            <input
              value={blkMotivo}
              onChange={e => setBlkMotivo(e.target.value)}
              placeholder="Férias, congresso, almoço…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm"
            />

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setBlockOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={salvarBloqueio}
                disabled={blkSaving}
                className="flex-1 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
              >
                {blkSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Bloquear
              </button>
            </div>
          </div>
        </>
      )}

      {/* Form modal */}
      {formOpen && (
        <AppointmentFormModal
          open={formOpen}
          onOpenChange={(o) => { setFormOpen(o); if (!o) setPrefillPatient(null); }}
          clinics={clinics}
          initialDate={createDate}
          editingAppointment={editingAppt}
          initialPatient={prefillPatient}
          onSaved={handleSaved}
          onCancelled={handleCancelled}
        />
      )}
    </div>
    </PageWithSidebar>
  );
}
