"use client";

/**
 * /documentos — hub de documentos clínicos (atualizado Sprint 6 Day 7).
 *
 * Agora inclui acesso direto ao novo gestor de documentos por paciente.
 */

import { FileText, FileHeart, FileSignature, BookOpen, FolderOpen } from "lucide-react";
import Link from "next/link";
import { ProtectedPageLayout } from "@/components/ProtectedPageLayout";

const DOC_SECTIONS = [
  {
    href: "/pacientes",
    label: "Documentos por Paciente",
    description: "Upload, exames, assinatura, compartilhamento",
    icon: FolderOpen,
    color: "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400",
    badge: "Novo",
  },
  {
    href: "/pacientes",
    label: "Prontuários",
    description: "Anamnese e evolução de consultas",
    icon: FileHeart,
    color: "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400",
  },
  {
    href: "/folhetos",
    label: "Folhetos Informativos",
    description: "Material educativo para pacientes",
    icon: BookOpen,
    color: "bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400",
  },
  {
    href: "/contrato",
    label: "Contratos",
    description: "Termos de tratamento e consentimento",
    icon: FileSignature,
    color: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  },
  {
    href: "/pacientes",
    label: "Receitas",
    description: "Prescrições médicas emitidas",
    icon: FileText,
    color: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  },
];

export default function DocumentosPage() {
  return (
    <ProtectedPageLayout title="Documentos">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Acesse e gerencie todos os documentos clínicos da clínica.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DOC_SECTIONS.map((sec) => {
            const Icon = sec.icon;
            return (
              <Link
                key={sec.href + sec.label}
                href={sec.href}
                className="card card-hover flex items-start gap-4 p-4 focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-brand-500 relative"
              >
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sec.color}`}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-50">{sec.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sec.description}</p>
                </div>
                {"badge" in sec && sec.badge && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold px-1.5 py-0.5
                                   rounded-full bg-brand-600 text-white">
                    {sec.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </ProtectedPageLayout>
  );
}
