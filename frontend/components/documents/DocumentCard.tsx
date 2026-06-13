"use client";

import { useState } from "react";
import {
  Download, Share2, PenLine, Trash2, Eye,
  FileText, Image as ImageIcon, Clock, CheckCircle,
} from "lucide-react";
import {
  PatientDocument, CATEGORY_ICONS, CATEGORY_COLORS,
  isPdf, isImage, formatFileSize,
} from "./DocumentTypes";

interface Props {
  doc: PatientDocument;
  onView: (doc: PatientDocument) => void;
  onShare: (doc: PatientDocument) => void;
  onSign: (doc: PatientDocument) => void;
  onDownload: (doc: PatientDocument) => void;
  onDelete: (doc: PatientDocument) => void;
  isCached?: boolean;
}

export function DocumentCard({
  doc, onView, onShare, onSign, onDownload, onDelete, isCached = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const icon = CATEGORY_ICONS[doc.category] || "📎";
  const colorClass = CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other;

  const hasFile = !!doc.file_url || !!doc.generated_doc_type;
  const fileIcon = isPdf(doc) ? (
    <FileText className="w-4 h-4 text-red-500" />
  ) : isImage(doc) ? (
    <ImageIcon className="w-4 h-4 text-blue-500" />
  ) : null;

  return (
    <div className="card p-0 overflow-hidden active:scale-[0.98] transition-transform">
      {/* Main tap area */}
      <button
        onClick={() => onView(doc)}
        className="w-full text-left p-4 flex items-start gap-3 focus:outline-none"
        aria-label={`Visualizar ${doc.title}`}
      >
        {/* Category badge */}
        <span
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${colorClass}`}
          aria-hidden="true"
        >
          {icon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex-1 leading-tight">
              {doc.title}
            </p>
            {doc.has_signature && (
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" aria-label="Assinado" />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {doc.category_label}
            </span>
            <span className="text-xs text-slate-300 dark:text-slate-600">•</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(doc.date).toLocaleDateString("pt-BR")}
            </span>
            {doc.file_size_kb && (
              <>
                <span className="text-xs text-slate-300 dark:text-slate-600">•</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  {fileIcon}
                  {formatFileSize(doc.file_size_kb)}
                </span>
              </>
            )}
            {isCached && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <Download className="w-3 h-3" />
                offline
              </span>
            )}
          </div>

          {doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {doc.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800
                             text-slate-600 dark:text-slate-400"
                >
                  {tag}
                </span>
              ))}
              {doc.tags.length > 3 && (
                <span className="text-[10px] text-slate-400">+{doc.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Arrow indicator */}
        <Eye className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0 mt-0.5" />
      </button>

      {/* Action strip */}
      <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 flex items-center gap-1">
        {hasFile && (
          <ActionBtn
            icon={<Download className="w-4 h-4" />}
            label="Baixar"
            onClick={() => onDownload(doc)}
          />
        )}
        <ActionBtn
          icon={<Share2 className="w-4 h-4" />}
          label="Compartilhar"
          onClick={() => onShare(doc)}
        />
        {!doc.has_signature && hasFile && (
          <ActionBtn
            icon={<PenLine className="w-4 h-4" />}
            label="Assinar"
            onClick={() => onSign(doc)}
          />
        )}
        <div className="flex-1" />
        <ActionBtn
          icon={<Trash2 className="w-4 h-4 text-red-400" />}
          label="Excluir"
          onClick={() => onDelete(doc)}
          danger
        />
      </div>
    </div>
  );
}

function ActionBtn({
  icon, label, onClick, danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium
                  transition-colors
                  ${danger
          ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      aria-label={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
