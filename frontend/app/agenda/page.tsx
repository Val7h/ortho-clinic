'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Video, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import { agendaApi, clinicApi } from '@/lib/api';
import { useProtectedPage } from '@/components/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const CONSULT_TYPES: Record<string, { label: string; color: string }> = {
  primeira_consulta:  { label: "1ª Consulta",   color: "#0F2D5E" },
  retorno:            { label: "Retorno",        color: "#06B6D4" },
  teleconsulta:       { label: "Teleconsulta",   color: "#7C3AED" },
  procedimento:       { label: "Procedimento",   color: "#F59E0B" },
  urgencia:           { label: "Urgência",       color: "#EF4444" },
  retorno_agendado:   { label: "Ret. agend.",    color: "#14B8A6" },
};

const WEEK_DAYS = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 6 : day - 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDate(d: Date) { return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`; }
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export default function AgendaPage() {
  const { user } = useProtectedPage();
  const [mobileView, setMobileView] = useState("hoje");
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [consultations, setConsultations] = useState<any[]>([]);
  const [clinicEvents, setClinicEvents] = useState<any[]>([]);
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
    Promise.all([
      agendaApi.get(start, end),
      clinicApi.week(start, end),
    ])
      .then(([consults, clinic]) => {
        setConsultations(consults);
        setClinicEvents(clinic);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weekStart]);

  const today = toISO(new Date());

  // Group by day
  const byDay: Record<string, { consultations: any[]; blocks: any[]; appointments: any[] }> = {};
  for (const d of days) {
    byDay[toISO(d)] = { consultations: [], blocks: [], appointments: [] };
  }
  for (const c of consultations) {
    const key = c.date?.slice(0, 10);
    if (key && byDay[key]) byDay[key].consultations.push(c);
  }
  for (const e of clinicEvents) {
    const key = e.date?.slice(0, 10);
    if (!key || !byDay[key]) continue;
    if (e.source === "walk_in_block") byDay[key].blocks.push(e);
    else if (e.source === "appointment") byDay[key].appointments.push(e);
  }

  const totalConsults = consultations.length;
  const totalAppts = clinicEvents.filter((e) => e.source === "appointment").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar
        title="Agenda"
        subtitle={`${fmtDate(days[0])} – ${fmtDate(days[6])}`}
        back="/"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() - 7);
                setWeekStart(d);
              }}
              className="rounded-lg p-2 hover:bg-white/20 text-white transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <Button variant="secondary" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
              Hoje
            </Button>
            <button
              onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + 7);
                setWeekStart(d);
              }}
              className="rounded-lg p-2 hover:bg-white/20 text-white transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        }
      />

      <div className="flex gap-2 border-b border-slate-200 bg-white px-4 sm:hidden">
        {['hoje', 'semana'].map((v) => (
          <button
            key={v}
            onClick={() => setMobileView(v)}
            className={`flex-1 border-b-2 py-3 text-sm font-semibold transition-colors ${
              mobileView === v ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {v === 'hoje' ? 'Hoje' : 'Semana'}
          </button>
        ))}
      </div>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            {MONTHS_PT[days[3].getMonth()]} {days[3].getFullYear()}
          </h2>
          <p className="text-sm font-medium text-slate-600">
            {loading ? (
              'Carregando...'
            ) : (
              <>
                {totalConsults} consulta{totalConsults !== 1 ? 's' : ''} · {totalAppts} agendamento
                {totalAppts !== 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>

        {/* Week columns */}
        <div className={mobileView === "semana" ? "block" : "hidden sm:block"}>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const key = toISO(day);
            const isToday = key === today;
            const { consultations: cons, blocks, appointments: appts } = byDay[key];
            const hasContent = cons.length > 0 || blocks.length > 0 || appts.length > 0;

            return (
              <div key={key} className={`rounded-xl overflow-hidden border ${isToday ? "border-brand-400 shadow-md" : "border-gray-200"}`}>
                {/* Day header */}
                <div className={`px-1 py-2 text-center ${isToday ? "bg-brand-600" : "bg-white"}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? "text-blue-200" : "text-slate-400"}`}>
                    {WEEK_DAYS[day.getDay() === 0 ? 6 : day.getDay()-1]}
                  </p>
                  <p className={`text-lg font-extrabold leading-none mt-0.5 ${isToday ? "text-white" : "text-slate-700"}`}>
                    {day.getDate()}
                  </p>
                </div>

                {/* Content */}
                <div className="bg-slate-50 min-h-[90px] p-1 space-y-1">
                  {!hasContent && (
                    <div className="flex items-center justify-center py-5">
                      <p className="text-[10px] text-slate-300">—</p>
                    </div>
                  )}

                  {/* Walk-in clinic blocks */}
                  {blocks.map((b, i) => (
                    <Link key={i} href="/clinicas">
                      <div
                        className="rounded-lg px-1.5 py-1.5 cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: b.clinic_color + "22", borderLeft: `3px solid ${b.clinic_color}` }}
                      >
                        <p className="text-[9px] font-bold truncate" style={{ color: b.clinic_color }}>
                          {b.clinic_name}
                        </p>
                        <p className="text-[9px] text-slate-500 truncate">{b.start_time}–{b.end_time}</p>
                        <p className="text-[8px] text-slate-400">chegada</p>
                      </div>
                    </Link>
                  ))}

                  {/* Booked appointments */}
                  {appts.map((a: any, i: number) => (
                    <Link key={i} href="/clinicas">
                      <div
                        className="rounded-lg px-1.5 py-1.5 cursor-pointer hover:opacity-90 transition-opacity text-white"
                        style={{ backgroundColor: a.clinic_color || "#0F2D5E" }}
                      >
                        <p className="text-[9px] font-bold truncate">{a.patient_name}</p>
                        <p className="text-[9px] opacity-80">{a.start_time}</p>
                      </div>
                    </Link>
                  ))}

                  {/* Prontuário consultations */}
                  {cons.map((c: any) => {
                    const type = CONSULT_TYPES[c.type] || { label: c.type, color: "#888" };
                    return (
                      <Link key={c.id} href={`/pacientes/${c.patient_id}`}>
                        <div
                          className="rounded-lg px-1.5 py-1 cursor-pointer hover:opacity-90 transition-opacity text-white"
                          style={{ backgroundColor: type.color }}
                        >
                          <p className="text-[10px] font-bold truncate">{c.patient_name}</p>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            {c.type === "teleconsulta" && <Video className="w-2.5 h-2.5 opacity-80 flex-shrink-0" />}
                            <p className="text-[9px] opacity-90 truncate">{fmtTime(c.date)}</p>
                          </div>
                          {c.teleconsult_url && (
                            <a
                              href={c.teleconsult_url} target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[9px] underline opacity-90 block truncate"
                            >
                              Entrar →
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
        </div>

        {/* Legend */}
        <Card shadow="sm">
          <div className="p-6">
            <p className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">Legenda</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CONSULT_TYPES).map(([k, v]) => (
                <Badge key={k} size="md" style={{ backgroundColor: v.color }} className="text-white">
                  {v.label}
                </Badge>
              ))}
              <Badge size="md" variant="neutral" outline>
                Clínica — chegada
              </Badge>
            </div>
          </div>
        </Card>

        {/* Detail list */}
        {(totalConsults > 0 || totalAppts > 0) && (
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">Detalhes</h3>
            <Card shadow="sm">
              <div className="divide-y divide-slate-100">

              {/* Clinic appointments */}
              {clinicEvents.filter(e => e.source === "appointment").map((a: any, i: number) => (
                <Link key={`appt-${i}`} href="/clinicas">
                  <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                      style={{ backgroundColor: a.clinic_color }}>
                      {a.clinic_name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{a.patient_name}</p>
                      <p className="text-xs text-slate-400">{a.clinic_name} · {a.start_time}–{a.end_time}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium text-slate-600">
                        {WEEK_DAYS[new Date(a.date + "T12:00:00").getDay() === 0 ? 6 : new Date(a.date + "T12:00:00").getDay()-1]}, {fmtDate(new Date(a.date + "T12:00:00"))}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        a.status === "confirmed" ? "bg-emerald-100 text-emerald-700" :
                        a.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {a.status === "confirmed" ? "Confirmado" : a.status === "pending" ? "Pendente" : a.status}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}

              {/* Prontuário consultations */}
              {consultations.map((c: any) => {
                const type = CONSULT_TYPES[c.type] || { label: c.type, color: "#888" };
                return (
                  <Link key={`c-${c.id}`} href={`/pacientes/${c.patient_id}`}>
                    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white"
                        style={{ backgroundColor: type.color }}>
                        <Stethoscope className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.patient_name}</p>
                        <p className="text-xs text-slate-400">{type.label}{c.diagnosis ? ` · ${c.diagnosis}` : ""}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium text-slate-600">
                          {WEEK_DAYS[new Date(c.date).getDay() === 0 ? 6 : new Date(c.date).getDay()-1]}
                        </p>
                        <p className="text-xs text-slate-400">{fmtTime(c.date)}</p>
                      </div>
                      {c.teleconsult_url && (
                        <a href={c.teleconsult_url} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0 p-1.5 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 transition-colors">
                          <Video className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </Link>
                );
              })}
              </div>
            </Card>
          </div>
        )}

        {totalConsults === 0 && totalAppts === 0 && !loading && (
          <Card shadow="sm">
            <div className="py-16 text-center">
              <Stethoscope className="mx-auto mb-3 h-10 w-10 text-slate-200" />
              <p className="font-medium text-slate-500">Nenhuma consulta esta semana</p>
            </div>
          </Card>
        )}

      </main>
    </div>
  );
}
