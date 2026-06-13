"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ChevronLeft, ChevronRight, CheckCircle, Loader2,
  AlertCircle, Clock, MapPin, Users, Hash,
} from "lucide-react";
import { clinicApi } from "@/lib/api";

const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DOW_NAMES = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];

function toISO(d: Date) { return d.toISOString().slice(0, 10); }

export default function AgendarPage() {
  const params = useParams();
  const slug = params?.slug as string;
  if (!slug) return <div>Clínica não encontrada</div>;

  const [clinic, setClinic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // calendar
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // slots / walk-in info
  const [slotData, setSlotData] = useState<any>(null);
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
        if (e?.response?.status === 404) setError("Link de agendamento inválido.");
        else setError("Erro ao carregar. Tente novamente.");
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const availableDows: number[] = clinic
    ? clinic.schedules.map((s: any) => s.day_of_week)
    : [];

  // Convert JS getDay() (0=Sun) to backend (0=Mon)
  const jsDowToBackend = (jsDay: number) => jsDay === 0 ? 6 : jsDay - 1;

  const isAvailableDay = (d: Date) =>
    availableDows.includes(jsDowToBackend(d.getDay())) &&
    d >= new Date(new Date().toDateString());

  // Calendar grid
  const firstDay = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
  const lastDay  = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const calDays: (Date | null)[] = Array(startOffset).fill(null);
  for (let i = 1; i <= lastDay.getDate(); i++)
    calDays.push(new Date(displayMonth.getFullYear(), displayMonth.getMonth(), i));
  while (calDays.length % 7 !== 0) calDays.push(null);

  const handleDateSelect = async (d: Date) => {
    if (!isAvailableDay(d)) return;
    const iso = toISO(d);
    setSelectedDate(iso);
    setSelectedSlot(null);
    setSlotData(null);
    setSlotsLoading(true);
    try {
      const data = await clinicApi.slots(slug, iso);
      setSlotData(data);
    } catch {
      setSlotData(null);
    } finally {
      setSlotsLoading(false);
    }
  };

  const isWalkIn = slotData?.schedule_type === "walk_in";

  // For timed appointments, require slot selection before showing form
  // For walk-in, show form as soon as date is selected and spots available
  const showForm = selectedDate && slotData &&
    (isWalkIn ? slotData.available : selectedSlot !== null);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !name.trim()) return;
    if (!isWalkIn && !selectedSlot) return;
    setSaving(true);
    try {
      const result = await clinicApi.book(slug, {
        date: selectedDate,
        start_time: isWalkIn ? undefined : selectedSlot!,
        patient_name: name.trim(),
        patient_phone: phone.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setBooked(result);
    } catch (e: any) {
      const msg = e?.response?.data?.detail;
      if (e?.response?.status === 409) alert("Este horário acabou de ser ocupado. Escolha outro.");
      else if (msg) alert(msg);
      else alert("Erro ao registrar. Tente novamente.");
      // Refresh slot data
      if (selectedDate) handleDateSelect(new Date(selectedDate + "T12:00:00"));
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / error / success screens ─────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
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

  if (booked) {
    const isWalkInBooked = booked.queue_number != null;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>

          {isWalkInBooked ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Presença confirmada!</h1>
              <div
                className="rounded-2xl p-5 text-white flex flex-col items-center gap-1"
                style={{ backgroundColor: clinic?.color || "#0F2D5E" }}
              >
                <p className="text-sm font-medium opacity-80">Sua posição na fila</p>
                <p className="text-6xl font-extrabold leading-none">#{booked.queue_number}</p>
                <p className="text-sm opacity-80 mt-1">{clinic?.name}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-1.5">
                <p className="text-sm"><span className="text-gray-400">Data:</span> <strong>
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                </strong></p>
                <p className="text-sm"><span className="text-gray-400">Horário:</span> <strong>{booked.start_time} – {booked.end_time}</strong></p>
                <p className="text-sm"><span className="text-gray-400">Nome:</span> <strong>{booked.patient_name}</strong></p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs text-amber-700 font-medium">⚠️ Ordem de chegada</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Chegue no horário do turno. O atendimento é por ordem de chegada no local.
                  Este número é apenas uma previsão.
                </p>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Consulta agendada!</h1>
              <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-1.5">
                <p className="text-sm"><span className="text-gray-400">Clínica:</span> <strong>{clinic?.name}</strong></p>
                <p className="text-sm"><span className="text-gray-400">Data:</span> <strong>
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                </strong></p>
                <p className="text-sm"><span className="text-gray-400">Horário:</span> <strong>{booked.start_time} – {booked.end_time}</strong></p>
                <p className="text-sm"><span className="text-gray-400">Nome:</span> <strong>{booked.patient_name}</strong></p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs text-amber-700 font-medium">⏰ Aguardando confirmação</p>
                <p className="text-xs text-amber-600 mt-0.5">Você será contatado para confirmar o horário.</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

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
                {s.schedule_type === "walk_in" ? " · chegada" : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* Calendar */}
        {!showForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <button
                onClick={() => setDisplayMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <span className="font-bold text-gray-800">
                {MONTHS_PT[displayMonth.getMonth()]} {displayMonth.getFullYear()}
              </span>
              <button
                onClick={() => setDisplayMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="grid grid-cols-7 px-3 pt-3 pb-1">
              {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map((d) => (
                <div key={d} className="text-center text-[10px] font-bold text-gray-400 pb-2">{d}</div>
              ))}
            </div>

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
                      isSelected ? "text-white font-bold" :
                      available ? "hover:bg-gray-100 text-gray-800" :
                      "text-gray-300 cursor-not-allowed"
                    } ${isToday && !isSelected ? "ring-1 ring-gray-300" : ""}`}
                    style={isSelected ? { backgroundColor: clinic?.color } : {}}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Slot info after date selection */}
        {selectedDate && !showForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">
                {selectedDateObj?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <button onClick={() => { setSelectedDate(null); setSlotData(null); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline">
                Trocar data
              </button>
            </div>

            {slotsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !slotData ? (
              <p className="text-gray-400 text-sm text-center py-4">Sem atendimento neste dia.</p>
            ) : !slotData.available ? (
              <div className="text-center py-6 space-y-2">
                <Users className="w-10 h-10 text-red-300 mx-auto" />
                <p className="text-red-600 font-semibold">Vagas esgotadas</p>
                <p className="text-gray-400 text-sm">
                  {slotData.schedule_type === "walk_in"
                    ? `Limite de ${slotData.max_patients} pacientes atingido para este turno.`
                    : "Sem horários disponíveis nesta data."}
                </p>
              </div>
            ) : isWalkIn ? (
              /* Walk-in: show availability and go straight to form */
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Vagas disponíveis</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {slotData.start_time} – {slotData.end_time} · máx. {slotData.max_patients} pacientes
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-extrabold text-emerald-600 leading-none">{slotData.available_spots}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{slotData.booked_count} confirmados</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(slotData.booked_count / slotData.max_patients) * 100}%`,
                        backgroundColor: slotData.booked_count / slotData.max_patients > 0.8
                          ? "#EF4444" : slotData.booked_count / slotData.max_patients > 0.5
                          ? "#F59E0B" : "#10B981",
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 text-right">
                    {slotData.booked_count}/{slotData.max_patients} vagas preenchidas
                  </p>
                </div>

                <button
                  onClick={() => setSelectedSlot("walk_in")}
                  className="w-full py-3.5 text-white font-bold rounded-2xl transition-colors text-base"
                  style={{ backgroundColor: clinic?.color || "#0F2D5E" }}
                >
                  Confirmar presença →
                </button>
              </div>
            ) : (
              /* Timed: show slot grid */
              <div className="grid grid-cols-4 gap-2">
                {(slotData.slots || []).map((s: any) => (
                  <button
                    key={s.time}
                    disabled={!s.available}
                    onClick={() => setSelectedSlot(s.time)}
                    className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      s.available
                        ? "border-gray-200 text-gray-700 hover:text-white hover:border-transparent hover:scale-105"
                        : "bg-gray-50 text-gray-300 cursor-not-allowed border-gray-100 line-through"
                    }`}
                    style={s.available ? {} : {}}
                    onMouseEnter={(e) => s.available && ((e.currentTarget as HTMLElement).style.backgroundColor = clinic?.color)}
                    onMouseLeave={(e) => s.available && ((e.currentTarget as HTMLElement).style.backgroundColor = "")}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Booking form */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900">
                    {isWalkIn ? "Confirmar presença" : "Confirmar agendamento"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {selectedDateObj?.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
                      {isWalkIn
                        ? ` · ${slotData?.start_time}–${slotData?.end_time}`
                        : ` às ${selectedSlot}`}
                    </span>
                  </div>
                  {isWalkIn && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Hash className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-sm text-emerald-600 font-semibold">
                        Você será o nº {slotData?.booked_count + 1} na fila
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedSlot(null); if (isWalkIn) setSlotData(null); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Voltar
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

              {isWalkIn && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                  ⚠️ Ordem de chegada — este registro não garante horário fixo.
                  Chegue no início do turno para ser atendido.
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="w-full py-4 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg text-base transition-opacity disabled:opacity-50"
                style={{ backgroundColor: clinic?.color || "#0F2D5E" }}
              >
                {saving
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Registrando...</>
                  : <><CheckCircle className="w-5 h-5" />
                    {isWalkIn ? "Confirmar presença" : "Confirmar agendamento"}</>
                }
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
