'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, AlertTriangle, TrendingUp } from 'lucide-react';

interface QueueStatusData {
  totalAguardando: number;
  tempoMedioEspera: number; // minutos
  maiorTempoEspera: number; // minutos
  atrasoPercentual: number; // 0-100
  estimadoParaAtender: number; // minutos
}

interface QueueStatusProps {
  apiUrl?: string;
  updateInterval?: number;
  compact?: boolean;
}

/**
 * QueueStatus: Widget pequeno com status da fila
 *
 * Features:
 * - Exibe número de pacientes aguardando
 * - Tempo médio de espera
 * - Indicador visual de atraso (verde/amarelo/vermelho)
 * - Updates real-time
 * - Versão compacta e expandida
 */
export const QueueStatus: React.FC<QueueStatusProps> = ({
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  updateInterval = 10000,
  compact = false,
}) => {
  const [data, setData] = useState<QueueStatusData>({
    totalAguardando: 0,
    tempoMedioEspera: 0,
    maiorTempoEspera: 0,
    atrasoPercentual: 0,
    estimadoParaAtender: 0,
  });
  const [loading, setLoading] = useState(true);

  /**
   * Busca status da fila via API
   */
  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/fila/status-rapido`);
      if (!res.ok) throw new Error('Erro ao buscar status');

      const newData = await res.json();
      setData(newData);
      setLoading(false);
    } catch (error) {
      console.error('Erro ao buscar status da fila:', error);
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, updateInterval);
    return () => clearInterval(interval);
  }, [fetchQueueStatus, updateInterval]);

  /**
   * Define cor do indicador baseado no nível de atraso
   * Verde: < 20% atrasos
   * Amarelo: 20-50% atrasos
   * Vermelho: > 50% atrasos
   */
  const getStatusColor = useCallback((atrasoPercentual: number) => {
    if (atrasoPercentual < 20) return 'text-emerald-500';
    if (atrasoPercentual < 50) return 'text-amber-500';
    return 'text-error-500';
  }, []);

  const getStatusBgColor = useCallback((atrasoPercentual: number) => {
    if (atrasoPercentual < 20) return 'bg-emerald-500/10 border-emerald-500/20';
    if (atrasoPercentual < 50) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-error-500/10 border-error-500/20';
  }, []);

  const getStatusLabel = useCallback((atrasoPercentual: number) => {
    if (atrasoPercentual < 20) return 'No prazo';
    if (atrasoPercentual < 50) return 'Ligeiro atraso';
    return 'Atrasos significativos';
  }, []);

  const statusColor = useMemo(
    () => getStatusColor(data.atrasoPercentual),
    [data.atrasoPercentual, getStatusColor]
  );

  const statusBgColor = useMemo(
    () => getStatusBgColor(data.atrasoPercentual),
    [data.atrasoPercentual, getStatusBgColor]
  );

  const statusLabel = useMemo(
    () => getStatusLabel(data.atrasoPercentual),
    [data.atrasoPercentual, getStatusLabel]
  );

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-2"></div>
        <div className="h-6 bg-slate-700 rounded w-1/2"></div>
      </div>
    );
  }

  if (compact) {
    // Versão compacta para widgets/sidebar
    return (
      <div
        className={`rounded-lg border px-4 py-3 transition-all duration-300 ${statusBgColor}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase">
              Aguardando
            </div>
            <div className={`text-2xl font-bold ${statusColor}`}>
              {data.totalAguardando}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-semibold text-slate-400 uppercase">
              Médio
            </div>
            <div className="text-lg font-semibold text-slate-300">
              {data.tempoMedioEspera}min
            </div>
          </div>
        </div>

        {/* Barra de status */}
        <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${statusColor.replace('text-', 'bg-')}`}
            style={{
              width: `${Math.min(data.atrasoPercentual, 100)}%`,
            }}
          ></div>
        </div>

        <div className={`text-xs mt-2 font-medium ${statusColor}`}>
          {statusLabel}
        </div>
      </div>
    );
  }

  // Versão expandida
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-6 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-50">Status da Fila</h3>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${statusBgColor}`}>
          <div
            className={`w-2.5 h-2.5 rounded-full ${statusColor.replace('text-', 'bg-')}`}
          ></div>
          <span className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
        </div>
      </div>

      {/* Grid de métricas */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Pacientes Aguardando */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-xs font-semibold text-slate-400 uppercase mb-1">
            Aguardando
          </div>
          <div className="text-3xl font-bold text-slate-50">
            {data.totalAguardando}
          </div>
          <p className="text-xs text-slate-500 mt-2">paciente(s) na fila</p>
        </div>

        {/* Tempo Médio */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-xs font-semibold text-slate-400 uppercase mb-1">
            Tempo Médio
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold text-slate-50">
              {data.tempoMedioEspera}
            </div>
            <span className="text-sm text-slate-400">min</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">tempo de espera</p>
        </div>

        {/* Maior Espera */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-xs font-semibold text-slate-400 uppercase mb-1">
            Maior Espera
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold text-amber-400">
              {data.maiorTempoEspera}
            </div>
            <span className="text-sm text-slate-400">min</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">paciente mais antigo</p>
        </div>

        {/* Estimativa */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-xs font-semibold text-slate-400 uppercase mb-1">
            Estimado
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold text-slate-50">
              {data.estimadoParaAtender}
            </div>
            <span className="text-sm text-slate-400">min</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">para próximo paciente</p>
        </div>
      </div>

      {/* Indicador de Atraso */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-400">
            <TrendingUp size={16} />
            Nível de Atraso
          </div>
          <span className={`text-sm font-bold ${statusColor}`}>
            {data.atrasoPercentual}%
          </span>
        </div>

        {/* Barra de progresso visual */}
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              data.atrasoPercentual < 20
                ? 'bg-emerald-500'
                : data.atrasoPercentual < 50
                  ? 'bg-amber-500'
                  : 'bg-error-500'
            }`}
            style={{
              width: `${Math.min(data.atrasoPercentual, 100)}%`,
            }}
          ></div>
        </div>

        {/* Escala de referência */}
        <div className="flex justify-between text-xs text-slate-500">
          <span>No prazo</span>
          <span>Ligeiro</span>
          <span>Crítico</span>
        </div>
      </div>

      {/* Alert se houver atraso significativo */}
      {data.atrasoPercentual >= 50 && (
        <div className="mt-5 p-4 rounded-lg bg-error-500/10 border border-error-500/20 flex items-start gap-3">
          <AlertTriangle size={18} className="text-error-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-error-400">Atrasos Significativos</div>
            <p className="text-xs text-error-300 mt-1">
              Mais de 50% dos pacientes estão atrasados. Considere adicionar mais médicos ao
              atendimento.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueueStatus;
