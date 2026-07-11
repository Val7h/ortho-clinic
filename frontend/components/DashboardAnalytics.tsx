'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent } from '@/components/ui';
import { Calendar, DollarSign, Users, Clock } from 'lucide-react';
import { financialApi } from '@/lib/api';

interface DashboardAnalyticsProps {
  stats: any;
}

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const brl = (n: number) =>
  (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Estado vazio padrão para gráficos/painéis ainda sem dado real.
const EmptyState = ({ text }: { text: string }) => (
  <div className="flex h-[300px] flex-col items-center justify-center text-center">
    <p className="text-sm text-slate-400 dark:text-slate-500">{text}</p>
    <p className="mt-1 text-xs text-slate-400 dark:text-slate-600">
      Preenche automaticamente conforme você usa o sistema.
    </p>
  </div>
);

export const DashboardAnalytics = ({ stats }: DashboardAnalyticsProps) => {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [fin, setFin] = useState<any>(null);

  // Receita real do banco (tabela financial_records via /financial/summary).
  useEffect(() => {
    financialApi.summary().then(setFin).catch(() => setFin(null));
  }, []);

  const s = stats?.stats ?? {};
  const consultas =
    period === 'week'
      ? s.consultations_this_week ?? 0
      : period === 'month'
      ? s.consultations_this_month ?? 0
      : s.total_consultations ?? 0;
  const receita = period === 'year' ? fin?.total_ytd_paid ?? 0 : fin?.total_month_paid ?? 0;
  const receitaPendente =
    period === 'year' ? fin?.total_ytd_pending ?? 0 : fin?.total_month_pending ?? 0;
  const totalPatients = s.total_patients ?? 0;
  const avgDuration = s.avg_duration_minutes;
  const ticketMedio = consultas > 0 && receita > 0 ? receita / consultas : null;

  // Receita por mês (real) — fin.monthly = { <mês 1-12>: total }.
  const receitaMensal = useMemo(() => {
    const m = fin?.monthly ?? {};
    const keys = Object.keys(m);
    if (!keys.length) return [];
    return keys
      .map((k) => ({ mes: Number(k), name: MONTHS_PT[Number(k) - 1] ?? k, receita: m[k] }))
      .sort((a, b) => a.mes - b.mes);
  }, [fin]);

  const KPICard = ({ icon: Icon, label, value, sub }: any) => (
    <Card shadow="sm" hoverable>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900/40">
            <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{value}</p>
            {sub && <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const periodLabel = period === 'week' ? 'na semana' : period === 'year' ? 'no ano' : 'no mês';

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <div className="flex gap-2">
        {(['week', 'month', 'year'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-4 py-2 font-medium transition-colors ${
              period === p
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : 'Ano'}
          </button>
        ))}
      </div>

      {/* KPI Cards — todos reais */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPICard
          icon={DollarSign}
          label={`Receita (${periodLabel})`}
          value={brl(receita)}
          sub={receitaPendente > 0 ? `${brl(receitaPendente)} a receber` : undefined}
        />
        <KPICard icon={Calendar} label={`Consultas (${periodLabel})`} value={consultas} />
        <KPICard icon={Users} label="Pacientes ativos" value={totalPatients} />
        <KPICard
          icon={Clock}
          label="Tempo médio"
          value={avgDuration != null ? `${avgDuration} min` : '—'}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Receita por mês (real) */}
        <Card shadow="sm">
          <CardContent className="pt-6">
            <h3 className="mb-4 font-bold text-slate-900 dark:text-slate-50">📈 Receita por mês</h3>
            {receitaMensal.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={receitaMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    formatter={(v: any) => brl(Number(v))}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }}
                  />
                  <Line type="monotone" dataKey="receita" stroke="#0F2D5E" strokeWidth={2} name="Receita" dot={{ fill: '#0F2D5E', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Sem receita registrada ainda." />
            )}
          </CardContent>
        </Card>

        {/* Tipo de Consulta — sem agregado real ainda */}
        <Card shadow="sm">
          <CardContent className="pt-6">
            <h3 className="mb-4 font-bold text-slate-900 dark:text-slate-50">📊 Tipo de consulta</h3>
            <EmptyState text="Sem consultas registradas ainda." />
          </CardContent>
        </Card>

        {/* Top Pacientes — depende de lançamentos financeiros por paciente */}
        <Card shadow="sm">
          <CardContent className="pt-6">
            <h3 className="mb-4 font-bold text-slate-900 dark:text-slate-50">🏆 Top pacientes por receita</h3>
            <EmptyState text="Sem receitas por paciente ainda." />
          </CardContent>
        </Card>

        {/* Métricas de Performance — só o que é real (ticket) */}
        <Card shadow="sm">
          <CardContent className="pt-6">
            <h3 className="mb-6 font-bold text-slate-900 dark:text-slate-50">📊 Métricas de performance</h3>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Ticket médio por consulta</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {ticketMedio != null ? brl(ticketMedio) : '—'}
                </p>
              </div>
              <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Taxa de ocupação e retorno aparecem quando houver histórico de consultas concluídas.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
