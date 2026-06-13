/**
 * Notification Preferences Page — /perfil/notificacoes
 * ======================================================
 *
 * Allows the user to:
 *   - Enable/disable push per notification type
 *   - Set appointment reminder lead time (minutes before)
 *   - Enable Do Not Disturb window (DND)
 *   - Request push permission if not yet granted
 *   - Send a test notification
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell, BellOff, Calendar, FileText, MessageCircle, AlertCircle,
  Moon, Send, Loader2, CheckCircle, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchPreferences,
  updatePreferences,
  NOTIFICATION_TYPE_LABELS,
  type NotificationPreference,
  type NotificationType,
} from "@/lib/push-notifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Icon & color per type
// ---------------------------------------------------------------------------
const TYPE_META: Record<
  NotificationType,
  { Icon: React.FC<{ className?: string }>; color: string; description: string }
> = {
  appointment_reminder: {
    Icon: ({ className }) => <Calendar className={className} />,
    color: "text-blue-500",
    description: "Lembrete antes do horário da consulta",
  },
  result_ready: {
    Icon: ({ className }) => <FileText className={className} />,
    color: "text-green-500",
    description: "Quando exames ou laudos estiverem disponíveis",
  },
  message_received: {
    Icon: ({ className }) => <MessageCircle className={className} />,
    color: "text-purple-500",
    description: "Mensagens do médico ou secretaria",
  },
  system_alert: {
    Icon: ({ className }) => <AlertCircle className={className} />,
    color: "text-amber-500",
    description: "Alertas de sistema e manutenção",
  },
};

const LEAD_TIME_OPTIONS = [
  { value: 15,   label: "15 minutos antes" },
  { value: 30,   label: "30 minutos antes" },
  { value: 60,   label: "1 hora antes" },
  { value: 120,  label: "2 horas antes" },
  { value: 1440, label: "1 dia antes" },
];

// ---------------------------------------------------------------------------
// Preference row
// ---------------------------------------------------------------------------
function PreferenceRow({
  pref,
  onChange,
}: {
  pref: NotificationPreference;
  onChange: (updated: NotificationPreference) => void;
}) {
  const meta = TYPE_META[pref.notification_type];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center ${meta.color}`}>
            <meta.Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {NOTIFICATION_TYPE_LABELS[pref.notification_type]}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => onChange({ ...pref, push_enabled: !pref.push_enabled })}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            pref.push_enabled ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-700"
          }`}
          aria-label={pref.push_enabled ? "Desativar" : "Ativar"}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              pref.push_enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Appointment lead time */}
      {pref.notification_type === "appointment_reminder" && pref.push_enabled && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">
            Avisar com antecedência
          </label>
          <select
            value={pref.reminder_lead_minutes}
            onChange={(e) =>
              onChange({ ...pref, reminder_lead_minutes: Number(e.target.value) })
            }
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LEAD_TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function NotificationPreferencesPage() {
  const { initialized, permissionDenied, requestPermission } = usePushNotifications();
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndStart, setDndStart] = useState("22:00");
  const [dndEnd, setDndEnd] = useState("07:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPreferences();
      setPrefs(data);
    } catch {
      toast.error("Erro ao carregar preferências");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const handleChange = (updated: NotificationPreference) => {
    setPrefs((prev) => prev.map((p) => (p.notification_type === updated.notification_type ? updated : p)));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePreferences(prefs);
      // Also update DND on all active device tokens
      if (dndEnabled) {
        // In a real app, call PATCH /push/tokens/{id} per active token
        // Simulated here:
        localStorage.setItem("dnd_start", dndStart);
        localStorage.setItem("dnd_end", dndEnd);
      }
      setSaved(true);
      toast.success("Preferências salvas com sucesso");
    } catch {
      toast.error("Erro ao salvar preferências");
    } finally {
      setSaving(false);
    }
  };

  const handleTestPush = async () => {
    setTestSending(true);
    try {
      await api.post("/push/test", null, { params: { notification_type: "system_alert" } });
      toast.success("Notificação de teste enviada! Verifique seu dispositivo.");
    } catch {
      toast.error("Erro ao enviar teste — verifique se o dispositivo está registrado");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notificações
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Gerencie como você quer ser avisado
        </p>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">

        {/* Permission banner */}
        {!initialized && !permissionDenied && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
            <Bell className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Ativar notificações
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">
                Permita que o OrthoClinic envie alertas para este dispositivo.
              </p>
              <button
                onClick={requestPermission}
                className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                Ativar agora <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {permissionDenied && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
            <BellOff className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Notificações bloqueadas
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                Para ativar, vá em Configurações do dispositivo e permita notificações para o OrthoClinic.
              </p>
            </div>
          </div>
        )}

        {/* Per-type preferences */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3 px-1">
            Tipos de notificação
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-3">
              {prefs.map((pref) => (
                <PreferenceRow key={pref.notification_type} pref={pref} onChange={handleChange} />
              ))}
            </div>
          )}
        </section>

        {/* Do Not Disturb */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3 px-1">
            Não perturbe
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Horário silencioso
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Sem notificações neste período
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setDndEnabled(!dndEnabled); setSaved(false); }}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  dndEnabled ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    dndEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {dndEnabled && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Início</label>
                  <input
                    type="time"
                    value={dndStart}
                    onChange={(e) => { setDndStart(e.target.value); setSaved(false); }}
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Fim</label>
                  <input
                    type="time"
                    value={dndEnd}
                    onChange={(e) => { setDndEnd(e.target.value); setSaved(false); }}
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Test push */}
        {initialized && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3 px-1">
              Teste
            </h2>
            <button
              onClick={handleTestPush}
              disabled={testSending}
              className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {testSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar notificação de teste
            </button>
          </section>
        )}

        {/* Save button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : null}
            {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar preferências"}
          </button>
        </div>
      </div>
    </div>
  );
}
