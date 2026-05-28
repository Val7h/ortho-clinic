"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle, Loader2, AlertCircle, Clock, MapPin } from "lucide-react";
import { clinicApi } from "@/lib/api";

const DAYS_PT = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DOW_NAMES = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

export default function AgendarPage() {
  const { slug } = useParams<{ slug: string }>();

  const [clinic, setClinic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // calendar
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // slots
  const [slots, setSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [booked, setBooked] = useState<any>(null);

  useEffect(() => {
    clinicApi.getPublic(slug)
      .then(setClinic)
      .catch((e) => {
        if (e?.response?.status === 404) setError("Link de agendamento inválido ou clínica não encontrada.");
        else setError("Erro ao carregar. Tente novamente.");
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // available days for this clinic
  const availableDows = clinic
    ? clinic.schedules.map((s: any) => s.day_of_week)
    : [];

  const isAvailableDay = (d: Date) => {
    const dow = d.getDay(); // 0=Sun
    // convert JS dow (0=Sun) to backend dow (0=Mon)
    const backendDow = dow === 0 ? 6 : dow - 1;
    return availableDows.includes(backendDow) && d >= new Date(new Date().toDateString());
  };

  // calendar grid
  const firstDay = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
  const lastDay = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0);
  // Start from Monday
  const startOffset = (firstDay.getDay() + 6) % 7;
  const calDays: (Date | null)[] = Array(startOffset).fill(null);
  for (let i = 1; i <= lastDay.getDate(); i++) {
    calDays.push(new Date(displayMonth.getFullYear(), displayMonth.getMonth(), i));
  }
  while (calDays.length % 7 !== 0) calDays.push(null);

  const handleDateSelect = async (d: Date) => {
    if (!isAvailableDay(d)) return;
    const iso = toISO(d);
    setSelectedDate(iso);
    setSelectedSlot(null);
    setSlotsLoading(true);
    try {
      const data = await clinicApi.slots(slug, iso);
      setSlots(data.slots || []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedSlot || !name.trim()) return;
    setSaving(true);
    try {
      const result = await clinicApi.book(slug, {
        date: selectedDate,
        start_time: selectedSlot,
        patient_name: name.trim(),
        patient_phone: phone.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setBooked(result);
    } catch (e: any) {
      if (e?.response?.status === 409) alert("Este horário acabou de ser ocupado. Escolha outro.");
      else alert("Erro ao agendar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <p className="text-gray-700 font-medium">{error}</p>
      </div>
    </div>
  );

  if (booked) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Consulta agendada!</h1>
        <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-2">
          <p className="text-sm"><span className="text-gray-400">Clínica:</span> <strong>{clinic.name}</strong></p>
          <p className="text-sm"><span className="text-gray-400">Data:</span> <strong>
            {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </strong></p>
          <p className="text-sm"><span className="text-gray-400">Horário:</span> <strong>{booked.start_time} — {booked.end_time}</strong></p>
          <p className="text-sm"><span className="text-gray-400">Paciente:</span> <strong>{booked.patient_name}</strong></p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-xs text-amber-700 font-medium">⏰ Aguardando confirmação do consultório</p>
          <p className="text-xs text-amber-600 mt-0.5">Você será contatado por telefone para confirmar.</p>
        </div>
      </div>
    </div>
  );

  const selectedDateObj = selectedDate ? new Date(selectedDate + "T12:00:00") : null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div style={{ background: clinic?.color || "#0F2D5E" }} className="px-5 py-6 text-white">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold">{clinic?.name}</h1>
          <div className="flex items-center gap-1.5 mt-1 text-white/70 text-sm">
            <MapPin className="w-3.5 h-3.5" />
            <span>{clinic?.city}/{clinic?.state}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {clinic?.schedules.map((s: any, i: number) => (
              <span key={i} className="text-xs bg-white/20 rounded-lg px-2.5 py-1 font-medium">
                {DOW_NAMES[s.day_of_week]} · {s.start_time}–{s.end_time}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* Calendar */}
        {!selectedSlot && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <button onClick={() => setDisplayMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <span className="font-bold text-gray-800">
                {MONTHS_PT[displayMonth.getMonth()]} {displayMonth.getFullYear()}
              </span>
              <button onClick={() => setDisplayMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 px-3 pt-3 pb-1">
              {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map((d) => (
                <div key={d} className="text-center text-[10px] font-bold text-gray-400 pb-2">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 px-3 pb-4 gap-y-1">
              {calDays.map((day, i) => {
                if (!day) return <div key={i} />;
                const iso = toISO(day);
                const available = isAvailableDay(day);
                const isSelected = iso === selectedDate;
                const isToday = iso === toISO(new Date());
                return (
                  <button
                    key={i}
                    onClick={() => available && handleDateSelect(day)}
                    disabled={!available}
                    className={`h-9 w-9 mx-auto rounded-xl text-sm font-medium transition-all ${
                      isSelected
                        ? "text-white font-bold ring-2 ring-offset-1"
                        : available
                          ? "hover:bg-gray-100 text-gray-800 cursor-pointer"
                          : "text-gray-300 cursor-not-allowed"
                    } ${isToday && !isSelected ? "ring-1 ring-gray-300" : ""}`}
                    style={isSelected ? { backgroundColor: clinic?.color || "#0F2D5E", ringColor: clinic?.color } : {}}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Slots */}
        {selectedDate && !selectedSlot && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">
                {selectedDateObj?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <button onClick={() => { setSelectedDate(null); setSlots([]); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline">
                Trocar data
              </button>
            </div>

            {slotsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : slots.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Sem horários disponíveis nesta data.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {slots.map((s: any) => (
                  <button
                    key={s.time}
                    disabled={!s.available}
                    onClick={() => setSelectedSlot(s.time)}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      s.available
                        ? "hover:text-white hover:scale-105 text-gray-700 border-2 border-gray-200"
                        : "bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-100 line-through"
                    }`}
                    style={s.available ? { borderColor: "transparent", backgroundColor: "#f8fafc" } : {}}
                    onMouseEnter={(e) => {
                      if (s.available) (e.currentTarget as HTMLElement).style.backgroundColor = clinic?.color || "#0F2D5E";
                    }}
                    onMouseLeave={(e) => {
                      if (s.available) (e.currentTarget as HTMLElement).style.backgroundColor = "#f8fafc";
                    }}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Booking form */}
        {selectedDate && selectedSlot && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900">Confirmar agendamento</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {selectedDateObj?.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })} às {selectedSlot}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSlot(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Trocar horário
                </button>
              </div>
            </div>

            <form onSubmit={handleBook} className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Nome completo <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Telefone / WhatsApp
                </label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Motivo da consulta
                </label>
                <textarea
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                  placeholder="Descreva brevemente o motivo..."
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="w-full py-4 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg text-base"
                style={{ backgroundColor: clinic?.color || "#0F2D5E" }}
              >
                {saving
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Agendando...</>
                  : <><CheckCircle className="w-5 h-5" /> Confirmar agendamento</>
                }
              </button>
              <p className="text-center text-xs text-gray-400">
                Você será contatado para confirmar o horário.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
