'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Stethoscope,
  BookOpen,
  MessageSquare,
  DollarSign,
  TrendingUp,
  Activity,
  Calendar,
  FileText,
  MapPin,
  Shield,
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
              {
                label: 'Anamnese',
                icon: BookOpen,
                description: 'Registros de saúde dos pacientes',
                href: '/anamnese',
                color: 'bg-purple-500',
              },
              {
                label: 'Receitas',
                icon: FileText,
                description: 'Prescrições médicas',
                href: '/receitas',
                color: 'bg-red-500',
              },
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
              {
                label: 'Mensagens',
                icon: MessageSquare,
                description: 'Comunicação com pacientes',
                href: '/mensagens',
                color: 'bg-cyan-500',
              },
              {
                label: 'Documentos',
                icon: FileText,
                description: 'Gestão de arquivos e documentos',
                href: '/documentos',
                color: 'bg-orange-500',
              },
              {
                label: 'Relatórios',
                icon: TrendingUp,
                description: 'Análises e relatórios clínicos',
                href: '/relatorios',
                color: 'bg-pink-500',
              },
              {
                label: 'Localização',
                icon: MapPin,
                description: 'Localização e endereço da clínica',
                href: '/localizacao',
                color: 'bg-teal-500',
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
