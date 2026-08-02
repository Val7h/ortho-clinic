"use client";
import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare, Send, Clock, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Phone, RefreshCw, Cake, Calendar,
  UserCheck, MessageCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { Card, Badge, Button } from "@/components/ui";
import { whatsappApi } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";

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
    <div className="mt-3 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-4">
      <div className="flex items-start gap-2">
        <Phone className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-700">
          {patient.phone || <span className="text-error-600 font-medium">Telefone não cadastrado</span>}
        </p>
      </div>
      <div className="bg-white rounded-lg p-3 border border-slate-200">
        <p className="text-xs font-semibold text-slate-600 mb-2">Prévia da mensagem:</p>
        {preview ? (
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{preview}</p>
        ) : (
          <div className="flex items-center gap-2 text-slate-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-xs">Carregando...</span>
          </div>
        )}
      </div>
      {demo && (
        <div className="flex items-start gap-2 p-3 bg-warning-50 border border-warning-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-warning-700">Modo demo — mensagem salva no sistema mas não enviada</p>
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={onCancel} variant="secondary" fullWidth>
          Cancelar
        </Button>
        <Button
          onClick={handleSend}
          disabled={sending || !preview}
          isLoading={sending}
          variant="success"
          fullWidth
          icon={<Send className="w-4 h-4" />}
        >
          {demo ? "Simular envio" : "Enviar agora"}
        </Button>
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
    <div className="pb-3 border-b border-slate-200 last:border-0 pt-3 first:pt-0">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900 truncate">{patient.name}</span>
            <Badge variant="success" size="sm">
              {badge}
            </Badge>
          </div>
          {patient.phone && (
            <p className="text-xs text-slate-600 mt-1">{patient.phone}</p>
          )}
        </div>
        <Button
          onClick={() => setExpanded((v) => !v)}
          variant="success"
          size="sm"
          icon={<MessageCircle className="w-4 h-4" />}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
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
  title, icon: Icon, variant = "brand", count, children, emptyText,
}: {
  title: string;
  icon: React.ComponentType<any>;
  variant?: any;
  count: number;
  children: React.ReactNode;
  emptyText: string;
}) {
  const variantMap: Record<string, string> = {
    brand: "bg-brand-100",
    pink: "bg-error-100",
    blue: "bg-brand-100",
    purple: "bg-accent-100",
    teal: "bg-accent-100",
    amber: "bg-warning-100",
    slate: "bg-slate-100",
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${variantMap[variant] || variantMap.brand}`}>
          <Icon className="w-5 h-5 text-slate-900" />
        </div>
        <h2 className="font-semibold text-slate-900 flex-1">{title}</h2>
        {count > 0 && (
          <Badge variant="neutral" size="sm">
            {count}
          </Badge>
        )}
      </div>
      <div>
        {count === 0 ? (
          <p className="py-6 text-sm text-slate-500 text-center">{emptyText}</p>
        ) : (
          <div className="space-y-0.5">
            {children}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WhatsAppPage() {
  const { user } = useProtectedPage();
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
    <div className="min-h-screen bg-slate-50">
      <NavBar
        title="WhatsApp & Lembretes"
        subtitle="Comunicação com pacientes"
        back="/"
        actions={
          <Button
            onClick={load}
            variant="tertiary"
            size="sm"
            icon={<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />}
          />
        }
      />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* ── Config banner ────────────────────────────────────────────── */}
        {config && (
          <Card className={`border-l-4 ${demo ? "border-l-warning-500 bg-warning-50" : "border-l-success-500 bg-success-50"}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${demo ? "bg-warning-100" : "bg-success-100"}`}>
                <MessageSquare className={`w-5 h-5 ${demo ? "text-warning-600" : "text-success-600"}`} />
              </div>
              <div className="flex-1 min-w-0">
                {demo ? (
                  <>
                    <p className="font-semibold text-warning-900 text-sm">Modo demonstração ativo</p>
                    <p className="text-xs text-warning-700 mt-1">
                      Mensagens são simuladas e salvas no sistema sem envio real.
                      Para envio real, cadastre-se no <strong>Z-API (zapi.com.br)</strong> e adicione
                      <code className="bg-warning-100 px-1 rounded mx-0.5 text-xs font-mono">WHATSAPP_TOKEN</code> no Render.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-success-900 text-sm">WhatsApp configurado ✓</p>
                    <p className="text-xs text-success-700 mt-1">
                      Mensagens serão enviadas via API para os pacientes.
                    </p>
                  </>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* ── Summary ──────────────────────────────────────────────────── */}
        {dash && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Aniversários hoje", value: dash.birthdays_today.length, variant: "error" },
              { label: "Retornos hoje", value: dash.returns_today.length, variant: "brand" },
              { label: "Esta semana", value: totalAlerts, variant: "accent" },
            ].map((s) => (
              <Card key={s.label} padding="md" className="text-center">
                <p className={`text-3xl font-bold text-${s.variant}-600`}>{s.value}</p>
                <p className="text-xs text-slate-600 mt-2">{s.label}</p>
              </Card>
            ))}
          </div>
        )}

        {loading && !dash && (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-7 h-7 animate-spin text-brand-600" />
          </div>
        )}

        {dash && (
          <>
            {/* Envio automático de parabéns (02/08): loop no backend, 09-19h BRT */}
            <p className="text-xs text-slate-500 dark:text-slate-400 -mb-2">
              🤖 Os parabéns de aniversário são enviados <b>automaticamente</b> a partir
              das 9h (1 por paciente/ano). O botão abaixo serve pra reenvio manual.
            </p>

            {/* ── Birthdays today ───────────────────────────────────────── */}
            <Section
              title="🎂 Aniversariantes Hoje"
              icon={Cake}
              variant="pink"
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
              variant="blue"
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
              variant="purple"
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
              variant="teal"
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
              variant="amber"
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
              variant="slate"
              count={dash.recent_messages.length}
              emptyText="Nenhuma mensagem enviada ainda"
            >
              <div className="space-y-0.5">
                {dash.recent_messages.map((m) => (
                  <div key={m.id} className="py-3 border-b border-slate-200 last:border-0">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex-shrink-0 ${m.status === "sent" ? "text-success-500" : "text-warning-500"}`}>
                        {m.status === "sent" ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">{m.patient_name}</span>
                          <span className="text-xs text-slate-600">{TYPE_LABELS[m.message_type] ?? m.message_type}</span>
                          {m.demo && (
                            <Badge variant="warning" size="sm">demo</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{m.message_text}</p>
                        <p className="text-xs text-slate-500 mt-1">{formatTime(m.created_at)}</p>
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
