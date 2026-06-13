'use client';
/**
 * SyncQueueDrawer
 *
 * Slide-in panel that shows all pending/error/conflict queue items.
 * Allows the user to:
 *   - Manually retry individual items
 *   - Dismiss conflict items (accepting server resolution)
 *   - View error messages
 *   - Trigger a full sync
 *
 * Data freshness indicators are shown per item.
 */

import React from 'react';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
  Trash2,
  WifiOff,
  Upload,
} from 'lucide-react';
import { useSyncContext } from '@/lib/offline/syncContext';
import { SyncQueueItem } from '@/lib/offline/db';
import { freshnessLabel } from '@/hooks/useOfflineFirst';

interface Props {
  open: boolean;
  onClose: () => void;
}

function StatusBadge({ status }: { status: SyncQueueItem['status'] }) {
  const map: Record<SyncQueueItem['status'], { label: string; cls: string }> = {
    pending: { label: 'Pendente', cls: 'bg-blue-500/20 text-blue-300' },
    syncing: { label: 'Sincronizando', cls: 'bg-blue-700/20 text-blue-200' },
    synced: { label: 'Sincronizado', cls: 'bg-emerald-500/20 text-emerald-300' },
    conflict: { label: 'Conflito', cls: 'bg-red-500/20 text-red-300' },
    error: { label: 'Erro', cls: 'bg-orange-500/20 text-orange-300' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function EntityLabel({ entity }: { entity: SyncQueueItem['entity'] }) {
  const labels: Record<SyncQueueItem['entity'], string> = {
    appointment: 'Agendamento',
    consultationNote: 'Nota de consulta',
    patient: 'Paciente',
  };
  return <span className="text-slate-400 text-xs">{labels[entity]}</span>;
}

export function SyncQueueDrawer({ open, onClose }: Props) {
  const { queueItems, syncStatus, pendingCount, conflictCount, triggerSync, resolveConflict, removeQueueItem, isOnline, lastSyncAt } =
    useSyncContext();

  if (!open) return null;

  const visibleItems = queueItems.filter((i) => i.status !== 'synced');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000] bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-[10001] flex flex-col w-full max-w-md bg-slate-900 border-l border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">
              Fila de Sincronização
            </h2>
            {lastSyncAt && (
              <p className="text-xs text-slate-400 mt-0.5">
                Última sync: {freshnessLabel(lastSyncAt)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 transition"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Online status pill */}
        <div className="px-5 pt-3 pb-0">
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-amber-500/10 text-amber-400'
            }`}
          >
            {isOnline ? (
              <CheckCircle size={12} />
            ) : (
              <WifiOff size={12} />
            )}
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>

        {/* Summary strip */}
        {(pendingCount > 0 || conflictCount > 0) && (
          <div className="flex gap-3 px-5 pt-3">
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-blue-300">
                <Upload size={12} />
                {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
              </div>
            )}
            {conflictCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-red-300">
                <AlertTriangle size={12} />
                {conflictCount} conflito{conflictCount > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {/* Trigger sync button */}
        {isOnline && (
          <div className="px-5 pt-3">
            <button
              onClick={() => triggerSync()}
              disabled={syncStatus === 'syncing'}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition"
            >
              <RefreshCw size={14} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              {syncStatus === 'syncing' ? 'Sincronizando...' : 'Sincronizar agora'}
            </button>
          </div>
        )}

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <CheckCircle size={40} className="text-emerald-400 mb-3" />
              <p className="text-slate-300 font-medium">Tudo sincronizado</p>
              <p className="text-slate-500 text-sm mt-1">
                Nenhuma operação pendente.
              </p>
            </div>
          ) : (
            visibleItems.map((item) => (
              <QueueItemCard
                key={item.id}
                item={item}
                onResolve={(useServer) => resolveConflict(item.id, useServer)}
                onRemove={() => removeQueueItem(item.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Individual item card ──────────────────────────────────────────────────────

function QueueItemCard({
  item,
  onResolve,
  onRemove,
}: {
  item: SyncQueueItem;
  onResolve: (useServer: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-2 ${
        item.status === 'conflict'
          ? 'border-red-500/30 bg-red-500/5'
          : item.status === 'error'
          ? 'border-orange-500/30 bg-orange-500/5'
          : 'border-slate-700 bg-slate-800/50'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <EntityLabel entity={item.entity} />
          <span className="text-slate-600">·</span>
          <span className="text-xs text-slate-500 uppercase">{item.op}</span>
        </div>
        <StatusBadge status={item.status} />
      </div>

      {/* Timestamps */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Clock size={11} />
        Criado {freshnessLabel(item.createdAt)}
        {item.attempts > 0 && (
          <span className="ml-2 text-slate-600">
            · {item.attempts} tentativa{item.attempts > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Error message */}
      {item.errorMessage && (
        <p className="text-xs text-orange-300 bg-orange-500/10 rounded px-2 py-1">
          {item.errorMessage}
        </p>
      )}

      {/* Retry info */}
      {item.status === 'error' && item.nextRetry && (
        <p className="text-xs text-slate-500">
          Próxima tentativa: {new Date(item.nextRetry).toLocaleTimeString('pt-BR')}
        </p>
      )}

      {/* Conflict resolution */}
      {item.status === 'conflict' && (
        <div className="pt-1 space-y-2">
          <p className="text-xs text-red-300">
            {item.entity === 'appointment'
              ? 'Servidor prevalece: o horário foi ocupado por outro agendamento.'
              : 'Nota local preservada (política client-wins).'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onResolve(true)}
              className="flex-1 rounded-lg border border-red-500/30 py-1.5 text-xs text-red-300 hover:bg-red-500/10 transition"
            >
              Aceitar resolução
            </button>
          </div>
        </div>
      )}

      {/* Remove button */}
      {(item.status === 'error' || item.status === 'conflict') && (
        <button
          onClick={onRemove}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition"
        >
          <Trash2 size={11} /> Remover
        </button>
      )}
    </div>
  );
}
