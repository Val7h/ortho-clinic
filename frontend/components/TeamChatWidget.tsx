"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Users, X, Send, User as UserIcon, Check, CheckCheck } from "lucide-react";
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
// Quem abrir primeiro quando ele entra no chat: online com mensagem não lida >
// online > com não lida > o primeiro. Sem isso ele caía sempre no primeiro nome
// em ordem alfabética, quase sempre alguém offline.
function escolherMelhorContato(lista: any[], online: Set<number>): number | null {
  if (!lista.length) return null;
  const naoLida = (c: any) => (c.unread_count ?? 0) > 0;
  return (
    lista.find((c) => online.has(c.id) && naoLida(c))?.id ??
    lista.find((c) => online.has(c.id))?.id ??
    lista.find(naoLida)?.id ??
    lista[0].id
  );
}

// Bipe curto gerado na hora (sem arquivo de áudio para baixar). Silencioso se
// o navegador ainda não liberou som — nunca quebra a tela por causa disso.
function tocarAviso() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    vol.gain.setValueAtTime(0.0001, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(vol); vol.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.36);
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch { /* sem som, segue a vida */ }
}

export function TeamChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<number | null>(null);
  // Depois que ELE escolhe uma conversa, o app nunca mais troca sozinho.
  const escolhaManualRef = useRef(false);
  // Destaque do botão quando chega mensagem e o chat está fechado.
  const [chamando, setChamando] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dmByContact, setDmByContact] = useState<Record<number, DirectMessageOut[]>>({});
  const [unreadByContact, setUnreadByContact] = useState<Record<number, number>>({});
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const onlineIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => { onlineIdsRef.current = onlineIds; }, [onlineIds]);
  const [dmSending, setDmSending] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
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
      // 11/08: antes caía sempre no PRIMEIRO da lista alfabética — ele voltava
      // ao chat e estava numa pessoa offline, tendo que procurar a ativa. Agora
      // a escolha inicial prioriza quem está online (e com mensagem não lida).
      setTab((prev) => (prev ?? escolherMelhorContato(list, onlineIdsRef.current)));
      // A21: badge nasce com as não-lidas anteriores ao login (o backend
      // manda unread_count por contato). Não sobrescreve contagens que já
      // subiram via WS enquanto a lista carregava.
      setUnreadByContact((prev) => {
        const next = { ...prev };
        for (const c of list) {
          const count = (c as { unread_count?: number }).unread_count ?? 0;
          if (next[c.id] === undefined) next[c.id] = count;
        }
        return next;
      });
    }).catch(() => {});
  }, [user]);

  // Presença: estado inicial via REST + refresh a cada 30s como rede de
  // segurança (os eventos do WebSocket cobrem as mudanças em tempo real, mas
  // um poll leve garante consistência se algum evento se perder na reconexão).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = () => {
      messagesApi.presence()
        .then((r) => { if (!cancelled) setOnlineIds(new Set(r.online_user_ids)); })
        .catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  useEffect(() => {
    if (tab === null || loadedContactIds.current.has(tab)) return;
    loadedContactIds.current.add(tab);
    messagesApi.conversation(tab).then((msgs) => {
      setDmByContact((prev) => ({ ...prev, [tab]: msgs }));
    }).catch(() => {});
  }, [tab]);

  // Abrir uma conversa = marcar como lidas as mensagens do colega e zerar o
  // contador. O markRead avisa o remetente (WS) pra UI dele mostrar "lida".
  useEffect(() => {
    if (open && tab !== null) {
      setUnreadByContact((prev) => (prev[tab] ? { ...prev, [tab]: 0 } : prev));
      messagesApi.markRead(tab).catch(() => {});
    }
  }, [open, tab]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let socket: WebSocket | null = null;
    let isReconnect = false;

    // M13: heartbeat do cliente — WS ocioso morre (~60s no Render). Enquanto o
    // socket está OPEN, manda "ping" a cada 25s (o backend responde "pong").
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    const stopPing = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    };
    const startPing = () => {
      stopPing();
      pingTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          try { socket.send("ping"); } catch { /* ignora */ }
        }
      }, 25000);
    };

    const connect = () => {
      if (cancelled) return;
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;
      const wsUrl = `${API_URL.replace(/^http/, "ws")}/api/messages/ws?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        startPing();
        // A22: numa RECONEXÃO, mensagens podem ter chegado enquanto o socket
        // estava caído — a conversa da aba ativa já está em loadedContactIds e
        // não recarregaria sozinha. Re-busca a conversa ativa e a presença.
        if (isReconnect) {
          const activeTab = tabRef.current;
          if (activeTab !== null) {
            messagesApi.conversation(activeTab).then((msgs) => {
              setDmByContact((prev) => ({ ...prev, [activeTab]: msgs }));
              // Se a aba está aberta, remarca como lido (get_conversation não marca).
              if (openRef.current) messagesApi.markRead(activeTab).catch(() => {});
            }).catch(() => {});
          }
          messagesApi.presence()
            .then((r) => setOnlineIds(new Set(r.online_user_ids)))
            .catch(() => {});
        }
        isReconnect = true;
      };

      socket.onmessage = (event) => {
        if (event.data === "pong") return;
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        // Colega entrou/saiu (online/offline).
        if (data.type === "presence") {
          setOnlineIds((prev) => {
            const next = new Set(prev);
            if (data.online) next.add(data.user_id);
            else next.delete(data.user_id);
            return next;
          });
          return;
        }

        // Colega leu minhas mensagens → marca tudo que MANDEI pra ele como lido.
        if (data.type === "read") {
          const readerId = data.reader_id as number;
          setDmByContact((prev) => {
            const existing = prev[readerId];
            if (!existing) return prev;
            return {
              ...prev,
              [readerId]: existing.map((m) =>
                m.sender_id === user.id && !m.read ? { ...m, read: true } : m
              ),
            };
          });
          return;
        }

        // Caso contrário é uma mensagem (type "message" ou payload legado).
        const msg = data as DirectMessageOut;
        if (typeof msg.sender_id !== "number") return;
        const otherId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
        setDmByContact((prev) => {
          const existing = prev[otherId] || [];
          if (existing.some((m) => m.id === msg.id)) return prev;
          return { ...prev, [otherId]: [...existing, msg] };
        });
        if (msg.sender_id !== user.id) {
          const convOpen = openRef.current && tabRef.current === otherId;
          if (convOpen) {
            // Conversa aberta na tela → já marca como lida e avisa o remetente.
            messagesApi.markRead(otherId).catch(() => {});
          } else {
            setUnreadByContact((prev) => ({ ...prev, [otherId]: (prev[otherId] || 0) + 1 }));
            // 11/08 (pedido dele): aviso sonoro + destaque no botão. Sem isso a
            // mensagem da secretária ficava só num numerozinho, e ele não via
            // no meio do atendimento.
            tocarAviso();
            setChamando(true);
            setTimeout(() => setChamando(false), 8000);
          }
        }
      };

      socket.onclose = () => {
        stopPing();
        if (!cancelled) setTimeout(connect, 3000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      cancelled = true;
      stopPing();
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const sendDm = useCallback(async (contactId: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || dmSending) return;
    setInput("");
    setDmError(null);
    setDmSending(true);
    try {
      const msg = await messagesApi.send(contactId, trimmed);
      setDmByContact((prev) => {
        const existing = prev[contactId] || [];
        if (existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [contactId]: [...existing, msg] };
      });
    } catch {
      // M12: não perde a mensagem — devolve o texto pro input (só se o usuário
      // não digitou outra coisa nesse meio-tempo) e avisa o erro.
      setInput((cur) => (cur.trim() ? cur : trimmed));
      setDmError("Não foi possível enviar. Tente novamente.");
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
  const activeOnline = activeContact ? onlineIds.has(activeContact.id) : false;
  const dmMessages = tab !== null ? (dmByContact[tab] || []) : [];
  // Índice da última mensagem que EU enviei — só nela mostramos o recibo (enviada/lida).
  const lastMineIdx = (() => {
    for (let i = dmMessages.length - 1; i >= 0; i--) {
      if (dmMessages[i].sender_id === user.id) return i;
    }
    return -1;
  })();

  return (
    <>
      {!open && (
        <button
          onClick={() => { setOpen(true); setChamando(false); }}
          aria-label="Abrir conversa com a equipe"
          className={`fixed bottom-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${
            chamando
              ? "bg-emerald-500 hover:bg-emerald-600 animate-pulse ring-4 ring-emerald-300/60"
              : "bg-slate-700 hover:bg-slate-800"
          }`}
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
            <div className="relative w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <UserIcon className="w-5 h-5" />
              {activeContact && (
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-700 ${
                    activeOnline ? "bg-green-400" : "bg-slate-400"
                  }`}
                  title={activeOnline ? "Online" : "Offline"}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">
                {activeContact?.name || "Equipe"}
              </p>
              <p className="text-xs text-white/70 leading-tight truncate flex items-center gap-1">
                {activeContact ? (
                  <>
                    <span className={`w-1.5 h-1.5 rounded-full ${activeOnline ? "bg-green-400" : "bg-slate-400"}`} />
                    {activeOnline ? "Online agora" : "Offline"}
                  </>
                ) : "Mensagem direta"}
              </p>
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
                  onClick={() => { escolhaManualRef.current = true; setTab(c.id); }}
                  className={`relative px-3 py-1.5 rounded-t-lg text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 ${
                    tab === c.id
                      ? "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-x border-t border-slate-200 dark:border-slate-800"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlineIds.has(c.id) ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`}
                    title={onlineIds.has(c.id) ? "Online" : "Offline"}
                  />
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
            {dmMessages.map((m, idx) => (
              <div key={m.id} className={`flex flex-col ${m.sender_id === user.id ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.sender_id === user.id
                      ? "bg-success-600 text-white rounded-br-sm"
                      : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
                {idx === lastMineIdx && (
                  <span className={`mt-0.5 flex items-center gap-0.5 text-[10px] ${m.read ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
                    {m.read ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                    {m.read ? "Lida" : "Enviada"}
                  </span>
                )}
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

          {/* Aviso de falha no envio (M12) — a mensagem volta pro input */}
          {dmError && (
            <div className="px-3 py-1.5 text-xs text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-500/10 border-t border-error-200 dark:border-error-700 shrink-0">
              {dmError}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-end gap-2 px-3 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoGrow(e.target);
                if (dmError) setDmError(null);
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
