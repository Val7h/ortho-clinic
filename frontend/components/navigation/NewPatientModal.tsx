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
import { User, Phone, Mail, Calendar, CreditCard, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { hojeISO } from "@/lib/utils";

interface NewPatientModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (patientId: number) => void;
}

interface PatientForm {
  name: string;
  phone: string;
  email: string;
  cpf: string;
  birthdate: string;
  insurance: string;
}

const INITIAL: PatientForm = {
  name: "",
  phone: "",
  email: "",
  cpf: "",
  birthdate: "",
  insurance: "",
};

// ── Máscaras / validação BR ────────────────────────────────────────────────
// Telefone BR: (DD) 9XXXX-XXXX (celular) ou (DD) XXXX-XXXX (fixo)
function formatPhoneBR(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// DDD (2 dígitos) + 8 ou 9 dígitos do número
function isValidPhoneBR(value: string): boolean {
  const d = value.replace(/\D/g, "");
  return d.length === 10 || d.length === 11;
}

// CPF: XXX.XXX.XXX-XX (apenas formatação, campo opcional)
function formatCPF(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function NewPatientModal({ open, onClose, onSuccess }: NewPatientModalProps) {
  const router = useRouter();
  const [form, setForm] = useState<PatientForm>(INITIAL);
  const [errors, setErrors] = useState<Partial<PatientForm>>({});
  const [submitting, setSubmitting] = useState(false);
  // Aviso não-bloqueante de possível duplicado (nome+nascimento) vindo do backend.
  // Guarda o resultado já criado até o usuário confirmar que quer prosseguir.
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<{ id: number } | null>(null);

  useEffect(() => {
    if (open) {
      setForm(INITIAL);
      setErrors({});
      setWarning(null);
      setPendingResult(null);
    }
  }, [open]);

  const update = (field: keyof PatientForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const updatePhone = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, phone: formatPhoneBR(e.target.value) }));

  const updateCpf = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, cpf: formatCPF(e.target.value) }));

  function validate(): boolean {
    const errs: Partial<PatientForm> = {};
    if (!form.name.trim()) errs.name = "Nome é obrigatório";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "E-mail inválido";
    if (form.phone && !isValidPhoneBR(form.phone))
      errs.phone = "Telefone inválido — use DDD + 8 ou 9 dígitos";
    setErrors(errs);
    if (errs.phone) toast.error(errs.phone);
    return Object.keys(errs).length === 0;
  }

  // Finaliza o fluxo: avisa sucesso, fecha e navega para o prontuário.
  function finish(id: number) {
    onSuccess?.(id);
    onClose();
    router.push(`/pacientes/${id}`);
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
        cpf: form.cpf.replace(/\D/g, "") || undefined,
        birthdate: form.birthdate || undefined,
        insurance: form.insurance,
      });
      // Backend pode retornar 'warning' quando há paciente parecido (nome+nascimento).
      if (result?.warning) {
        setWarning(String(result.warning));
        setPendingResult({ id: result.id });
        return; // aguarda confirmação do usuário (não-bloqueante)
      }
      toast.success("Paciente cadastrado com sucesso!");
      finish(result.id);
    } catch {
      toast.error("Erro ao cadastrar paciente. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  // Usuário confirmou o aviso de duplicado — segue para o prontuário.
  const handleConfirmWarning = () => {
    if (!pendingResult) return;
    toast.success("Paciente cadastrado com sucesso!");
    finish(pendingResult.id);
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
              onChange={updatePhone}
              placeholder="(11) 99999-9999"
              autoComplete="tel"
              maxLength={16}
              className="w-full h-12 pl-9 pr-4 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 placeholder:text-slate-400"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "np-phone-err" : undefined}
            />
          </div>
          {errors.phone && (
            <p id="np-phone-err" role="alert" className="text-xs text-red-600 font-medium">
              {errors.phone}
            </p>
          )}
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

        {/* CPF */}
        <div className="space-y-1.5">
          <label
            htmlFor="np-cpf"
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide"
          >
            CPF
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              id="np-cpf"
              type="text"
              inputMode="numeric"
              value={form.cpf}
              onChange={updateCpf}
              placeholder="000.000.000-00"
              maxLength={14}
              className="w-full h-12 pl-9 pr-4 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 placeholder:text-slate-400"
            />
          </div>
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
              max={hojeISO()}
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

        {/* Aviso não-bloqueante de possível duplicado */}
        {warning && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Já existe paciente parecido
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="pt-2">
          {warning ? (
            <button
              type="button"
              onClick={handleConfirmWarning}
              className="w-full h-12 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Continuar mesmo assim
            </button>
          ) : (
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
          )}
        </div>
      </form>
    </ModalSheet>
  );
}
