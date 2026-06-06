'use client';

import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, Badge } from '@/components/ui';
import { TrendingUp, Calendar, DollarSign, Users, Clock, Target } from 'lucide-react';

interface DashboardAnalyticsProps {
  stats: any;
}

export const DashboardAnalytics = ({ stats }: DashboardAnalyticsProps) => {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  // Mock data for charts (em produção viria da API)
  const recebeData = useMemo(() => {
    if (period === 'week') {
      return [
        { name: 'Seg', receita: 2100, consultas: 8 },
        { name: 'Ter', receita: 2400, consultas: 9 },
        { name: 'Qua', receita: 2200, consultas: 8 },
        { name: 'Qui', receita: 2290, consultas: 9 },
        { name: 'Sex', receita: 2000, consultas: 7 },
      ];
    } else if (period === 'month') {
      return [
        { name: 'Semana 1', receita: 8200, consultas: 32 },
        { name: 'Semana 2', receita: 9100, consultas: 35 },
        { name: 'Semana 3', receita: 8800, consultas: 34 },
        { name: 'Semana 4', receita: 9500, consultas: 36 },
      ];
    } else {
      return [
        { name: 'Jan', receita: 28000, consultas: 110 },
        { name: 'Fev', receita: 32000, consultas: 125 },
        { name: 'Mar', receita: 35000, consultas: 135 },
        { name: 'Abr', receita: 31000, consultas: 120 },
        { name: 'Mai', receita: 34000, consultas: 130 },
        { name: 'Jun', receita: 37000, consultas: 145 },
      ];
    }
  }, [period]);

  const consultasData = [
    { name: '1ª Consulta', value: 60, fill: '#0F2D5E' },
    { name: 'Retorno', value: 40, fill: '#06B6D4' },
  ];

  const topPacientesData = [
    { name: 'João Silva', receita: 2100 },
    { name: 'Maria Santos', receita: 1850 },
    { name: 'Pedro Costa', receita: 1650 },
    { name: 'Ana Oliveira', receita: 1200 },
    { name: 'Carlos Mendes', receita: 1100 },
  ];

  const tempoMedioConsulta = 28; // minutos
  const taxaOcupacao = 85; // %
  const pacientesNovos = 12;
  const taxaRetorno = 72; // %

  // KPI Card Component
  const KPICard = ({ icon: Icon, label, value, change, unit = '' }: any) => (
    <Card shadow="sm" hoverable>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
              <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                {value}{unit}
              </p>
            </div>
          </div>
          {change !== undefined && (
            <Badge variant={change >= 0 ? 'success' : 'error'} size="sm">
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setPeriod('week')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            period === 'week'
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Semana
        </button>
        <button
          onClick={() => setPeriod('month')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            period === 'month'
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Mês
        </button>
        <button
          onClick={() => setPeriod('year')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            period === 'year'
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Ano
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPICard
          icon={DollarSign}
          label="Receita"
          value={period === 'week' ? 'R$ 10.8k' : period === 'month' ? 'R$ 35.4k' : 'R$ 197k'}
          change={8}
        />
        <KPICard
          icon={Calendar}
          label="Consultas"
          value={period === 'week' ? 41 : period === 'month' ? 137 : 665}
          change={5}
        />
        <KPICard
          icon={Users}
          label="Pacientes Novos"
          value={pacientesNovos}
          change={12}
        />
        <KPICard
          icon={Clock}
          label="Tempo Médio"
          value={tempoMedioConsulta}
          unit=" min"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Receita vs Consultas */}
        <Card shadow="sm">
          <CardContent className="pt-6">
            <h3 className="font-bold text-slate-900 dark:text-slate-50 mb-4">
              📈 Receita e Consultas
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={recebeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="receita"
                  stroke="#0F2D5E"
                  strokeWidth={2}
                  name="Receita (R$)"
                  dot={{ fill: '#0F2D5E', r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="consultas"
                  stroke="#06B6D4"
                  strokeWidth={2}
                  name="Consultas"
                  dot={{ fill: '#06B6D4', r: 4 }}
                  yAxisId="right"
                />
                <YAxis yAxisId="right" orientation="right" stroke="#64748b" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tipo de Consulta */}
        <Card shadow="sm">
          <CardContent className="pt-6">
            <h3 className="font-bold text-slate-900 dark:text-slate-50 mb-4">
              📊 Tipo de Consulta
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={consultasData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {consultasData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Pacientes */}
        <Card shadow="sm">
          <CardContent className="pt-6">
            <h3 className="font-bold text-slate-900 dark:text-slate-50 mb-4">
              🏆 Top 5 Pacientes
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topPacientesData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#64748b" />
                <YAxis dataKey="name" type="category" width={120} stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                  }}
                  formatter={(value) => `R$ ${value}`}
                />
                <Bar dataKey="receita" fill="#0F2D5E" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Performance Metrics */}
        <Card shadow="sm">
          <CardContent className="pt-6">
            <h3 className="font-bold text-slate-900 dark:text-slate-50 mb-6">
              📊 Métricas de Performance
            </h3>
            <div className="space-y-4">
              {/* Taxa de Ocupação */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Taxa de Ocupação
                  </span>
                  <span className="text-sm font-bold text-brand-600 dark:text-brand-400">
                    {taxaOcupacao}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-brand-600 h-2 rounded-full transition-all"
                    style={{ width: `${taxaOcupacao}%` }}
                  />
                </div>
              </div>

              {/* Taxa de Retorno */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Taxa de Retorno
                  </span>
                  <span className="text-sm font-bold text-accent-600 dark:text-accent-400">
                    {taxaRetorno}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-accent-600 h-2 rounded-full transition-all"
                    style={{ width: `${taxaRetorno}%` }}
                  />
                </div>
              </div>

              {/* Ticket Médio */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Ticket Médio por Consulta
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  R$ {period === 'week' ? '263' : period === 'month' ? '258' : '296'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <Card shadow="sm" className="bg-gradient-to-r from-brand-50 to-accent-50 dark:from-brand-900/20 dark:to-accent-900/20">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Receita Média/Dia
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                {period === 'week' ? 'R$ 2.160' : period === 'month' ? 'R$ 1.180' : 'R$ 328'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Consultas/Dia
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                {period === 'week' ? '8,2' : period === 'month' ? '4,6' : '1,8'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Crescimento MoM
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                +8,2%
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Meta do Mês
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                94% ✅
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
