"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { consultationsApi, patientsApi } from "@/lib/api";

const PAIN_SCALE = Array.from({ length: 11 }, (_, i) => i);
const PAIN_COLORS = [
  "bg-green-500", "bg-green-400", "bg-lime-400", "bg-yellow-300",
  "bg-yellow-400", "bg-orange-300", "bg-orange-400", "bg-orange-500",
  "bg-red-400", "bg-red-500", "bg-red-600",
];

export default function ConsultationPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  const router = useRouter();

  const [patient, setPatient] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [painScale, setPainScale] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    date: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    patientsApi.get(pid).then(setPatient).catch(() => toast.error("Erro ao carregar paciente"));
  }, [pid]);

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await consultationsApi.create(pid, {
        ...form,
        pain_scale: painScale,
        date: new Date(form.date).toISOString(),
      });
      toast.success("Consulta salva com sucesso!");
      router.push(`/pacientes/${pid}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar consulta");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar
        title="Registro de Consulta"
        subtitle={patient?.name}
        back={`/pacientes/${pid}`}
      />

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Data e tipo */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Identificação da Consulta</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Data e hora</label>
              <input type="datetime-local" className="input" value={form.date} onChange={set("date")} />
            </div>
            <div>
              <label className="label">Tipo de consulta</label>
              <select className="input" onChange={set("type")}>
                <option value="retorno">Retorno</option>
                <option value="primeira_consulta">1ª Consulta</option>
                <option value="urgencia">Urgência</option>
                <option value="procedimento">Procedimento</option>
                <option value="teleconsulta">Teleconsulta</option>
              </select>
            </div>
          </div>
        </section>

        {/* Queixa principal */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Queixa e História</h2>
          <div>
            <label className="label">Queixa principal</label>
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="Descreva o motivo da consulta..."
              onChange={set("chief_complaint")}
            />
          </div>
          <div>
            <label className="label">História da doença atual</label>
            <textarea
              className="input min-h-[100px] resize-none"
              placeholder="Início, evolução, fatores de melhora e piora..."
              onChange={set("history_of_illness")}
            />
          </div>
          <div>
            <label className="label">Localização da dor</label>
            <input className="input" placeholder="Ex: Joelho direito, lombar bilateral..." onChange={set("pain_location")} />
          </div>
          <div>
            <label className="label">Duração dos sintomas</label>
            <input className="input" placeholder="Ex: 3 meses, desde 2023..." onChange={set("symptom_duration")} />
          </div>

          {/* Escala de dor visual */}
          <div>
            <label className="label">Escala de dor (EVA) — {painScale !== null ? painScale : "não avaliado"}</label>
            <div className="flex gap-1.5 mt-2">
              {PAIN_SCALE.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPainScale(n)}
                  className={`flex-1 h-10 rounded-lg text-xs font-bold text-white transition-all ${PAIN_COLORS[n]} ${
                    painScale === n ? "ring-2 ring-gray-800 ring-offset-1 scale-110" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Sem dor</span>
              <span>Dor máxima</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Fatores de piora</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Movimento, clima, esforço..." onChange={set("aggravating_factors")} />
            </div>
            <div>
              <label className="label">Fatores de melhora</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Repouso, analgésicos..." onChange={set("relieving_factors")} />
            </div>
          </div>
          <div>
            <label className="label">Tratamentos anteriores</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Fisioterapia, cirurgias, medicamentos..." onChange={set("previous_treatments")} />
          </div>
        </section>

        {/* Exame físico */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Exame Físico</h2>
          <div>
            <label className="label">Exame físico geral</label>
            <textarea className="input min-h-[100px] resize-none" placeholder="Inspeção, palpação, testes..." onChange={set("physical_exam")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Amplitude de movimento</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Flexão, extensão, rotação..." onChange={set("range_of_motion")} />
            </div>
            <div>
              <label className="label">Testes especiais</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Lachman, McMurray, Spurling..." onChange={set("special_tests")} />
            </div>
          </div>
          <div>
            <label className="label">Achados de imagem</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="RX, RM, TC já realizados..." onChange={set("imaging_findings")} />
          </div>
          <div>
            <label className="label">Sinais vitais</label>
            <input className="input" placeholder="PA, FC, SpO2, peso..." onChange={set("vital_signs")} />
          </div>
        </section>

        {/* Diagnóstico e conduta */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Diagnóstico e Conduta</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Diagnóstico</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Hipótese diagnóstica..." onChange={set("diagnosis")} />
            </div>
            <div>
              <label className="label">CID-10</label>
              <input className="input" placeholder="M17.1, M51.1..." onChange={set("cid10")} />
            </div>
          </div>
          <div>
            <label className="label">Plano de tratamento</label>
            <textarea className="input min-h-[100px] resize-none" placeholder="Medicamentos, fisioterapia, cirurgia, orientações..." onChange={set("treatment_plan")} />
          </div>
          <div>
            <label className="label">Evolução (para retornos)</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Como o paciente evoluiu desde a última consulta..." onChange={set("evolution")} />
          </div>
          <div>
            <label className="label">Procedimento realizado</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Infiltração, bloqueio, curativo..." onChange={set("procedure_performed")} />
          </div>
        </section>

        {/* Retorno */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Retorno e Observações</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Data do próximo retorno</label>
              <input type="date" className="input" onChange={set("next_appointment")} />
            </div>
            <div>
              <label className="label">Observações do retorno</label>
              <input className="input" placeholder="Ex: Trazer exames de imagem..." onChange={set("next_appointment_notes")} />
            </div>
          </div>
          <div>
            <label className="label">Notas privadas (não aparecem no prontuário)</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Anotações pessoais do médico..." onChange={set("doctor_private_notes")} />
          </div>
        </section>

        <div className="flex gap-3 pb-8">
          <button type="button" onClick={() => router.back()} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "Salvando..." : "Salvar Consulta"}
          </button>
        </div>
      </form>
    </div>
  );
}
