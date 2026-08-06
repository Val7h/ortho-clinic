"use client";

/**
 * DashboardV2 — redesign aprovado 02/08 (mockup "proposta-v1").
 *
 * 4 faixas na ordem de decisão: HOJE (acionável) → o mês em 4 números →
 * POR CLÍNICA (o coração) → máquina de pacientes (funil do bot + recall).
 * Sem recharts: números, tabela e barras CSS — carrega instantâneo.
 * Regra: nenhum card de vaidade; todo número com comparação quando há base.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, PhoneCall, RefreshCw, X } from "lucide-react";
import { dashboardApi } from "@/lib/api";
import toast from "react-hot-toast";

function brl(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

const kpiCls = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4";
const bandCls = "text-[11px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500";

export function DashboardV2() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recallOpen, setRecallOpen] = useState(false);
  const [recall, setRecall] = useState<any[] | null>(null);

  const load = () => {
    setLoading(true);
    dashboardApi.v2()
      .then(setD)
      .catch(() => toast.error("Erro ao carregar o dashboard"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const abrirRecall = async () => {
    setRecallOpen(true);
    if (!recall) {
      try { setRecall(await dashboardApi.recall()); } catch { toast.error("Erro ao carregar a lista"); }
    }
  };

  // Enquanto carrega, mostra o ESQUELETO do painel (faixas e cards) em vez de
  // um bloco cinza — o Valth achou que a tela estava "em branco" (05/08).
  if (loading && !d) {
    return (
      <div className="space-y-6 animate-pulse">
        <div>
          <p className={`${bandCls} mb-2`}>Hoje · ação imediata</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map(i => <div key={i} className={`${kpiCls} h-20 bg-slate-50 dark:bg-slate-800/60`} />)}
          </div>
        </div>
        <div>
          <p className={`${bandCls} mb-2`}>O mês em 4 números</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className={`${kpiCls} h-24 bg-slate-50 dark:bg-slate-800/60`} />)}
          </div>
        </div>
        <div>
          <p className={`${bandCls} mb-2`}>Por clínica</p>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 h-44 bg-slate-50 dark:bg-slate-800/60" />
        </div>
        <p className="text-center text-xs text-slate-400">Carregando os números…</p>
      </div>
    );
  }
  if (!d) return null;

  const { hoje, mes, clinicas, funil_28d: funil, pacientes } = d;
  const varMes = mes.receita_mes_anterior > 0 ? (mes.receita - mes.receita_mes_anterior) / mes.receita_mes_anterior : null;
  const funilW = (n: number) => (funil.marcados > 0 ? Math.max(8, Math.round((n / funil.marcados) * 100)) : 0);

  return (
    <div className="space-y-6">
      {/* ══ SENTINELA: agendamento em dia que a clínica não abre (05/08) ══ */}
      {(d.alertas_agenda?.length ?? 0) > 0 && (
        <div className="rounded-2xl border-2 border-red-400 bg-red-50 dark:bg-red-950/30 p-4">
          <p className="text-sm font-extrabold text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Agendamento em dia que a clínica não atende
          </p>
          {d.alertas_agenda.map((a: any) => (
            <p key={a.appointment_id} className="text-sm text-red-800 dark:text-red-200 mt-1.5">
              <b>{a.paciente}</b> — {a.clinica}, {a.data.split('-').reverse().join('/')} às {a.hora}
              <span className="text-red-600 dark:text-red-400"> · {a.motivo}</span>
              {a.telefone ? <span className="text-red-500"> · {a.telefone}</span> : null}
            </p>
          ))}
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">
            Remarque na Agenda — o paciente iria à unidade errada.
          </p>
        </div>
      )}

      {/* ══ FAIXA 1 · HOJE ══ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className={bandCls}>Hoje · ação imediata</p>
          <button onClick={load} className="text-slate-300 hover:text-slate-500" aria-label="Atualizar">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={`${kpiCls} border-l-4 ${hoje.nao_confirmados_amanha.length ? "border-l-amber-500" : "border-l-emerald-500"}`}>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {hoje.nao_confirmados_amanha.length ? `⚠️ ${hoje.nao_confirmados_amanha.length} não confirmados amanhã` : "✓ Amanhã tudo confirmado"}
            </p>
            {hoje.nao_confirmados_amanha.slice(0, 3).map((p: any, i: number) => (
              <p key={i} className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {p.nome} · {p.clinica}{p.telefone ? ` · ${p.telefone}` : ""}
              </p>
            ))}
            {hoje.nao_confirmados_amanha.length > 3 && (
              <p className="text-xs text-slate-400 mt-0.5">+{hoje.nao_confirmados_amanha.length - 3} — lista pra secretária ligar</p>
            )}
          </div>
          <div className={`${kpiCls} border-l-4 ${hoje.cancelados_hoje ? "border-l-amber-500" : "border-l-emerald-500"}`}>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {hoje.pacientes_hoje} paciente{hoje.pacientes_hoje !== 1 ? "s" : ""} hoje
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {hoje.cancelados_hoje ? `🕳 ${hoje.cancelados_hoje} cancelamento${hoje.cancelados_hoje !== 1 ? "s" : ""} — vaga pra encaixe` : "nenhum cancelamento"}
            </p>
          </div>
          <div className={`${kpiCls} border-l-4 border-l-emerald-500`}>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">💰 Caixa do dia: {brl(hoje.caixa_dia)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hoje.pagamentos_dia} pagamento{hoje.pagamentos_dia !== 1 ? "s" : ""} registrado{hoje.pagamentos_dia !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* ══ FAIXA 2 · O MÊS EM 4 NÚMEROS ══ */}
      <div>
        <p className={`${bandCls} mb-2`}>O mês em 4 números</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={kpiCls}>
            <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-50" style={{ fontVariantNumeric: "tabular-nums" }}>{brl(mes.receita)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              receita do mês · projeção <b className="text-slate-700 dark:text-slate-200">{brl(mes.projecao)}</b>
            </p>
            <p className="text-[11px] font-bold mt-1">
              {varMes != null && (
                <span className={varMes >= 0 ? "text-emerald-600" : "text-red-500"}>
                  {varMes >= 0 ? "▲" : "▼"} {Math.abs(Math.round(varMes * 100))}% vs mês anterior
                </span>
              )}
              {mes.receita_pendente > 0 && <span className="text-slate-400 font-semibold"> · {brl(mes.receita_pendente)} a receber</span>}
            </p>
          </div>
          <div className={kpiCls}>
            <p className="text-2xl font-extrabold text-red-600" style={{ fontVariantNumeric: "tabular-nums" }}>{brl(mes.receita_perdida_faltas)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">perdidos com faltas ({mes.faltas} falta{mes.faltas !== 1 ? "s" : ""})</p>
            <p className="text-[11px] font-bold mt-1 text-slate-500">taxa de falta {pct(mes.taxa_falta)}</p>
          </div>
          <div className={kpiCls}>
            <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-50" style={{ fontVariantNumeric: "tabular-nums" }}>
              {brl(mes.ticket_particular)} <span className="text-sm text-slate-400 font-bold">×</span> {brl(mes.ticket_convenio)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ticket médio: particular × convênio</p>
            <p className="text-[11px] font-bold mt-1 text-slate-500">geral {brl(mes.ticket_geral)}</p>
          </div>
          <div className={kpiCls}>
            <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-50" style={{ fontVariantNumeric: "tabular-nums" }}>{pct(mes.ocupacao_media)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ocupação média dos turnos (28 dias)</p>
            {mes.ocupacao_media != null && (
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${Math.min(100, Math.round(mes.ocupacao_media * 100))}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ FAIXA 3 · POR CLÍNICA ══ */}
      <div>
        <p className={`${bandCls} mb-2`}>Por clínica · onde o dinheiro está (e onde vaza)</p>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-2.5 font-bold">Clínica</th>
                <th className="px-3 py-2.5 font-bold">Ocupação</th>
                <th className="px-3 py-2.5 font-bold">Faltas</th>
                <th className="px-3 py-2.5 font-bold">Atendidos</th>
                <th className="px-3 py-2.5 font-bold">Ticket</th>
                <th className="px-3 py-2.5 font-bold">Receita mês</th>
                <th className="px-3 py-2.5 font-bold">T. médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {clinicas.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                    <span className="inline-block w-2.5 h-2.5 rounded mr-2 align-middle" style={{ backgroundColor: c.color }} />
                    {c.nome}
                  </td>
                  <td className={`px-3 py-2.5 font-bold ${c.ocupacao == null ? "text-slate-300" : c.ocupacao >= 0.85 ? "text-emerald-600" : c.ocupacao < 0.6 ? "text-amber-600" : "text-slate-600 dark:text-slate-300"}`}>
                    {pct(c.ocupacao)}
                  </td>
                  <td className={`px-3 py-2.5 ${c.taxa_falta != null && c.taxa_falta > 0.15 ? "text-red-600 font-bold" : "text-slate-600 dark:text-slate-300"}`}>
                    {c.taxa_falta == null ? "—" : `${pct(c.taxa_falta)} (${c.faltas})`}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{c.atendidos_mes}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{c.ticket != null ? brl(c.ticket) : "—"}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100">{c.receita_mes ? brl(c.receita_mes) : "—"}</td>
                  <td className={`px-3 py-2.5 ${c.tempo_medio_min != null && c.slot_min && c.tempo_medio_min > c.slot_min ? "text-amber-600 font-bold" : "text-slate-600 dark:text-slate-300"}`}>
                    {c.tempo_medio_min != null ? `${c.tempo_medio_min} min` : "—"}
                    {c.slot_min ? <span className="text-slate-300"> /{c.slot_min}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          Receita/ticket por clínica vêm dos valores lançados na sala de espera; faltas = marcado que não compareceu nem cancelou.
        </p>
      </div>

      {/* ══ FAIXA 4 · MÁQUINA DE PACIENTES ══ */}
      <div>
        <p className={`${bandCls} mb-2`}>Máquina de pacientes</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={kpiCls}>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2.5">Funil do bot — últimas 4 semanas</p>
            <div className="space-y-1.5">
              <div className="h-7 rounded-lg bg-brand-600 text-white text-xs font-bold flex items-center px-3" style={{ width: "100%" }}>
                Marcados · {funil.marcados}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 rounded-lg bg-blue-500 text-white text-xs font-bold flex items-center px-3 whitespace-nowrap" style={{ width: `${funilW(funil.confirmados)}%` }}>
                  Confirmaram · {funil.confirmados}
                </div>
                <span className="text-xs font-semibold text-slate-400">{funil.marcados ? pct(funil.confirmados / funil.marcados) : "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 rounded-lg bg-emerald-500 text-white text-xs font-bold flex items-center px-3 whitespace-nowrap" style={{ width: `${funilW(funil.compareceram)}%` }}>
                  Compareceram · {funil.compareceram}
                </div>
                <span className="text-xs font-semibold text-slate-400">{funil.confirmados ? pct(funil.compareceram / funil.confirmados) : "—"}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2.5">
              {pacientes.novos_mes} paciente{pacientes.novos_mes !== 1 ? "s" : ""} novo{pacientes.novos_mes !== 1 ? "s" : ""} no mês · {pacientes.retornos_mes} retorno{pacientes.retornos_mes !== 1 ? "s" : ""} · {pacientes.folhetos_mes} folheto{pacientes.folhetos_mes !== 1 ? "s" : ""} de tratamento enviado{pacientes.folhetos_mes !== 1 ? "s" : ""}
            </p>
          </div>
          <div className={kpiCls}>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Crônicos sem retorno há 6+ meses</p>
            <p className="text-3xl font-extrabold text-slate-800 dark:text-slate-50 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
              {pacientes.recall_6m} <span className="text-sm font-semibold text-slate-400">paciente{pacientes.recall_6m !== 1 ? "s" : ""}</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              gonartrose, lombalgia, osteoporose… acompanhamento é indicação clínica — a lista é pra contato individual, nunca em massa.
            </p>
            <button
              onClick={abrirRecall}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-3.5 py-2"
            >
              <PhoneCall className="w-3.5 h-3.5" /> Ver lista pra secretária
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal recall ── */}
      {recallOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[85vh]">
            <div className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-50 text-sm">Crônicos sem retorno — lista de contato</p>
                <p className="text-xs text-slate-400 mt-0.5">Contato individual pela secretária (ligação ou mensagem 1 a 1)</p>
              </div>
              <button onClick={() => setRecallOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {!recall && <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-300" /></div>}
              {recall && recall.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">Nenhum crônico sumido — base em dia. 👏</p>
              )}
              {recall?.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{p.nome}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {p.telefone || "sem telefone"} · última consulta {p.ultima_consulta?.split("-").reverse().join("/")}
                    {(p.cids?.length ? ` · ${p.cids.map((c: string) => c.split("—")[0].trim()).join(", ")}` : p.condicoes ? ` · ${p.condicoes}` : "")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
