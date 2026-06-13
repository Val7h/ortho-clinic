"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Video, Upload, X, Image as ImageIcon, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import CidSearch from "@/components/CidSearch";
import { consultationsApi, patientsApi, mediaApi } from "@/lib/api";

const PAIN_SCALE = Array.from({ length: 11 }, (_, i) => i);
const PAIN_COLORS = [
  "bg-green-500","bg-green-400","bg-lime-400","bg-yellow-300",
  "bg-yellow-400","bg-orange-300","bg-orange-400","bg-orange-500",
  "bg-red-400","bg-red-500","bg-red-600",
];

const MEDIA_TYPES = [
  { key: "photo", label: "Foto clínica" },
  { key: "xray", label: "Raio-X" },
  { key: "mri", label: "Ressonância" },
  { key: "ct", label: "Tomografia" },
  { key: "ultrasound", label: "Ultrassom" },
  { key: "other", label: "Outro" },
];

export default function ConsultationPage() {
  const params = useParams();
  const id = params?.id as string;
  if (!id) return <div>Paciente não encontrado</div>;
  const pid = Number(id);
  const router = useRouter();

  const [patient, setPatient] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [painScale, setPainScale] = useState<number | null>(null);
  const [cid10, setCid10] = useState("");
  const [consultType, setConsultType] = useState("retorno");
  const [teleconsultUrl, setTeleconsultUrl] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    date: new Date().toISOString().slice(0, 16),
  });

  // Media state
  const [savedConsultId, setSavedConsultId] = useState<number | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaType, setMediaType] = useState("photo");
  const [mediaDesc, setMediaDesc] = useState("");
  const [uploadedMedia, setUploadedMedia] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

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
      const result = await consultationsApi.create(pid, {
        ...form,
        pain_scale: painScale,
        cid10,
        type: consultType,
        date: new Date(form.date).toISOString(),
      });
      setSavedConsultId(result.id);
      if (result.teleconsult_url) setTeleconsultUrl(result.teleconsult_url);
      toast.success("Consulta salva! Adicione imagens se desejar.");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar consulta");
      setSaving(false);
    }
  };

  const handleUpload = async () => {
    if (!savedConsultId || mediaFiles.length === 0) return;
    setUploading(true);
    try {
      for (const file of mediaFiles) {
        const media = await mediaApi.upload(savedConsultId, pid, file, mediaType, mediaDesc);
        setUploadedMedia((prev) => [...prev, media]);
      }
      toast.success(`${mediaFiles.length} imagem(ns) enviada(s)`);
      setMediaFiles([]);
      setMediaDesc("");
    } catch {
      toast.error("Erro ao fazer upload");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMedia = async (mediaId: number) => {
    if (!savedConsultId) return;
    await mediaApi.delete(savedConsultId, mediaId);
    setUploadedMedia((prev) => prev.filter((m) => m.id !== mediaId));
    toast.success("Imagem removida");
  };

  const handleFinish = () => {
    router.push(`/pacientes/${pid}`);
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
              <select
                className="input"
                value={consultType}
                onChange={(e) => setConsultType(e.target.value)}
              >
                <option value="retorno">Retorno</option>
                <option value="primeira_consulta">1ª Consulta</option>
                <option value="urgencia">Urgência</option>
                <option value="procedimento">Procedimento</option>
                <option value="teleconsulta">Teleconsulta</option>
              </select>
            </div>
          </div>

          {/* Teleconsulta URL preview */}
          {consultType === "teleconsulta" && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
              <Video className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-violet-800">Teleconsulta via Jitsi Meet</p>
                {teleconsultUrl ? (
                  <>
                    <p className="text-xs text-violet-600 mt-0.5 break-all">{teleconsultUrl}</p>
                    <a
                      href={teleconsultUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-violet-700 underline font-medium mt-1 inline-block"
                    >
                      Entrar na chamada →
                    </a>
                  </>
                ) : (
                  <p className="text-xs text-violet-500 mt-0.5">
                    Link gerado automaticamente ao salvar
                  </p>
                )}
              </div>
            </div>
          )}
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

          {/* Escala de dor */}
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
              <span>Sem dor</span><span>Dor máxima</span>
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

        {/* Diagnóstico */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Diagnóstico e Conduta</h2>
          <div>
            <label className="label">Diagnóstico</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Hipótese diagnóstica..." onChange={set("diagnosis")} />
          </div>
          <div>
            <label className="label">CID-10</label>
            <CidSearch value={cid10} onChange={setCid10} />
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

        {!savedConsultId ? (
          <div className="flex gap-3 pb-4">
            <button type="button" onClick={() => router.back()} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? "Salvando..." : "Salvar Consulta"}
            </button>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-emerald-700 font-semibold text-sm">✓ Consulta salva com sucesso!</p>
            {teleconsultUrl && (
              <a href={teleconsultUrl} target="_blank" rel="noopener noreferrer"
                className="text-violet-600 text-xs underline mt-1 block">
                Teleconsulta: {teleconsultUrl}
              </a>
            )}
          </div>
        )}
      </form>

      {/* Imagens — só aparece após salvar */}
      {savedConsultId && (
        <div className="max-w-3xl mx-auto px-4 pb-10 space-y-5">
          <section className="card p-6 space-y-4">
            <h2 className="section-title flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Imagens da Consulta
            </h2>

            {/* Already uploaded */}
            {uploadedMedia.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {uploadedMedia.map((m) => (
                  <div key={m.id} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002"}${m.file_path}`}
                      alt={m.description || m.media_type}
                      className="w-full h-28 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-image.png"; }}
                    />
                    <div className="px-2 py-1.5">
                      <p className="text-[11px] font-medium text-gray-600 truncate">{m.description || m.media_type}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteMedia(m.id)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload form */}
            <div className="space-y-3 border border-dashed border-gray-300 rounded-xl p-4">
              <div>
                <label className="label">Tipo de imagem</label>
                <select
                  className="input"
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value)}
                >
                  {MEDIA_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Descrição (opcional)</label>
                <input
                  className="input"
                  placeholder="Ex: RX joelho AP, foto pré-operatória..."
                  value={mediaDesc}
                  onChange={(e) => setMediaDesc(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Arquivos</label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
                  onChange={(e) => setMediaFiles(Array.from(e.target.files || []))}
                />
              </div>
              {mediaFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {mediaFiles.map((f, i) => (
                    <span key={i} className="text-xs bg-brand-50 text-brand-700 px-2.5 py-1 rounded-lg font-medium">
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || mediaFiles.length === 0}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
              >
                {uploading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Fazer upload</>
                )}
              </button>
            </div>
          </section>

          <button onClick={handleFinish} className="btn-primary w-full py-3.5">
            Finalizar e voltar ao prontuário
          </button>
        </div>
      )}
    </div>
  );
}
