"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Users, X, Send, User as UserIcon } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  messagesApi,
  API_URL,
  type Contact,
  type DirectMessageOut,
} from "@/lib/api";

const TOKEN_KEY = "ortho_token";

// Widget separado do assistente de IA (FloatingChatWidget) — mensagem direta
// entre colegas (médico <-> secretária), lado a lado com o botão da IA.
export function TeamChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<number | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dmByContact, setDmByContact] = useState<Record<number, DirectMessageOut[]>>({});
  const [unreadByContact, setUnreadByContact] = useState<Record<number, number>>({});
  const [dmSending, setDmSending] = useState(false);
  const loadedContactIds = useRef<Set<number>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mesma técnica de refs do FloatingChatWidget: o onmessage do WebSocket é
  // criado uma única vez e não pode fechar sobre `open`/`tab` diretamente.
  const openRef = useRef(open);
  const tabRef = useRef(tab);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [tab, open, dmByContact]);

  useEffect(() => {
    if (!user) return;
    messagesApi.contacts().then((list) => {
      setContacts(list);
      setTab((prev) => prev ?? list[0]?.id ?? null);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (tab === null || loadedContactIds.current.has(tab)) return;
    loadedContactIds.current.add(tab);
    messagesApi.conversation(tab).then((msgs) => {
      setDmByContact((prev) => ({ ...prev, [tab]: msgs }));
    }).catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (open && tab !== null) {
      setUnreadByContact((prev) => (prev[tab] ? { ...prev, [tab]: 0 } : prev));
    }
  }, [open, tab]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (cancelled) return;
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;
      const wsUrl = `${API_URL.replace(/^http/, "ws")}/api/messages/ws?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onmessage = (event) => {
        if (event.data === "pong") return;
        let msg: DirectMessageOut;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        const otherId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
        setDmByContact((prev) => {
          const existing = prev[otherId] || [];
          if (existing.some((m) => m.id === msg.id)) return prev;
          return { ...prev, [otherId]: [...existing, msg] };
        });
        if (msg.sender_id !== user.id && !(openRef.current && tabRef.current === otherId)) {
          setUnreadByContact((prev) => ({ ...prev, [otherId]: (prev[otherId] || 0) + 1 }));
        }
      };

      socket.onclose = () => {
        if (!cancelled) setTimeout(connect, 3000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      cancelled = true;
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const sendDm = useCallback(async (contactId: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || dmSending) return;
    setInput("");
    setDmSending(true);
    try {
      const msg = await messagesApi.send(contactId, trimmed);
      setDmByContact((prev) => {
        const existing = prev[contactId] || [];
        if (existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [contactId]: [...existing, msg] };
      });
    } catch {
      // silencioso — o próximo fetch de histórico corrige o estado
    } finally {
      setDmSending(false);
    }
  }, [dmSending]);

  const handleSend = () => {
    if (tab !== null) sendDm(tab, input);
  };

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

  if (!user || contacts.length === 0) return null;

  const totalUnread = Object.values(unreadByContact).reduce((a, b) => a + b, 0);
  const activeContact = contacts.find((c) => c.id === tab) || null;
  const dmMessages = tab !== null ? (dmByContact[tab] || []) : [];

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir conversa com a equipe"
          className="fixed bottom-4 z-50 w-14 h-14 rounded-full bg-slate-700 hover:bg-slate-800 shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          style={{ right: "80px" }}
        >
          <Users className="w-6 h-6 text-white" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-error-500 text-white text-xs font-semibold flex items-center justify-center border-2 border-white dark:border-slate-950">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          className="fixed z-50 bottom-4 flex flex-col bg-white dark:bg-slate-900 rounded-[18px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
          style={{ right: "80px", width: "min(380px, calc(100vw - 24px))", height: "min(72vh, 560px)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-700 text-white shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">
                {activeContact?.name || "Equipe"}
              </p>
              <p className="text-xs text-white/70 leading-tight truncate">Mensagem direta</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar conversa com a equipe"
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Abas (só aparece se houver mais de 1 colega) */}
          {contacts.length > 1 && (
            <div className="flex gap-1 px-2 pt-2 bg-white dark:bg-slate-900 shrink-0 overflow-x-auto">
              {contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setTab(c.id)}
                  className={`relative px-3 py-1.5 rounded-t-lg text-xs font-medium whitespace-nowrap ${
                    tab === c.id
                      ? "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-x border-t border-slate-200 dark:border-slate-800"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                  }`}
                >
                  {c.name.split(" ")[0]}
                  {unreadByContact[c.id] > 0 && (
                    <span className="ml-1.5 inline-flex min-w-[16px] h-4 px-1 rounded-full bg-error-500 text-white text-[10px] font-semibold items-center justify-center">
                      {unreadByContact[c.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Body */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50 dark:bg-slate-950">
            {dmMessages.length === 0 && (
              <div className="h-full flex items-center justify-center text-center px-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nenhuma mensagem ainda. Manda um "oi" pra {activeContact?.name?.split(" ")[0]}!
                </p>
              </div>
            )}
            {dmMessages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_id === user.id ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.sender_id === user.id
                      ? "bg-success-600 text-white rounded-br-sm"
                      : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {dmSending && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-400">
                  enviando…
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
              placeholder="Escreva uma mensagem…"
              rows={1}
              className="flex-1 resize-none max-h-[120px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-slate-400"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || dmSending}
              aria-label="Enviar mensagem"
              className="w-9 h-9 rounded-full bg-slate-700 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
