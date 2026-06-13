"use client";

/**
 * PdfViewer — visualizador in-app de PDFs e imagens.
 *
 * Estratégia de renderização:
 *  - PDF: usa <iframe> com o URL do backend (funciona em iOS Safari ≥ 12,
 *    Chrome, Firefox). Fallback para link de download se o browser bloquear.
 *  - Imagens: tag <img> com pinch-to-zoom via CSS touch-action.
 *
 * Offline: se o documento foi baixado para cache (IndexedDB), usa blob URL
 * local. Caso contrário, tenta fetch e cacheia automaticamente.
 */

import { useEffect, useRef, useState } from "react";
import { X, Download, ZoomIn, ZoomOut, ExternalLink, Loader2 } from "lucide-react";
import { PatientDocument, isPdf, isImage } from "./DocumentTypes";
import {
  getCachedDocument,
  cacheDocument,
} from "@/lib/document-cache";
import { patientDocsApi } from "@/lib/api";

interface Props {
  doc: PatientDocument;
  onClose: () => void;
}

export function PdfViewer({ doc, onClose }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isImg = isImage(doc);
  const isPdfDoc = isPdf(doc);

  // ── Carrega documento (cache ou rede) ──────────────────────────────────────
  useEffect(() => {
    let revoked = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1. Tenta cache offline primeiro
        const cached = await getCachedDocument(doc.patient_id, doc.id);
        if (cached) {
          const url = URL.createObjectURL(cached.blob);
          setObjectUrl(url);
          setLoading(false);
          return;
        }

        // 2. Busca da rede
        const srcUrl = doc.file_url
          ? doc.file_url
          : patientDocsApi.getPdfUrl(doc.patient_id, doc.id);

        const token = localStorage.getItem("ortho_token") || "";
        const resp = await fetch(srcUrl, {
          headers: doc.file_url ? {} : { Authorization: `Bearer ${token}` },
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const blob = await resp.blob();
        const mimeType = blob.type || doc.mime_type || "application/octet-stream";
        const fileName = doc.file_name || `${doc.title}.pdf`;

        // 3. Cacheia para uso offline
        await cacheDocument(doc.patient_id, doc.id, blob, mimeType, fileName);

        if (!revoked) {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
        }
      } catch (e: any) {
        setError(e.message || "Não foi possível carregar o documento.");
      } finally {
        if (!revoked) setLoading(false);
      }
    }

    load();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // ── Download manual ───────────────────────────────────────────────────────
  function handleDownload() {
    if (!objectUrl) return;
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = doc.file_name || `${doc.title}.pdf`;
    a.click();
  }

  // ── Fecha com ESC e clique no backdrop ───────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizando ${doc.title}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 text-white flex-shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{doc.title}</p>
          <p className="text-xs text-slate-400">{doc.category_label}</p>
        </div>
        {/* Zoom controls — only for images */}
        {isImg && objectUrl && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Diminuir zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Aumentar zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        )}
        {objectUrl && (
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Baixar documento"
          >
            <Download className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-800">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-white">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
            <p className="text-sm text-slate-400">Carregando documento...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-white">
            <p className="text-sm text-red-400 text-center">{error}</p>
            {doc.file_url && (
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir em nova aba
              </a>
            )}
          </div>
        )}

        {!loading && !error && objectUrl && (
          <>
            {/* PDF */}
            {isPdfDoc && (
              <iframe
                ref={iframeRef}
                src={objectUrl}
                title={doc.title}
                className="w-full h-full border-0"
                style={{ minHeight: "100%" }}
              />
            )}

            {/* Image */}
            {isImg && (
              <div
                className="flex items-center justify-center min-h-full p-4 overflow-auto"
                style={{ touchAction: "pinch-zoom" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={objectUrl}
                  alt={doc.title}
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }}
                  className="max-w-full rounded-lg shadow-lg transition-transform"
                  draggable={false}
                />
              </div>
            )}

            {/* Other file type fallback */}
            {!isPdfDoc && !isImg && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-white p-6">
                <p className="text-sm text-slate-300 text-center">
                  Visualização não disponível para este tipo de arquivo.
                </p>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm"
                >
                  <Download className="w-4 h-4" />
                  Baixar arquivo
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
