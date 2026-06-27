'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Clock, CheckCircle, AlertCircle, Activity,
  Plus, Trash2, Play, Pause, UserCheck, Loader2, X,
} from 'lucide-react';
import NavBar from '@/components/NavBar';
import { PageWithSidebar } from '@/components/PageWithSidebar';
import { Card, CardContent, Badge, Button, Modal, useModal } from '@/components/ui';
import { patientsApi } from '@/lib/api';
import toast from 'react-hot-toast';

type PatientStatus = 'waiting' | 'attending' | 'exam' | 'completed';

interface PanelPatient {
  id: number;
  name: string;
  status: PatientStatus;
  arrivedAt: number;     // timestamp de chegada à fila
  startTime?: number;    // timestamp início do atendimento
  pausedTime?: number;   // segundos acumulados pausados
  isPaused?: boolean;
  examReturn?: number;   // timestamp esperado de retorno do exame
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function PanelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
        <div className="col-span-2 h-48 rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

export default function PanelPage() {
  const [patients, setPatients] = useState<PanelPatient[]>([]);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Modal: adicionar paciente
  const addModal = useModal();
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');

  // Modal: confirmar remoção
  const removeModal = useModal();
  const [toRemove, setToRemove] = useState<PanelPatient | null>(null);

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load patients for autocomplete
  useEffect(() => {
    patientsApi.list().then(setAllPatients).catch(() => toast.error('Erro ao carregar pacientes'));
  }, []);

  // Persist/restore panel from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('painel_v2');
    if (saved) {
      try { setPatients(JSON.parse(saved)); } catch { setPatients([]); }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) localStorage.setItem('painel_v2', JSON.stringify(patients));
  }, [patients, loading]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const addPatient = useCallback(() => {
    if (!selectedPatientId) return toast.error('Selecione um paciente');
    const id = Number(selectedPatientId);
    if (patients.some(p => p.id === id)) return toast.error('Paciente já está no painel');
    const found = allPatients.find(p => p.id === id);
    if (!found) return;
    setPatients(prev => [...prev, { id, name: found.name, status: 'waiting', arrivedAt: Date.now() }]);
    setSelectedPatientId('');
    addModal.onOpenChange(false);
    toast.success(`${found.name} adicionado à fila`);
  }, [selectedPatientId, patients, allPatients, addModal]);

  const confirmRemove = (p: PanelPatient) => {
    setToRemove(p);
    removeModal.onOpenChange(true);
  };

  const doRemove = () => {
    if (!toRemove) return;
    setPatients(prev => prev.filter(p => p.id !== toRemove.id));
    setToRemove(null);
    removeModal.onOpenChange(false);
    toast.success('Paciente removido do painel');
  };

  const startAttending = (id: number) => {
    setPatients(prev => prev.map(p =>
      p.id === id ? { ...p, status: 'attending', startTime: Date.now(), pausedTime: 0, isPaused: false } : p
    ));
    toast.success('Atendimento iniciado');
  };

  const togglePause = (id: number) => {
    setPatients(prev => prev.map(p => {
      if (p.id !== id) return p;
      return p.isPaused
        ? { ...p, isPaused: false, startTime: Date.now() - (p.pausedTime ?? 0) * 1000 }
        : { ...p, isPaused: true, pausedTime: Math.floor((now - (p.startTime ?? now)) / 1000) };
    }));
  };

  const sendToExam = (id: number) => {
    setPatients(prev => prev.map(p =>
      p.id === id ? { ...p, status: 'exam', examReturn: Date.now() + 15 * 60 * 1000 } : p
    ));
    toast.success('Enviado para exame — retorna em 15 min');
  };

  const completeAttendance = (id: number) => {
    setPatients(prev => prev.map(p =>
      p.id === id ? { ...p, status: 'completed', startTime: undefined, examReturn: undefined } : p
    ));
    toast.success('Atendimento finalizado');
  };

  const returnFromExam = (id: number) => {
    setPatients(prev => prev.map(p =>
      p.id === id ? { ...p, status: 'attending', startTime: p.startTime ?? Date.now(), examReturn: undefined } : p
    ));
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const elapsed = (p: PanelPatient): string => {
    if (!p.startTime) return '00:00';
    if (p.isPaused) return formatDuration((p.pausedTime ?? 0) * 1000);
    return formatDuration(now - p.startTime);
  };

  const waiting = patients.filter(p => p.status === 'waiting');
  const attending = patients.filter(p => p.status === 'attending');
  const exam = patients.filter(p => p.status === 'exam');
  const completed = patients.filter(p => p.status === 'completed');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar
        title="Painel de Atendimento"
        subtitle={`${patients.length} pacientes · ${attending.length} em atendimento`}
        actions={
          <Button size="md" icon={<Plus className="h-5 w-5" />} onClick={() => addModal.onOpenChange(true)}>
            Adicionar
          </Button>
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        {loading ? <PanelSkeleton /> : (
          <>
            {/* ── KPI strip ── */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Aguardando',     count: waiting.length,   color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',   Icon: AlertCircle },
                { label: 'Em atendimento', count: attending.length, color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/20', Icon: Activity },
                { label: 'Em exame',       count: exam.length,      color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', Icon: Clock },
                { label: 'Atendidos',      count: completed.length, color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-900/20', Icon: CheckCircle },
              ].map(({ label, count, color, bg, Icon }) => (
                <div key={label} className={`rounded-xl p-4 flex items-center gap-3 ${bg}`}>
                  <Icon className={`w-8 h-8 ${color} flex-shrink-0`} />
                  <div>
                    <p className={`text-2xl font-bold ${color}`}>{count}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Main layout ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

              {/* Fila de espera */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  <h2 className="font-bold text-slate-900 dark:text-slate-50">
                    Aguardando ({waiting.length})
                  </h2>
                </div>

                {waiting.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 py-10 text-center">
                    <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Fila vazia</p>
                  </div>
                ) : waiting.map((p, idx) => (
                  <Card key={p.id} shadow="sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                            <p className="font-semibold text-slate-900 dark:text-slate-50 text-sm">{p.name}</p>
                          </div>
                          <p className="text-xs text-slate-400">
                            Aguarda há {formatDuration(now - p.arrivedAt)}
                          </p>
                        </div>
                        <button
                          onClick={() => confirmRemove(p)}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                          aria-label={`Remover ${p.name} da fila`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <Button
                        size="sm"
                        fullWidth
                        onClick={() => startAttending(p.id)}
                        className="bg-amber-500 hover:bg-amber-600 text-white"
                      >
                        Iniciar atendimento
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Em atendimento */}
              <div className="col-span-1 lg:col-span-2 space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-amber-600" />
                  <h2 className="font-bold text-slate-900 dark:text-slate-50">
                    Em Atendimento ({attending.length})
                  </h2>
                </div>

                {attending.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 py-16 text-center">
                    <UserCheck className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Nenhum paciente em atendimento</p>
                    <p className="text-xs text-slate-300 mt-1">Inicie o atendimento de um paciente da fila</p>
                  </div>
                ) : attending.map(p => (
                  <Card key={p.id} className="border-2 border-amber-300 dark:border-amber-700">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">{p.name}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Na clínica há {formatDuration(now - p.arrivedAt)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-4xl font-mono font-bold ${p.isPaused ? 'text-slate-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {elapsed(p)}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {p.isPaused ? 'pausado' : 'em atendimento'}
                          </p>
                        </div>
                      </div>

                      {p.isPaused && (
                        <Badge variant="warning" size="md">⏸ Pausado</Badge>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={p.isPaused ? 'secondary' : 'tertiary'}
                          icon={p.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                          onClick={() => togglePause(p.id)}
                        >
                          {p.isPaused ? 'Retomar' : 'Pausar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="tertiary"
                          icon={<Clock className="w-4 h-4" />}
                          onClick={() => sendToExam(p.id)}
                        >
                          Enviar p/ exame
                        </Button>
                        <Button
                          size="sm"
                          variant="success"
                          icon={<CheckCircle className="w-4 h-4" />}
                          onClick={() => completeAttendance(p.id)}
                        >
                          Finalizar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<Trash2 className="w-4 h-4" />}
                          onClick={() => confirmRemove(p)}
                        >
                          Remover
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Em exame */}
            {exam.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-600" />
                  <h2 className="font-bold text-slate-900 dark:text-slate-50">Em Exame ({exam.length})</h2>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {exam.map(p => {
                    const remaining = Math.max(0, (p.examReturn ?? now) - now);
                    return (
                      <Card key={p.id} className="border-l-4 border-purple-500">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-slate-50 text-sm">{p.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">Retorna em:</p>
                            </div>
                            <div className={`text-2xl font-mono font-bold ${remaining < 60000 ? 'text-red-500' : 'text-purple-600 dark:text-purple-400'}`}>
                              {formatDuration(remaining)}
                            </div>
                          </div>
                          <Button size="sm" fullWidth variant="secondary" onClick={() => returnFromExam(p.id)}>
                            Retornou
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Atendidos */}
            {completed.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <h2 className="font-bold text-slate-900 dark:text-slate-50">Atendidos ({completed.length})</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {completed.map(p => (
                    <Card key={p.id} className="opacity-60">
                      <CardContent className="p-3 text-center space-y-2">
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                        <p className="text-xs font-semibold text-slate-500 line-through truncate">{p.name}</p>
                        <button
                          onClick={() => confirmRemove(p)}
                          className="text-xs text-slate-300 hover:text-red-400 transition-colors"
                          aria-label={`Remover ${p.name}`}
                        >
                          Remover
                        </button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal: Adicionar Paciente */}
      <Modal
        open={addModal.open}
        onOpenChange={addModal.onOpenChange}
        title="Adicionar Paciente ao Painel"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="tertiary" onClick={() => addModal.onOpenChange(false)}>Cancelar</Button>
            <Button onClick={addPatient}>Adicionar</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
              Selecione o paciente
            </label>
            <select
              value={selectedPatientId}
              onChange={e => setSelectedPatientId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Escolha um paciente...</option>
              {allPatients
                .filter(p => !patients.some(pp => pp.id === p.id))
                .map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              {allPatients.filter(p => !patients.some(pp => pp.id === p.id)).length} pacientes disponíveis
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal: Confirmar Remoção */}
      <Modal
        open={removeModal.open}
        onOpenChange={removeModal.onOpenChange}
        title="Remover do painel?"
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => { removeModal.onOpenChange(false); setToRemove(null); }}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth onClick={doRemove}>
              Remover
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Deseja remover <strong>{toRemove?.name}</strong> do painel de atendimento?
          {toRemove?.status === 'attending' && (
            <span className="block mt-2 text-amber-600 font-medium">⚠ Este paciente está em atendimento.</span>
          )}
        </p>
      </Modal>
    </div>
    </PageWithSidebar>
  );
}
