"use client";
import { useEffect, useState } from "react";
import {
  MapPin, Calendar, Clock, CheckCircle, XCircle,
  User, Phone, FileText, ChevronDown, ChevronUp,
  Link as LinkIcon, Copy, RefreshCw, Loader2,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { clinicApi } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";
import toast from "react-hot-toast";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pendente",    color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  confirmed: { label: "Confirmado",  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  completed: { label: "Realizado",   color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  cancelled: { label: "Cancelado",   color: "text-red-700",     bg: "bg-red-50 border-red-200" },
  blocked:   { label: "Bloqueado",   color: "text-gray-600",    bg: "bg-gray-100 border-gray-200" },
};

const DOW = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return `${DOW[d.getDay() === 0 ? 6 : d.getDay()-1]}, ${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
}

function getNextDates(dayOfWeek: number, count = 4): string[] {
  const today = new Date();
  const results: string[] = [];
  for (let i = 0; i <= 60 && results.length < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    if (dow === dayOfWeek) results.push(d.toISOString().slice(0, 10));
  }
  return results;
}

export default function ClinicasPage() {
  const { user, loading: authLoading } = useProtectedPage();
  const [clinics, setClinics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [apptsByClinic, setApptsByClinic] = useState<Record<number, any[]>>({});
  const [apptLoading, setApptLoading] = useState<number | null>(null);

  useEffect(() => {
    clinicApi.list()
      .then(setClinics)
      .catch(() => toast.error("Erro ao carregar clínicas"))
      .finally(() => setLoading(false));
  }, []);

  const loadAppointments = async (clinicId: number) => {
    setApptLoading(clinicId);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date();
      future.setDate(future.getDate() + 30);
      const data = await clinicApi.appointments(clinicId, {
        date_from: today,
        date_to: future.toISOString().slice(0, 10),
      });
      setApptsByClinic((prev) => ({ ...prev, [clinicId]: data }));
    } catch {
      toast.error("Erro ao carregar agendamentos");
    } finally {
      setApptLoading(null);
    }
  };

  const toggleClinic = async (clinicId: number) => {
    if (expanded === clinicId) {
      setExpanded(null);
    } else {
      setExpanded(clinicId);
      if (!apptsByClinic[clinicId]) await loadAppointments(clinicId);
    }
  };

  const handleStatus = async (apptId: number, status: string, clinicId: number) => {
    try {
      await clinicApi.updateAppointment(apptId, status);
      await loadAppointments(clinicId);
      toast.success(status === "confirmed" ? "Confirmado!" : status === "cancelled" ? "Cancelado" : "Atualizado");
    } catch {
      toast.error("Erro ao atualizar");
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/agendar/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar title="Clínicas" subtitle="Agendamentos e horários" back="/" />

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 border-l-4 border-brand-400">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Clínicas</p>
            <p className="text-2xl font-extrabold text-brand-600 mt-0.5">{clinics.length}</p>
          </div>
          <div className="card p-4 border-l-4 border-blue-400">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Com agendamento</p>
            <p className="text-2xl font-extrabold text-blue-600 mt-0.5">
              {clinics.filter(c => c.schedules.some((s: any) => s.schedule_type === "appointment")).length}
            </p>
          </div>
          <div className="card p-4 border-l-4 border-amber-400">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Ordem chegada</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-0.5">
              {clinics.filter(c => c.schedules.some((s: any) => s.schedule_type === "walk_in")).length}
            </p>
          </div>
        </div>

        {/* Clinic cards */}
        {clinics.map((clinic) => {
          const isOpen = expanded === clinic.id;
          const hasOnlineBooking = clinic.schedules.some((s: any) => s.schedule_type === "appointment");
          const appts = apptsByClinic[clinic.id] || [];
          const pending = appts.filter((a: any) => a.status === "pending").length;

          return (
            <div key={clinic.id} className="card overflow-hidden">
              {/* Header */}
              <button
                onClick={() => toggleClinic(clinic.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                {/* Color dot */}
                <div
                  className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: clinic.color }}
                >
                  {clinic.name.slice(0, 2).toUpperCase()}
                </div>

                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-800">{clinic.name}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${
                      hasOnlineBooking
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {hasOnlineBooking ? "Agendamento" : "Chegada"}
                    </span>
                    {pending > 0 && (
                      <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                        {pending} pendente{pending > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400">
                    <MapPin className="w-3 h-3" />
                    <span>{clinic.city}/{clinic.state}</span>
                    <span className="text-slate-200">·</span>
                    {clinic.schedules.map((s: any, i: number) => (
                      <span key={i} className="text-slate-400">
                        {DOW[s.day_of_week]} {s.start_time}–{s.end_time}
                        {i < clinic.schedules.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                </div>

                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                }
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t border-slate-100">

                  {/* Link público — todas as clínicas têm agora */}
                  <div className="px-5 py-4 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      Link de {hasOnlineBooking ? "agendamento" : "confirmação de presença"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-mono truncate">
                        {typeof window !== "undefined" ? `${window.location.origin}/agendar/${clinic.slug}` : `/agendar/${clinic.slug}`}
                      </div>
                      <button
                        onClick={() => copyLink(clinic.slug)}
                        className="flex-shrink-0 p-2 text-white rounded-xl hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: clinic.color }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {!hasOnlineBooking && (
                      <p className="text-[10px] text-slate-400 mt-1.5">
                        🚶 Ordem de chegada · Limite de 30 pacientes por turno
                      </p>
                    )}
                  </div>

                  {/* Appointments list — all clinics */}
                  <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                          {hasOnlineBooking ? "Próximos agendamentos" : "Presenças confirmadas"}
                        </p>
                        <button
                          onClick={() => loadAppointments(clinic.id)}
                          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          {apptLoading === clinic.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                            : <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                          }
                        </button>
                      </div>

                      {appts.filter((a: any) => a.status !== "blocked").length === 0 ? (
                        <div className="text-center py-6">
                          <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">Nenhum agendamento nos próximos 30 dias</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {appts
                            .filter((a: any) => a.status !== "blocked")
                            .map((a: any) => {
                              const st = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
                              return (
                                <div
                                  key={a.id}
                                  className={`rounded-xl border p-3.5 ${st.bg}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {a.queue_number && (
                                          <span
                                            className="text-xs font-extrabold px-2 py-0.5 rounded-lg text-white"
                                            style={{ backgroundColor: clinic.color }}
                                          >
                                            #{a.queue_number}
                                          </span>
                                        )}
                                        <p className="font-semibold text-slate-800 text-sm">{a.patient_name}</p>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.bg} ${st.color}`}>
                                          {st.label}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap gap-3 mt-1">
                                        <span className="flex items-center gap-1 text-xs text-slate-500">
                                          <Calendar className="w-3 h-3" />
                                          {fmtDate(a.date)}
                                        </span>
                                        <span className="flex items-center gap-1 text-xs text-slate-500">
                                          <Clock className="w-3 h-3" />
                                          {a.queue_number ? `Turno ${a.start_time}–${a.end_time}` : `${a.start_time} – ${a.end_time}`}
                                        </span>
                                        {a.patient_phone && (
                                          <span className="flex items-center gap-1 text-xs text-slate-500">
                                            <Phone className="w-3 h-3" />
                                            {a.patient_phone}
                                          </span>
                                        )}
                                      </div>
                                      {a.reason && (
                                        <p className="text-xs text-slate-400 mt-1 truncate">
                                          📋 {a.reason}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Action buttons */}
                                  {a.status === "pending" && (
                                    <div className="flex gap-2 mt-3">
                                      <button
                                        onClick={() => handleStatus(a.id, "confirmed", clinic.id)}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors"
                                      >
                                        <CheckCircle className="w-3.5 h-3.5" /> Confirmar
                                      </button>
                                      <button
                                        onClick={() => handleStatus(a.id, "cancelled", clinic.id)}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-100 text-red-700 text-xs font-bold rounded-xl hover:bg-red-200 transition-colors"
                                      >
                                        <XCircle className="w-3.5 h-3.5" /> Cancelar
                                      </button>
                                    </div>
                                  )}
                                  {a.status === "confirmed" && (
                                    <div className="flex gap-2 mt-3">
                                      <button
                                        onClick={() => handleStatus(a.id, "completed", clinic.id)}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors"
                                      >
                                        <CheckCircle className="w-3.5 h-3.5" /> Marcar realizado
                                      </button>
                                      <button
                                        onClick={() => handleStatus(a.id, "cancelled", clinic.id)}
                                        className="flex items-center justify-center gap-1 px-3 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl hover:bg-red-100 transition-colors"
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
