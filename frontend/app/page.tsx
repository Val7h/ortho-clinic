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
import NavBar from '@/components/NavBar';
import ModuleCard from '@/components/ModuleCard';
import { dashboardApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useProtectedPage } from '@/components/AuthProvider';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export default function Dashboard() {
  const { user, loading: authLoading } = useProtectedPage();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (user) {
      dashboardApi.get().then(setStats).catch(() => {});
    }
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title="OrthoClinic" subtitle="Gestão de Consultório Premium" />

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {/* ── Stats row ────────────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              {
                label: 'Pacientes',
                value: stats.stats.total_patients,
                color: 'text-brand-600',
                icon: Users,
                bg: 'bg-brand-100',
              },
              {
                label: 'Esta semana',
                value: stats.stats.consultations_this_week,
                color: 'text-accent-600',
                icon: Calendar,
                bg: 'bg-accent-100',
              },
              {
                label: 'Este mês',
                value: stats.stats.consultations_this_month,
                color: 'text-purple-600',
                icon: Activity,
                bg: 'bg-purple-100',
              },
              {
                label: 'Total',
                value: stats.stats.total_consultations,
                color: 'text-success-600',
                icon: TrendingUp,
                bg: 'bg-success-100',
              },
            ].map((s) => (
              <Card key={s.label} hoverable shadow="md">
                <CardContent className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg ${s.bg}`}>
                    <s.icon className={`h-6 w-6 ${s.color}`} />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold leading-none ${s.color}`}>{s.value}</p>
                    <p className="mt-1 text-xs font-medium text-slate-600">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Module grid ───────────────────────────────────────────────── */}
        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">Módulos principais</h3>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            <ModuleCard
              href="/pacientes"
              icon={Users}
              label="Pacientes"
              description="Prontuários"
              color="bg-gradient-to-br from-brand-500 to-brand-700"
              badge={stats?.stats.total_patients}
            />
            <ModuleCard
              href="/agenda"
              icon={Stethoscope}
              label="Consultas"
              description="Nova / Retorno"
              color="bg-gradient-to-br from-accent-400 to-accent-700"
            />
            <ModuleCard
              href="/folhetos"
              icon={BookOpen}
              label="Folhetos"
              description="Informativos"
              color="bg-gradient-to-br from-purple-500 to-purple-700"
            />
            <ModuleCard
              href="/whatsapp"
              icon={MessageSquare}
              label="WhatsApp"
              description="Lembretes"
              color="bg-gradient-to-br from-emerald-500 to-emerald-700"
            />
            <ModuleCard
              href="/financeiro"
              icon={DollarSign}
              label="Financeiro"
              description="Faturamento"
              color="bg-gradient-to-br from-amber-400 to-amber-600"
            />
            <ModuleCard
              href="/clinicas"
              icon={MapPin}
              label="Clínicas"
              description="Agendamentos"
              color="bg-gradient-to-br from-indigo-500 to-indigo-700"
            />
            {user && (user.role === 'admin' || user.role === 'superadmin') && (
              <ModuleCard
                href="/usuarios"
                icon={Shield}
                label="Usuários"
                description="Equipe"
                color="bg-gradient-to-br from-slate-500 to-slate-700"
              />
            )}
          </div>
        </div>

        {/* ── Recent consultations ──────────────────────────────────────── */}
        {stats?.recent_consultations?.length > 0 && (
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">Últimas consultas</h3>
            <Card shadow="sm">
              <div className="divide-y divide-slate-100">
                {stats.recent_consultations.map((c: any) => (
                  <Link key={c.id} href={`/pacientes/${c.patient_id}`}>
                    <div className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-brand-50">
                      <Badge
                        variant={c.type === 'primeira_consulta' ? 'brand' : 'accent'}
                        size="sm"
                      >
                        {c.type === 'primeira_consulta' ? '1ª' : 'Retorno'}
                      </Badge>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {c.patient_name || `Paciente #${c.patient_id}`}
                        </p>
                        {c.diagnosis && (
                          <p className="mt-0.5 truncate text-xs text-slate-500">{c.diagnosis}</p>
                        )}
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-3">
                        <time className="text-xs font-medium text-slate-500">
                          {formatDateTime(c.date)}
                        </time>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── Quick actions ─────────────────────────────────────────────── */}
        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">Ações rápidas</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Link href="/pacientes/novo">
              <Card hoverable>
                <CardContent className="flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-100">
                    <Plus className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Novo paciente</p>
                    <p className="text-xs text-slate-500">Cadastrar</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/pacientes">
              <Card hoverable>
                <CardContent className="flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent-100">
                    <FileText className="h-5 w-5 text-accent-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Prontuários</p>
                    <p className="text-xs text-slate-500">Listar</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/agenda">
              <Card hoverable>
                <CardContent className="flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-rose-100">
                    <Calendar className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Agenda</p>
                    <p className="text-xs text-slate-500">Semana</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/financeiro">
              <Card hoverable>
                <CardContent className="flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
                    <DollarSign className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Financeiro</p>
                    <p className="text-xs text-slate-500">Relatórios</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* ── Footer CTA ────────────────────────────────────────────────── */}
        <div className="rounded-xl bg-gradient-to-r from-brand-50 to-accent-50 p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Conheça todos os planos</h3>
              <p className="mt-1 text-sm text-slate-600">Escolha o plano ideal para sua clínica</p>
            </div>
            <Link href="/planos">
              <Button variant="primary">
                Ver planos
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
