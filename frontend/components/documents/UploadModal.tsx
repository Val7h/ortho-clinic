"use client";

/**
 * UploadModal — modal de upload de documentos.
 *
 * Modos:
 *  - "file": seletor de arquivo (PDF, imagens, DOCX)
 *  - "camera": input com capture="environment" para foto de câmera
 *
 * Valida tipo e tamanho no cliente antes de enviar.
 */

import { useRef, useState } from "react";
import {
  Upload, Camera, FileText, Image as ImageIcon,
  X, Loader2, Check,
} from "lucide-react";
import { patientDocsApi, msgErro } from "@/lib/api";

const ACCEPTED_FILE = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx";
const MAX_MB = 25;

const CATEGORIES = [
  { value: "exam",         label: "Exame de Imagem" },
  { value: "lab",          label: "Resultado de Lab." },
  { value: "prescription", label: "Receita (externa)" },
  { value: "referral",     label: "Encaminhamento" },
  { value: "report",       label: "Laudo / Relatório" },
  { value: "consent",      label: "Termo de Consentimento" },
  { value: "other",        label: "Outro" },
];

interface Props {
  patientId: number;
  mode: "file" | "camera";
  consultationId?: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function UploadModal({
  patientId, mode, consultationId, onSuccess, onCancel,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(mode === "camera" ? "exam" : "other");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);

    const sizeMb = f.size / (1024 * 1024);
    if (sizeMb > MAX_MB) {
      setError(`Arquivo muito grande (${sizeMb.toFixed(1)} MB). Máximo ${MAX_MB} MB.`);
      return;
    }

    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));

    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title || !date) return;

    setLoading(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      fd.append("category", category);
      fd.append("date", date);
      fd.append("description", description);
      if (consultationId) fd.append("consultation_id", String(consultationId));

      if (mode === "camera") {
        await patientDocsApi.uploadCamera(patientId, fd);
      } else {
        await patientDocsApi.upload(patientId, fd);
      }

      setDone(true);
      setTimeout(onSuccess, 800);
    } catch (e: any) {
      const msg = msgErro(e, "Erro ao fazer upload. Tente novamente.");
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Documento salvo!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* File input */}
      <div
        onClick={() => fileRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2
                     cursor-pointer transition-colors
                     ${file
            ? "border-brand-400 bg-brand-50/50 dark:bg-brand-900/10"
            : "border-slate-300 dark:border-slate-600 hover:border-brand-400 hover:bg-brand-50/20"
          }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="max-h-32 rounded-lg object-contain" />
        ) : file ? (
          <div className="flex flex-col items-center gap-1">
            <FileText className="w-10 h-10 text-brand-500" />
            <p className="text-sm font-medium text-brand-600">{file.name}</p>
            <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            {mode === "camera" ? (
              <Camera className="w-10 h-10" />
            ) : (
              <Upload className="w-10 h-10" />
            )}
            <p className="text-sm font-medium">
              {mode === "camera" ? "Tirar foto" : "Selecionar arquivo"}
            </p>
            <p className="text-xs">PDF, JPG, PNG, HEIC — máx. {MAX_MB} MB</p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_FILE}
          capture={mode === "camera" ? "environment" : undefined}
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Selecionar arquivo"
        />
      </div>

      {/* Form fields */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
          Título <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Raio-X coluna cervical"
          required
          className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700
                     bg-white dark:bg-slate-900 text-sm focus:outline-none
                     focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Categoria
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-900 text-sm focus:outline-none
                       focus:ring-2 focus:ring-brand-500/40"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Data <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-900 text-sm focus:outline-none
                       focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
          Observação
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Opcional — ex: solicitado pelo Dr. João"
          rows={2}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700
                     bg-white dark:bg-slate-900 text-sm focus:outline-none
                     focus:ring-2 focus:ring-brand-500/40 resize-none"
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 text-center">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700
                     text-sm font-medium text-slate-600 dark:text-slate-400
                     hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors
                     flex items-center justify-center gap-2"
        >
          <X className="w-4 h-4" />
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!file || !title || loading}
          className="flex-1 h-11 rounded-xl bg-brand-600 disabled:opacity-50
                     text-white text-sm font-semibold
                     hover:bg-brand-700 transition-colors
                     flex items-center justify-center gap-2 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {loading ? "Enviando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
