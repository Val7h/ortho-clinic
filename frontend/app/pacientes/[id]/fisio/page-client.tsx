"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Trash2, Printer } from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { physioApi, patientsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function PhysioPage() {
  const params = useParams();
  const id = params?.id as string;
  if (!id) return <div>Paciente não encontrado</div>;
  const pid = Number(id);
  const [patient, setPatient] = useState<any>(null);
  const [physioList, setPhysioList] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    diagnosis: "", cid10: "", sessions: "10", frequency: "3x por semana",
    goals: "", precautions: "", techniques: "", notes: "",
  });

  useEffect(() => {
    Promise.all([patientsApi.get(pid), physioApi.list(pid)])
      .then(([p, fi]) => { setPatient(p); setPhysioList(fi); })
      .catch(() => toast.error("Erro ao carregar"));
  }, [pid]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const newFi = await physioApi.create(pid, { ...form, sessions: Number(form.sessions), date: new Date().toISOString().split("T")[0] });
      toast.success("Encaminhamento salvo!");
      setPhysioList((prev) => [newFi, ...prev]);
      setForm({ diagnosis: "", cid10: "", sessions: "10", frequency: "3x por semana", goals: "", precautions: "", techniques: "", notes: "" });
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  };

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-100">
      <NavBar title="Encaminhamento de Fisioterapia" subtitle={patient?.name} back={`/pacientes/${pid}`} />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <h2 className="section-title">Novo Encaminhamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Diagnóstico</label>
              <input className="input" placeholder="Gonartrose, lombalgia..." value={form.diagnosis} onChange={set("diagnosis")} />
            </div>
            <div>
              <label className="label">CID-10</label>
              <input className="input" placeholder="M17.1" value={form.cid10} onChange={set("cid10")} />
            </div>
            <div>
              <label className="label">Número de sessões</label>
              <input type="number" min="1" max="60" className="input" value={form.sessions} onChange={set("sessions")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Frequência</label>
              <select className="input" value={form.frequency} onChange={set("frequency")}>
                <option>1x por semana</option>
                <option>2x por semana</option>
                <option>3x por semana</option>
                <option>4x por semana</option>
                <option>5x por semana (diário)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Objetivos</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Fortalecimento muscular, melhora da amplitude de movimento..." value={form.goals} onChange={set("goals")} />
          </div>
          <div>
            <label className="label">Técnicas sugeridas</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Eletroterapia, hidroterapia, RPG..." value={form.techniques} onChange={set("techniques")} />
          </div>
          <div>
            <label className="label">Precauções / contraindicações</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Evitar impacto, não realizar certos movimentos..." value={form.precautions} onChange={set("precautions")} />
          </div>
          <div>
            <label className="label">Observações adicionais</label>
            <textarea className="input min-h-[80px] resize-none" value={form.notes} onChange={set("notes")} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Salvando..." : "Salvar Encaminhamento"}
          </button>
        </form>

        {physioList.length > 0 && (
          <div className="space-y-3">
            <h2 className="section-title">Encaminhamentos anteriores</h2>
            {physioList.map((fi) => (
              <div key={fi.id} className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">{formatDate(fi.date)}</span>
                  <div className="flex gap-1">
                    <button onClick={() => window.print()} className="p-1.5 text-gray-400 hover:text-brand-600"><Printer className="w-4 h-4" /></button>
                    <button onClick={async () => {
                      await physioApi.delete(pid, fi.id);
                      setPhysioList((p) => p.filter((f) => f.id !== fi.id));
                      toast.success("Excluído");
                    }} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <p className="text-sm font-medium">{fi.diagnosis} {fi.cid10 && <span className="text-gray-400 text-xs">({fi.cid10})</span>}</p>
                <p className="text-xs text-gray-600">{fi.sessions} sessões — {fi.frequency}</p>
                {fi.goals && <p className="text-xs text-gray-500">Objetivos: {fi.goals}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </PageWithSidebar>
  );
}
