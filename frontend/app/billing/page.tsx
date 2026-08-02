"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CreditCard, FileText, Zap, Database, Calendar, AlertTriangle,
  CheckCircle, Clock, TrendingUp, Download, ExternalLink, ChevronRight,
  RefreshCw, Building2, ArrowUpRight,
} from "lucide-react";
import { Card, Badge, Button } from "@/components/ui";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubscriptionData {
  status: string;
  billing_cycle: string;
  plan: { tier: string; name: string; features: string[] };
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  volume_discount_pct: number;
}

interface UsageData {
  api_calls: { limit: number | null; remaining: number | null; calls_this_window: number; plan: string };
  storage:   { limit_gb: number | null; used_gb: number; pct_used: number; warn: boolean; blocked: boolean };
  appointments: { limit: number | null; used: number; remaining: number | null };
}

interface InvoiceRow {
  id: number;
  stripe_invoice_id: string;
  status: string;
  total_brl: number;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  due_date: string | null;
  pdf_url: string | null;
  nfe_number: string | null;
  nfe_url: string | null;
  payment_method_type: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch(path: string, token: string) {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusColor(s: string) {
  switch (s) {
    case "active":    return "bg-success-100 text-success-700";
    case "trialing":  return "bg-blue-100 text-blue-700";
    case "past_due":  return "bg-amber-100 text-amber-700";
    case "unpaid":
    case "canceled":  return "bg-red-100 text-red-700";
    default:          return "bg-slate-100 text-slate-600";
  }
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    active: "Ativo", trialing: "Trial", past_due: "Pagamento pendente",
    unpaid: "Inadimplente", canceled: "Cancelado", paused: "Pausado",
    incomplete: "Incompleto",
  };
  return map[s] ?? s;
}

// ── Usage meter bar ───────────────────────────────────────────────────────────

function MeterBar({
  label, used, limit, unit, warn, icon: Icon,
}: {
  label: string; used: number; limit: number | null;
  unit: string; warn?: boolean; icon: React.ElementType;
}) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const unlimited = limit === null;
  const color = unlimited ? "bg-brand-500" : warn ? "bg-amber-500" : pct > 80 ? "bg-amber-400" : "bg-success-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <Icon className="w-4 h-4 text-slate-400" />
          {label}
        </div>
        {unlimited ? (
          <span className="text-xs text-brand-600 font-semibold">Ilimitado</span>
        ) : (
          <span className="text-xs text-slate-500">
            {used.toLocaleString("pt-BR")} / {limit?.toLocaleString("pt-BR")} {unit}
          </span>
        )}
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: unlimited ? "30%" : `${pct}%` }}
        />
      </div>
      {warn && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Atenção: 80% do limite atingido
        </p>
      )}
    </div>
  );
}

// ── Invoice row ───────────────────────────────────────────────────────────────

function InvoiceRow({ inv }: { inv: InvoiceRow }) {
  const pmLabel: Record<string, string> = {
    card: "Cartão", boleto: "Boleto", pix: "PIX",
  };
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="py-3 px-4 text-sm text-slate-700">
        {fmtDate(inv.period_start)}
        {inv.period_end && ` → ${fmtDate(inv.period_end)}`}
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          inv.status === "paid"
            ? "bg-success-100 text-success-700"
            : inv.status === "open"
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-600"
        }`}>
          {inv.status === "paid" ? "Pago" : inv.status === "open" ? "Em aberto" : inv.status}
        </span>
      </td>
      <td className="py-3 px-4 text-sm font-semibold text-slate-900 text-right">
        {fmtBRL(inv.total_brl)}
      </td>
      <td className="py-3 px-4 text-xs text-slate-500 text-center">
        {inv.payment_method_type ? pmLabel[inv.payment_method_type] ?? inv.payment_method_type : "—"}
      </td>
      <td className="py-3 px-4 text-xs text-center">
        {inv.nfe_number ? (
          <a href={inv.nfe_url ?? "#"} target="_blank" rel="noopener noreferrer"
            className="text-brand-600 hover:underline font-medium">
            NF-e {inv.nfe_number}
          </a>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="py-3 px-4 text-center">
        {inv.pdf_url ? (
          <a href={`/billing/invoices/${inv.id}/pdf`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600 font-medium">
            <Download className="w-3.5 h-3.5" /> PDF
          </a>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

// ── Dunning banner ────────────────────────────────────────────────────────────

function DunningBanner({ status, onPortal }: { status: string; onPortal: () => void }) {
  if (status !== "past_due" && status !== "unpaid") return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold text-red-800 text-sm">Pagamento pendente</p>
        <p className="text-xs text-red-600 mt-0.5">
          {status === "unpaid"
            ? "Sua conta foi suspensa por falta de pagamento. Regularize para restaurar o acesso."
            : "Identificamos um problema com seu pagamento. Atualize seu método para evitar interrupção do serviço."}
        </p>
      </div>
      <button
        onClick={onPortal}
        className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
      >
        Regularizar agora
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [portalLoading, setPortalLoading] = useState(false);

  // Get token from localStorage (same pattern as rest of the app)
  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const [subData, invoiceData] = await Promise.all([
        apiFetch("/billing/subscription", token),
        apiFetch("/billing/invoices?limit=10", token),
      ]);
      setSub(subData.subscription ?? null);
      setUsage(subData.usage ?? null);
      setInvoices(invoiceData.invoices ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados de faturamento.");
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    try {
      const token = getToken();
      const r = await fetch(`${API}/billing/portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (data.portal_url) window.open(data.portal_url, "_blank");
    } catch {
      alert("Não foi possível abrir o portal de faturamento. Tente novamente.");
    } finally {
      setPortalLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-brand-500 animate-spin mx-auto" />
          <p className="text-slate-500 text-sm">Carregando faturamento...</p>
        </div>
      </div>
    );
  }

  const noSub = !sub;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">← Painel</Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-900">Faturamento</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="text-slate-400 hover:text-slate-700 transition-colors"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {sub && (
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {portalLoading ? "Abrindo..." : "Portal de Faturamento"}
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Dunning banner ───────────────────────────────────────── */}
        {sub && <DunningBanner status={sub.status} onPortal={openPortal} />}

        {/* ── No subscription ──────────────────────────────────────── */}
        {noSub && (
          <Card className="text-center py-16">
            <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Nenhum plano ativo</h2>
            <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
              Comece com 14 dias grátis, sem cartão de crédito. Escolha o plano ideal para sua clínica.
            </p>
            <Link href="/planos">
              <button className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-6 py-3 rounded-xl transition-colors inline-flex items-center gap-2">
                Ver planos <ArrowUpRight className="w-4 h-4" />
              </button>
            </Link>
          </Card>
        )}

        {/* ── Subscription card ────────────────────────────────────── */}
        {sub && (
          <Card className="overflow-hidden">
            <div className="px-6 py-5 flex flex-wrap gap-4 items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-lg font-bold text-slate-900">
                    Plano {sub.plan.name}
                  </h2>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColor(sub.status)}`}>
                    {statusLabel(sub.status)}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  Ciclo {sub.billing_cycle === "annual" ? "anual" : "mensal"}
                  {sub.volume_discount_pct > 0 && (
                    <span className="ml-2 text-success-600 font-semibold">
                      · {(sub.volume_discount_pct * 100).toFixed(0)}% desconto por volume
                    </span>
                  )}
                </p>

                {sub.status === "trialing" && sub.trial_end && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-blue-600 font-semibold">
                    <Clock className="w-3.5 h-3.5" />
                    Trial termina em {fmtDate(sub.trial_end)}
                  </div>
                )}
                {sub.cancel_at_period_end && sub.current_period_end && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Cancela em {fmtDate(sub.current_period_end)}
                  </div>
                )}
                {sub.status === "active" && !sub.cancel_at_period_end && sub.current_period_end && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    Próxima renovação: {fmtDate(sub.current_period_end)}
                  </div>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                <Link href="/planos">
                  <button className="text-xs font-semibold border border-brand-600 text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> Fazer upgrade
                  </button>
                </Link>
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="text-xs font-semibold border border-slate-200 text-slate-600 hover:border-slate-400 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" /> Método de pagamento
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Usage meters ─────────────────────────────────────────── */}
        {usage && (
          <Card>
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-500" />
                Uso do período atual
              </h3>
            </div>
            <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-6">
              <MeterBar
                label="Chamadas de API"
                used={usage.api_calls.calls_this_window}
                limit={usage.api_calls.limit}
                unit="calls"
                icon={Zap}
              />
              <MeterBar
                label="Armazenamento"
                used={usage.storage.used_gb}
                limit={usage.storage.limit_gb}
                unit="GB"
                warn={usage.storage.warn}
                icon={Database}
              />
              <MeterBar
                label="Agendamentos"
                used={usage.appointments.used}
                limit={usage.appointments.limit}
                unit="agend."
                icon={Calendar}
              />
            </div>
            {sub?.plan.tier !== "enterprise" && (
              <div className="px-6 pb-4">
                <p className="text-xs text-slate-400">
                  Chamadas de API excedentes: R$ 0,15 / 1.000 chamadas.
                  Armazenamento excedente será cobrado no próximo ciclo.
                </p>
              </div>
            )}
          </Card>
        )}

        {/* ── Multi-clinic volume discount info ────────────────────── */}
        {sub?.plan.tier === "enterprise" && (
          <Card className="bg-slate-900 text-white overflow-hidden">
            <div className="px-6 py-5 flex items-start gap-4">
              <Building2 className="w-8 h-8 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white mb-1">Faturamento multi-unidade ativo</p>
                <p className="text-sm text-slate-400">
                  Sua organização recebe uma única fatura consolidada para todas as unidades.
                  Descontos por volume são aplicados automaticamente com base no número de clínicas ativas.
                </p>
                <div className="mt-3 flex gap-4 text-xs text-slate-400">
                  <span className="bg-white/10 px-2 py-1 rounded">10+ unidades → 15% off</span>
                  <span className="bg-white/10 px-2 py-1 rounded">25+ unidades → 25% off</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── Invoices ─────────────────────────────────────────────── */}
        <Card>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-500" />
              Histórico de faturas
            </h3>
            <span className="text-xs text-slate-400">{invoices.length} faturas</span>
          </div>

          {invoices.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">
              Nenhuma fatura ainda. As faturas aparecerão aqui após o primeiro pagamento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs font-semibold text-slate-500 border-b border-slate-100">
                    <th className="text-left py-3 px-4">Período</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Valor</th>
                    <th className="text-center py-3 px-4">Pagamento</th>
                    <th className="text-center py-3 px-4">NFS-e</th>
                    <th className="text-center py-3 px-4">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <InvoiceRow key={inv.id} inv={inv} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Quick links ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Cancelar: era um Link pra /billing/cancelar, página que nunca
              existiu (auditoria 02/08) — agora chama o POST /billing/cancel
              direto, com confirmação. */}
          <button
            onClick={async () => {
              if (!window.confirm("Cancelar a assinatura? O acesso continua até o fim do período já pago.")) return;
              try {
                await api.post("/billing/cancel");
                toast.success("Assinatura cancelada.");
              } catch (e: any) {
                toast.error(e?.response?.data?.detail ?? "Não foi possível cancelar — fale com o suporte.");
              }
            }}
            className="border border-slate-200 rounded-xl p-4 hover:border-red-400 hover:shadow-sm transition-all flex items-center justify-between bg-white cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Cancelar assinatura</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
          {[
            { label: "Solicitar plano Enterprise", href: "/billing/enterprise", icon: Building2 },
            { label: "Ver todos os planos", href: "/planos", icon: ChevronRight },
          ].map(({ label, href, icon: Icon }) => (
            <Link key={label} href={href}>
              <div className="border border-slate-200 rounded-xl p-4 hover:border-brand-400 hover:shadow-sm transition-all flex items-center justify-between bg-white cursor-pointer">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
