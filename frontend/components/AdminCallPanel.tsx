'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Phone, Clock, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui';
import toast from 'react-hot-toast';

interface QueuePatient {
  id: string;
  nome: string;
  sala: string;
  tempoEspera: number; // segundos
}

interface CallHistory {
  id: string;
  pacienteNome: string;
  sala: string;
  chamadoEm: Date;
  status: 'chamado' | 'em_atendimento' | 'concluido';
}

interface AdminCallPanelProps {
  apiUrl?: string;
  onCallSuccess?: (paciente: QueuePatient) => void;
}

/**
 * AdminCallPanel: Painel de controle para chamar próximos pacientes
 *
 * Features:
 * - Dropdown seletor de próximo paciente
 * - Campo de seleção de sala
 * - Botão grande "CHAMAR PRÓXIMO"
 * - Histórico dos últimos 5 chamados com timestamps
 * - Indicador tempo até próxima consulta
 * - Status de conexão e validações
 * - Dark mode completo
 */
export const AdminCallPanel: React.FC<AdminCallPanelProps> = ({
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  onCallSuccess,
}) => {
  const [patients, setPatients] = useState<QueuePatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<QueuePatient | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [history, setHistory] = useState<CallHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [nextConsultationTime, setNextConsultationTime] = useState<number | null>(null);

  /**
   * Carrega fila de pacientes aguardando
   */
  const loadPatients = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/fila/aguardando`);
      if (!res.ok) throw new Error('Erro ao carregar fila');

      const data = await res.json();
      setPatients(data.pacientes || []);
      setIsConnected(true);

      // Preseleciona primeiro paciente
      if (data.pacientes?.length > 0 && !selectedPatient) {
        setSelectedPatient(data.pacientes[0]);
      }
    } catch (error) {
      console.error('Erro ao carregar fila:', error);
      setIsConnected(false);
      toast.error('Erro ao carregar fila de pacientes');
    }
  }, [apiUrl, selectedPatient]);

  /**
   * Carrega histórico de chamadas
   */
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/fila/historico?limite=5`);
      if (!res.ok) throw new Error('Erro ao carregar histórico');

      const data = await res.json();
      setHistory(
        (data.historico || []).map((item: any) => ({
          ...item,
          chamadoEm: new Date(item.chamadoEm),
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  }, [apiUrl]);

  /**
   * Calcula tempo até a próxima consulta
   */
  const calculateNextConsultationTime = useCallback(async () => {
    if (!selectedPatient) return;

    try {
      const res = await fetch(
        `${apiUrl}/api/pacientes/${selectedPatient.id}/proxima-consulta`
      );
      if (res.ok) {
        const data = await res.json();
        const agora = new Date();
        const proxima = new Date(data.horario);
        const diffMs = proxima.getTime() - agora.getTime();
        const diffMin = Math.ceil(diffMs / 60000);
        setNextConsultationTime(diffMin);
      }
    } catch (error) {
      console.error('Erro ao calcular próxima consulta:', error);
    }
  }, [selectedPatient, apiUrl]);

  // Carrega dados inicialmente e a cada 10s
  useEffect(() => {
    loadPatients();
    loadHistory();
    calculateNextConsultationTime();

    const interval = setInterval(() => {
      loadPatients();
      loadHistory();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadPatients, loadHistory, calculateNextConsultationTime]);

  /**
   * Chama próximo paciente para sala
   */
  const handleCallNext = useCallback(async () => {
    if (!selectedPatient || !selectedRoom) {
      toast.error('Selecione um paciente e uma sala');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/fila/chamar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pacienteId: selectedPatient.id,
          sala: selectedRoom,
        }),
      });

      if (!res.ok) throw new Error('Erro ao chamar paciente');

      toast.success(`${selectedPatient.nome} chamado para sala ${selectedRoom}`);

      // Callback customizado
      onCallSuccess?.(selectedPatient);

      // Recarrega fila
      await loadPatients();
      await loadHistory();

      // Limpa seleção
      setSelectedRoom('');
    } catch (error) {
      console.error('Erro ao chamar paciente:', error);
      toast.error('Erro ao chamar paciente. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPatient, selectedRoom, apiUrl, onCallSuccess, loadPatients, loadHistory]);

  /**
   * Salas disponíveis (exemplo - pode vir da API)
   */
  const rooms = useMemo(
    () => ['01', '02', '03', '04', '05', '06', 'Recepção', 'Consultório'],
    []
  );

  /**
   * Status da próxima consulta com cores
   */
  const getConsultationStatusColor = (minutos: number | null) => {
    if (minutos === null) return 'text-slate-400';
    if (minutos < 10) return 'text-error-500';
    if (minutos < 30) return 'text-warning-500';
    return 'text-success-500';
  };

  return (
    <div className="w-full h-full bg-slate-950 text-slate-50 p-6 rounded-2xl border border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Painel de Atendimento</h2>
          <p className="text-sm text-slate-400 mt-1">
            {patients.length} paciente(s) aguardando
          </p>
        </div>

        {/* Status de Conexão */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-error-500'
            }`}
          />
          <span className="text-xs text-slate-400">
            {isConnected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Seletor de Paciente */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">
          Próximo Paciente
        </label>
        <select
          value={selectedPatient?.id || ''}
          onChange={(e) => {
            const patient = patients.find((p) => p.id === e.target.value);
            setSelectedPatient(patient || null);
            calculateNextConsultationTime();
          }}
          className="w-full bg-slate-900 border border-slate-700 text-slate-50 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Selecione um paciente...</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.nome} (espera: {Math.floor(patient.tempoEspera / 60)}min)
            </option>
          ))}
        </select>

        {/* Info tempo espera */}
        {selectedPatient && (
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
            <Clock size={14} />
            Aguardando há {Math.floor(selectedPatient.tempoEspera / 60)} minutos
          </div>
        )}
      </div>

      {/* Seletor de Sala */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">
          Sala de Atendimento
        </label>
        <div className="grid grid-cols-4 gap-2">
          {rooms.map((room) => (
            <button
              key={room}
              onClick={() => setSelectedRoom(room)}
              className={`py-2.5 px-3 rounded-lg font-medium transition-all text-sm ${
                selectedRoom === room
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {room}
            </button>
          ))}
        </div>
      </div>

      {/* Botão CHAMAR PRÓXIMO - GRANDE */}
      <div className="mb-6">
        <Button
          onClick={handleCallNext}
          isLoading={isLoading}
          disabled={!selectedPatient || !selectedRoom}
          fullWidth
          size="lg"
          className="h-16 text-xl font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 shadow-lg"
          icon={<Phone size={24} />}
          iconPosition="left"
        >
          CHAMAR PRÓXIMO
        </Button>
      </div>

      {/* Indicador Próxima Consulta */}
      {nextConsultationTime !== null && selectedPatient && (
        <div className="bg-slate-900/50 rounded-lg px-4 py-3 mb-6 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase">Próxima Consulta</span>
            <span className={`text-sm font-semibold ${getConsultationStatusColor(nextConsultationTime)}`}>
              {nextConsultationTime > 0
                ? `em ${nextConsultationTime}min`
                : 'Atrasado'}
            </span>
          </div>
        </div>
      )}

      {/* Histórico - Últimos 5 Chamados */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">
          Últimas Chamadas
        </h3>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {history.length > 0 ? (
            history.map((call, idx) => (
              <div
                key={`${call.id}-${idx}`}
                className="flex items-center justify-between bg-slate-900/30 rounded-lg px-3 py-2.5 border border-slate-800 hover:bg-slate-900/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-100">
                    {call.pacienteNome}
                  </div>
                  <div className="text-xs text-slate-500">
                    Sala {call.sala} • {format(call.chamadoEm, 'HH:mm:ss', { locale: ptBR })}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2 ml-3">
                  {call.status === 'chamado' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-blue-900/30 text-blue-300">
                      <Phone size={12} /> Chamado
                    </span>
                  )}
                  {call.status === 'em_atendimento' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-900/30 text-amber-300">
                      <Clock size={12} /> Atendendo
                    </span>
                  )}
                  {call.status === 'concluido' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-emerald-900/30 text-emerald-300">
                      <Check size={12} /> Concluído
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-slate-500 text-sm">
              Nenhuma chamada registrada
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminCallPanel;
