"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles, Copy, Check, MessageSquare } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { chatApi, type ChatMessage } from "@/lib/api";

const STORAGE_KEY = "ortho_chat_history";
const MAX_STORED_MESSAGES = 40;

const SUGGESTIONS = [
  "Como está a agenda de hoje?",
  "Tenho encaixe à tarde?",
  "Quantos pacientes estão aguardando?",
];

// Suporta só **negrito** — é o único markdown que o assistente usa nas respostas.
function renderMarkdown(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch {
    // localStorage cheio/indisponível — histórico simplesmente não persiste
  }
}

// Assistente de IA (agenda + fila do dia). A mensagem direta com colegas
// (médico <-> secretária) mora num widget separado: TeamChatWidget.
export function FloatingChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [errored, setErrored] = useState(false);

  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, sending, open]);

  const sendAi = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setErrored(false);
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    saveHistory(nextMessages);
    setInput("");
    setSending(true);

    try {
      const { reply, draft } = await chatApi.send(nextMessages);
      const withReply = [...nextMessages, {
        role: "assistant" as const,
        content: reply,
        draft,
        draftStatus: draft ? ("pending" as const) : undefined,
      }];
      setMessages(withReply);
      saveHistory(withReply);
    } catch {
      setErrored(true);
    } finally {
      setSending(false);
    }
  }, [messages, sending]);

  const updateDraftStatus = useCallback((index: number, status: ChatMessage["draftStatus"]) => {
    setMessages((prev) => {
      const next = prev.map((m, i) => (i === index ? { ...m, draftStatus: status } : m));
      saveHistory(next);
      return next;
    });
  }, []);

  const approveDraft = useCallback(async (index: number, draft: NonNullable<ChatMessage["draft"]>) => {
    updateDraftStatus(index, "sending");
    try {
      const result = await chatApi.sendWhatsApp(draft.patient_id, draft.message);
      if (result.sent) {
        toast.success(`Mensagem enviada para ${draft.patient_name.split(" ")[0]}`);
        updateDraftStatus(index, "sent");
      } else if (result.demo) {
        toast(`Modo demo: WhatsApp não configurado neste ambiente (mensagem não enviada de verdade)`, { icon: "⚠️" });
        updateDraftStatus(index, "sent");
      } else {
        toast.error("Falha ao enviar via WhatsApp");
        updateDraftStatus(index, "failed");
      }
    } catch {
      toast.error("Falha ao enviar via WhatsApp");
      updateDraftStatus(index, "failed");
    }
  }, [updateDraftStatus]);

  const copyDraft = useCallback((message: string) => {
    navigator.clipboard.writeText(message).then(() => toast.success("Mensagem copiada")).catch(() => toast.error("Não foi possível copiar"));
  }, []);

  const handleSend = () => sendAi(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  if (!user) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir assistente da clínica"
          className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </button>
      )}

      {open && (
        <div
          className="fixed z-50 bottom-4 right-4 flex flex-col bg-white dark:bg-slate-900 rounded-[18px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
          style={{ width: "min(380px, calc(100vw - 24px))", height: "min(72vh, 560px)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-brand-600 text-white shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">Assistente OrthoClinic</p>
              <p className="text-xs text-white/70 leading-tight truncate">Agenda e fila em tempo real</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar assistente"
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50 dark:bg-slate-950">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 gap-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Pergunte sobre a agenda e a fila de atendimento de hoje.
                </p>
                <div className="flex flex-col gap-2 w-full">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendAi(s)}
                      className="text-sm text-left px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-success-600 text-white rounded-br-sm"
                      : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm"
                  }`}
                >
                  {renderMarkdown(m.content)}
                </div>
                {m.draft && (
                  <div className="max-w-[85%] w-full rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-900/20 px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wide">
                      <MessageSquare className="w-3.5 h-3.5" /> WhatsApp para {m.draft.patient_name.split(" ")[0]}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap bg-white dark:bg-slate-800 rounded-lg px-2.5 py-2 border border-slate-200 dark:border-slate-700">
                      {m.draft.message}
                    </p>
                    {m.draftStatus === "sent" ? (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-success-600 dark:text-success-400">
                        <Check className="w-3.5 h-3.5" /> Enviado
                      </div>
                    ) : m.draftStatus === "dismissed" ? (
                      <p className="text-xs text-slate-400">Descartado</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => approveDraft(i, m.draft!)}
                          disabled={!m.draft.phone || m.draftStatus === "sending"}
                          title={!m.draft.phone ? "Paciente sem telefone cadastrado" : undefined}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-success-600 hover:bg-success-700 disabled:opacity-40 text-white text-xs font-semibold"
                        >
                          {m.draftStatus === "sending" ? "Enviando…" : "Enviar via WhatsApp"}
                        </button>
                        <button
                          onClick={() => copyDraft(m.draft!.message)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <Copy className="w-3 h-3" /> Copiar
                        </button>
                        <button
                          onClick={() => updateDraftStatus(i, "dismissed")}
                          disabled={m.draftStatus === "sending"}
                          className="px-2.5 py-1 rounded-lg text-slate-500 dark:text-slate-400 text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          Descartar
                        </button>
                      </div>
                    )}
                    {!m.draft.phone && m.draftStatus !== "sent" && m.draftStatus !== "dismissed" && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">Sem telefone cadastrado — não é possível enviar.</p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {errored && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-sm text-error-700 dark:text-error-300">
                  Não consegui responder agora. Tenta de novo em instantes.
                </div>
              </div>
            )}

            {sending && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-400">
                  digitando…
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-end gap-2 px-3 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoGrow(e.target);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Escreva sua pergunta…"
              rows={1}
              className="flex-1 resize-none max-h-[120px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-brand-400"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              aria-label="Enviar mensagem"
              className="w-9 h-9 rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:hover:bg-brand-600 flex items-center justify-center shrink-0 transition-colors"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
