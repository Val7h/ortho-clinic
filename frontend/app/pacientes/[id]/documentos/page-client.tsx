"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Camera, Upload, Filter, Search,
  Loader2, FileX, RefreshCw,
} from "lucide-react";
import { ProtectedPageLayout } from "@/components/ProtectedPageLayout";
import { patientDocsApi, patientsApi } from "@/lib/api";
import { PatientDocument } from "@/components/documents/DocumentTypes";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { PdfViewer } from "@/components/documents/PdfViewer";
import { BottomSheet } from "@/components/documents/BottomSheet";
import { UploadModal } from "@/components/documents/UploadModal";
import { SignaturePad } from "@/components/documents/SignaturePad";
import { ShareSheet } from "@/components/documents/ShareSheet";
import { getCachedDocument, cacheDocument } from "@/lib/document-cache";

type Tab = "all" | "exam" | "lab" | "prescription" | "referral" | "report" | "consent" | "other";

const TABS: { value: Tab; label: string }[] = [
  { value: "all",          label: "Todos" },
  { value: "exam",         label: "Exames" },
  { value: "lab",          label: "Lab." },
  { value: "prescription", label: "Receitas" },
  { value: "referral",     label: "Encam." },
  { value: "report",       label: "Laudos" },
  { value: "consent",      label: "Termos" },
  { value: "other",        label: "Outros" },
];

export default function PatientDocumentsPage() {
  const params = useParams<{ id: string }>();
  const patientId = Number(params?.id ?? 0);

  const [patient, setPatient] = useState<any>(null);
  const [docs, setDocs] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [cachedIds, setCachedIds] = useState<Set<number>>(new Set());

  // Sheets / modals
  const [viewer, setViewer] = useState<PatientDocument | null>(null);
  const [uploadMode, setUploadMode] = useState<"file" | "camera" | null>(null);
  const [signing, setSigning] = useState<PatientDocument | null>(null);
  const [sharing, setSharing] = useState<PatientDocument | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PatientDocument | null>(null);

  useEffect(() => {
    patientsApi.get(patientId).then(setPatient).catch(console.error);
  }, [patientId]);

  const fetchDocs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await patientDocsApi.list(patientId, {
        category: tab !== "all" ? tab : undefined,
        q: search || undefined,
      });
      setDocs(data);

      const cached = new Set<number>();
      await Promise.all(
        data.map(async (d: PatientDocument) => {
          const c = await getCachedDocument(patientId, d.id);
          if (c) cached.add(d.id);
        })
      );
      setCachedIds(cached);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [patientId, tab, search]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function handleDownload(doc: PatientDocument) {
    if (cachedIds.has(doc.id)) {
      setViewer(doc);
      return;
    }
    try {
      const srcUrl = doc.file_url || patientDocsApi.getPdfUrl(patientId, doc.id);
      const token = localStorage.getItem("ortho_token") || "";
      const resp = await fetch(srcUrl, {
        headers: doc.file_url ? {} : { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Falha no download");
      const blob = await resp.blob();
      await cacheDocument(patientId, doc.id, blob, blob.type, doc.file_name || doc.title);
      setCachedIds((prev) => new Set(Array.from(prev).concat(doc.id)));

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name || `${doc.title}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Não foi possível baixar o documento.");
    }
  }

  async function handleSign(doc: PatientDocument, dataUrl: string, signerName: string) {
    try {
      await patientDocsApi.sign(patientId, doc.id, {
        signature_data_url: dataUrl,
        signed_by_name: signerName,
      });
      setSigning(null);
      fetchDocs(true);
    } catch {
      alert("Erro ao salvar assinatura.");
    }
  }

  async function handleDelete(doc: PatientDocument) {
    try {
      await patientDocsApi.delete(patientId, doc.id);
      setDeleteConfirm(null);
      fetchDocs(true);
    } catch {
      alert("Erro ao excluir documento.");
    }
  }

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchDocs(), 400);
  }

  const pageTitle = patient ? `Documentos — ${patient.name.split(" ")[0]}` : "Documentos";

  return (
    <ProtectedPageLayout
      title={pageTitle}
      back={`/pacientes/${patientId}`}
      actions={
        <div className="flex gap-2">
          <button
            onClick={() => setUploadMode("camera")}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Fotografar documento"
          >
            <Camera className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => setUploadMode("file")}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Enviar arquivo"
          >
            <Upload className="w-5 h-5 text-white" />
          </button>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar documentos..."
            className="w-full h-11 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-900 text-sm focus:outline-none
                       focus:ring-2 focus:ring-brand-500/40"
          />
          {refreshing && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-500 animate-spin" />
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold
                          transition-colors whitespace-nowrap
                          ${tab === t.value
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
            <p className="text-sm">Carregando documentos...</p>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-slate-400">
            <FileX className="w-12 h-12 text-slate-300" />
            <p className="text-sm font-medium">Nenhum documento encontrado</p>
            <div className="flex gap-3">
              <button
                onClick={() => setUploadMode("camera")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-50 dark:bg-brand-900/30
                           text-brand-600 dark:text-brand-400 text-sm font-medium"
              >
                <Camera className="w-4 h-4" />
                Fotografar
              </button>
              <button
                onClick={() => setUploadMode("file")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600
                           text-white text-sm font-medium"
              >
                <Upload className="w-4 h-4" />
                Enviar arquivo
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isCached={cachedIds.has(doc.id)}
                onView={setViewer}
                onShare={setSharing}
                onSign={setSigning}
                onDownload={handleDownload}
                onDelete={setDeleteConfirm}
              />
            ))}
          </div>
        )}

        {/* FAB */}
        <div className="fixed bottom-20 right-4 lg:bottom-6 flex flex-col gap-2 z-30">
          <button
            onClick={() => setUploadMode("camera")}
            className="w-12 h-12 rounded-full bg-slate-700 text-white shadow-lg
                       flex items-center justify-center hover:bg-slate-600 transition-colors"
            aria-label="Tirar foto"
          >
            <Camera className="w-5 h-5" />
          </button>
          <button
            onClick={() => setUploadMode("file")}
            className="w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg
                       flex items-center justify-center hover:bg-brand-700 transition-colors"
            aria-label="Enviar documento"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {viewer && (
        <PdfViewer doc={viewer} onClose={() => setViewer(null)} />
      )}

      <BottomSheet isOpen={uploadMode === "file"} onClose={() => setUploadMode(null)} title="Enviar Documento">
        <UploadModal patientId={patientId} mode="file"
          onSuccess={() => { setUploadMode(null); fetchDocs(true); }}
          onCancel={() => setUploadMode(null)} />
      </BottomSheet>

      <BottomSheet isOpen={uploadMode === "camera"} onClose={() => setUploadMode(null)} title="Fotografar Documento">
        <UploadModal patientId={patientId} mode="camera"
          onSuccess={() => { setUploadMode(null); fetchDocs(true); }}
          onCancel={() => setUploadMode(null)} />
      </BottomSheet>

      <BottomSheet isOpen={!!signing} onClose={() => setSigning(null)} title="Assinatura Digital" maxWidth="max-w-lg">
        {signing && (
          <SignaturePad signerName={patient?.name || ""}
            onSave={(dataUrl, name) => handleSign(signing, dataUrl, name)}
            onCancel={() => setSigning(null)} />
        )}
      </BottomSheet>

      <BottomSheet isOpen={!!sharing} onClose={() => setSharing(null)} title="Compartilhar Documento">
        {sharing && (
          <ShareSheet doc={sharing} patientPhone={patient?.phone} patientEmail={patient?.email}
            onClose={() => setSharing(null)} />
        )}
      </BottomSheet>

      <BottomSheet isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Excluir Documento">
        {deleteConfirm && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Tem certeza que deseja excluir{" "}
              <strong className="text-slate-800 dark:text-slate-200">{deleteConfirm.title}</strong>
              ? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700
                           text-sm font-medium text-slate-600 dark:text-slate-400">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-semibold">
                Excluir
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </ProtectedPageLayout>
  );
}
