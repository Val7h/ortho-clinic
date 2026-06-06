/**
 * Página de exemplo: Painel Admin com todos os componentes
 *
 * Use este arquivo como referência para implementar o painel
 * administrativo completo da clínica.
 *
 * Para usar:
 * 1. Crie um arquivo app/admin/painel/page.tsx
 * 2. Copie o conteúdo de PainelAdminPage
 */

'use client';

import React, { useState } from 'react';
import { AdminCallPanel } from '@/components/AdminCallPanel';
import { QueueStatus } from '@/components/QueueStatus';
import { MedicationSelector } from '@/components/MedicationSelector';
import { BarChart3, Users, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface Patient {
  id: string;
  nome: string;
  sala: string;
  tempoEspera: number;
}

/**
 * PainelAdminPage: Dashboard administrativo com:
 * - QueueStatus (widget compacto e expandido)
 * - AdminCallPanel (chamar próximos)
 * - MedicationSelector (prescrever medicações)
 */
export default function PainelAdminPage() {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Painel Administrativo</h1>
              <p className="text-sm text-slate-400 mt-1">Gerenciamento de fila e prescrições</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs font-medium text-slate-400">Hora</div>
                <div className="text-xl font-bold text-slate-50">
                  {new Date().toLocaleTimeString('pt-BR')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Grid: 2 colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda: Admin Panel + Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* QueueStatus Expandido */}
            <QueueStatus compact={false} />

            {/* Admin Call Panel */}
            <AdminCallPanel
              apiUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}
              onCallSuccess={(patient) => {
                setSelectedPatient(patient);
                toast.success(`${patient.nome} foi chamado para sala ${patient.sala}`);
              }}
            />
          </div>

          {/* Coluna Direita: Sidebar */}
          <div className="space-y-6">
            {/* QueueStatus Compacto */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Status Rápido</h3>
              <QueueStatus compact={true} />
            </div>

            {/* Quick Stats */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Estatísticas</h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Users size={18} className="text-brand-400" />
                    <span className="text-xs text-slate-400">Pacientes hoje</span>
                  </div>
                  <span className="font-bold text-slate-50">24</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-accent-400" />
                    <span className="text-xs text-slate-400">Atendidos</span>
                  </div>
                  <span className="font-bold text-slate-50">18</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={18} className="text-emerald-400" />
                    <span className="text-xs text-slate-400">Taxa conclusão</span>
                  </div>
                  <span className="font-bold text-slate-50">75%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Medication Selector - Full Width */}
        {selectedPatient && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-white mb-4">
              Prescrição para: {selectedPatient.nome}
            </h2>
            <MedicationSelector
              pacienteId={selectedPatient.id}
              pacienteAlergias={[]} // Buscar da API conforme necessário
              medicacoesAtuais={[]}  // Buscar da API conforme necessário
              onMedicationAdd={(medicacao) => {
                console.log('Medicação adicionada:', medicacao);
                // Aqui você salva a prescrição na API
              }}
              onMedicationRemove={(medicacaoId) => {
                console.log('Medicação removida:', medicacaoId);
              }}
              apiUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}
            />
          </div>
        )}

        {!selectedPatient && (
          <div className="mt-8 text-center py-12 bg-slate-900/50 border border-slate-800 rounded-xl">
            <p className="text-slate-400">
              Selecione um paciente no painel à esquerda para prescrever medicações
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Rotas necessárias no backend:
 *
 * GET /api/fila/status - Status geral da fila
 * GET /api/fila/aguardando - Pacientes aguardando
 * GET /api/fila/historico - Histórico de chamadas
 * POST /api/fila/chamar - Chamar paciente
 * GET /api/medicamentos - Buscar medicações
 * POST /api/medicamentos/:id/interacoes - Interações
 *
 * WebSocket:
 * /ws/queue - Atualizações real-time da fila
 */
