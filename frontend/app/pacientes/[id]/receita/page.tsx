"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2, Printer } from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { prescriptionsApi, patientsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface Medication {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

const emptyMed = (): Medication => ({ name: "", dose: "", route: "", frequency: "", duration: "", instructions: "" });

export default function PrescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  const router = useRouter();

  const [patient, setPatient] = useState<any>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [medications, setMedications] = useState<Medication[]>([emptyMed()]);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([patientsApi.get(pid), prescriptionsApi.list(pid)])
      .then(([p, rx]) => { setPatient(p); setPrescriptions(rx); })
      .catch(() => toast.error("Erro ao carregar"));
  }, [pid]);

  const updateMed = (i: number, k: keyof Medication) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setMedications((ms) => ms.map((m, idx) => idx === i ? { ...m, [k]: e.target.value } : m));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) { toast.error("Adicione pelo menos um medicamento"); return; }
    setSaving(true);
    try {
      const newRx = await prescriptionsApi.create(pid, {
        date: new Date().toISOString().split("T")[0],
        medications: validMeds,
        instructions,
      });
      toast.success("Receita salva!");
      setPrescriptions((prev) => [newRx, ...prev]);
      setMedications([emptyMed()]);
      setInstructions("");
    } catch {
      toast.error("Erro ao salvar receita");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rxId: number) => {
    if (!confirm("Excluir esta receita?")) return;
    await prescriptionsApi.delete(pid, rxId);
    setPrescriptions((prev) => prev.filter((r) => r.id !== rxId));
    toast.success("Receita excluída");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar title="Receita Médica" subtitle={patient?.name} back={`/pacientes/${pid}`} />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Formulário de nova receita */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <h2 className="section-title">Nova Receita</h2>

          {medications.map((med, i) => (
            <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Medicamento {i + 1}</span>
                {medications.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setMedications((ms) => ms.filter((_, idx) => idx !== i))}
                    className="p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Nome do medicamento *</label>
                  <input className="input" placeholder="Ex: Nimesulida 100mg" value={med.name} onChange={updateMed(i, "name")} />
                </div>
                <div>
                  <label className="label">Dose</label>
                  <input className="input" placeholder="1 comprimido" value={med.dose} onChange={updateMed(i, "dose")} />
                </div>
                <div>
                  <label className="label">Via</label>
                  <input className="input" placeholder="Oral, tópica..." value={med.route} onChange={updateMed(i, "route")} />
                </div>
                <div>
                  <label className="label">Frequência</label>
                  <input className="input" placeholder="8/8h, 2x ao dia..." value={med.frequency} onChange={updateMed(i, "frequency")} />
                </div>
                <div>
                  <label className="label">Duração</label>
                  <input className="input" placeholder="7 dias, contínuo..." value={med.duration} onChange={updateMed(i, "duration")} />
                </div>
                <div className="col-span-2">
                  <label className="label">Observações</label>
                  <input className="input" placeholder="Tomar após as refeições..." value={med.instructions} onChange={updateMed(i, "instructions")} />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setMedications((ms) => [...ms, emptyMed()])}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Adicionar medicamento
          </button>

          <div>
            <label className="label">Orientações gerais</label>
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="Evitar álcool, repouso, retornar em caso de piora..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Salvando..." : "Salvar Receita"}
          </button>
        </form>

        {/* Histórico de receitas */}
        {prescriptions.length > 0 && (
          <div className="space-y-3">
            <h2 className="section-title">Receitas anteriores</h2>
            {prescriptions.map((rx) => (
              <div key={rx.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">{formatDate(rx.date)}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="p-1.5 text-gray-400 hover:text-brand-600 transition-colors"
                      title="Imprimir"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rx.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {rx.medications?.map((m: any, i: number) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">{i + 1}. {m.name}</span>
                      {m.dose && <span className="text-gray-500"> — {m.dose}</span>}
                      {m.frequency && <span className="text-gray-500">, {m.frequency}</span>}
                      {m.duration && <span className="text-gray-500">, {m.duration}</span>}
                    </div>
                  ))}
                </div>
                {rx.instructions && (
                  <p className="text-xs text-gray-500 border-t border-gray-50 pt-2">{rx.instructions}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
