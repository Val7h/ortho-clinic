"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Trash2, Printer } from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { reportsApi, patientsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const REPORT_TYPES = [
  "Atestado Médico",
  "Atestado para Condução de Veículos",
  "Laudo Médico",
  "Declaração de Comparecimento",
  "Relatório Médico",
  "Laudo para INSS/Perícia",
  "Laudo para Seguro",
  "Laudo para Plano de Saúde",
];

const TEMPLATES: Record<string, string> = {
  "Atestado Médico": "Atesto que o(a) paciente [NOME], portador(a) de [CID/DIAGNÓSTICO], necessita de afastamento de suas atividades pelo período de [X] dias, contados desta data.",
  "Declaração de Comparecimento": "Declaro que o(a) paciente [NOME] compareceu a esta clínica em consulta médica na data de hoje, das [HORA] às [HORA].",
  "Relatório Médico": "Paciente [NOME], [IDADE], em acompanhamento neste serviço de ortopedia.\n\nDiagnóstico: [DIAGNÓSTICO]\n\nEvolução: [EVOLUÇÃO DO QUADRO]\n\nConduta: [CONDUTA ATUAL]\n\nPrognóstico: [PROGNÓSTICO]",
};

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  const [patient, setPatient] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ report_type: "Atestado Médico", title: "", content: "", purpose: "" });

  useEffect(() => {
    Promise.all([patientsApi.get(pid), reportsApi.list(pid)])
      .then(([p, r]) => { setPatient(p); setReports(r); })
      .catch(() => toast.error("Erro ao carregar"));
  }, [pid]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const applyTemplate = (type: string) => {
    const tmpl = TEMPLATES[type];
    if (tmpl && !form.content) setForm((f) => ({ ...f, content: tmpl }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content.trim()) { toast.error("Conteúdo obrigatório"); return; }
    setSaving(true);
    try {
      const newR = await reportsApi.create(pid, { ...form, date: new Date().toISOString().split("T")[0] });
      toast.success("Laudo salvo!");
      setReports((prev) => [newR, ...prev]);
      setForm({ report_type: "Atestado Médico", title: "", content: "", purpose: "" });
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar title="Laudos e Atestados" subtitle={patient?.name} back={`/pacientes/${pid}`} />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <h2 className="section-title">Novo Documento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo de documento</label>
              <select className="input" value={form.report_type}
                onChange={(e) => { set("report_type")(e); applyTemplate(e.target.value); }}>
                {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Título / descrição</label>
              <input className="input" placeholder="Opcional" value={form.title} onChange={set("title")} />
            </div>
          </div>
          <div>
            <label className="label">Finalidade</label>
            <input className="input" placeholder="Ex: Para fins previdenciários, afastamento do trabalho..." value={form.purpose} onChange={set("purpose")} />
          </div>
          <div>
            <label className="label">Conteúdo *</label>
            <textarea
              className="input min-h-[200px] resize-none font-mono text-sm"
              placeholder="Texto do documento..."
              value={form.content}
              onChange={set("content")}
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Salvando..." : "Salvar Documento"}
          </button>
        </form>

        {reports.length > 0 && (
          <div className="space-y-3">
            <h2 className="section-title">Documentos anteriores</h2>
            {reports.map((r) => (
              <div key={r.id} className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-gray-700">{r.title || r.report_type}</span>
                    <span className="ml-2 text-xs text-gray-400">{formatDate(r.date)}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => window.print()} className="p-1.5 text-gray-400 hover:text-brand-600"><Printer className="w-4 h-4" /></button>
                    <button onClick={async () => {
                      await reportsApi.delete(pid, r.id);
                      setReports((p) => p.filter((rr) => rr.id !== r.id));
                      toast.success("Excluído");
                    }} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-line">{r.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
