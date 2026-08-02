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
        {/* Grade de "Módulos" REMOVIDA (decisão Valth 02/08): tudo que ela
            oferecia já vive no menu lateral (Agenda, Pacientes, Sala de Espera,
            Financeiro, Documentos, Equipe) — a home do médico é o dashboard. */}
        {stats && <DashboardAnalytics stats={stats} />}
      </div>
    </ProtectedPageLayout>
  );
}
