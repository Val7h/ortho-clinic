"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ClipboardList, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { anamnesisApi } from "@/lib/api";

const PAIN_COLORS = [
  "bg-green-500","bg-green-400","bg-lime-400","bg-yellow-300",
  "bg-yellow-400","bg-orange-300","bg-orange-400","bg-orange-500",
  "bg-red-400","bg-red-500","bg-red-600",
];

export default function AnamnesePage() {
  const { token } = useParams<{ token: string }>();

  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [painScale, setPainScale] = useState<number | null>(null);
  const [form, setForm] = useState({
    chief_complaint: "",
    symptom_duration: "",
    pain_location: "",
    aggravating_factors: "",
    relieving_factors: "",
    previous_treatments: "",
    current_medications: "",
    allergies: "",
    surgeries_history: "",
    chronic_conditions: "",
    additional_notes: "",
  });

  useEffect(() => {
    anamnesisApi.getPublic(token)
      .then((data) => {
        setInfo(data);
        if (data.status === "filled") setSubmitted(true);
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 410) setError("Este link expirou. Solicite um novo link ao consultório.");
        else if (status === 404) setError("Formulário não encontrado.");
        else setError("Erro ao carregar o formulário. Tente novamente.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.chief_complaint.trim()) {
      alert("Por favor, descreva sua queixa principal.");
      return;
    }
    setSaving(true);
    try {
      await anamnesisApi.fillPublic(token, {
        ...form,
        pain_scale: painScale,
      });
      setSubmitted(true);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 410) setError("Este link expirou.");
      else alert("Erro ao enviar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Formulário indisponível</h1>
        <p className="text-gray-500">{error}</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Enviado com sucesso!</h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          Suas informações foram recebidas. Apresente este formulário ao médico na consulta.
        </p>
        {info?.patient_name && (
          <p className="text-sm font-semibold text-brand-600 bg-brand-50 rounded-xl px-4 py-2 inline-block">
            {info.patient_name}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}
        className="px-5 py-6 text-white">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Anamnese Pré-Consulta</h1>
            {info?.patient_name && (
              <p className="text-blue-200/80 text-sm">{info.patient_name}</p>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <p className="font-medium mb-1">📋 Questionário de saúde</p>
          <p className="text-blue-600/80 text-xs">
            Preencha este formulário antes da sua consulta. As informações serão revisadas pelo médico.
          </p>
        </div>

        {/* Queixa principal */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-bold text-gray-900 text-base border-b border-gray-100 pb-3">
            Motivo da Consulta
          </h2>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Queixa principal <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
              rows={3}
              placeholder="Descreva o principal motivo da sua consulta..."
              value={form.chief_complaint}
              onChange={set("chief_complaint")}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Localização da dor / desconforto
            </label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              placeholder="Ex: joelho direito, costas, ombro esquerdo..."
              value={form.pain_location}
              onChange={set("pain_location")}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Há quanto tempo?
            </label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              placeholder="Ex: 2 semanas, 3 meses, desde 2023..."
              value={form.symptom_duration}
              onChange={set("symptom_duration")}
            />
          </div>

          {/* Escala de dor */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Intensidade da dor — {painScale !== null ? painScale + "/10" : "não avaliado"}
            </label>
            <div className="flex gap-1.5">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPainScale(i)}
                  className={`flex-1 h-10 rounded-lg text-xs font-bold text-white transition-all ${PAIN_COLORS[i]} ${
                    painScale === i ? "ring-2 ring-gray-800 ring-offset-1 scale-110" : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>Sem dor</span>
              <span>Dor máxima</span>
            </div>
          </div>
        </div>

        {/* Fatores */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-bold text-gray-900 text-base border-b border-gray-100 pb-3">
            Fatores e Tratamentos
          </h2>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              O que piora a dor?
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
              rows={2}
              placeholder="Movimento, esforço, frio, posição..."
              value={form.aggravating_factors}
              onChange={set("aggravating_factors")}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              O que melhora a dor?
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
              rows={2}
              placeholder="Repouso, analgésicos, gelo, calor..."
              value={form.relieving_factors}
              onChange={set("relieving_factors")}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Tratamentos já realizados para este problema
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
              rows={2}
              placeholder="Fisioterapia, cirurgias anteriores, medicamentos usados..."
              value={form.previous_treatments}
              onChange={set("previous_treatments")}
            />
          </div>
        </div>

        {/* Histórico médico */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-bold text-gray-900 text-base border-b border-gray-100 pb-3">
            Histórico Médico
          </h2>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Medicamentos em uso
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
              rows={2}
              placeholder="Liste todos os medicamentos que toma atualmente..."
              value={form.current_medications}
              onChange={set("current_medications")}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Alergias
            </label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              placeholder="Medicamentos, alimentos, látex... (ou 'nenhuma')"
              value={form.allergies}
              onChange={set("allergies")}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Cirurgias anteriores
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
              rows={2}
              placeholder="Descreva cirurgias que já realizou e quando..."
              value={form.surgeries_history}
              onChange={set("surgeries_history")}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Doenças crônicas / condições de saúde
            </label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              placeholder="Diabetes, hipertensão, artrite, osteoporose..."
              value={form.chronic_conditions}
              onChange={set("chronic_conditions")}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Observações adicionais
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
              rows={3}
              placeholder="Qualquer informação adicional que queira compartilhar com o médico..."
              value={form.additional_notes}
              onChange={set("additional_notes")}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 text-base shadow-lg shadow-brand-500/30"
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</>
          ) : (
            <><CheckCircle className="w-5 h-5" /> Enviar Anamnese</>
          )}
        </button>

        <p className="text-center text-xs text-gray-400 pb-6">
          Suas informações são confidenciais e serão acessadas apenas pela equipe médica.
        </p>
      </form>
    </div>
  );
}
