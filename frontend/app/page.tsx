"use client";
import { useEffect, useState } from "react";
import {
  Users, Stethoscope, BookOpen, MessageSquare,
  DollarSign, TrendingUp, Activity,
  Calendar, FileText,
} from "lucide-react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ModuleCard from "@/components/ModuleCard";
import { dashboardApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    dashboardApi.get().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar
        title="OrthoClinic"
        subtitle="Sistema de gestão ortopédica"
        actions={
          <div className="text-right">
            <p className="text-xs font-bold text-white leading-tight">Dr. Ortopedista</p>
            <p className="text-[11px] text-blue-200/70 leading-tight">CRM 00000</p>
          </div>
        }
      />

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-6">

        {/* ── Stats row ────────────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Pacientes", value: stats.stats.total_patients,
                color: "text-brand-600", border: "border-brand-400",
                icon: Users, bg: "bg-brand-50",
              },
              {
                label: "Esta semana", value: stats.stats.consultations_this_week,
                color: "text-accent-600", border: "border-accent-400",
                icon: Calendar, bg: "bg-accent-50",
              },
              {
                label: "Este mês", value: stats.stats.consultations_this_month,
                color: "text-purple-600", border: "border-purple-400",
                icon: Activity, bg: "bg-purple-50",
              },
              {
                label: "Total consultas", value: stats.stats.total_consultations,
                color: "text-emerald-600", border: "border-emerald-400",
                icon: TrendingUp, bg: "bg-emerald-50",
              },
            ].map((s) => (
              <div
                key={s.label}
                className={`card p-4 flex items-center gap-3 border-l-4 ${s.border}`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                  <s.icon className={`w-4.5 h-4.5 ${s.color}`} style={{ width: "18px", height: "18px" }} />
                </div>
                <div>
                  <p className={`text-xl font-extrabold leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Module grid ───────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-0.5">
            Módulos
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
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
              href="/agenda"
              icon={Calendar}
              label="Agenda"
              description="Semana atual"
              color="bg-gradient-to-br from-rose-500 to-rose-700"
            />
          </div>
        </div>

        {/* ── Recent consultations ──────────────────────────────────────── */}
        {stats?.recent_consultations?.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-0.5">
              Últimas consultas
            </p>
            <div className="card overflow-hidden divide-y divide-slate-100">
              {stats.recent_consultations.map((c: any, idx: number) => (
                <Link key={c.id} href={`/pacientes/${c.patient_id}`}>
                  <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group cursor-pointer">
                    {/* Type indicator */}
                    <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${
                      c.type === "primeira_consulta" ? "bg-brand-500" : "bg-accent-500"
                    }`} />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {c.type === "primeira_consulta" ? "1ª Consulta" : "Retorno"}
                      </p>
                      {c.diagnosis && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{c.diagnosis}</p>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <time className="text-xs font-medium text-slate-400">
                        {formatDateTime(c.date)}
                      </time>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Quick actions footer ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-4">
          <Link href="/pacientes/novo">
            <div className="card card-hover p-4 flex items-center gap-3 cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">Novo paciente</p>
                <p className="text-xs text-slate-400">Cadastrar agora</p>
              </div>
            </div>
          </Link>
          <Link href="/pacientes">
            <div className="card card-hover p-4 flex items-center gap-3 cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-accent-500 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">Prontuários</p>
                <p className="text-xs text-slate-400">Lista de pacientes</p>
              </div>
            </div>
          </Link>
          <Link href="/agenda">
            <div className="card card-hover p-4 flex items-center gap-3 cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">Agenda</p>
                <p className="text-xs text-slate-400">Semana atual</p>
              </div>
            </div>
          </Link>
          <Link href="/financeiro">
            <div className="card card-hover p-4 flex items-center gap-3 cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">Financeiro</p>
                <p className="text-xs text-slate-400">Este mês</p>
              </div>
            </div>
          </Link>
        </div>

      </main>
    </div>
  );
}
