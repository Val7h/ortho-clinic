"use client";

/**
 * ShareSheet — bottom sheet para compartilhamento de documento.
 *
 * Canais:
 *  - WhatsApp: abre wa.me/ com link pré-preenchido ou usa Evolution API
 *  - E-mail: usa mailto: ou Evolution API
 *  - Link: copia URL para o clipboard (com fallback para navigator.share)
 */

import { useState } from "react";
import { MessageCircle, Mail, Link2, Copy, Check, Loader2, X } from "lucide-react";
import { PatientDocument, ShareChannel } from "./DocumentTypes";
import { patientDocsApi } from "@/lib/api";

interface Props {
  doc: PatientDocument;
  patientPhone?: string;
  patientEmail?: string;
  onClose: () => void;
}

export function ShareSheet({ doc, patientPhone, patientEmail, onClose }: Props) {
  const [channel, setChannel] = useState<ShareChannel | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [done, setDone] = useState(false);

  async function doShare(ch: ShareChannel) {
    setChannel(ch);
    setLoading(true);
    try {
      const phone = ch === "whatsapp" ? (recipient || patientPhone || "") : undefined;
      const email = ch === "email" ? (recipient || patientEmail || "") : undefined;

      const res = await patientDocsApi.share(doc.patient_id, doc.id, {
        channel: ch,
        recipient: phone || email || undefined,
        expires_hours: 72,
      });

      if (res.share_url) setShareUrl(res.share_url);

      // Abre WhatsApp nativo
      if (ch === "whatsapp" && (phone || patientPhone)) {
        const msg = encodeURIComponent(
          `Olá! Seu documento *${doc.title}* está disponível:\n\n${res.share_url}`
        );
        const cleaned = ((phone || patientPhone) as string).replace(/\D/g, "");
        const waPhone = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
        window.open(`https://wa.me/${waPhone}?text=${msg}`, "_blank");
      }

      // Abre mailto
      if (ch === "email" && (email || patientEmail)) {
        const subject = encodeURIComponent(`Documento: ${doc.title}`);
        const body = encodeURIComponent(
          `Olá!\n\nSeu documento "${doc.title}" está disponível para visualização:\n\n${res.share_url}\n\nLink válido por 72 horas.\n\nAtenciosamente,\nClínica`
        );
        window.open(`mailto:${email || patientEmail}?subject=${subject}&body=${body}`);
      }

      setDone(true);
    } catch (e) {
      alert("Erro ao gerar link de compartilhamento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: textarea select
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function nativeShare() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: doc.title,
          text: `Documento: ${doc.title}`,
          url: shareUrl,
        });
      } catch {
        // Usuário cancelou — não é erro
      }
    } else {
      copyLink();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Compartilhar <strong>{doc.title}</strong> com o paciente:
      </p>

      {/* Canal não selecionado ainda */}
      {!channel && (
        <div className="grid grid-cols-3 gap-3">
          {/* WhatsApp */}
          <ChannelButton
            icon={<MessageCircle className="w-6 h-6 text-emerald-500" />}
            label="WhatsApp"
            onClick={() => {
              if (patientPhone) {
                doShare("whatsapp");
              } else {
                setChannel("whatsapp");
              }
            }}
          />
          {/* E-mail */}
          <ChannelButton
            icon={<Mail className="w-6 h-6 text-blue-500" />}
            label="E-mail"
            onClick={() => {
              if (patientEmail) {
                doShare("email");
              } else {
                setChannel("email");
              }
            }}
          />
          {/* Link */}
          <ChannelButton
            icon={<Link2 className="w-6 h-6 text-brand-500" />}
            label="Link"
            onClick={() => doShare("link")}
          />
        </div>
      )}

      {/* Entrada de contato manual */}
      {channel && !done && (
        <div className="flex flex-col gap-3">
          {channel === "whatsapp" && !patientPhone && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                Telefone (WhatsApp)
              </label>
              <input
                type="tel"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="(11) 99999-9999"
                className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700
                           bg-white dark:bg-slate-900 text-sm focus:outline-none
                           focus:ring-2 focus:ring-brand-500/40"
                inputMode="tel"
              />
            </div>
          )}
          {channel === "email" && !patientEmail && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                E-mail
              </label>
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="paciente@email.com"
                className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700
                           bg-white dark:bg-slate-900 text-sm focus:outline-none
                           focus:ring-2 focus:ring-brand-500/40"
                inputMode="email"
              />
            </div>
          )}

          <button
            onClick={() => doShare(channel)}
            disabled={loading}
            className="h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold
                       hover:bg-brand-700 disabled:opacity-60 transition-colors
                       flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Enviar
          </button>
        </div>
      )}

      {/* Resultado */}
      {done && shareUrl && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
            <p className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate font-mono">
              {shareUrl}
            </p>
            <button
              onClick={copyLink}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 flex-shrink-0"
              aria-label="Copiar link"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-slate-500" />
              )}
            </button>
          </div>

          {/* Web Share API */}
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              onClick={nativeShare}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700
                         text-sm font-medium text-slate-700 dark:text-slate-300
                         hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Compartilhar via...
            </button>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
            Link válido por 72 horas
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
        </div>
      )}
    </div>
  );
}

function ChannelButton({
  icon, label, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-xl
                 border border-slate-200 dark:border-slate-700
                 bg-white dark:bg-slate-900
                 hover:bg-slate-50 dark:hover:bg-slate-800
                 active:scale-95 transition-all"
    >
      {icon}
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
    </button>
  );
}
