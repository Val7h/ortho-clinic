"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Video, Upload, X, Image as ImageIcon, ChevronDown, ChevronUp,
  Stethoscope, FileText, ClipboardList, Activity, CalendarClock, Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { consultationsApi, patientsApi, mediaApi, msgErro } from "@/lib/api";
import { resolveDynamicParam } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAIN_COLORS = [
  "bg-green-500", "bg-green-400", "bg-lime-400", "bg-yellow-300",
  "bg-yellow-400", "bg-orange-300", "bg-orange-400", "bg-orange-500",
  "bg-red-400", "bg-red-500", "bg-red-600",
];

const MEDIA_TYPES = [
  { key: "photo", label: "Foto clínica" },
  { key: "xray", label: "Raio-X" },
  { key: "mri", label: "Ressonância" },
  { key: "ct", label: "Tomografia" },
  { key: "ultrasound", label: "Ultrassom" },
  { key: "other", label: "Outro" },
];

const DURATION_UNITS = ["horas", "dias", "semanas", "meses", "anos"];

const CONSULT_TYPES = [
  { value: "primeira_consulta", label: "1ª Consulta" },
  { value: "retorno", label: "Retorno" },
  { value: "urgencia", label: "Urgência" },
  { value: "pre_operatorio", label: "Pré-operatório" },
  { value: "pos_operatorio", label: "Pós-operatório" },
  { value: "procedimento", label: "Procedimento" },
  { value: "teleconsulta", label: "Teleconsulta" },
];

const ORTHO_TESTS = [
  { key: "lachman", label: "Lachman", region: "Joelho" },
  { key: "mcmurray", label: "McMurray", region: "Joelho" },
  { key: "thessaly", label: "Thessaly", region: "Joelho" },
  { key: "varus_valgus", label: "Varo/Valgo", region: "Joelho" },
  { key: "lasegue", label: "Lasègue", region: "Coluna" },
  { key: "bragard", label: "Bragard", region: "Coluna" },
  { key: "patrick", label: "Patrick (FABER)", region: "Quadril" },
  { key: "trendelenburg", label: "Trendelenburg", region: "Quadril" },
  { key: "neer", label: "Neer", region: "Ombro" },
  { key: "hawkins", label: "Hawkins-Kennedy", region: "Ombro" },
  { key: "jobe", label: "Jobe (empty can)", region: "Ombro" },
  { key: "finkelstein", label: "Finkelstein", region: "Punho" },
  { key: "phalen", label: "Phalen", region: "Punho" },
  { key: "tinel_carpal", label: "Tinel (carpo)", region: "Punho" },
];

const ORTHO_CIDS = [
  { code: "M17.1", label: "Gonartrose primária unilateral" },
  { code: "M17.0", label: "Gonartrose primária bilateral" },
  { code: "M16.1", label: "Coxartrose primária unilateral" },
  { code: "M16.0", label: "Coxartrose primária bilateral" },
  { code: "M54.5", label: "Lombalgia" },
  { code: "M54.4", label: "Lumbociatalgia" },
  { code: "M51.1", label: "Hérnia de disco lombar com radiculopatia" },
  { code: "M50.1", label: "Hérnia de disco cervical com radiculopatia" },
  { code: "M75.1", label: "Síndrome do manguito rotador" },
  { code: "M75.5", label: "Bursite do ombro" },
  { code: "M75.0", label: "Síndrome do impacto do ombro" },
  { code: "M23.2", label: "Lesão do menisco por ruptura" },
  { code: "M23.6", label: "Outras afecções internas do joelho" },
  { code: "M06.9", label: "Artrite reumatoide inespecífica" },
  { code: "M10.9", label: "Gota inespecífica" },
  { code: "M79.3", label: "Paniculite" },
  { code: "M65.1", label: "Tenossinovite do tendão" },
  { code: "M72.2", label: "Fibromatose plantar (esporão)" },
  { code: "M77.0", label: "Epicondilite medial" },
  { code: "M77.1", label: "Epicondilite lateral" },
  { code: "S83.2", label: "Ruptura do ligamento cruzado anterior" },
  { code: "S83.0", label: "Luxação da rótula" },
  { code: "S72.0", label: "Fratura do colo do fêmur" },
  { code: "S52.5", label: "Fratura distal do rádio" },
  { code: "M84.3", label: "Fratura por estresse" },
  { code: "M19.9", label: "Artrose inespecífica" },
  { code: "M41.9", label: "Escoliose inespecífica" },
  { code: "M48.0", label: "Estenose espinhal" },
  { code: "M47.8", label: "Espondilose com outras mielopatias" },
  { code: "M62.6", label: "Distensão muscular" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Accordion section component
// ─────────────────────────────────────────────────────────────────────────────

interface AccordionSectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}

function AccordionSection({ id, title, icon, children, defaultOpen = false, badge }: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-brand-600">{icon}</span>
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
          {badge && (
            <span className="text-[10px] font-bold bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-6 pb-6 pt-2 space-y-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CID inline search (30 CIDs hardcoded ortopédicos + busca livre)
// ─────────────────────────────────────────────────────────────────────────────

function CidInlineSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.length >= 2
    ? ORTHO_CIDS.filter(
        (c) =>
          c.code.toLowerCase().includes(query.toLowerCase()) ||
          c.label.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const select = (code: string, label: string) => {
    const val = `${code} — ${label}`;
    setQuery(val);
    onChange(val);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input
        className="input"
        placeholder="Ex: M17.1 ou gonartrose..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 hover:bg-brand-50 flex items-center gap-3"
                onClick={() => select(c.code, c.label)}
              >
                <span className="text-xs font-bold text-brand-600 w-14 flex-shrink-0">{c.code}</span>
                <span className="text-sm text-gray-700">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ConsultationPage() {
  const params = useParams();
  const id = resolveDynamicParam(params?.id as string);
  if (!id) return <div>Paciente não encontrado</div>;
  const pid = Number(id);
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────
  const [patient, setPatient] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [savedConsultId, setSavedConsultId] = useState<number | null>(null);
  const [teleconsultUrl, setTeleconsultUrl] = useState<string | null>(null);

  // Identification
  const [consultDate, setConsultDate] = useState(new Date().toISOString().slice(0, 16));
  const [consultType, setConsultType] = useState("retorno");

  // Anamnese
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [historyOfIllness, setHistoryOfIllness] = useState("");
  const [painLocation, setPainLocation] = useState("");
  const [durationQty, setDurationQty] = useState("");
  const [durationUnit, setDurationUnit] = useState("semanas");
  const [aggravating, setAggravating] = useState("");
  const [relieving, setRelieving] = useState("");
  const [previousTreatments, setPreviousTreatments] = useState("");
  const [painScale, setPainScale] = useState<number | null>(null);

  // Exame físico — sinais vitais estruturados
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [temperature, setTemperature] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const imc = weight && height
    ? (parseFloat(weight) / Math.pow(parseFloat(height) / 100, 2)).toFixed(1)
    : null;

  // Exame físico — clínico
  const [physicalExam, setPhysicalExam] = useState("");
  const [rangeOfMotion, setRangeOfMotion] = useState("");

  // Testes especiais ortopédicos
  const [specialTestsMap, setSpecialTestsMap] = useState<Record<string, string>>({});
  const toggleTest = (key: string) =>
    setSpecialTestsMap((prev) => {
      const next = { ...prev };
      if (next[key] !== undefined) {
        delete next[key];
      } else {
        next[key] = "nao_realizado";
      }
      return next;
    });
  const setTestResult = (key: string, result: string) =>
    setSpecialTestsMap((prev) => ({ ...prev, [key]: result }));

  // Diagnóstico
  const [cid10, setCid10] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [imagingFindings, setImagingFindings] = useState("");

  // Conduta
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [evolution, setEvolution] = useState("");
  const [procedurePerformed, setProcedurePerformed] = useState("");

  // Retorno
  const [returnDays, setReturnDays] = useState("");
  const [nextAppointmentNotes, setNextAppointmentNotes] = useState("");
  const [doctorPrivateNotes, setDoctorPrivateNotes] = useState("");

  // Media
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaType, setMediaType] = useState("photo");
  const [mediaDesc, setMediaDesc] = useState("");
  const [uploadedMedia, setUploadedMedia] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // ── Load patient ───────────────────────────────────────────────────────────
  useEffect(() => {
    patientsApi.get(pid).then(setPatient).catch(() => toast.error("Erro ao carregar paciente"));
  }, [pid]);

  // ── Build payload ──────────────────────────────────────────────────────────
  const buildVitalSigns = () => {
    const vs: Record<string, any> = {};
    if (bpSystolic) vs.bp_systolic = parseInt(bpSystolic);
    if (bpDiastolic) vs.bp_diastolic = parseInt(bpDiastolic);
    if (heartRate) vs.hr = parseInt(heartRate);
    if (temperature) vs.temperature = parseFloat(temperature);
    if (weight) vs.weight = parseFloat(weight);
    if (height) vs.height = parseFloat(height);
    if (imc) vs.imc = parseFloat(imc);
    return Object.keys(vs).length > 0 ? JSON.stringify(vs) : null;
  };

  const buildSpecialTests = () => {
    const tests: Record<string, string> = {};
    ORTHO_TESTS.forEach((t) => {
      if (specialTestsMap[t.key] !== undefined) {
        tests[t.key] = specialTestsMap[t.key];
      }
    });
    return Object.keys(tests).length > 0 ? JSON.stringify(tests) : null;
  };

  const buildSymptomDuration = () => {
    if (!durationQty) return undefined;
    return `${durationQty} ${durationUnit}`;
  };

  const buildNextAppointment = () => {
    if (!returnDays) return undefined;
    const d = new Date();
    d.setDate(d.getDate() + parseInt(returnDays));
    return d.toISOString().slice(0, 10);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chiefComplaint.trim()) {
      toast.error("Preencha a queixa principal");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        date: new Date(consultDate).toISOString(),
        type: consultType,
        chief_complaint: chiefComplaint || undefined,
        history_of_illness: historyOfIllness || undefined,
        pain_location: painLocation || undefined,
        symptom_duration: buildSymptomDuration(),
        aggravating_factors: aggravating || undefined,
        relieving_factors: relieving || undefined,
        previous_treatments: previousTreatments || undefined,
        pain_scale: painScale,
        physical_exam: physicalExam || undefined,
        vital_signs: buildVitalSigns(),
        range_of_motion: rangeOfMotion || undefined,
        special_tests: buildSpecialTests(),
        imaging_findings: imagingFindings || undefined,
        diagnosis: diagnosis || undefined,
        cid10: cid10 || undefined,
        treatment_plan: treatmentPlan || undefined,
        evolution: evolution || undefined,
        procedure_performed: procedurePerformed || undefined,
        next_appointment: buildNextAppointment(),
        next_appointment_notes: nextAppointmentNotes || undefined,
        doctor_private_notes: doctorPrivateNotes || undefined,
      };
      const result = await consultationsApi.create(pid, payload);
      setSavedConsultId(result.id);
      if (result.teleconsult_url) setTeleconsultUrl(result.teleconsult_url);
      toast.success("Consulta salva! Adicione imagens se desejar.");
    } catch (err: any) {
      toast.error(msgErro(err, "Erro ao salvar consulta"));
      setSaving(false);
    }
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
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

  // ── Region groups for special tests ───────────────────────────────────────
  const testsByRegion: Record<string, typeof ORTHO_TESTS> = {};
  ORTHO_TESTS.forEach((t) => {
    if (!testsByRegion[t.region]) testsByRegion[t.region] = [];
    testsByRegion[t.region].push(t);
  });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <PageWithSidebar>
      <div className="min-h-screen bg-slate-100">
        <NavBar
          title="Prontuário Clínico"
          subtitle={patient?.name}
          back={`/pacientes/${pid}`}
        />

        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-6 space-y-4">

          {/* ── Identificação ── */}
          <div className="card p-5 space-y-4">
            <h2 className="section-title flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-brand-600" />
              Identificação da Consulta
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Data e hora</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={consultDate}
                  onChange={(e) => setConsultDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Tipo de consulta</label>
                <select
                  className="input"
                  value={consultType}
                  onChange={(e) => setConsultType(e.target.value)}
                >
                  {CONSULT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {consultType === "teleconsulta" && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
                <Video className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-violet-800">Teleconsulta via Jitsi Meet</p>
                  {teleconsultUrl ? (
                    <>
                      <p className="text-xs text-violet-600 mt-0.5 break-all">{teleconsultUrl}</p>
                      <a href={teleconsultUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-violet-700 underline font-medium mt-1 inline-block">
                        Entrar na chamada →
                      </a>
                    </>
                  ) : (
                    <p className="text-xs text-violet-500 mt-0.5">Link gerado automaticamente ao salvar</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── SEÇÃO 1: Anamnese ── */}
          <AccordionSection
            id="anamnese"
            title="Seção 1 — Anamnese"
            icon={<ClipboardList className="w-4 h-4" />}
            defaultOpen={true}
            badge="Obrigatória"
          >
            <div>
              <label className="label">
                Queixa principal <span className="text-red-500">*</span>
              </label>
              <textarea
                className="input min-h-[90px] resize-none"
                placeholder="Motivo da consulta em palavras do paciente..."
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
              />
            </div>

            <div>
              <label className="label">História da doença atual</label>
              <textarea
                className="input min-h-[100px] resize-none"
                placeholder="Início, evolução, fatores de melhora e piora, tratamentos já realizados..."
                value={historyOfIllness}
                onChange={(e) => setHistoryOfIllness(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Localização da dor</label>
              <input
                className="input"
                placeholder="Ex: Joelho direito, lombar bilateral, ombro esquerdo..."
                value={painLocation}
                onChange={(e) => setPainLocation(e.target.value)}
              />
            </div>

            {/* Duração — dropdown estruturado */}
            <div>
              <label className="label">Duração dos sintomas</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  className="input w-24 flex-shrink-0"
                  placeholder="Qtd"
                  value={durationQty}
                  onChange={(e) => setDurationQty(e.target.value)}
                />
                <select
                  className="input flex-1"
                  value={durationUnit}
                  onChange={(e) => setDurationUnit(e.target.value)}
                >
                  {DURATION_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* EVA Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Escala de dor (EVA)</label>
                {painScale !== null ? (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${PAIN_COLORS[painScale]}`}>
                    {painScale}/10
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">não avaliado</span>
                )}
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                className="w-full h-2 appearance-none rounded-full cursor-pointer"
                style={{
                  background: painScale !== null
                    ? `linear-gradient(to right, #ef4444 0%, #ef4444 ${painScale * 10}%, #e5e7eb ${painScale * 10}%, #e5e7eb 100%)`
                    : "#e5e7eb",
                }}
                value={painScale ?? 0}
                onChange={(e) => setPainScale(parseInt(e.target.value))}
                onMouseDown={() => { if (painScale === null) setPainScale(0); }}
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
                {[0,1,2,3,4,5,6,7,8,9,10].map((n) => (
                  <span key={n} className={painScale === n ? "font-bold text-gray-700" : ""}>{n}</span>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Sem dor</span><span>Dor máxima</span>
              </div>
              {painScale !== null && (
                <button
                  type="button"
                  onClick={() => setPainScale(null)}
                  className="text-[10px] text-gray-400 underline mt-1"
                >
                  Limpar avaliação
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Fatores de piora</label>
                <textarea
                  className="input min-h-[80px] resize-none"
                  placeholder="Movimento, esforço, clima, posição..."
                  value={aggravating}
                  onChange={(e) => setAggravating(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Fatores de melhora</label>
                <textarea
                  className="input min-h-[80px] resize-none"
                  placeholder="Repouso, calor, analgésicos..."
                  value={relieving}
                  onChange={(e) => setRelieving(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Tratamentos anteriores</label>
              <textarea
                className="input min-h-[80px] resize-none"
                placeholder="Fisioterapia, cirurgias prévias, medicamentos em uso..."
                value={previousTreatments}
                onChange={(e) => setPreviousTreatments(e.target.value)}
              />
            </div>
          </AccordionSection>

          {/* ── SEÇÃO 2: Exame Físico ── */}
          <AccordionSection
            id="exame"
            title="Seção 2 — Exame Físico"
            icon={<Stethoscope className="w-4 h-4" />}
            defaultOpen={true}
            badge="Ortopedia"
          >
            {/* Sinais Vitais */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sinais Vitais</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* PA */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="label">Pressão Arterial (mmHg)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      className="input text-center px-2"
                      placeholder="120"
                      value={bpSystolic}
                      onChange={(e) => setBpSystolic(e.target.value)}
                    />
                    <span className="text-gray-400 font-bold">/</span>
                    <input
                      type="number"
                      className="input text-center px-2"
                      placeholder="80"
                      value={bpDiastolic}
                      onChange={(e) => setBpDiastolic(e.target.value)}
                    />
                  </div>
                </div>
                {/* FC */}
                <div>
                  <label className="label">FC (bpm)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="72"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                  />
                </div>
                {/* Temp */}
                <div>
                  <label className="label">Temperatura (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="input"
                    placeholder="36.5"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                  />
                </div>
                {/* Peso */}
                <div>
                  <label className="label">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="input"
                    placeholder="75"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </div>
                {/* Altura */}
                <div>
                  <label className="label">Altura (cm)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="175"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                  />
                </div>
                {/* IMC */}
                <div>
                  <label className="label">IMC</label>
                  <div className={`input flex items-center justify-between ${imc ? "" : "text-gray-400"}`}>
                    <span>{imc ?? "—"}</span>
                    {imc && (
                      <span className="text-[10px] font-semibold ml-1 text-brand-600">
                        {parseFloat(imc) < 18.5 ? "Abaixo peso"
                          : parseFloat(imc) < 25 ? "Normal"
                          : parseFloat(imc) < 30 ? "Sobrepeso"
                          : "Obeso"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Exame Clínico */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-2">Exame Clínico</p>
            </div>
            <div>
              <label className="label">Inspeção / Palpação</label>
              <textarea
                className="input min-h-[90px] resize-none"
                placeholder="Sem alterações aparentes / Edema leve em joelho D / Atrofia de quadríceps..."
                value={physicalExam}
                onChange={(e) => setPhysicalExam(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Amplitude de Movimento</label>
              <textarea
                className="input min-h-[90px] resize-none font-mono text-sm"
                placeholder={"Flexão: ___°  /  Extensão: ___°\nRotação interna: ___°  /  Rotação externa: ___°\nAbdução: ___°  /  Adução: ___°"}
                value={rangeOfMotion}
                onChange={(e) => setRangeOfMotion(e.target.value)}
              />
            </div>

            {/* Testes Ortopédicos */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-1">Testes Ortopédicos Especiais</p>
              <div className="space-y-4">
                {Object.entries(testsByRegion).map(([region, tests]) => (
                  <div key={region}>
                    <p className="text-xs font-bold text-gray-400 mb-2">{region}</p>
                    <div className="space-y-2">
                      {tests.map((t) => {
                        const active = specialTestsMap[t.key] !== undefined;
                        return (
                          <div key={t.key} className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer min-w-[160px]">
                              <input
                                type="checkbox"
                                checked={active}
                                onChange={() => toggleTest(t.key)}
                                className="w-4 h-4 rounded text-brand-600 border-gray-300"
                              />
                              <span className="text-sm text-gray-700">{t.label}</span>
                            </label>
                            {active && (
                              <select
                                className="input text-sm py-1.5 flex-1"
                                value={specialTestsMap[t.key]}
                                onChange={(e) => setTestResult(t.key, e.target.value)}
                              >
                                <option value="nao_realizado">Não realizado</option>
                                <option value="negativo">Negativo</option>
                                <option value="positivo">Positivo</option>
                                <option value="duvidoso">Duvidoso</option>
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AccordionSection>

          {/* ── SEÇÃO 3: Diagnóstico ── */}
          <AccordionSection
            id="diagnostico"
            title="Seção 3 — Diagnóstico"
            icon={<Activity className="w-4 h-4" />}
            defaultOpen={true}
          >
            <div>
              <label className="label">CID-10</label>
              <CidInlineSearch value={cid10} onChange={setCid10} />
              <p className="text-[11px] text-gray-400 mt-1">
                Digite o código ou nome da condição (lista ortopédica sugerida)
              </p>
            </div>
            <div>
              <label className="label">Hipótese diagnóstica</label>
              <textarea
                className="input min-h-[90px] resize-none"
                placeholder="Diagnóstico principal e hipóteses diferenciais..."
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Achados de imagem</label>
              <textarea
                className="input min-h-[80px] resize-none"
                placeholder="RX, RM, TC, Ultrassom — laudos e achados relevantes..."
                value={imagingFindings}
                onChange={(e) => setImagingFindings(e.target.value)}
              />
            </div>
          </AccordionSection>

          {/* ── SEÇÃO 4: Conduta ── */}
          <AccordionSection
            id="conduta"
            title="Seção 4 — Conduta"
            icon={<FileText className="w-4 h-4" />}
            defaultOpen={true}
          >
            <div>
              <label className="label">Plano de tratamento</label>
              <textarea
                className="input min-h-[110px] resize-none"
                placeholder="Medicamentos, fisioterapia, cirurgia, orientações ao paciente..."
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Evolução (retornos)</label>
              <textarea
                className="input min-h-[80px] resize-none"
                placeholder="Como o paciente evoluiu desde a última consulta..."
                value={evolution}
                onChange={(e) => setEvolution(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Procedimento realizado</label>
              <textarea
                className="input min-h-[80px] resize-none"
                placeholder="Infiltração, bloqueio, aspiração, curativo, redução..."
                value={procedurePerformed}
                onChange={(e) => setProcedurePerformed(e.target.value)}
              />
            </div>

            <hr className="border-gray-100 my-2" />

            {/* Retorno */}
            <div>
              <label className="label">Retorno em quantos dias?</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  className="input w-28"
                  placeholder="Ex: 30"
                  value={returnDays}
                  onChange={(e) => setReturnDays(e.target.value)}
                />
                {returnDays && (
                  <span className="text-sm text-gray-500">
                    Retorno em {new Date(Date.now() + parseInt(returnDays) * 86400000).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="label">Orientações para o retorno</label>
              <input
                className="input"
                placeholder="Ex: Trazer RX joelho, fazer fisioterapia antes..."
                value={nextAppointmentNotes}
                onChange={(e) => setNextAppointmentNotes(e.target.value)}
              />
            </div>
          </AccordionSection>

          {/* ── Notas privadas ── */}
          <AccordionSection
            id="privado"
            title="Notas Privadas do Médico"
            icon={<Lock className="w-4 h-4" />}
            defaultOpen={false}
          >
            <p className="text-xs text-gray-400">
              Não aparecem no prontuário impresso nem são compartilhadas com o paciente.
            </p>
            <textarea
              className="input min-h-[90px] resize-none"
              placeholder="Impressões clínicas, alertas, anotações pessoais..."
              value={doctorPrivateNotes}
              onChange={(e) => setDoctorPrivateNotes(e.target.value)}
            />
          </AccordionSection>

          {/* ── Botões ── */}
          {!savedConsultId ? (
            <div className="flex gap-3 pb-4">
              <button type="button" onClick={() => router.back()} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? "Salvando..." : "Salvar Prontuário"}
              </button>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-emerald-700 font-semibold text-sm">Prontuário salvo com sucesso!</p>
              {teleconsultUrl && (
                <a href={teleconsultUrl} target="_blank" rel="noopener noreferrer"
                  className="text-violet-600 text-xs underline mt-1 block">
                  Teleconsulta: {teleconsultUrl}
                </a>
              )}
            </div>
          )}
        </form>

        {/* ── Imagens — só aparece após salvar ── */}
        {savedConsultId && (
          <div className="max-w-3xl mx-auto px-4 pb-10 space-y-5">
            <section className="card p-6 space-y-4">
              <h2 className="section-title flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Imagens da Consulta
              </h2>

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

              <div className="space-y-3 border border-dashed border-gray-300 rounded-xl p-4">
                <div>
                  <label className="label">Tipo de imagem</label>
                  <select className="input" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
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

            <button onClick={() => router.push(`/pacientes/${pid}`)} className="btn-primary w-full py-3.5">
              Finalizar e voltar ao prontuário
            </button>
          </div>
        )}
      </div>
    </PageWithSidebar>
  );
}
