"use client";

/**
 * NewAppointmentModal — modal flow para nova consulta
 *
 * Fluxo:
 *   Passo 1: Selecionar paciente (busca)
 *   Passo 2: Escolher data e horário
 *   Passo 3: Confirmar
 *
 * Abre como ModalSheet (bottom sheet mobile, dialog desktop).
 * Pode ser acionado via deep link: /agenda?nova=true
 */

import { useState, useEffect, useCallback } from "react";
import { ModalSheet } from "@/components/navigation/ModalSheet";
import { patientsApi, consultationsApi } from "@/lib/api";
import { ChevronLeft, ChevronRight, Check, Search, User, Calendar } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { hojeISO } from "@/lib/utils";

interface NewAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  /** Se fornecido, pula o passo de seleção de paciente */
  preselectedPatientId?: number;
  onSuccess?: (consultationId: number) => void;
}

type Step = "patient" | "datetime" | "confirm";

interface FormState {
  patientId: number | null;
  patientName: string;
  date: string;
  time: string;
  notes: string;
}

const INITIAL_FORM: FormState = {
  patientId: null,
  patientName: "",
  date: hojeISO(),
  time: "08:00",
  notes: "",
};

export function NewAppointmentModal({
  open,
  onClose,
  preselectedPatientId,
  onSuccess,
}: NewAppointmentModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(preselectedPatientId ? "datetime" : "patient");
  const [form, setForm] = useState<FormState>({
    ...INITIAL_FORM,
    patientId: preselectedPatientId ?? null,
  });
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset ao fechar/abrir
  useEffect(() => {
    if (open) {
      setStep(preselectedPatientId ? "datetime" : "patient");
      setForm({ ...INITIAL_FORM, patientId: preselectedPatientId ?? null });
      setSearch("");
    }
  }, [open, preselectedPatientId]);

  // Carrega pacientes para passo 1
  useEffect(() => {
    if (open && step === "patient") {
      patientsApi.list().then(setPatients).catch(() => {});
    }
  }, [open, step]);

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectPatient = (patient: any) => {
    setForm((f) => ({ ...f, patientId: patient.id, patientName: patient.name }));
    setStep("datetime");
  };

  const handleSubmit = async () => {
    if (!form.patientId || !form.date || !form.time) return;
    setSubmitting(true);
    try {
      const result = await consultationsApi.create(form.patientId, {
        scheduled_at: `${form.date}T${form.time}:00`,
        notes: form.notes,
        status: "scheduled",
      });
      toast.success("Consulta agendada com sucesso!");
      onSuccess?.(result.id);
      onClose();
      router.push(`/agenda?data=${form.date}`);
    } catch {
      toast.error("Erro ao agendar consulta. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const STEP_TITLES: Record<Step, string> = {
    patient: "Selecionar Paciente",
    datetime: "Data e Horário",
    confirm: "Confirmar Agendamento",
  };

  return (
    <ModalSheet
      open={open}
      onClose={onClose}
      title={STEP_TITLES[step]}
      size="md"
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5">
        {(["patient", "datetime", "confirm"] as Step[]).map((s, i) => {
          const steps: Step[] = ["patient", "datetime", "confirm"];
          const idx = steps.indexOf(step);
          const done = i < idx;
          const active = s === step;
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                className={[
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                  done
                    ? "bg-brand-600 text-white"
                    : active
                    ? "bg-brand-600 text-white"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-500",
                ].join(" ")}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              {i < 2 && (
                <span className={["h-0.5 w-8 rounded", done ? "bg-brand-600" : "bg-slate-200 dark:bg-slate-700"].join(" ")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Patient */}
      {step === "patient" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar paciente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-9 pr-4 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400"
              autoFocus
            />
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">Nenhum paciente encontrado.</p>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPatient(p)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span className="w-9 h-9 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-50 truncate">{p.name}</p>
                  {p.phone && (
                    <p className="text-xs text-slate-500 truncate">{p.phone}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 ml-auto shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: DateTime */}
      {step === "datetime" && (
        <div className="space-y-4">
          {form.patientName && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Paciente: <span className="font-semibold text-slate-800 dark:text-slate-100">{form.patientName}</span>
            </p>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              Data
            </label>
            <input
              type="date"
              value={form.date}
              min={hojeISO()}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full h-12 px-4 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              Horário
            </label>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              className="w-full h-12 px-4 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              Observações (opcional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Queixa principal, urgência..."
              className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setStep("patient")}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Voltar
            </button>
            <button
              onClick={() => setStep("confirm")}
              disabled={!form.date || !form.time}
              className="flex-1 flex items-center justify-center gap-1.5 h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
            >
              Continuar
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === "confirm" && (
        <div className="space-y-4">
          <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Paciente</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{form.patientName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Data e Horário</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {new Date(`${form.date}T${form.time}`).toLocaleString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
            {form.notes && (
              <div className="text-sm text-slate-600 dark:text-slate-400 pl-7">
                {form.notes}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("datetime")}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Editar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
              ) : (
                <Check className="w-4 h-4" aria-hidden="true" />
              )}
              {submitting ? "Agendando..." : "Confirmar Agendamento"}
            </button>
          </div>
        </div>
      )}
    </ModalSheet>
  );
}
