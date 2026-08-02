'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Stethoscope,
  BookOpen,
  DollarSign,
  Activity,
  Calendar,
  FileText,
  Shield,
  Clock,
  Plus,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ProtectedPageLayout } from '@/components/ProtectedPageLayout';
import ModuleCard from '@/components/ModuleCard';
import { dashboardApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent, Button, Badge } from '@/components/ui';

// Recharts is ~120 KB gzipped — load only when stats are available.
// This keeps the dashboard TTI under 2s on 4G.
const DashboardAnalytics = dynamic(
  () => import('@/components/DashboardAnalytics').then(m => ({ default: m.DashboardAnalytics })),
  {
    loading: () => (
      <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
    ),
    ssr: false, // chart renders only on client
  }
);

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (user) {
      dashboardApi.get().then(setStats).catch(() => {});
    }
  }, [user]);

  // HOME DA SECRETÁRIA (decisão Valth 02/08): só atalhos operacionais — sem
  // analytics, sem número de faturamento, sem módulos clínicos.
  if (user?.role === 'secretary') {
    return (
      <ProtectedPageLayout title="OrthoClinic" subtitle="Bom trabalho!">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: 'Agenda', icon: Calendar, description: 'Marcações e horários do dia', href: '/agenda', color: 'bg-green-500' },
              { label: 'Sala de Espera', icon: Clock, description: 'Check-in e fila de atendimento', href: '/painel', color: 'bg-orange-500' },
              { label: 'Pacientes', icon: Users, description: 'Cadastro e contatos', href: '/pacientes', color: 'bg-blue-500' },
              { label: 'Caixa do Dia', icon: DollarSign, description: 'Registrar pagamentos de hoje', href: '/financeiro', color: 'bg-yellow-500' },
            ].map((module) => (
              <ModuleCard key={module.href} {...module} />
            ))}
          </div>
        </div>
      </ProtectedPageLayout>
    );
  }

  return (
    <ProtectedPageLayout title="OrthoClinic" subtitle="Gestão de Consultório Premium">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* ── ANALYTICS DASHBOARD ───────────────────────────────────── */}
        {stats && <DashboardAnalytics stats={stats} />}

        {/* ── Modules ────── */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Módulos
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: 'Pacientes',
                icon: Users,
                description: 'Gerenciar pacientes e histórico',
                href: '/pacientes',
                color: 'bg-blue-500',
              },
              {
                label: 'Consultas',
                icon: Calendar,
                description: 'Agendar e gerenciar consultas',
                href: '/agenda',
                color: 'bg-green-500',
              },
              // Anamnese e Receitas saíram da home (decisão Valth 02/08):
              // acontecem DENTRO do atendimento (gaveta do paciente), não como
              // módulos soltos.
              {
                label: 'Financeiro',
                icon: DollarSign,
                description: 'Relatórios e análises financeiras',
                href: '/financeiro',
                color: 'bg-yellow-500',
              },
              {
                label: 'Usuários',
                icon: Shield,
                description: 'Gerenciar permissões e papéis',
                href: '/usuarios',
                color: 'bg-indigo-500',
              },
              // Card "Atendimento" removido (decisão Valth 02/08): é a mesma
              // Sala de Espera que já está no menu lateral — redundante.
              {
                label: 'Documentos',
                icon: FileText,
                description: 'Gestão de arquivos e documentos',
                href: '/documentos',
                color: 'bg-cyan-500',
              },
            ].map((module) => (
              <ModuleCard key={module.href} {...module} />
            ))}
          </div>
        </div>

        {/* ── Quick Actions ────── */}
        <div className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Quer explorar mais?</h3>
              <p className="mt-1 text-blue-100">
                Conheça todos os recursos premium da OrthoClinic
              </p>
            </div>
            <Link href="/planos">
              <Button variant="primary">
                Ver planos
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </ProtectedPageLayout>
  );
}
