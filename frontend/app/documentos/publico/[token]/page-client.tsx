"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Download, Clock, AlertTriangle, Loader2, Image as ImageIcon } from "lucide-react";
import { api } from "@/lib/api";

interface SharedDoc {
  title: string;
  category: string;
  date: string;
  file_url: string | null;
  mime_type: string | null;
  expires_at: string | null;
}

export default function PublicDocumentPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [doc, setDoc] = useState<SharedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/documentos/publico/${token}`)
      .then((r) => setDoc(r.data))
      .catch((e) => {
        const status = e?.response?.status;
        if (status === 410) setError("Este link expirou. Solicite um novo link ao consultório.");
        else if (status === 404) setError("Link inválido ou documento não encontrado.");
        else setError("Não foi possível carregar o documento.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const isPdf = doc?.mime_type === "application/pdf" || (!doc?.mime_type && doc?.file_url?.endsWith(".pdf"));
  const isImage = doc?.mime_type?.startsWith("image/");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          <p className="text-sm">Carregando documento...</p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
          </div>
          <h1 className="text-base font-bold text-slate-800">Documento indisponível</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-950 text-white px-4 py-4 flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          {isPdf ? (
            <FileText className="w-4 h-4" />
          ) : (
            <ImageIcon className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{doc.title}</p>
          <p className="text-xs text-slate-400">
            {doc.category} · {new Date(doc.date).toLocaleDateString("pt-BR")}
          </p>
        </div>
        {doc.file_url && (
          <a
            href={doc.file_url}
            download
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Baixar documento"
          >
            <Download className="w-5 h-5" />
          </a>
        )}
      </div>

      {/* Document viewer */}
      <div className="flex-1 overflow-auto">
        {doc.file_url ? (
          isPdf ? (
            <iframe
              src={doc.file_url}
              title={doc.title}
              className="w-full h-full border-0"
              style={{ minHeight: "calc(100vh - 72px)" }}
            />
          ) : isImage ? (
            <div className="flex items-center justify-center min-h-full p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={doc.file_url}
                alt={doc.title}
                className="max-w-full max-h-full rounded-xl shadow-lg"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-full gap-4 p-6 text-white">
              <p className="text-sm text-slate-300">Clique abaixo para baixar o documento.</p>
              <a
                href={doc.file_url}
                download
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-600 text-white text-sm font-semibold"
              >
                <Download className="w-4 h-4" />
                Baixar documento
              </a>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center min-h-full text-slate-400 p-6">
            <p className="text-sm text-center">Arquivo não disponível para visualização.</p>
          </div>
        )}
      </div>

      {/* Footer — validade */}
      {doc.expires_at && (
        <div className="bg-slate-950 text-slate-400 text-xs px-4 py-2
                        flex items-center gap-2 flex-shrink-0">
          <Clock className="w-3.5 h-3.5" />
          Link válido até {new Date(doc.expires_at).toLocaleString("pt-BR")}
        </div>
      )}
    </div>
  );
}
