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
import { ProtectedPageLayout } from '@/components/ProtectedPageLayout';
import ModuleCard from '@/components/ModuleCard';
import { DashboardAnalytics } from '@/components/DashboardAnalytics';
import { dashboardApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent, Button, Badge } from '@/components/ui';

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

        {/* ── Stats row ────── */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              {
                label: 'Receita',
                value: stats.revenue || 'R$ 0',
                icon: DollarSign,
                change: '+8%',
                positive: true,
              },
              {
                label: 'Consultas',
                value: stats.appointments || 0,
                icon: Calendar,
                change: '+5%',
                positive: true,
              },
              {
                label: 'Pacientes',
                value: stats.patients || 0,
                icon: Users,
                change: '+2%',
                positive: true,
              },
              {
                label: 'Taxa Retorno',
                value: stats.returnRate || '0%',
                icon: TrendingUp,
                change: '-1%',
                positive: false,
              },
            ].map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <Card key={idx} shadow="sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {stat.label}
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                          {stat.value}
                        </p>
                      </div>
                      <Icon className="h-8 w-8 text-slate-300 dark:text-slate-700" />
                    </div>
                    <Badge
                      variant={stat.positive ? 'success' : 'warning'}
                      className="mt-2"
                    >
                      {stat.change}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

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
              <Link key={module.href} href={module.href}>
                <ModuleCard {...module} />
              </Link>
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
