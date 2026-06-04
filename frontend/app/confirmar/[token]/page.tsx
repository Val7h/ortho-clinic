"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle, XCircle, Calendar, Clock, MapPin,
  Loader2, AlertCircle, Hash,
} from "lucide-react";
import { confirmApi } from "@/lib/api";

const DOW = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return `${DOW[d.getDay() === 0 ? 6 : d.getDay() - 1]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

function OrthoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6a3 3 0 0 0-3-3 3 3 0 0 0-2.1 5.1L6.1 14.9A3 3 0 0 0 3 17a3 3 0 0 0 3 3 3 3 0 0 0 2.1-5.1l6.8-6.8A3 3 0 0 0 18 6z"/>
    </svg>
  );
}

type AppointmentInfo = {
  id: number;
  clinic_name: string;
  clinic_city: string;
  clinic_color: string;
  date: string;
  start_time: string;
  end_time: string;
  patient_name: string;
  queue_number: number | null;
  schedule_type: string;
  status: string;
};

type Phase = "loading" | "ready" | "confirming" | "done" | "error";

const STATUS_MESSAGES: Record<string, { icon: any; title: string; text: string; color: string }> = {
  confirmed: {
    icon: CheckCircle,
    title: "Presença confirmada!",
    text: "Ótimo! Sua presença foi confirmada. Te esperamos no dia.",
    color: "text-emerald-600",
  },
  cancelled: {
    icon: XCircle,
    title: "Agendamento cancelado",
    text: "Seu agendamento foi cancelado. Se mudar de ideia, entre em contato.",
    color: "text-red-600",
  },
  completed: {
    icon: CheckCircle,
    title: "Consulta realizada",
    text: "Esta consulta já foi realizada.",
    color: "text-blue-600",
  },
};

export default function ConfirmarPage() {
  const { token } = useParams<{ token: string }>();
  const [appt, setAppt] = useState<AppointmentInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [actionDone, setActionDone] = useState<"confirm" | "cancel" | null>(null);

  useEffect(() => {
    confirmApi.get(token)
      .then((data) => {
        setAppt(data);
        setPhase("ready");
      })
      .catch(() => {
        setError("Link inválido ou expirado.");
        setPhase("error");
      });
  }, [token]);

  const handleAction = async (action: "confirm" | "cancel") => {
    setPhase("confirming");
    try {
      const updated = action === "confirm"
        ? await confirmApi.confirm(token)
        : await confirmApi.cancel(token);
      setAppt(updated);
      setActionDone(action);
      setPhase("done");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Erro ao processar. Tente novamente.");
      setPhase("error");
    }
  };

  const isWalkIn = appt?.schedule_type === "walk_in";
  const alreadyActioned = appt?.status === "confirmed" || appt?.status === "cancelled" || appt?.status === "completed";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #0F2D5E 0%, #1A4A9A 50%, #2563EB 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
          <span className="text-white"><OrthoIcon /></span>
        </div>
        <span className="font-extrabold text-white text-sm">OrthoClinic</span>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-sm">

          {/* Loading */}
          {phase === "loading" && (
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-white/60 mx-auto" />
              <p className="text-white/60 mt-3 text-sm">Carregando agendamento...</p>
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-slate-800 mb-2">Link inválido</h2>
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          )}

          {/* Already actioned (existing status) */}
          {phase === "ready" && alreadyActioned && appt && (() => {
            const s = STATUS_MESSAGES[appt.status];
            if (!s) return null;
            const Icon = s.icon;
            return (
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="px-6 py-8 text-center">
                  <Icon className={`w-14 h-14 mx-auto mb-3 ${s.color}`} />
                  <h2 className="text-xl font-extrabold text-slate-800">{s.title}</h2>
                  <p className="text-sm text-slate-500 mt-2">{s.text}</p>
                </div>
                <AppointmentCard appt={appt} />
              </div>
            );
          })()}

          {/* Ready to act */}
          {phase === "ready" && !alreadyActioned && appt && (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 pt-7 pb-5 text-center">
                <h2 className="text-lg font-extrabold text-slate-800 mb-1">
                  Confirmar agendamento
                </h2>
                <p className="text-sm text-slate-500">
                  Olá, <strong>{appt.patient_name.split(" ")[0]}</strong>! Confirme sua presença abaixo.
                </p>
              </div>

              <AppointmentCard appt={appt} />

              <div className="px-5 py-5 space-y-3">
                <button
                  onClick={() => handleAction("confirm")}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"
                >
                  <CheckCircle className="w-5 h-5" />
                  Confirmar presença
                </button>
                <button
                  onClick={() => handleAction("cancel")}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 font-semibold text-sm transition-colors"
                >
                  <XCircle className="w-4.5 h-4.5" style={{width:"18px",height:"18px"}} />
                  Não poderei comparecer
                </button>
              </div>
            </div>
          )}

          {/* Processing */}
          {phase === "confirming" && (
            <div className="bg-white rounded-2xl shadow-xl p-10 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-brand-500 mx-auto" />
              <p className="text-slate-500 mt-3 text-sm">Processando...</p>
            </div>
          )}

          {/* Done */}
          {phase === "done" && appt && (() => {
            const s = STATUS_MESSAGES[appt.status];
            if (!s) return null;
            const Icon = s.icon;
            return (
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="px-6 py-8 text-center">
                  <Icon className={`w-14 h-14 mx-auto mb-3 ${s.color}`} />
                  <h2 className="text-xl font-extrabold text-slate-800">{s.title}</h2>
                  <p className="text-sm text-slate-500 mt-2">{s.text}</p>
                </div>
                <AppointmentCard appt={appt} />
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}

function AppointmentCard({ appt }: { appt: AppointmentInfo }) {
  const isWalkIn = appt.schedule_type === "walk_in";
  return (
    <div
      className="mx-5 mb-2 rounded-xl p-4 border-2"
      style={{ borderColor: appt.clinic_color + "40", backgroundColor: appt.clinic_color + "08" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: appt.clinic_color }}
        />
        <span className="font-bold text-slate-800 text-sm">{appt.clinic_name}</span>
      </div>
      <div className="space-y-1.5 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>{appt.clinic_city}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>{fmtDate(appt.date)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>
            {isWalkIn
              ? `Turno ${appt.start_time}–${appt.end_time}`
              : `${appt.start_time} – ${appt.end_time}`}
          </span>
        </div>
        {isWalkIn && appt.queue_number && (
          <div className="flex items-center gap-2">
            <Hash className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>
              Senha <strong>#{appt.queue_number}</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
