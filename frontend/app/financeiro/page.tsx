"use client";
import { useEffect, useState } from "react";
import {
  DollarSign, Plus, Trash2, TrendingUp, CreditCard,
  Wallet, Smartphone, Banknote, Gift, ChevronDown, X,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { financialApi, patientsApi } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";
import toast from "react-hot-toast";

const METHODS: Record<string, { label: string; icon: any; color: string }> = {
  pix: { label: "Pix", icon: Smartphone, color: "text-teal-600 bg-teal-50" },
  dinheiro: { label: "Dinheiro", icon: Banknote, color: "text-green-600 bg-green-50" },
  cartao_credito: { label: "Crédito", icon: CreditCard, color: "text-blue-600 bg-blue-50" },
  cartao_debito: { label: "Débito", icon: CreditCard, color: "text-indigo-600 bg-indigo-50" },
  cortesia: { label: "Cortesia", icon: Gift, color: "text-rose-600 bg-rose-50" },
};

const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function FinanceiroPage() {
  const { user } = useProtectedPage();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [summary, setSummary] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    patient_id: "",
    amount: "",
    payment_method: "pix",
    description: "",
    status: "paid",
    date: today.toISOString().slice(0, 10),
    notes: "",
  });

  const load = () => {
    financialApi.summary({ month, year }).then(setSummary).catch(() => {});
    financialApi.list({ month, year }).then(setRecords).catch(() => {});
  };

  useEffect(() => { load(); }, [month, year]);
  useEffect(() => {
    patientsApi.list().then(setPatients).catch(() => {});
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Remover este registro?")) return;
    await financialApi.delete(id);
    toast.success("Registro removido");
    load();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id || !form.amount) {
      toast.error("Preencha paciente e valor");
      return;
    }
    setSaving(true);
    try {
      await financialApi.create({
        ...form,
        patient_id: Number(form.patient_id),
        amount: parseFloat(form.amount.replace(",", ".")),
      });
      toast.success("Pagamento registrado!");
      setShowForm(false);
      setForm({ patient_id: "", amount: "", payment_method: "pix", description: "", status: "paid", date: today.toISOString().slice(0, 10), notes: "" });
      load();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar
        title="Financeiro"
        subtitle="Controle de pagamentos particulares"
        back="/"
        actions={
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Registrar
          </button>
        }
      />

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">

        {/* Month navigator */}
        <div className="flex items-center justify-between bg-white rounded-2xl px-5 py-3 border border-gray-100 shadow-sm">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronDown className="w-4 h-4 text-slate-500 rotate-90" />
          </button>
          <span className="font-bold text-slate-700 text-base">
            {MONTHS_PT[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronDown className="w-4 h-4 text-slate-500 -rotate-90" />
          </button>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 border-l-4 border-emerald-400">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Mês</p>
              <p className="text-xl font-extrabold text-emerald-600 leading-tight">{formatBRL(summary.total_month)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{summary.count_month} pgto{summary.count_month !== 1 ? "s" : ""}</p>
            </div>
            <div className="card p-4 border-l-4 border-brand-400">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">No ano</p>
              <p className="text-xl font-extrabold text-brand-600 leading-tight">{formatBRL(summary.total_ytd)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{year}</p>
            </div>
            <div className="card p-4 border-l-4 border-amber-400">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Pendente</p>
              <p className="text-xl font-extrabold text-amber-600 leading-tight">{formatBRL(summary.pending)}</p>
              <p className="text-xs text-slate-400 mt-0.5">a receber</p>
            </div>
          </div>
        )}

        {/* By method */}
        {summary && Object.keys(summary.by_method || {}).length > 0 && (
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por forma de pagamento</p>
            <div className="space-y-2.5">
              {Object.entries(summary.by_method as Record<string, number>).map(([method, total]) => {
                const m = METHODS[method] || { label: method, icon: DollarSign, color: "text-gray-600 bg-gray-50" };
                const Icon = m.icon;
                const pct = summary.total_month > 0 ? (total / summary.total_month) * 100 : 0;
                return (
                  <div key={method} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${m.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-slate-700">{m.label}</span>
                        <span className="text-sm font-bold text-slate-800">{formatBRL(total)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Monthly bar chart */}
        {summary?.monthly_totals && Object.keys(summary.monthly_totals).length > 0 && (
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Faturamento mensal ({year})</p>
            <div className="flex items-end gap-1 h-24">
              {Array.from({ length: 12 }, (_, i) => {
                const m = String(i + 1);
                const val = (summary.monthly_totals as Record<string, number>)[m] || 0;
                const max = Math.max(...Object.values(summary.monthly_totals as Record<string, number>), 1);
                const pct = (val / max) * 100;
                const isCurrentMonth = (i + 1) === month;
                return (
                  <div key={m} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: "80px" }}>
                      <div
                        className={`w-full rounded-t-lg transition-all ${isCurrentMonth ? "bg-brand-500" : "bg-slate-200"}`}
                        style={{ height: `${Math.max(pct, val > 0 ? 4 : 0)}%` }}
                        title={formatBRL(val)}
                      />
                    </div>
                    <span className={`text-[9px] font-medium ${isCurrentMonth ? "text-brand-600" : "text-slate-400"}`}>
                      {MONTHS_PT[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Records list */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Registros — {MONTHS_PT[month - 1]} {year}
          </p>
          {records.length === 0 ? (
            <div className="card p-10 text-center">
              <DollarSign className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Nenhum pagamento registrado</p>
              <button onClick={() => setShowForm(true)} className="btn-primary mt-4 text-sm">
                Registrar pagamento
              </button>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-100">
              {records.map((r) => {
                const m = METHODS[r.payment_method] || { label: r.payment_method, icon: DollarSign, color: "text-gray-600 bg-gray-50" };
                const Icon = m.icon;
                return (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${m.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {patients.find((p) => p.id === r.patient_id)?.name || `Paciente #${r.patient_id}`}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {m.label} · {formatDate(r.date)}{r.description ? ` · ${r.description}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-600">{formatBRL(r.amount)}</p>
                        {r.status !== "paid" && (
                          <p className="text-xs text-amber-600 font-medium capitalize">{r.status}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Registrar Pagamento</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="label">Paciente</label>
                <select
                  className="input"
                  value={form.patient_id}
                  onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
                  required
                >
                  <option value="">Selecionar paciente...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Valor (R$)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="150,00"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="label">Data</label>
                  <input
                    className="input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label">Forma de pagamento</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(METHODS).map(([key, m]) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, payment_method: key }))}
                        className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border text-xs font-medium transition-all ${
                          form.payment_method === key
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-gray-200 text-gray-600 hover:border-brand-300"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">Descrição (opcional)</label>
                <input
                  className="input"
                  placeholder="Ex: Consulta inicial, Infiltração..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="paid">Pago</option>
                  <option value="pending">Pendente</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
