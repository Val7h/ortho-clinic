/**
 * Tipos compartilhados para o módulo de documentos.
 */

export interface PatientDocument {
  id: number;
  patient_id: number;
  consultation_id: number | null;
  title: string;
  category: string;
  category_label: string;
  description: string | null;
  date: string;
  tags: string[];
  file_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_kb: number | null;
  generated_doc_type: string | null;
  generated_doc_id: number | null;
  has_signature: boolean;
  signature_at: string | null;
  signed_by_name: string | null;
  created_at: string;
}

export interface DocumentCategory {
  value: string;
  label: string;
}

export type ShareChannel = "whatsapp" | "email" | "link";

export const CATEGORY_ICONS: Record<string, string> = {
  exam:         "🩻",
  lab:          "🧪",
  prescription: "💊",
  referral:     "📋",
  report:       "📄",
  consent:      "✍️",
  other:        "📎",
};

export const CATEGORY_COLORS: Record<string, string> = {
  exam:         "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  lab:          "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
  prescription: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  referral:     "bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400",
  report:       "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400",
  consent:      "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  other:        "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
};

export function isPdf(doc: PatientDocument): boolean {
  return doc.mime_type === "application/pdf" || !!doc.generated_doc_type;
}

export function isImage(doc: PatientDocument): boolean {
  return !!doc.mime_type && doc.mime_type.startsWith("image/");
}

export function formatFileSize(kb: number | null): string {
  if (!kb) return "";
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
