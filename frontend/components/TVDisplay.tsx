'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertCircle, Clock } from 'lucide-react';

interface Patient {
  id: string;
  nome: string;
  sala: string;
  horario: string;
}

interface CallEvent {
  pacienteId: string;
  pacienteNome: string;
  sala: string;
  timestamp: Date;
}

interface TVDisplayProps {
  apiUrl?: string;
  updateInterval?: number; // ms para polling fallback
  wsUrl?: string;
}

/**
 * TVDisplay: Component full-screen para sala de espera
 *
 * Features:
 * - Nome do paciente em 80%+ da tela
 * - WebSocket real-time com fallback polling
 * - Animação suave ao chamar novo paciente
 * - Próximos 3 pacientes visíveis
 * - Timestamp da última chamada
 * - Responsivo para 1920x1080 e 4K
 * - Dark theme sem UI clutter
 */
export const TVDisplay: React.FC<TVDisplayProps> = ({
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  updateInterval = 5000,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/queue',
}) => {
  const [currentCall, setCurrentCall] = useState<CallEvent | null>(null);
  const [nextPatients, setNextPatients] = useState<Patient[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [animateNew, setAnimateNew] = useState(false);

  // Armazena conexão WebSocket para cleanup
  const wsRef = React.useRef<WebSocket | null>(null);
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  /**
   * Busca dados da fila via HTTP (fallback/polling)
   */
  const fetchQueueData = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/fila/status`);
      if (!res.ok) throw new Error('Failed to fetch queue status');

      const data = await res.json();

      // Se há uma chamada ativa, anima
      if (data.pacienteAtual && !currentCall?.pacienteId) {
        setAnimateNew(true);
        setTimeout(() => setAnimateNew(false), 600);
      }

      setCurrentCall(
        data.pacienteAtual
          ? {
              pacienteId: data.pacienteAtual.id,
              pacienteNome: data.pacienteAtual.nome,
              sala: data.pacienteAtual.sala,
              timestamp: new Date(data.chamadaEm),
            }
          : null
      );

      setNextPatients(data.proximosPacientes || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erro ao buscar fila:', error);
    }
  }, [apiUrl, currentCall?.pacienteId]);

  /**
   * Conecta ao WebSocket para atualizações real-time
   */
  const setupWebSocket = useCallback(() => {
    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket conectado');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Quando novo paciente é chamado
          if (message.tipo === 'paciente_chamado') {
            setAnimateNew(true);
            setTimeout(() => setAnimateNew(false), 600);

            setCurrentCall({
              pacienteId: message.pacienteId,
              pacienteNome: message.pacienteNome,
              sala: message.sala,
              timestamp: new Date(),
            });

            setNextPatients(message.proximosPacientes || []);
            setLastUpdate(new Date());
          }
        } catch (err) {
          console.error('Erro ao processar mensagem WebSocket:', err);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
        console.warn('Erro WebSocket, usando polling');
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Reconectar em 3s
        setTimeout(setupWebSocket, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Erro ao conectar WebSocket:', error);
      setIsConnected(false);
    }
  }, [wsUrl]);

  // Setup inicial: WebSocket + polling fallback
  useEffect(() => {
    setupWebSocket();
    fetchQueueData();

    // Polling a cada updateInterval ms
    pollIntervalRef.current = setInterval(fetchQueueData, updateInterval);

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [setupWebSocket, fetchQueueData, updateInterval]);

  /**
   * Formata timestamp da chamada
   */
  const formattedTime = useMemo(() => {
    if (!lastUpdate) return '';
    return format(lastUpdate, 'HH:mm:ss', { locale: ptBR });
  }, [lastUpdate]);

  /**
   * Calcula tempo desde a última chamada
   */
  const timeElapsed = useMemo(() => {
    if (!lastUpdate) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);

    if (diff < 60) return `${diff}s atrás`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
    return `${Math.floor(diff / 3600)}h atrás`;
  }, [lastUpdate]);

  return (
    <div className="w-screen h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-center items-center overflow-hidden">
      {/* Status de Conexão */}
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
          }`}
        />
        <span className="text-xs font-medium text-slate-400">
          {isConnected ? 'ao vivo' : 'offline (polling)'}
        </span>
      </div>

      {/* Paciente Atual - GRANDE */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {currentCall ? (
          <div
            className={`text-center transition-all duration-600 ${
              animateNew ? 'scale-105 opacity-100' : 'scale-100 opacity-100'
            }`}
          >
            {/* Nome do Paciente - 80%+ da tela */}
            <h1 className="text-9xl font-extrabold text-white mb-8 leading-none drop-shadow-2xl break-words">
              {currentCall.pacienteNome}
            </h1>

            {/* Sala */}
            <div className="flex items-center justify-center gap-4 mb-12">
              <div className="text-6xl font-bold text-emerald-400">
                SALA {currentCall.sala}
              </div>
            </div>

            {/* Timestamp */}
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
              <Clock size={16} />
              <span>
                Chamado às {formattedTime} ({timeElapsed})
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-5xl text-slate-600 mb-4">Aguardando pacientes...</div>
            <AlertCircle size={48} className="mx-auto text-slate-500" />
          </div>
        )}
      </div>

      {/* Próximos 3 Pacientes - footer */}
      {nextPatients.length > 0 && (
        <div className="w-full bg-slate-900/50 backdrop-blur-sm border-t border-slate-800 px-8 py-6">
          <div className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">
            Próximos a chamar
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {nextPatients.slice(0, 3).map((patient, idx) => (
              <div
                key={patient.id}
                className="bg-slate-800/50 rounded-lg px-6 py-4 border border-slate-700/50 hover:border-slate-600/50 transition-colors"
              >
                <div className="text-xl font-semibold text-white mb-1">
                  {idx + 1}. {patient.nome}
                </div>
                <div className="text-sm text-slate-400">
                  Sala: <span className="text-slate-300">{patient.sala || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TVDisplay;
