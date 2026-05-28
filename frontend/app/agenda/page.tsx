"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Video, RotateCcw, Stethoscope, UserPlus, RefreshCw } from "lucide-react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { agendaApi } from "@/lib/api";

const TYPE_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  primeira_consulta: { label: "1ª Consulta", color: "bg-brand-500 text-white", icon: UserPlus },
  retorno: { label: "Retorno", color: "bg-accent-500 text-white", icon: RotateCcw },
  teleconsulta: { label: "Teleconsulta", color: "bg-violet-500 text-white", icon: Video },
  procedimento: { label: "Procedimento", color: "bg-amber-500 text-white", icon: Stethoscope },
  urgencia: { label: "Urgência", color: "bg-red-500 text-white", icon: Stethoscope },
  retorno_agendado: { label: "Retorno agend.", color: "bg-teal-500 text-white", icon: RefreshCw },
};

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: Date) {
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth()+1).toString().padStart(2, "0")}`;
}

export default function AgendaPage() {
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  useEffect(() => {
    setLoading(true);
    const start = toISO(days[0]);
    const end = toISO(days[6]);
    agendaApi.get(start, end)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [weekStart]);

  const byDay: Record<string, any[]> = {};
  for (const d of days) byDay[toISO(d)] = [];
  for (const e of events) {
    const key = e.date?.slice(0, 10);
    if (key && byDay[key]) byDay[key].push(e);
  }

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const today = toISO(new Date());
  const totalEvents = events.length;

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar
        title="Agenda"
        subtitle={`Semana de ${fmtDate(days[0])} a ${fmtDate(days[6])}`}
        back="/"
        actions={
          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="text-xs px-2.5 py-1 bg-white/20 rounded-lg hover:bg-white/30 transition-colors text-white font-medium"
            >
              Hoje
            </button>
            <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">

        {/* Header month */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-700">
            {MONTHS[days[3].getMonth()]} {days[3].getFullYear()}
          </h2>
          <span className="text-sm text-slate-500">
            {loading ? "Carregando..." : `${totalEvents} evento${totalEvents !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Week grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day, i) => {
            const key = toISO(day);
            const isToday = key === today;
            const dayEvents = byDay[key] || [];
            return (
              <div key={key} className={`rounded-xl overflow-hidden border transition-all ${
                isToday ? "border-brand-400 shadow-md" : "border-gray-200"
              }`}>
                {/* Day header */}
                <div className={`px-2 py-2 text-center ${isToday ? "bg-brand-600" : "bg-white"}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? "text-blue-200" : "text-slate-400"}`}>
                    {WEEK_DAYS[day.getDay()]}
                  </p>
                  <p className={`text-lg font-extrabold leading-none mt-0.5 ${isToday ? "text-white" : "text-slate-700"}`}>
                    {day.getDate()}
                  </p>
                </div>

                {/* Events */}
                <div className="bg-slate-50 min-h-[80px] p-1 space-y-1">
                  {dayEvents.length === 0 && (
                    <div className="h-full flex items-center justify-center py-4">
                      <p className="text-[10px] text-slate-300">—</p>
                    </div>
                  )}
                  {dayEvents.map((ev) => {
                    const type = TYPE_LABELS[ev.type] || { label: ev.type, color: "bg-gray-400 text-white", icon: Stethoscope };
                    const Icon = type.icon;
                    return (
                      <Link key={`${ev.id}-${ev.type}`} href={`/pacientes/${ev.patient_id}`}>
                        <div className={`rounded-lg px-1.5 py-1 ${type.color} cursor-pointer hover:opacity-90 transition-opacity`}>
                          <p className="text-[10px] font-bold truncate">{ev.patient_name}</p>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <Icon className="w-2.5 h-2.5 opacity-80 flex-shrink-0" />
                            <p className="text-[9px] opacity-90 truncate">{fmt(ev.date)}</p>
                          </div>
                          {ev.teleconsult_url && (
                            <a
                              href={ev.teleconsult_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[9px] underline opacity-90 block truncate"
                            >
                              Entrar na chamada
                            </a>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Legenda</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TYPE_LABELS).map(([key, val]) => (
              <span key={key} className={`text-xs px-2.5 py-1 rounded-lg font-medium ${val.color}`}>
                {val.label}
              </span>
            ))}
          </div>
        </div>

        {/* List view for mobile / detail */}
        {totalEvents > 0 && (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Detalhes da semana
            </p>
            <div className="card overflow-hidden divide-y divide-slate-100">
              {events.map((ev) => {
                const type = TYPE_LABELS[ev.type] || { label: ev.type, color: "bg-gray-400 text-white", icon: Stethoscope };
                const Icon = type.icon;
                return (
                  <Link key={`list-${ev.id}-${ev.type}`} href={`/pacientes/${ev.patient_id}`}>
                    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${type.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{ev.patient_name}</p>
                        <p className="text-xs text-slate-400">{type.label}{ev.diagnosis ? ` · ${ev.diagnosis}` : ""}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium text-slate-700">
                          {WEEK_DAYS[new Date(ev.date).getDay()]}, {fmtDate(new Date(ev.date))}
                        </p>
                        <p className="text-xs text-slate-400">{fmt(ev.date)}</p>
                      </div>
                      {ev.teleconsult_url && (
                        <a
                          href={ev.teleconsult_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0 p-1.5 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {totalEvents === 0 && !loading && (
          <div className="card p-12 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Stethoscope className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium">Nenhuma consulta esta semana</p>
            <p className="text-xs text-slate-400 mt-1">Navegue para outras semanas ou agende uma consulta</p>
          </div>
        )}

      </main>
    </div>
  );
}
