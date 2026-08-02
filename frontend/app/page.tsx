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

// Dashboard v2: sem recharts (números + tabela + barras CSS) — leve, mas mantém
// o dynamic import p/ não pesar o bundle da home da secretária.
const DashboardV2 = dynamic(
  () => import('@/components/DashboardV2').then(m => ({ default: m.DashboardV2 })),
  {
    loading: () => (
      <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
    ),
    ssr: false,
  }
);

export default function Dashboard() {
  const { user } = useAuth();

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
        {/* Dashboard v2 (redesign aprovado 02/08): HOJE → mês em 4 números →
            por clínica → funil+recall. Substitui o DashboardAnalytics antigo. */}
        <DashboardV2 />
      </div>
    </ProtectedPageLayout>
  );
}
