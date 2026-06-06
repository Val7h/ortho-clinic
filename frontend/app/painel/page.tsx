'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Clock, CheckCircle, AlertCircle, Activity,
  Plus, Trash2, Play, Pause, StopCircle, XCircle
} from 'lucide-react';
import NavBar from '@/components/NavBar';
import { Card, CardContent, Badge, Button, Modal, useModal } from '@/components/ui';
import { patientsApi, consultationsApi } from '@/lib/api';
import toast from 'react-hot-toast';

type PatientStatus = 'waiting' | 'attending' | 'exam' | 'completed';

interface PanelPatient {
  id: number;
  name: string;
  status: PatientStatus;
  consultationId?: number;
  startTime?: number; // timestamp
  pausedTime?: number; // accumulated paused time in seconds
  isPaused?: boolean;
  examReturn?: number; // timestamp when exam ends
}

export default function PanelPage() {
  const [patients, setPatients] = useState<PanelPatient[]>([]);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const addModal = useModal();
  const [selectedPatient, setSelectedPatient] = useState<any>(null);

  // Load all patients for adding
  useEffect(() => {
    patientsApi
      .list()
      .then(setAllPatients)
      .catch(() => toast.error('Erro ao carregar pacientes'));
  }, []);

  // Load panel from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('painel_pacientes');
    if (saved) {
      try {
        setPatients(JSON.parse(saved));
      } catch (e) {
        setPatients([]);
      }
    }
    setLoading(false);
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('painel_pacientes', JSON.stringify(patients));
  }, [patients]);

  // Timer for clock
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Add patient to panel
  const addPatient = () => {
    if (!selectedPatient) {
      toast.error('Selecione um paciente');
      return;
    }

    const exists = patients.some((p) => p.id === selectedPatient.id);
    if (exists) {
      toast.error('Paciente já está no painel');
      return;
    }

    setPatients([
      ...patients,
      {
        id: selectedPatient.id,
        name: selectedPatient.name,
        status: 'waiting',
      },
    ]);
    setSelectedPatient(null);
    addModal.onOpenChange(false);
    toast.success('Paciente adicionado ao painel');
  };

  // Remove patient
  const removePatient = (id: number) => {
    setPatients(patients.filter((p) => p.id !== id));
    toast.success('Paciente removido');
  };

  // Start attending
  const startAttending = (id: number) => {
    setPatients(
      patients.map((p) =>
        p.id === id
          ? { ...p, status: 'attending' as const, startTime: Date.now(), pausedTime: 0, isPaused: false }
          : p
      )
    );
    toast.success('Atendimento iniciado');
  };

  // Pause/resume
  const togglePause = (id: number) => {
    setPatients(
      patients.map((p) => {
        if (p.id !== id) return p;
        if (!p.isPaused) {
          // Pause
          return { ...p, isPaused: true };
        } else {
          // Resume - adjust startTime
          const pausedDuration = (Date.now() - p.startTime!) / 1000 - (p.pausedTime || 0);
          return {
            ...p,
            isPaused: false,
            startTime: Date.now() - (p.pausedTime || 0) * 1000,
          };
        }
      })
    );
  };

  // Send to exam
  const sendToExam = (id: number) => {
    setPatients(
      patients.map((p) =>
        p.id === id
          ? {
              ...p,
              status: 'exam' as const,
              examReturn: Date.now() + 15 * 60 * 1000, // 15 min
            }
          : p
      )
    );
    toast.success('Paciente enviado para exame (retorna em 15 min)');
  };

  // Complete attendance
  const completeAttendance = (id: number) => {
    setPatients(
      patients.map((p) =>
        p.id === id
          ? { ...p, status: 'completed' as const, startTime: undefined, examReturn: undefined }
          : p
      )
    );
    toast.success('Atendimento finalizado');
  };

  // Get elapsed time for display
  const getElapsedTime = (patient: PanelPatient): string => {
    if (!patient.startTime || patient.status !== 'attending') return '00:00';

    let elapsed = Math.floor((currentTime - patient.startTime) / 1000);

    if (patient.isPaused) {
      elapsed = Math.floor((patient.pausedTime || 0));
    } else {
      elapsed = Math.floor((currentTime - patient.startTime) / 1000);
    }

    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Get exam return time
  const getExamReturnTime = (patient: PanelPatient): string => {
    if (!patient.examReturn) return '';
    const timeLeft = Math.max(0, Math.floor((patient.examReturn - currentTime) / 1000));
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const waiting = patients.filter((p) => p.status === 'waiting');
  const attending = patients.filter((p) => p.status === 'attending');
  const exam = patients.filter((p) => p.status === 'exam');
  const completed = patients.filter((p) => p.status === 'completed');

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar
        title="Painel de Atendimento"
        subtitle={`${patients.length} pacientes | ${attending.length} em atendimento`}
        actions={
          <Button
            size="md"
            icon={<Plus className="h-5 w-5" />}
            onClick={() => addModal.onOpenChange(true)}
          >
            Adicionar Paciente
          </Button>
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card shadow="sm">
            <CardContent className="flex items-center gap-3 pt-4">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{waiting.length}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Aguardando</p>
              </div>
            </CardContent>
          </Card>

          <Card shadow="sm">
            <CardContent className="flex items-center gap-3 pt-4">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{attending.length}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Em atendimento</p>
              </div>
            </CardContent>
          </Card>

          <Card shadow="sm">
            <CardContent className="flex items-center gap-3 pt-4">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{exam.length}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Fazendo exame</p>
              </div>
            </CardContent>
          </Card>

          <Card shadow="sm">
            <CardContent className="flex items-center gap-3 pt-4">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{completed.length}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Atendidos</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Layout: Waiting | Attending */}
        <div className="grid grid-cols-3 gap-6">
          {/* Waiting */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="font-bold text-slate-900 dark:text-slate-50">Aguardando ({waiting.length})</h2>
            </div>
            <div className="space-y-2">
              {waiting.map((p) => (
                <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-50">{p.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">ID: {p.id}</p>
                    </div>
                    <Button
                      size="sm"
                      fullWidth
                      onClick={() => startAttending(p.id)}
                      className="bg-amber-500 hover:bg-amber-600"
                    >
                      Iniciar Atendimento
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {waiting.length === 0 && (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  Ninguém aguardando
                </div>
              )}
            </div>
          </div>

          {/* Attending - Large */}
          <div className="col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <h2 className="font-bold text-slate-900 dark:text-slate-50">Em Atendimento ({attending.length})</h2>
            </div>
            <div className="space-y-3">
              {attending.map((p) => (
                <Card key={p.id} className="border-2 border-amber-300 dark:border-amber-700">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">{p.name}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">ID: {p.id}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-4xl font-mono font-bold text-amber-600 dark:text-amber-400">
                          {getElapsedTime(p)}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Tempo decorrido</p>
                      </div>
                    </div>

                    {/* Status badge */}
                    {p.isPaused && (
                      <Badge variant="warning" size="md">
                        ⏸️ Pausado
                      </Badge>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 flex-wrap">
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
                        Enviar para Exame
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
                        onClick={() => removePatient(p.id)}
                      >
                        Remover
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {attending.length === 0 && (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  Ninguém em atendimento
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Exam section */}
        {exam.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h2 className="font-bold text-slate-900 dark:text-slate-50">Fazendo Exame ({exam.length})</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {exam.map((p) => (
                <Card key={p.id} className="border-l-4 border-purple-500">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-50">{p.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Retorna em:</p>
                      </div>
                      <div className="text-2xl font-mono font-bold text-purple-600 dark:text-purple-400">
                        {getExamReturnTime(p)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      fullWidth
                      variant="secondary"
                      onClick={() =>
                        setPatients(
                          patients.map((patient) =>
                            patient.id === p.id ? { ...patient, status: 'completed' as const } : patient
                          )
                        )
                      }
                    >
                      Retornou
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Completed section */}
        {completed.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <h2 className="font-bold text-slate-900 dark:text-slate-50">Atendidos ({completed.length})</h2>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {completed.map((p) => (
                <Card key={p.id} className="opacity-75">
                  <CardContent className="p-3 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 line-through">
                      {p.name}
                    </p>
                    <Button
                      size="sm"
                      variant="tertiary"
                      fullWidth
                      icon={<Trash2 className="w-3 h-3" />}
                      onClick={() => removePatient(p.id)}
                    >
                      Remover
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modal Add Patient */}
      <Modal
        open={addModal.open}
        onOpenChange={addModal.onOpenChange}
        title="Adicionar Paciente ao Painel"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="tertiary" onClick={() => addModal.onOpenChange(false)}>
              Cancelar
            </Button>
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
              value={selectedPatient?.id || ''}
              onChange={(e) => {
                const patient = allPatients.find((p) => p.id === Number(e.target.value));
                setSelectedPatient(patient);
              }}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
            >
              <option value="">Escolha um paciente...</option>
              {allPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
