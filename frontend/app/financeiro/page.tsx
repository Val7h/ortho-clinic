'use client';

import { useEffect, useState, useRef } from 'react';
import {
  DollarSign,
  Plus,
  Trash2,
  CreditCard,
  Smartphone,
  Banknote,
  Gift,
  ChevronDown,
} from 'lucide-react';
import NavBar from '@/components/NavBar';
import { financialApi, patientsApi } from '@/lib/api';
import { useProtectedPage } from '@/components/AuthProvider';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal, useModal } from '@/components/ui/Modal';

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
  const { open: showForm, onOpenChange: setShowForm } = useModal();
  const firstInputRef = useRef<HTMLSelectElement>(null);
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [summary, setSummary] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
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

  // Auto-focus first input when modal opens
  useEffect(() => {
    if (showForm && firstInputRef.current) {
      // Use setTimeout to ensure modal is rendered before focusing
      setTimeout(() => firstInputRef.current?.focus(), 0);
    }
  }, [showForm]);

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
    <div className="min-h-screen bg-slate-50">
      <NavBar
        title="Financeiro"
        subtitle="Controle de pagamentos"
        back="/"
        actions={
          <Button size="md" icon={<Plus className="h-5 w-5" />} onClick={() => setShowForm(true)}>
            Registrar
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {/* Month navigator */}
        <Card shadow="sm">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={prevMonth}
              className="rounded-lg p-2 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              aria-label="Mês anterior"
            >
              <ChevronDown className="h-5 w-5 rotate-90 text-slate-500" />
            </button>
            <span className="text-lg font-bold text-slate-900">
              {MONTHS_PT[month - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="rounded-lg p-2 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              aria-label="Próximo mês"
            >
              <ChevronDown className="h-5 w-5 -rotate-90 text-slate-500" />
            </button>
          </div>
        </Card>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card shadow="sm">
              <div className="border-l-4 border-success-400 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600">Mês</p>
                <p className="leading-tight text-2xl font-bold text-success-600">
                  {formatBRL(summary.total_month)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {summary.count_month} pagto{summary.count_month !== 1 ? 's' : ''}
                </p>
              </div>
            </Card>
            <Card shadow="sm">
              <div className="border-l-4 border-brand-400 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600">No ano</p>
                <p className="leading-tight text-2xl font-bold text-brand-600">
                  {formatBRL(summary.total_ytd)}
                </p>
                <p className="mt-1 text-xs text-slate-600">{year}</p>
              </div>
            </Card>
            <Card shadow="sm">
              <div className="border-l-4 border-warning-400 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600">Pendente</p>
                <p className="leading-tight text-2xl font-bold text-warning-600">
                  {formatBRL(summary.pending)}
                </p>
                <p className="mt-1 text-xs text-slate-600">a receber</p>
              </div>
            </Card>
          </div>
        )}

        {/* By method */}
        {summary && Object.keys(summary.by_method || {}).length > 0 && (
          <Card shadow="sm">
            <div className="p-6">
              <p className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">Por forma de pagamento</p>
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
          </Card>
        )}

        {/* Monthly bar chart */}
        {summary?.monthly_totals && Object.keys(summary.monthly_totals).length > 0 && (
          <Card shadow="sm">
            <div className="p-6">
              <p className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">
                Faturamento mensal ({year})
              </p>
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
          </Card>
        )}

        {/* Records list */}
        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">
            Registros — {MONTHS_PT[month - 1]} {year}
          </h3>
          {records.length === 0 ? (
            <Card shadow="sm">
              <div className="space-y-4 py-12 text-center">
                <DollarSign className="mx-auto h-10 w-10 text-slate-200" />
                <p className="text-sm text-slate-600">Nenhum pagamento registrado</p>
                <Button variant="primary" onClick={() => setShowForm(true)}>
                  Registrar pagamento
                </Button>
              </div>
            </Card>
          ) : (
            <Card shadow="sm">
              <div className="divide-y divide-slate-100">
              {records.map((r) => {
                const m = METHODS[r.payment_method] || { label: r.payment_method, icon: DollarSign, color: "text-gray-600 bg-gray-50" };
                const Icon = m.icon;
                return (
                  <div key={r.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-brand-50">
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${m.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {patients.find((p) => p.id === r.patient_id)?.name || `Paciente #${r.patient_id}`}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-600">
                        {m.label} · {formatDate(r.date)}{r.description ? ` · ${r.description}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-success-600">{formatBRL(r.amount)}</p>
                        {r.status !== 'paid' && (
                          <Badge variant="warning" size="sm" className="mt-1">
                            {r.status === 'pending' ? 'Pendente' : r.status}
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-error-50 hover:text-error-600 focus:outline-none focus:ring-2 focus:ring-error-500 focus:ring-offset-2"
                        aria-label={`Remover pagamento de ${patients.find((p) => p.id === r.patient_id)?.name || `Paciente #${r.patient_id}`}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            </Card>
          )}
        </div>

      </main>

      {/* Form modal */}
      <Modal
        open={showForm}
        onOpenChange={setShowForm}
        title="Registrar Pagamento"
        size="md"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              fullWidth
              isLoading={saving}
              onClick={() => {
                const form_el = document.querySelector('form[data-financeiro-form]') as HTMLFormElement;
                if (form_el) form_el.dispatchEvent(new Event('submit', { bubbles: true }));
              }}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} data-financeiro-form className="space-y-5">
          <Select
            ref={firstInputRef}
            label="Paciente"
            options={patients.map((p) => ({ value: p.id, label: p.name }))}
            value={form.patient_id}
            onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="number"
              label="Valor (R$)"
              step="0.01"
              min="0"
              placeholder="150,00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
            <Input
              type="date"
              label="Data"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900">Forma de pagamento</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(METHODS).map(([key, m]) => {
                const Icon = m.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, payment_method: key }))}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-2.5 text-center text-xs font-medium transition-all ${
                      form.payment_method === key
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-600 hover:border-brand-300'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            label="Descrição (opcional)"
            placeholder="Ex: Consulta inicial, Infiltração..."
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />

          <Select
            label="Status"
            options={[
              { value: 'paid', label: 'Pago' },
              { value: 'pending', label: 'Pendente' },
            ]}
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          />
        </form>
      </Modal>
    </div>
  );
}
