'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Clock, UserCheck, UserX, Play, CheckCircle, Timer,
  Plus, Trash2, RefreshCw, Search, ChevronRight, Stethoscope,
} from 'lucide-react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import { PageWithSidebar } from '@/components/PageWithSidebar';
import { Card, CardContent, Badge, Button, Modal, useModal } from '@/components/ui';
import { patientsApi, waitingRoomApi, clinicApi } from '@/lib/api';
import toast from 'react-hot-toast';
import ConsultaDrawer, { WaitingRoomEntry } from './ConsultaDrawer';

// ── Types ──────────────────────────────────────────────────────────────────

type QueueStatus = 'waiting' | 'attending' | 'attended' | 'absent';

type Filter = 'all' | QueueStatus;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function formatWait(minutes: number | null): string {
  if (minutes === null || minutes < 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function statusLabel(s: QueueStatus): string {
  const map: Record<QueueStatus, string> = {
    waiting: 'Aguardando',
    attending: 'Em Atendimento',
    attended: 'Atendido',
    absent: 'Ausente',
  };
  return map[s] ?? s;
}

function statusBadgeVariant(s: QueueStatus): 'warning' | 'success' | 'neutral' | 'error' {
  const map: Record<QueueStatus, 'warning' | 'success' | 'neutral' | 'error'> = {
    waiting: 'warning',
    attending: 'success',
    attended: 'neutral',
    absent: 'error',
  };
  return map[s] ?? 'neutral';
}

const INSURANCE_COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
];

function insuranceColor(name: string | null): string {
  if (!name) return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return INSURANCE_COLORS[Math.abs(hash) % INSURANCE_COLORS.length];
}

// ── Patient card ───────────────────────────────────────────────────────────

interface PatientCardProps {
  entry: WaitingRoomEntry;
  onStatusChange: (id: number, status: QueueStatus) => Promise<void>;
  onRemove: (id: number) => void;
  onSelect: (entry: WaitingRoomEntry) => void;
  busy: boolean;
  selected: boolean;
}

function PatientCard({ entry, onStatusChange, onRemove, onSelect, busy, selected }: PatientCardProps) {
  const isAttended = entry.status === 'attended';
  const isAbsent = entry.status === 'absent';
  const isDimmed = isAttended || isAbsent;

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 cursor-pointer ${
        selected
          ? 'border-blue-500 dark:border-blue-400 shadow-md shadow-blue-100 dark:shadow-blue-950 ring-2 ring-blue-500/30'
          : entry.status === 'attending'
          ? 'border-green-400 dark:border-green-600 shadow-sm shadow-green-100 dark:shadow-green-950'
          : entry.status === 'waiting'
          ? 'border-amber-300 dark:border-amber-700'
          : 'border-slate-200 dark:border-slate-700'
      } bg-white dark:bg-slate-900 ${isDimmed ? 'opacity-55' : ''}`}
      onClick={() => onSelect(entry)}
    >
      {entry.status === 'attending' && !selected && (
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
      )}

      <div className="px-3 py-2.5">
        {/* Row 1: position + name + time + wait */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              selected
                ? 'bg-blue-500 text-white'
                : entry.status === 'attending'
                ? 'bg-green-500 text-white'
                : entry.status === 'waiting'
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {entry.position}
          </span>
          <p
            className={`flex-1 min-w-0 font-semibold text-sm text-slate-900 dark:text-slate-50 truncate ${
              isAttended ? 'line-through text-slate-400 dark:text-slate-500' : ''
            }`}
          >
            {entry.patient_name}
          </p>
          <div className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-3 h-3" />
            <span>{formatTime(entry.arrived_at)}</span>
            <span className={`ml-1 font-medium ${(entry.waited_minutes ?? 0) > 30 ? 'text-red-500 dark:text-red-400' : ''}`}>
              · {formatWait(entry.waited_minutes)}
            </span>
          </div>
        </div>

        {/* Row 2: insurance + status badge + actions */}
        <div className="flex items-center gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${insuranceColor(entry.patient_insurance)}`}>
            {entry.patient_insurance ?? 'Particular'}
          </span>
          {entry.reason && (
            <span className="text-[10px] text-slate-400 truncate min-w-0 flex-1">{entry.reason}</span>
          )}
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            {entry.status === 'waiting' && (
              <>
                <button
                  onClick={() => onStatusChange(entry.id, 'attending')}
                  disabled={busy}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 text-white text-[10px] font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  <Play className="w-3 h-3" /> Chamar
                </button>
                <button
                  onClick={() => onStatusChange(entry.id, 'absent')}
                  disabled={busy}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  <UserX className="w-3 h-3" />
                </button>
              </>
            )}
            {entry.status === 'attending' && (
              <button
                onClick={() => onStatusChange(entry.id, 'attended')}
                disabled={busy}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle className="w-3 h-3" /> Concluir
              </button>
            )}
            {(entry.status === 'attended' || entry.status === 'absent') && (
              <button
                onClick={() => onStatusChange(entry.id, 'waiting')}
                disabled={busy}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500 text-white text-[10px] font-semibold hover:bg-amber-600 disabled:opacity-50"
              >
                <Play className="w-3 h-3" /> Recolocar
              </button>
            )}
            <button
              onClick={() => onRemove(entry.id)}
              disabled={busy}
              className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
              title="Remover da fila"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function SalaDeEsperaPage() {
  const [entries, setEntries] = useState<WaitingRoomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [clinics, setClinics] = useState<any[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<number | undefined>(undefined);

  // Drawer state
  const [selectedEntry, setSelectedEntry] = useState<WaitingRoomEntry | null>(null);

  const checkinModal = useModal();
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [checkinReason, setCheckinReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQueue = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const data = await waitingRoomApi.today(selectedClinicId);
        setEntries(data);
        // Sync selected entry with fresh data
        setSelectedEntry((prev) => {
          if (!prev) return null;
          const fresh = data.find((e: WaitingRoomEntry) => e.id === prev.id);
          return fresh ?? null;
        });
      } catch {
        if (!silent) toast.error('Erro ao carregar sala de espera');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedClinicId]
  );

  useEffect(() => {
    fetchQueue();
    intervalRef.current = setInterval(() => fetchQueue(true), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchQueue]);

  // Update waited_minutes client-side every minute
  useEffect(() => {
    const tick = setInterval(() => {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.status === 'attended' || e.status === 'absent') return e;
          const arrived = new Date(e.arrived_at);
          const waited = Math.floor((Date.now() - arrived.getTime()) / 60_000);
          return { ...e, waited_minutes: waited };
        })
      );
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    clinicApi.list().then(setClinics).catch(() => {});
  }, []);

  useEffect(() => {
    if (checkinModal.open) {
      patientsApi.list().then(setAllPatients).catch(() => {});
    }
  }, [checkinModal.open]);

  const countBy = (s: QueueStatus) => entries.filter((e) => e.status === s).length;
  const waitingCount = countBy('waiting');
  const attendingCount = countBy('attending');
  const attendedCount = countBy('attended');
  const absentCount = countBy('absent');

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.status === filter);

  const handleStatusChange = async (id: number, newStatus: QueueStatus) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      const updated = await waitingRoomApi.updateStatus(id, newStatus);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...updated } : e)));
      // Sync selected entry status
      setSelectedEntry((prev) => (prev && prev.id === id ? { ...prev, ...updated } : prev));
      const labels: Record<QueueStatus, string> = {
        waiting: 'voltou para aguardando',
        attending: 'chamado para atendimento',
        attended: 'atendimento concluído',
        absent: 'marcado como ausente',
      };
      toast.success(`Paciente ${labels[newStatus]}`);
    } catch {
      toast.error('Erro ao atualizar status');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRemove = async (id: number) => {
    if (!confirm('Remover este paciente da fila?')) return;
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await waitingRoomApi.remove(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setSelectedEntry((prev) => (prev && prev.id === id ? null : prev));
      toast.success('Paciente removido da fila');
    } catch {
      toast.error('Erro ao remover paciente');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCheckin = async () => {
    if (!selectedPatient) {
      toast.error('Selecione um paciente');
      return;
    }
    setSubmitting(true);
    try {
      const entry = await waitingRoomApi.checkin({
        patient_id: selectedPatient.id,
        clinic_id: selectedClinicId,
        reason: checkinReason || undefined,
      });
      setEntries((prev) => [...prev, entry]);
      checkinModal.onOpenChange(false);
      setSelectedPatient(null);
      setPatientSearch('');
      setCheckinReason('');
      toast.success(`${selectedPatient.name} registrado na fila`);
    } catch {
      toast.error('Erro ao registrar chegada');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectEntry = (entry: WaitingRoomEntry) => {
    setSelectedEntry((prev) => (prev && prev.id === entry.id ? null : entry));
  };

  const filteredPatients = patientSearch
    ? allPatients.filter(
        (p) =>
          p.name?.toLowerCase().includes(patientSearch.toLowerCase()) ||
          p.cpf?.includes(patientSearch)
      )
    : allPatients;

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: entries.length },
    { key: 'waiting', label: 'Aguardando', count: waitingCount },
    { key: 'attending', label: 'Em Atendimento', count: attendingCount },
    { key: 'attended', label: 'Atendidos', count: attendedCount },
    { key: 'absent', label: 'Ausentes', count: absentCount },
  ];

  const drawerOpen = selectedEntry !== null;

  return (
    <PageWithSidebar>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <NavBar
          title="Sala de Espera"
          subtitle={today}
          actions={
            <div className="flex items-center gap-3">
              {clinics.length > 1 && (
                <select
                  value={selectedClinicId ?? ''}
                  onChange={(e) =>
                    setSelectedClinicId(e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50"
                >
                  <option value="">Todas as clínicas</option>
                  {clinics.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
                onClick={() => fetchQueue(true)}
                disabled={refreshing}
              >
                Atualizar
              </Button>
              <Button
                size="md"
                icon={<Plus className="w-5 h-5" />}
                onClick={() => checkinModal.onOpenChange(true)}
              >
                Registrar Chegada
              </Button>
            </div>
          }
        />

        {/* Main layout: queue list + optional drawer */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── Queue list ── */}
          <main
            className={`flex-shrink-0 overflow-y-auto transition-all duration-300 ${
              drawerOpen ? 'w-[40%] min-w-[280px]' : 'w-full'
            }`}
          >
            <div className="px-4 py-6 space-y-6">
              {/* Stats */}
              {drawerOpen ? (
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                  {[
                    { label: 'Aguard.', count: waitingCount, color: 'text-amber-600 dark:text-amber-400', icon: <Timer className="w-3.5 h-3.5" /> },
                    { label: 'Atend.', count: attendingCount, color: 'text-green-600 dark:text-green-400', icon: <UserCheck className="w-3.5 h-3.5" /> },
                    { label: 'Concl.', count: attendedCount, color: 'text-blue-600 dark:text-blue-400', icon: <CheckCircle className="w-3.5 h-3.5" /> },
                    { label: 'Aus.', count: absentCount, color: 'text-red-500 dark:text-red-400', icon: <UserX className="w-3.5 h-3.5" /> },
                  ].map(({ label, count, color, icon }) => (
                    <div key={label} className={`flex items-center gap-1 ${color} flex-1 justify-center`}>
                      {icon}
                      <span className="font-bold text-sm">{count}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([
                    { label: 'Aguardando', count: waitingCount, colorClass: 'amber', icon: <Timer className="w-5 h-5" /> },
                    { label: 'Em Atendimento', count: attendingCount, colorClass: 'green', icon: <UserCheck className="w-5 h-5" /> },
                    { label: 'Atendidos', count: attendedCount, colorClass: 'blue', icon: <CheckCircle className="w-5 h-5" /> },
                    { label: 'Ausentes', count: absentCount, colorClass: 'red', icon: <UserX className="w-5 h-5" /> },
                  ] as const).map(({ label, count, colorClass, icon }) => (
                    <Card key={label} shadow="sm">
                      <CardContent className="flex items-center gap-3 pt-4 pb-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-${colorClass}-100 dark:bg-${colorClass}-900/30 text-${colorClass}-600 dark:text-${colorClass}-400`}>
                          {icon}
                        </div>
                        <div>
                          <p className={`text-2xl font-bold text-${colorClass}-600 dark:text-${colorClass}-400`}>{count}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Filter tabs */}
              <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
                {filterTabs.map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                      filter === key
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {drawerOpen ? '' : label}
                    {drawerOpen && <span title={label}>{label.slice(0, 3)}</span>}
                    <span
                      className={`inline-flex items-center justify-center text-xs w-5 h-5 rounded-full ${
                        filter === key
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Queue list */}
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="h-32 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 animate-pulse"
                    />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <UserCheck className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">
                    {filter === 'all'
                      ? 'Nenhum paciente na fila hoje'
                      : `Nenhum paciente com status "${statusLabel(filter as QueueStatus)}"`}
                  </p>
                  {filter === 'all' && (
                    <Button
                      className="mt-4"
                      variant="secondary"
                      icon={<Plus className="w-4 h-4" />}
                      onClick={() => checkinModal.onOpenChange(true)}
                    >
                      Registrar primeiro paciente
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((entry) => (
                    <PatientCard
                      key={entry.id}
                      entry={entry}
                      onStatusChange={handleStatusChange}
                      onRemove={handleRemove}
                      onSelect={handleSelectEntry}
                      busy={busyIds.has(entry.id)}
                      selected={selectedEntry?.id === entry.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>

          {/* ── Drawer panel ── */}
          {drawerOpen && selectedEntry && (
            <div className="flex-1 border-l border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
              <ConsultaDrawer
                entry={selectedEntry}
                onClose={() => setSelectedEntry(null)}
                onStatusChange={handleStatusChange}
              />
            </div>
          )}
        </div>

        {/* Checkin Modal */}
        <Modal
          open={checkinModal.open}
          onOpenChange={checkinModal.onOpenChange}
          title="Registrar Chegada"
          size="md"
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="tertiary" onClick={() => checkinModal.onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCheckin} isLoading={submitting}>
                Registrar
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1.5">
                Buscar paciente
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nome ou CPF..."
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setSelectedPatient(null);
                  }}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {!selectedPatient && (
              <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPatients.slice(0, 30).map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPatient(p);
                      setPatientSearch(p.name);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{p.name}</p>
                      {!p.consultation_count && (
                        <span className="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-semibold shrink-0">
                          🆕 novo
                        </span>
                      )}
                    </div>
                    {p.cpf && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">CPF: {p.cpf}</p>
                    )}
                  </button>
                ))}
                {filteredPatients.length === 0 && (
                  <p className="text-center py-6 text-sm text-slate-400">Nenhum paciente encontrado</p>
                )}
              </div>
            )}

            {selectedPatient && (
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                      {selectedPatient.name}
                    </p>
                    {!selectedPatient.consultation_count && (
                      <span className="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-semibold">
                        🆕 Paciente novo
                      </span>
                    )}
                  </div>
                  {selectedPatient.cpf && (
                    <p className="text-xs text-green-600 dark:text-green-400">CPF: {selectedPatient.cpf}</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedPatient(null);
                    setPatientSearch('');
                  }}
                  className="text-xs text-green-600 dark:text-green-400 hover:underline"
                >
                  Trocar
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1.5">
                Motivo da visita <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {["Retorno", "Procedimento", "Consulta Nova"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setCheckinReason(opt)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      checkinReason === opt
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Ex: Retorno, Consulta, Curativo..."
                value={checkinReason}
                onChange={(e) => setCheckinReason(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </Modal>
      </div>
    </PageWithSidebar>
  );
}
