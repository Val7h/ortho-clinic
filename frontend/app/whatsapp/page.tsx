"use client";
import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare, Send, Clock, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Phone, RefreshCw, Cake, Calendar,
  UserCheck, MessageCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { whatsappApi } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────
interface WaConfig {
  demo: boolean;
  configured: boolean;
  doctor_name: string;
}

interface PatientEntry {
  id: number;
  name: string;
  phone: string | null;
  days_until?: number;
  birthdate?: string;
  next_appointment?: string;
  last_consultation?: string;
  days_since?: number;
  consultation_id?: number;
}

interface RecentMessage {
  id: number;
  patient_id: number;
  patient_name: string;
  message_type: string;
  message_text: string;
  status: string;
  demo: boolean;
  created_at: string;
}

interface Dashboard {
  birthdays_today: PatientEntry[];
  birthdays_week: PatientEntry[];
  returns_today: PatientEntry[];
  returns_week: PatientEntry[];
  overdue: PatientEntry[];
  recent_messages: RecentMessage[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  birthday: "Aniversário 🎂",
  return_reminder: "Lembrete de Retorno",
  post_consultation: "Pós-Consulta",
  semestral: "Acompanhamento Semestral",
  anual: "Acompanhamento Anual",
  custom: "Personalizada",
};

function daysLabel(days: number): string {
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return `Em ${days} dias`;
}

function daysSinceLabel(days: number): string {
  if (days < 30) return `${days} dias atrás`;
  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? "mês" : "meses"} atrás`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ── Send confirmation card ────────────────────────────────────────────────────
function SendCard({
  patient,
  msgType,
  extraParams,
  demo,
  onSent,
  onCancel,
}: {
  patient: PatientEntry;
  msgType: string;
  extraParams?: Record<string, string>;
  demo: boolean;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    whatsappApi
      .preview({ patient_id: patient.id, message_type: msgType, ...extraParams })
      .then((r) => setPreview(r.text))
      .catch(() => setPreview("Erro ao carregar prévia"));
  }, [patient.id, msgType]);

  const handleSend = async () => {
    setSending(true);
    try {
      await whatsappApi.send({
        patient_id: patient.id,
        message_type: msgType,
        ...extraParams,
      });
      toast.success(demo ? "Mensagem simulada (demo)" : "Mensagem enviada via WhatsApp!");
      onSent();
    } catch {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-2 p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
      <div className="flex items-start gap-2">
        <Phone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600">
          {patient.phone || <span className="text-amber-600">Telefone não cadastrado</span>}
        </p>
      </div>
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 mb-1.5">Prévia da mensagem:</p>
        {preview ? (
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{preview}</p>
        ) : (
          <div className="flex items-center gap-2 text-gray-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Carregando...</span>
          </div>
        )}
      </div>
      {demo && (
        <p className="text-xs text-amber-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          Modo demo — mensagem salva no sistema mas não enviada
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-secondary flex-1 text-sm py-1.5">
          Cancelar
        </button>
        <button
          onClick={handleSend}
          disabled={sending || !preview}
          className="btn-primary flex-1 text-sm py-1.5 flex items-center justify-center gap-1.5"
        >
          {sending ? (
            <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
          ) : (
            <><Send className="w-3.5 h-3.5" /> {demo ? "Simular envio" : "Enviar agora"}</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Patient row ───────────────────────────────────────────────────────────────
function PatientRow({
  patient,
  msgType,
  extraParams,
  badge,
  badgeColor,
  demo,
  onSent,
}: {
  patient: PatientEntry;
  msgType: string;
  extraParams?: Record<string, string>;
  badge: string;
  badgeColor: string;
  demo: boolean;
  onSent: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">{patient.name}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
              {badge}
            </span>
          </div>
          {patient.phone && (
            <p className="text-xs text-gray-400 mt-0.5">{patient.phone}</p>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Enviar
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
      {expanded && (
        <SendCard
          patient={patient}
          msgType={msgType}
          extraParams={extraParams}
          demo={demo}
          onSent={() => { setExpanded(false); onSent(); }}
          onCancel={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({
  title, icon: Icon, iconColor, count, children, emptyText,
}: {
  title: string;
  icon: React.ComponentType<any>;
  iconColor: string;
  count: number;
  children: React.ReactNode;
  emptyText: string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h2 className="font-semibold text-gray-900 flex-1">{title}</h2>
        {count > 0 && (
          <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      <div className="px-5">
        {count === 0 ? (
          <p className="py-4 text-sm text-gray-400 text-center">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WhatsAppPage() {
  const [config, setConfig] = useState<WaConfig | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([whatsappApi.config(), whatsappApi.dashboard()])
      .then(([c, d]) => { setConfig(c); setDash(d); })
      .catch(() => toast.error("Erro ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const demo = config?.demo ?? true;

  const totalAlerts =
    (dash?.birthdays_today.length ?? 0) +
    (dash?.returns_today.length ?? 0) +
    (dash?.birthdays_week.length ?? 0) +
    (dash?.returns_week.length ?? 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar
        title="WhatsApp & Lembretes"
        subtitle="Comunicação com pacientes"
        back="/"
        actions={
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* ── Config banner ────────────────────────────────────────────── */}
        {config && (
          <div className={`card p-4 flex items-start gap-3 ${demo ? "border-l-4 border-amber-400 bg-amber-50" : "border-l-4 border-green-400 bg-green-50"}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${demo ? "bg-amber-500" : "bg-green-600"}`}>
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {demo ? (
                <>
                  <p className="font-semibold text-amber-900 text-sm">Modo demonstração ativo</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Mensagens são simuladas e salvas no sistema sem envio real.
                    Para envio real, cadastre-se no <strong>Z-API (zapi.com.br)</strong> e adicione
                    <code className="bg-amber-100 px-1 rounded mx-0.5">WHATSAPP_TOKEN</code> no Render.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-green-900 text-sm">WhatsApp configurado ✓</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Mensagens serão enviadas via API para os pacientes.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Summary ──────────────────────────────────────────────────── */}
        {dash && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Aniversários hoje", value: dash.birthdays_today.length, color: "text-pink-600" },
              { label: "Retornos hoje", value: dash.returns_today.length, color: "text-blue-600" },
              { label: "Esta semana", value: totalAlerts, color: "text-purple-600" },
            ].map((s) => (
              <div key={s.label} className="card p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {loading && !dash && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {dash && (
          <>
            {/* ── Birthdays today ───────────────────────────────────────── */}
            <Section
              title="🎂 Aniversariantes Hoje"
              icon={Cake}
              iconColor="bg-pink-500"
              count={dash.birthdays_today.length}
              emptyText="Nenhum aniversariante hoje"
            >
              {dash.birthdays_today.map((p) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  msgType="birthday"
                  badge="Hoje"
                  badgeColor="bg-pink-100 text-pink-700"
                  demo={demo}
                  onSent={load}
                />
              ))}
            </Section>

            {/* ── Returns today ─────────────────────────────────────────── */}
            <Section
              title="📅 Retornos Hoje"
              icon={Calendar}
              iconColor="bg-blue-500"
              count={dash.returns_today.length}
              emptyText="Nenhum retorno agendado para hoje"
            >
              {dash.returns_today.map((p) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  msgType="return_reminder"
                  extraParams={p.next_appointment ? { appointment_date: p.next_appointment } : undefined}
                  badge="Hoje"
                  badgeColor="bg-blue-100 text-blue-700"
                  demo={demo}
                  onSent={load}
                />
              ))}
            </Section>

            {/* ── Birthdays this week ───────────────────────────────────── */}
            <Section
              title="🎉 Aniversários — Próximos 7 dias"
              icon={Cake}
              iconColor="bg-purple-500"
              count={dash.birthdays_week.length}
              emptyText="Nenhum aniversário nos próximos 7 dias"
            >
              {dash.birthdays_week.map((p) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  msgType="birthday"
                  badge={daysLabel(p.days_until!)}
                  badgeColor="bg-purple-100 text-purple-700"
                  demo={demo}
                  onSent={load}
                />
              ))}
            </Section>

            {/* ── Returns this week ─────────────────────────────────────── */}
            <Section
              title="⏰ Retornos — Próximos 7 dias"
              icon={Clock}
              iconColor="bg-teal-500"
              count={dash.returns_week.length}
              emptyText="Nenhum retorno agendado para os próximos 7 dias"
            >
              {dash.returns_week.map((p) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  msgType="return_reminder"
                  extraParams={p.next_appointment ? { appointment_date: p.next_appointment } : undefined}
                  badge={daysLabel(p.days_until!)}
                  badgeColor="bg-teal-100 text-teal-700"
                  demo={demo}
                  onSent={load}
                />
              ))}
            </Section>

            {/* ── Overdue ───────────────────────────────────────────────── */}
            <Section
              title="💤 Sem consulta há 6+ meses"
              icon={UserCheck}
              iconColor="bg-amber-500"
              count={dash.overdue.length}
              emptyText="Todos os pacientes consultaram nos últimos 6 meses"
            >
              {dash.overdue.map((p) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  msgType="semestral"
                  badge={p.days_since ? daysSinceLabel(p.days_since) : "Há muito tempo"}
                  badgeColor="bg-amber-100 text-amber-700"
                  demo={demo}
                  onSent={load}
                />
              ))}
            </Section>

            {/* ── Message history ───────────────────────────────────────── */}
            <Section
              title="📋 Histórico de Mensagens"
              icon={MessageSquare}
              iconColor="bg-gray-500"
              count={dash.recent_messages.length}
              emptyText="Nenhuma mensagem enviada ainda"
            >
              <div className="py-2 space-y-0">
                {dash.recent_messages.map((m) => (
                  <div key={m.id} className="py-3 border-b border-gray-50 last:border-0">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex-shrink-0 ${m.status === "sent" ? "text-green-500" : "text-amber-500"}`}>
                        {m.status === "sent" ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{m.patient_name}</span>
                          <span className="text-xs text-gray-400">{TYPE_LABELS[m.message_type] ?? m.message_type}</span>
                          {m.demo && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">demo</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{m.message_text}</p>
                        <p className="text-xs text-gray-300 mt-0.5">{formatTime(m.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
