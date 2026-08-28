"use client";

/**
 * /auditoria — trilha de auditoria LGPD (criada 02/08).
 *
 * O backend grava TUDO desde sempre (middleware de auditoria + cadeia HMAC
 * imutável), mas nunca houve tela — este é o "tesouro escondido" nº 1 da
 * auditoria backend×frontend. Três visões:
 *   1. Acessos a prontuário (LGPD Art. 37): quem viu qual paciente e quando
 *   2. Atividade geral (logs filtrados por período/ação)
 *   3. Resumo do mês
 * Acesso: admin, superadmin e médico (secretária não vê).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { ProtectedPageLayout } from "@/components/ProtectedPageLayout";
import { useAuth } from "@/components/AuthProvider";
import { auditApi, patientsApi } from "@/lib/api";
import toast from "react-hot-toast";
import { hojeISO } from "@/lib/utils";

type Aba = "prontuario" | "atividade" | "resumo";

const ACTION_LABEL: Record<string, string> = {
  "patient.viewed": "Prontuário aberto",
  "patient.created": "Paciente cadastrado",
  "patient.updated": "Cadastro alterado",
  "patient.deleted": "Paciente excluído",
  "auth.login": "Login",
  "auth.login_failed": "Tentativa de login falhou",
  "auth.logout": "Logout",
  "password.changed": "Senha trocada",
  "appointment.created": "Agendamento criado",
  "appointment.updated": "Agendamento alterado",
  "appointment.cancelled": "Agendamento cancelado",
  "document.created": "Documento criado",
  "document.viewed": "Documento aberto",
  "document.deleted": "Documento excluído",
  "financial.viewed": "Financeiro consultado",
  "financial.created": "Pagamento registrado",
};

function fmtTs(ts: string) {
  try {
    return new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(ts) ? ts : `${ts}Z`).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ts; }
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function AuditoriaPage() {
  const { user } = useAuth();
  const [aba, setAba] = useState<Aba>("prontuario");
  const [periodo, setPeriodo] = useState<number>(7); // dias
  const [loading, setLoading] = useState(false);

  const [acessos, setAcessos] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({}); // patient_id -> nome

  const since = useMemo(() => isoDaysAgo(periodo), [periodo]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      if (aba === "prontuario") {
        const rows = await auditApi.patientAccess({ since });
        setAcessos(rows);
        // resolve nomes dos pacientes citados (melhor esforço, sem travar a tela)
        const ids = Array.from(new Set(rows.map((r: any) => r.patient_id).filter(Boolean))).slice(0, 40) as string[];
        const found: Record<string, string> = {};
        await Promise.all(ids.map(async (id) => {
          try { const p = await patientsApi.get(Number(id)); found[id] = p.name; } catch {}
        }));
        setNomes(found);
      } else if (aba === "atividade") {
        setLogs(await auditApi.logs({ since, limit: 200 }));
      } else {
        const now = new Date();
        setResumo(await auditApi.monthlySummary(now.getFullYear(), now.getMonth() + 1));
      }
    } catch (err: any) {
      toast.error(err?.response?.status === 403 ? "Sem permissão para ver a auditoria" : "Erro ao carregar auditoria");
    } finally {
      setLoading(false);
    }
  }, [aba, since]);

  useEffect(() => { carregar(); }, [carregar]);

  const baixarCsv = async () => {
    try {
      const blob = await auditApi.exportCsv({ since });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-${hojeISO()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao exportar CSV");
    }
  };

  if (user && !["admin", "superadmin", "doctor"].includes(user.role)) {
    return (
      <ProtectedPageLayout title="Auditoria">
        <p className="text-center py-16 text-sm text-slate-400">Sem permissão para ver esta página.</p>
      </ProtectedPageLayout>
    );
  }

  return (
    <ProtectedPageLayout title="Auditoria">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Trilha de auditoria (LGPD)</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Registro imutável de tudo que acontece no sistema — quem acessou, alterou ou excluiu o quê.
            </p>
          </div>
          <button
            onClick={baixarCsv}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Exportar CSV
          </button>
          <button
            onClick={carregar}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            aria-label="Atualizar"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        </div>

        {/* Abas + período */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {([
              ["prontuario", "Acessos a prontuário"],
              ["atividade", "Atividade geral"],
              ["resumo", "Resumo do mês"],
            ] as [Aba, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  aba === k
                    ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {aba !== "resumo" && (
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 ml-auto">
              {[7, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setPeriodo(d)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    periodo === d
                      ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {d} dias
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Acessos a prontuário ── */}
        {aba === "prontuario" && (
          <div className="card overflow-x-auto">
            {acessos.length === 0 && !loading && (
              <p className="py-12 text-center text-sm text-slate-400">Nenhum acesso a prontuário no período.</p>
            )}
            {acessos.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-2.5">Quando</th>
                    <th className="px-4 py-2.5">Paciente</th>
                    <th className="px-4 py-2.5">Ação</th>
                    <th className="px-4 py-2.5">Usuário (id)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                  {acessos.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{fmtTs(r.timestamp)}</td>
                      <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">
                        {r.patient_id ? (nomes[r.patient_id] ?? `#${r.patient_id}`) : "—"}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{ACTION_LABEL[r.action] ?? r.action}</td>
                      <td className="px-4 py-2 text-slate-500">{r.actor_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Atividade geral ── */}
        {aba === "atividade" && (
          <div className="card overflow-x-auto">
            {logs.length === 0 && !loading && (
              <p className="py-12 text-center text-sm text-slate-400">Nenhum evento no período.</p>
            )}
            {logs.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-2.5">Quando</th>
                    <th className="px-4 py-2.5">Ação</th>
                    <th className="px-4 py-2.5">Recurso</th>
                    <th className="px-4 py-2.5">Usuário (id)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                  {logs.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{fmtTs(r.timestamp)}</td>
                      <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{ACTION_LABEL[r.action] ?? r.action}</td>
                      <td className="px-4 py-2 text-slate-500">{r.resource_type}{r.resource_id ? ` #${r.resource_id}` : ""}</td>
                      <td className="px-4 py-2 text-slate-500">{r.actor_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Resumo do mês ── */}
        {aba === "resumo" && resumo && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Eventos no mês", resumo.total_events],
                ["Acessos a prontuário", resumo.patient_accesses],
                ["Logins falhados", resumo.failed_logins],
                ["Eventos de segurança", resumo.security_events],
              ].map(([label, valor]) => (
                <div key={label as string} className="card p-4">
                  <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>{valor as number}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <div className="card p-5">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3 capitalize">
                Ações de {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </p>
              <div className="space-y-1.5">
                {Object.entries(resumo.action_breakdown as Record<string, number>)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 15)
                  .map(([action, n]) => (
                    <div key={action} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{ACTION_LABEL[action] ?? action}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedPageLayout>
  );
}
