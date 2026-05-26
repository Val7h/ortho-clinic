import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, differenceInYears } from "date-fns";
import { ptBR } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined, pattern = "dd/MM/yyyy") {
  if (!dateStr) return "—";
  try {
    const d = dateStr.includes("T") ? parseISO(dateStr) : parseISO(dateStr + "T00:00:00");
    return format(d, pattern, { locale: ptBR });
  } catch {
    return "—";
  }
}

export function formatDateTime(dateStr: string | null | undefined) {
  return formatDate(dateStr, "dd/MM/yyyy 'às' HH:mm");
}

export function calcAge(birthdate: string | null | undefined): string {
  if (!birthdate) return "—";
  try {
    const d = parseISO(birthdate + "T00:00:00");
    return `${differenceInYears(new Date(), d)} anos`;
  } catch {
    return "—";
  }
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  return phone;
}

export const CONSULTATION_TYPE_LABELS: Record<string, string> = {
  primeira_consulta: "1ª Consulta",
  retorno: "Retorno",
  urgencia: "Urgência",
  procedimento: "Procedimento",
  teleconsulta: "Teleconsulta",
};

export const CONSULTATION_TYPE_COLORS: Record<string, string> = {
  primeira_consulta: "bg-brand-100 text-brand-800",
  retorno: "bg-teal-100 text-teal-800",
  urgencia: "bg-red-100 text-red-800",
  procedimento: "bg-purple-100 text-purple-800",
  teleconsulta: "bg-amber-100 text-amber-800",
};

export const TIMELINE_ICON_COLORS: Record<string, string> = {
  consulta: "bg-brand-600",
  receita: "bg-teal-600",
  exame: "bg-purple-600",
  fisio: "bg-amber-600",
  laudo: "bg-gray-600",
};
