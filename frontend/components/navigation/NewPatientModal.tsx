"use client";

/**
 * NewPatientModal — modal flow para cadastro rápido de paciente
 *
 * Fluxo single-step com campos essenciais.
 * Pode ser acionado via deep link: /pacientes?novo=true
 * Após salvar, redireciona para /pacientes/{id} (prontuário).
 */

import { useState, useEffect } from "react";
import { ModalSheet } from "@/components/navigation/ModalSheet";
import { patientsApi } from "@/lib/api";
import { User, Phone, Mail, Calendar } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface NewPatientModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (patientId: number) => void;
}

interface PatientForm {
  name: string;
  phone: string;
  email: string;
  birthdate: string;
  insurance: string;
}

const INITIAL: PatientForm = {
  name: "",
  phone: "",
  email: "",
  birthdate: "",
  insurance: "",
};

export function NewPatientModal({ open, onClose, onSuccess }: NewPatientModalProps) {
  const router = useRouter();
  const [form, setForm] = useState<PatientForm>(INITIAL);
  const [errors, setErrors] = useState<Partial<PatientForm>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(INITIAL);
      setErrors({});
    }
  }, [open]);

  const update = (field: keyof PatientForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  function validate(): boolean {
    const errs: Partial<PatientForm> = {};
    if (!form.name.trim()) errs.name = "Nome é obrigatório";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "E-mail inválido";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await patientsApi.create({
        name: form.name.trim(),
        phone: form.phone,
        email: form.email,
        birthdate: form.birthdate || undefined,
        insurance: form.insurance,
      });
      toast.success("Paciente cadastrado com sucesso!");
      onSuccess?.(result.id);
      onClose();
      router.push(`/pacientes/${result.id}`);
    } catch {
      toast.error("Erro ao cadastrar paciente. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSheet open={open} onClose={onClose} title="Novo Paciente" size="md">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Nome */}
        <div className="space-y-1.5">
          <label
            htmlFor="np-name"
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide"
          >
            Nome completo <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              id="np-name"
              type="text"
              value={form.name}
              onChange={update("name")}
              placeholder="Dr. João Silva"
              autoCapitalize="words"
              autoComplete="name"
              className="w-full h-12 pl-9 pr-4 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 placeholder:text-slate-400"
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "np-name-err" : undefined}
            />
          </div>
          {errors.name && (
            <p id="np-name-err" role="alert" className="text-xs text-red-600 font-medium">
              {errors.name}
            </p>
          )}
        </div>

        {/* Telefone */}
        <div className="space-y-1.5">
          <label
            htmlFor="np-phone"
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide"
          >
            Telefone / WhatsApp
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              id="np-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={update("phone")}
              placeholder="(11) 99999-9999"
              autoComplete="tel"
              className="w-full h-12 pl-9 pr-4 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* E-mail */}
        <div className="space-y-1.5">
          <label
            htmlFor="np-email"
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide"
          >
            E-mail
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              id="np-email"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={update("email")}
              placeholder="paciente@email.com"
              autoComplete="email"
              className="w-full h-12 pl-9 pr-4 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 placeholder:text-slate-400"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "np-email-err" : undefined}
            />
          </div>
          {errors.email && (
            <p id="np-email-err" role="alert" className="text-xs text-red-600 font-medium">
              {errors.email}
            </p>
          )}
        </div>

        {/* Data de nascimento */}
        <div className="space-y-1.5">
          <label
            htmlFor="np-birthdate"
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide"
          >
            Data de nascimento
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              id="np-birthdate"
              type="date"
              value={form.birthdate}
              onChange={update("birthdate")}
              max={new Date().toISOString().split("T")[0]}
              className="w-full h-12 pl-9 pr-4 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400"
            />
          </div>
        </div>

        {/* Convênio */}
        <div className="space-y-1.5">
          <label
            htmlFor="np-insurance"
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide"
          >
            Convênio
          </label>
          <input
            id="np-insurance"
            type="text"
            value={form.insurance}
            onChange={update("insurance")}
            placeholder="Unimed, Bradesco, particular..."
            className="w-full h-12 px-4 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 placeholder:text-slate-400"
          />
        </div>

        {/* CTA */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                Cadastrando...
              </>
            ) : (
              "Cadastrar Paciente"
            )}
          </button>
        </div>
      </form>
    </ModalSheet>
  );
}
