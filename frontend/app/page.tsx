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

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse h-24" />
      ))}
    </div>
  );
}

function StatsCards({ stats }: { stats: any }) {
  const s = stats?.stats ?? {};
  const cards = [
    { label: 'Pacientes', value: s.total_patients ?? 0, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: Users },
    { label: 'Consultas hoje', value: s.consultations_this_week ?? 0, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', icon: Activity },
    { label: 'Este mês', value: s.consultations_this_month ?? 0, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', icon: Calendar },
    { label: 'Total consultas', value: s.total_consultations ?? 0, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', icon: Stethoscope },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map(({ label, value, color, bg, icon: Icon }) => (
        <div key={label} className={`rounded-2xl p-5 ${bg}`}>
          <Icon className={`h-5 w-5 ${color} mb-3`} />
          <p className={`text-3xl font-extrabold ${color}`}>{value}</p>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    if (user) {
      setStatsLoading(true);
      setStatsError(false);
      dashboardApi.get()
        .then(setStats)
        .catch(() => setStatsError(true))
        .finally(() => setStatsLoading(false));
    }
  }, [user]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  return (
    <ProtectedPageLayout title="OrthoClinic" subtitle="Gestão de Consultório Premium">
      <div className="mx-auto max-w-7xl space-y-8">

        {/* ── Saudação ───────────────────────────────────────────────── */}
        {user && (
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {greeting}, {user.name?.split(' ')[0] ?? 'bem-vindo'}! 👋
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* ── KPIs ───────────────────────────────────────────────────── */}
        {statsLoading ? (
          <StatsSkeleton />
        ) : statsError ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 dark:bg-red-900/10 px-5 py-4 text-sm text-red-600 dark:text-red-400">
            Não foi possível carregar as estatísticas. Verifique a conexão com o servidor.
          </div>
        ) : (
          <StatsCards stats={stats} />
        )}

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
                label: 'Atendimento',
                icon: Clock,
                description: 'Fila de atendimento e triagem',
                href: '/painel',
                color: 'bg-orange-500',
              },
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
