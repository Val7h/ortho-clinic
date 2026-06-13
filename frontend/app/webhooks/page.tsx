"use client";

/**
 * Webhook Management Dashboard — Sprint 7
 *
 * Features:
 *  - List all registered webhook endpoints with live status
 *  - Register new endpoints (URL, events, secret, description)
 *  - Toggle active/inactive (re-enables after circuit breaker opens)
 *  - Delete endpoints
 *  - Delivery history per endpoint (HTTP status, duration, attempt)
 *  - Dead-letter queue with one-click replay
 *  - Send test ping
 *  - Circuit breaker status badge
 */

import { useEffect, useState, useCallback, Fragment } from "react";
import toast from "react-hot-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WebhookEvent =
  | "appointment.created"
  | "appointment.updated"
  | "appointment.cancelled"
  | "patient.created"
  | "patient.updated"
  | "document.uploaded"
  | "payment.received";

interface WebhookEndpoint {
  id: number;
  url: string;
  events: string[];
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  consecutive_failures: number;
  circuit_opened_at: string | null;
  secret_hint: string | null;
  has_ip_allowlist: boolean;
  has_mtls: boolean;
}

interface DeliveryLog {
  id: number;
  endpoint_id: number;
  evt_id: string;
  event_type: string;
  attempt_number: number;
  status: "success" | "failed" | "dead";
  http_status: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number | null;
  attempted_at: string;
  next_retry_at: string | null;
}

interface DeadLetter {
  id: number;
  endpoint_id: number;
  evt_id: string;
  event_type: string;
  total_attempts: number;
  first_attempted_at: string | null;
  last_attempted_at: string | null;
  last_error: string | null;
  created_at: string;
  replayed_at: string | null;
  replay_task_id: string | null;
}

interface TestResult {
  webhook_id: number;
  delivered: boolean;
  http_status: number | null;
  response_body: string | null;
  duration_ms: number;
  error: string | null;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_EVENTS: { key: WebhookEvent; label: string }[] = [
  { key: "appointment.created",   label: "Consulta criada" },
  { key: "appointment.updated",   label: "Consulta atualizada" },
  { key: "appointment.cancelled", label: "Consulta cancelada" },
  { key: "patient.created",       label: "Paciente cadastrado" },
  { key: "patient.updated",       label: "Paciente atualizado" },
  { key: "document.uploaded",     label: "Documento enviado" },
  { key: "payment.received",      label: "Pagamento recebido" },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("api_key") ?? "";
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusColor(status: string): string {
  if (status === "success") return "text-green-600 bg-green-50";
  if (status === "dead") return "text-red-700 bg-red-50";
  return "text-yellow-700 bg-yellow-50";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CircuitBadge({ endpoint }: { endpoint: WebhookEndpoint }) {
  if (!endpoint.active && endpoint.circuit_opened_at) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        Circuito aberto
      </span>
    );
  }
  if (!endpoint.active) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
        Inativo
      </span>
    );
  }
  if (endpoint.consecutive_failures >= 5) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
        {endpoint.consecutive_failures} falhas consecutivas
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      Ativo
    </span>
  );
}

function DeliveryRow({ log }: { log: DeliveryLog }) {
  return (
    <tr className="text-sm border-b border-gray-100 last:border-0">
      <td className="py-2 pr-3 font-mono text-xs text-gray-500 truncate max-w-[120px]">{log.evt_id}</td>
      <td className="py-2 pr-3 text-gray-700">{log.event_type}</td>
      <td className="py-2 pr-3 text-center">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(log.status)}`}>
          {log.status}
        </span>
      </td>
      <td className="py-2 pr-3 text-center text-gray-600">{log.http_status ?? "—"}</td>
      <td className="py-2 pr-3 text-center text-gray-600">{log.attempt_number}</td>
      <td className="py-2 pr-3 text-center text-gray-600">{log.duration_ms != null ? `${log.duration_ms}ms` : "—"}</td>
      <td className="py-2 text-gray-500 text-xs">{fmtDate(log.attempted_at)}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Delivery panel state
  const [selectedEp, setSelectedEp] = useState<WebhookEndpoint | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryLog[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [deliveryTab, setDeliveryTab] = useState<"deliveries" | "dead">("deliveries");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Form state
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formSecret, setFormSecret] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formIpList, setFormIpList] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchEndpoints = useCallback(async () => {
    try {
      const data = await apiFetch<WebhookEndpoint[]>("/api/v1/webhooks");
      setEndpoints(data);
    } catch (e: unknown) {
      toast.error(`Erro ao carregar webhooks: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEndpoints(); }, [fetchEndpoints]);

  const openDeliveryPanel = useCallback(async (ep: WebhookEndpoint) => {
    setSelectedEp(ep);
    setTestResult(null);
    setDeliveryTab("deliveries");
    try {
      const [logs, dead] = await Promise.all([
        apiFetch<DeliveryLog[]>(`/api/v1/webhooks/${ep.id}/deliveries?limit=50`),
        apiFetch<DeadLetter[]>(`/api/v1/webhooks/${ep.id}/dead-letters?limit=50`),
      ]);
      setDeliveries(logs);
      setDeadLetters(dead);
    } catch (e: unknown) {
      toast.error(`Erro ao carregar histórico: ${(e as Error).message}`);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUrl) return toast.error("URL obrigatória");
    if (formEvents.length === 0) return toast.error("Selecione ao menos um evento");

    const body: Record<string, unknown> = {
      url: formUrl,
      events: formEvents,
      description: formDesc || null,
      active: formActive,
    };
    if (formSecret) body.secret = formSecret;
    if (formIpList.trim()) {
      body.ip_allowlist = formIpList.split(",").map((s) => s.trim()).filter(Boolean);
    }

    setFormSubmitting(true);
    try {
      await apiFetch<WebhookEndpoint>("/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success("Webhook registrado com sucesso");
      setShowForm(false);
      setFormUrl(""); setFormEvents([]); setFormSecret(""); setFormDesc(""); setFormIpList("");
      fetchEndpoints();
    } catch (e: unknown) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggle = async (ep: WebhookEndpoint) => {
    try {
      await apiFetch<WebhookEndpoint>(`/api/v1/webhooks/${ep.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !ep.active }),
      });
      toast.success(ep.active ? "Webhook desativado" : "Webhook reativado");
      fetchEndpoints();
    } catch (e: unknown) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  const handleDelete = async (ep: WebhookEndpoint) => {
    if (!confirm(`Remover webhook ${ep.url}? Esta ação não pode ser desfeita.`)) return;
    try {
      await fetch(`${API_BASE}/api/v1/webhooks/${ep.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey()}` },
      });
      toast.success("Webhook removido");
      if (selectedEp?.id === ep.id) setSelectedEp(null);
      fetchEndpoints();
    } catch (e: unknown) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  const handleTest = async (ep: WebhookEndpoint) => {
    try {
      const result = await apiFetch<TestResult>(`/api/v1/webhooks/${ep.id}/test`, { method: "POST" });
      setTestResult(result);
      if (result.delivered) {
        toast.success(`Ping entregue — HTTP ${result.http_status} em ${result.duration_ms}ms`);
      } else {
        toast.error(`Ping falhou — ${result.error ?? `HTTP ${result.http_status}`}`);
      }
      // Refresh delivery history
      if (selectedEp?.id === ep.id) {
        const logs = await apiFetch<DeliveryLog[]>(`/api/v1/webhooks/${ep.id}/deliveries?limit=50`);
        setDeliveries(logs);
      }
    } catch (e: unknown) {
      toast.error(`Erro no teste: ${(e as Error).message}`);
    }
  };

  const handleReplay = async (dl: DeadLetter) => {
    try {
      await apiFetch(`/api/v1/webhooks/${dl.endpoint_id}/dead-letters/${dl.id}/replay`, { method: "POST" });
      toast.success(`Evento ${dl.evt_id} recolocado na fila`);
      if (selectedEp) {
        const dead = await apiFetch<DeadLetter[]>(`/api/v1/webhooks/${selectedEp.id}/dead-letters?limit=50`);
        setDeadLetters(dead);
      }
    } catch (e: unknown) {
      toast.error(`Erro no replay: ${(e as Error).message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Receba notificacoes em tempo real sobre eventos do OrthoClinic
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {showForm ? "Cancelar" : "+ Novo webhook"}
          </button>
        </div>

        {/* Registration form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Registrar endpoint</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL (HTTPS)</label>
                  <input
                    type="url"
                    required
                    placeholder="https://meuapp.com/webhooks/orthoclinic"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Eventos</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formEvents.includes("*")}
                        onChange={(e) => setFormEvents(e.target.checked ? ["*"] : [])}
                        className="rounded border-gray-300 text-blue-600"
                      />
                      Todos os eventos (*)
                    </label>
                    {ALL_EVENTS.map((ev) => (
                      <label key={ev.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={formEvents.includes("*")}
                          checked={formEvents.includes(ev.key) || formEvents.includes("*")}
                          onChange={(e) => {
                            setFormEvents(prev =>
                              e.target.checked ? [...prev, ev.key] : prev.filter(x => x !== ev.key)
                            );
                          }}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        {ev.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Secret HMAC-SHA256
                      <span className="text-gray-400 font-normal ml-1">(opcional, min. 16 chars)</span>
                    </label>
                    <input
                      type="password"
                      placeholder="whsec_..."
                      value={formSecret}
                      onChange={(e) => setFormSecret(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Salve agora — nao sera exibido novamente.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
                    <input
                      type="text"
                      placeholder="Ex: Notificacoes de agendamentos"
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      IP Allowlist
                      <span className="text-gray-400 font-normal ml-1">(CIDR, separados por virgula)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="203.0.113.0/24, 198.51.100.0/24"
                      value={formIpList}
                      onChange={(e) => setFormIpList(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formActive}
                      onChange={(e) => setFormActive(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    Ativar imediatamente
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {formSubmitting ? "Salvando..." : "Registrar webhook"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Endpoints list */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              Carregando webhooks...
            </div>
          ) : endpoints.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <p className="text-sm font-medium">Nenhum webhook registrado</p>
              <p className="text-xs mt-1">Clique em &quot;+ Novo webhook&quot; para comecar</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">URL</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Eventos</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Criado</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => (
                  <tr
                    key={ep.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer ${selectedEp?.id === ep.id ? "bg-blue-50/30" : ""}`}
                    onClick={() => openDeliveryPanel(ep)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-sm text-gray-800 truncate max-w-[300px]">{ep.url}</div>
                      {ep.description && <div className="text-xs text-gray-400 mt-0.5">{ep.description}</div>}
                      <div className="flex items-center gap-2 mt-1">
                        {ep.secret_hint && (
                          <span className="text-xs text-gray-400 font-mono">secret: {ep.secret_hint}</span>
                        )}
                        {ep.has_ip_allowlist && (
                          <span className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">IP allowlist</span>
                        )}
                        {ep.has_mtls && (
                          <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">mTLS</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(ep.events.includes("*") ? ["*"] : ep.events).map((ev) => (
                          <span key={ev} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                            {ev}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <CircuitBadge endpoint={ep} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(ep.created_at)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTest(ep)}
                          title="Enviar ping de teste"
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                        >
                          Testar
                        </button>
                        <button
                          onClick={() => handleToggle(ep)}
                          title={ep.active ? "Desativar" : "Reativar"}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            ep.active
                              ? "bg-yellow-50 hover:bg-yellow-100 text-yellow-700"
                              : "bg-green-50 hover:bg-green-100 text-green-700"
                          }`}
                        >
                          {ep.active ? "Pausar" : "Ativar"}
                        </button>
                        <button
                          onClick={() => handleDelete(ep)}
                          title="Remover webhook"
                          className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Delivery panel */}
        {selectedEp && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">
                  Historico — <span className="font-mono text-blue-700">{selectedEp.url}</span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedEp.consecutive_failures} falhas consecutivas
                  {selectedEp.circuit_opened_at && ` — circuito aberto em ${fmtDate(selectedEp.circuit_opened_at)}`}
                </p>
              </div>
              <button onClick={() => setSelectedEp(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Test result banner */}
            {testResult && (
              <div className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm ${testResult.delivered ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {testResult.delivered ? "Ping entregue" : "Ping falhou"}
                  </span>
                  <span className="text-xs opacity-70">
                    HTTP {testResult.http_status ?? "—"} &bull; {testResult.duration_ms}ms
                  </span>
                </div>
                {testResult.error && <p className="text-xs mt-1 opacity-80">{testResult.error}</p>}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6 mt-4">
              {(["deliveries", "dead"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDeliveryTab(tab)}
                  className={`pb-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors ${
                    deliveryTab === tab
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab === "deliveries" ? `Entregas (${deliveries.length})` : `Fila morta (${deadLetters.length})`}
                </button>
              ))}
            </div>

            <div className="p-6">
              {deliveryTab === "deliveries" && (
                deliveries.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Nenhuma entrega registrada ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                          <th className="pb-2 pr-3">ID evento</th>
                          <th className="pb-2 pr-3">Tipo</th>
                          <th className="pb-2 pr-3 text-center">Status</th>
                          <th className="pb-2 pr-3 text-center">HTTP</th>
                          <th className="pb-2 pr-3 text-center">Tentativa</th>
                          <th className="pb-2 pr-3 text-center">Duracao</th>
                          <th className="pb-2">Data/hora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveries.map((log) => <DeliveryRow key={log.id} log={log} />)}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {deliveryTab === "dead" && (
                deadLetters.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Nenhum evento na fila morta.</p>
                ) : (
                  <div className="space-y-3">
                    {deadLetters.map((dl) => (
                      <div key={dl.id} className="border border-red-100 rounded-lg p-4 bg-red-50/30">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs text-gray-500">{dl.evt_id}</span>
                              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{dl.event_type}</span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {dl.total_attempts} tentativas &bull; ultima em {fmtDate(dl.last_attempted_at)}
                            </p>
                            {dl.last_error && (
                              <p className="text-xs text-red-700 mt-1 font-mono truncate">{dl.last_error}</p>
                            )}
                            {dl.replayed_at && (
                              <p className="text-xs text-green-700 mt-1">
                                Recolocado na fila em {fmtDate(dl.replayed_at)}
                                {dl.replay_task_id && ` (task: ${dl.replay_task_id.slice(0, 8)}...)`}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleReplay(dl)}
                            disabled={!!dl.replayed_at}
                            className="shrink-0 text-xs px-3 py-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {dl.replayed_at ? "Reenviado" : "Reenviar"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Signature verification guide */}
        <div className="mt-8 bg-gray-900 rounded-xl p-6 text-sm">
          <h3 className="text-gray-300 font-semibold mb-3">Verificar assinatura (Python)</h3>
          <pre className="text-green-400 font-mono text-xs leading-relaxed overflow-x-auto">{`import hashlib, hmac, secrets

def verify_signature(payload: bytes, header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    received = header  # X-OrthoClinic-Signature header value
    return secrets.compare_digest(expected, received)

# No seu endpoint:
# raw_body = await request.body()
# sig      = request.headers["X-OrthoClinic-Signature"]
# if not verify_signature(raw_body, sig, WEBHOOK_SECRET):
#     raise HTTPException(403, "Invalid signature")`}</pre>
          <h3 className="text-gray-300 font-semibold mb-3 mt-5">Verificar assinatura (Node.js)</h3>
          <pre className="text-green-400 font-mono text-xs leading-relaxed overflow-x-auto">{`const crypto = require("crypto");

function verifySignature(payload, header, secret) {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(header)
  );
}`}</pre>
        </div>
      </div>
    </div>
  );
}
