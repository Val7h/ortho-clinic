/**
 * NotificationCenter — OrthoClinic Mobile
 * ========================================
 *
 * In-app notification center:
 *   - Bell icon with red badge (unread count)
 *   - Slide-out panel with full notification list
 *   - Mark single / all as read
 *   - Deep link on tap
 *   - Empty state illustration
 *   - Pull-to-refresh (mobile gesture)
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, X, Check, CheckCheck, Calendar, FileText,
  MessageCircle, AlertCircle, RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  fetchNotifications,
  markAsRead,
  type NotificationItem,
  type NotificationType,
} from "@/lib/push-notifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------
const TypeIcon: Record<NotificationType, React.FC<{ className?: string }>> = {
  appointment_reminder: ({ className }) => <Calendar className={className} />,
  result_ready:         ({ className }) => <FileText className={className} />,
  message_received:     ({ className }) => <MessageCircle className={className} />,
  system_alert:         ({ className }) => <AlertCircle className={className} />,
};

const TYPE_COLORS: Record<NotificationType, string> = {
  appointment_reminder: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  result_ready:         "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  message_received:     "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  system_alert:         "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
};

// ---------------------------------------------------------------------------
// Single notification row
// ---------------------------------------------------------------------------
function NotificationRow({
  item,
  onRead,
  onNavigate,
}: {
  item: NotificationItem;
  onRead: (id: number) => void;
  onNavigate: (link: string) => void;
}) {
  const Icon = TypeIcon[item.notification_type] ?? Bell;
  const colorClass = TYPE_COLORS[item.notification_type] ?? "bg-gray-100 text-gray-600";
  const isUnread = item.read_at === null;

  const handleClick = () => {
    if (isUnread) onRead(item.id);
    if (item.deep_link) onNavigate(item.deep_link);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left flex gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
        isUnread ? "bg-blue-50/40 dark:bg-blue-900/10" : ""
      }`}
    >
      {/* Icon badge */}
      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${colorClass}`}>
        <Icon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium leading-snug ${isUnread ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}>
            {item.title ?? "Notificação"}
          </p>
          {isUnread && (
            <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-blue-500" />
          )}
        </div>
        {item.body && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
            {item.body}
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
        </p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function NotificationCenter() {
  const router = useRouter();
  const { badgeCount, refreshBadge } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const loadNotifications = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const nextPage = reset ? 1 : page;
      const data = await fetchNotifications(nextPage, 20);
      setItems(reset ? data.items : (prev) => [...prev, ...data.items]);
      setTotal(data.total);
      if (!reset) setPage((p) => p + 1);
      else setPage(2);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (open) loadNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRead = useCallback(async (id: number) => {
    await markAsRead([id]);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    refreshBadge();
  }, [refreshBadge]);

  const handleReadAll = useCallback(async () => {
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!unreadIds.length) return;
    await markAsRead(unreadIds);
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    refreshBadge();
  }, [items, refreshBadge]);

  const handleNavigate = (link: string) => {
    setOpen(false);
    router.push(link);
  };

  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <>
      {/* Bell button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Centro de notificações"
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        {badgeCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>

      {/* Slide-out panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Notificações
                {unreadCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {unreadCount} não lidas
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={handleReadAll}
                    title="Marcar todas como lidas"
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => loadNotifications(true)}
                  title="Atualizar"
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/50">
              {items.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-center px-8">
                  <Bell className="w-12 h-12 text-gray-200 dark:text-gray-700 mb-3" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Nenhuma notificação
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Você está em dia!
                  </p>
                </div>
              ) : (
                <>
                  {items.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      onRead={handleRead}
                      onNavigate={handleNavigate}
                    />
                  ))}

                  {/* Load more */}
                  {items.length < total && (
                    <button
                      onClick={() => loadNotifications(false)}
                      disabled={loading}
                      className="w-full py-3 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors disabled:opacity-50"
                    >
                      {loading ? "Carregando..." : "Ver mais"}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Footer: link to preferences */}
            <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/perfil/notificacoes");
                }}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Gerenciar preferências de notificação
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
