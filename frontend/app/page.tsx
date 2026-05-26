"use client";
import { useEffect, useState } from "react";
import {
  Users, Stethoscope, FileText, FlaskConical,
  Dumbbell, ClipboardList, BookOpen, MessageSquare,
  DollarSign, Bell, TrendingUp,
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
    <div className="min-h-screen bg-gray-50">
      <NavBar
        title="OrthoClinic"
        subtitle="Sistema de gestão ortopédica"
        actions={
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-700">Dr. Ortopedista</p>
            <p className="text-xs text-gray-400">CRM 00000</p>
          </div>
        }
      />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Stats rápidas */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Pacientes", value: stats.stats.total_patients, color: "text-brand-600" },
              { label: "Consultas hoje", value: stats.stats.consultations_this_week, color: "text-teal-600" },
              { label: "Este mês", value: stats.stats.consultations_this_month, color: "text-purple-600" },
              { label: "Total consultas", value: stats.stats.total_consultations, color: "text-amber-600" },
            ].map((s) => (
              <div key={s.label} className="card p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Módulos principais */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Módulos
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <ModuleCard
              href="/pacientes"
              icon={Users}
              label="Pacientes"
              description="Cadastro e prontuários"
              color="bg-brand-600"
              badge={stats?.stats.total_patients}
            />
            <ModuleCard
              href="/pacientes"
              icon={Stethoscope}
              label="Consultas"
              description="Nova consulta ou retorno"
              color="bg-teal-600"
            />
            <ModuleCard
              href="/folhetos"
              icon={BookOpen}
              label="Folhetos"
              description="Materiais informativos"
              color="bg-purple-600"
            />
            <ModuleCard
              href="#"
              icon={MessageSquare}
              label="WhatsApp"
              description="Mensagens e lembretes"
              color="bg-green-600"
            />
            <ModuleCard
              href="#"
              icon={DollarSign}
              label="Financeiro"
              description="Controle de receitas"
              color="bg-amber-600"
            />
            <ModuleCard
              href="#"
              icon={Bell}
              label="Lembretes"
              description="Retornos e tratamentos"
              color="bg-red-500"
            />
          </div>
        </div>

        {/* Últimas consultas */}
        {stats?.recent_consultations?.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Últimas consultas
            </h2>
            <div className="space-y-2">
              {stats.recent_consultations.map((c: any) => (
                <Link key={c.id} href={`/pacientes/${c.patient_id}`}>
                  <div className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Stethoscope className="w-5 h-5 text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.type === "primeira_consulta" ? "1ª Consulta" : "Retorno"}
                      </p>
                      {c.diagnosis && (
                        <p className="text-xs text-gray-500 truncate">{c.diagnosis}</p>
                      )}
                    </div>
                    <time className="text-xs text-gray-400 flex-shrink-0">
                      {formatDateTime(c.date)}
                    </time>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
