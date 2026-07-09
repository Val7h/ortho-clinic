"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Printer } from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { examsApi, patientsApi } from "@/lib/api";
import { formatDate, resolveDynamicParam } from "@/lib/utils";

interface ExamItem { name: string; laterality: string; notes: string; }
const emptyExam = (): ExamItem => ({ name: "", laterality: "", notes: "" });

const COMMON_EXAMS = [
  "Raio-X coluna lombar (AP e perfil)",
  "Raio-X joelho direito (AP, perfil e axial)",
  "Raio-X joelho esquerdo (AP, perfil e axial)",
  "Raio-X ombro direito (AP e perfil Y)",
  "Ressonância magnética coluna lombar",
  "Ressonância magnética joelho direito",
  "Ressonância magnética joelho esquerdo",
  "Ressonância magnética ombro direito",
  "Tomografia computadorizada coluna lombar",
  "Eletroneuromiografia membros inferiores",
  "Densitometria óssea",
  "Hemograma completo",
  "PCR e VHS",
  "Ácido úrico",
  "Fator Reumatoide",
];

export default function ExamsPage() {
  const params = useParams();
  const id = resolveDynamicParam(params?.id as string);
  if (!id) return <div>Paciente não encontrado</div>;
  const pid = Number(id);
  const [patient, setPatient] = useState<any>(null);
  const [exams, setExams] = useState<any[]>([]);
  const [items, setItems] = useState<ExamItem[]>([emptyExam()]);
  const [indication, setIndication] = useState("");
  const [urgency, setUrgency] = useState("eletivo");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([patientsApi.get(pid), examsApi.list(pid)])
      .then(([p, e]) => { setPatient(p); setExams(e); })
      .catch(() => toast.error("Erro ao carregar"));
  }, [pid]);

  const addCommon = (name: string) => {
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (last.name === "") return prev.map((it, i) => i === prev.length - 1 ? { ...it, name } : it);
      return [...prev, { name, laterality: "", notes: "" }];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = items.filter((it) => it.name.trim());
    if (valid.length === 0) { toast.error("Adicione pelo menos um exame"); return; }
    setSaving(true);
    try {
      const newEx = await examsApi.create(pid, {
        date: new Date().toISOString().split("T")[0],
        exams: valid,
        clinical_indication: indication,
        urgency,
      });
      toast.success("Solicitação salva!");
      setExams((prev) => [newEx, ...prev]);
      setItems([emptyExam()]);
      setIndication("");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-100">
      <NavBar title="Solicitação de Exames" subtitle={patient?.name} back={`/pacientes/${pid}`} />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <h2 className="section-title">Nova Solicitação</h2>

          {/* Exames comuns (atalhos) */}
          <div>
            <label className="label">Exames frequentes (clique para adicionar)</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {COMMON_EXAMS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => addCommon(ex)}
                  className="text-xs px-3 py-1.5 rounded-full border border-brand-200 text-brand-700 hover:bg-brand-50 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de exames */}
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="label">Exame *</label>
                  <input className="input" placeholder="Nome do exame" value={item.name}
                    onChange={(e) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, name: e.target.value } : it))} />
                </div>
                <div>
                  <label className="label">Lateralidade</label>
                  <select className="input"
                    onChange={(e) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, laterality: e.target.value } : it))}>
                    <option value="">—</option>
                    <option>Direito</option>
                    <option>Esquerdo</option>
                    <option>Bilateral</option>
                  </select>
                </div>
              </div>
              {items.length > 1 && (
                <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                  className="p-2 text-red-400 hover:text-red-600 mb-0.5">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          <button type="button" onClick={() => setItems((p) => [...p, emptyExam()])}
            className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Adicionar exame
          </button>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Urgência</label>
              <select className="input" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="eletivo">Eletivo</option>
                <option value="urgente">Urgente</option>
                <option value="emergencia">Emergência</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Indicação clínica</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="CID, diagnóstico, motivo..."
              value={indication} onChange={(e) => setIndication(e.target.value)} />
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Salvando..." : "Salvar Solicitação"}
          </button>
        </form>

        {exams.length > 0 && (
          <div className="space-y-3">
            <h2 className="section-title">Solicitações anteriores</h2>
            {exams.map((ex) => (
              <div key={ex.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-semibold text-gray-700">{formatDate(ex.date)}</span>
                    <span className={`ml-2 badge ${ex.urgency === "urgente" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                      {ex.urgency}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => window.print()} className="p-1.5 text-gray-400 hover:text-brand-600"><Printer className="w-4 h-4" /></button>
                    <button onClick={async () => {
                      await examsApi.delete(pid, ex.id);
                      setExams((p) => p.filter((e) => e.id !== ex.id));
                      toast.success("Excluído");
                    }} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {ex.exams?.map((e: any, i: number) => (
                    <p key={i} className="text-sm">
                      {i + 1}. {e.name}{e.laterality ? ` — ${e.laterality}` : ""}
                    </p>
                  ))}
                </div>
                {ex.clinical_indication && (
                  <p className="text-xs text-gray-500 mt-2 border-t border-gray-50 pt-2">
                    Indicação: {ex.clinical_indication}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </PageWithSidebar>
  );
}
