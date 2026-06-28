"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  X, Play, CheckCircle, UserX, AlertTriangle, Activity, Pill,
  ClipboardList, Stethoscope, FileText, FlaskConical,
  Plus, Trash2, Printer, ChevronDown, ChevronUp, Save,
} from "lucide-react";
import toast from "react-hot-toast";
import { patientsApi, consultationsApi, prescriptionsApi, examsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type QueueStatus = "waiting" | "attending" | "attended" | "absent";

export interface WaitingRoomEntry {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_insurance: string | null;
  clinic_id: number | null;
  reason: string | null;
  position: number;
  arrived_at: string;
  status: QueueStatus;
  waited_minutes: number | null;
}

interface ConsultaDrawerProps {
  entry: WaitingRoomEntry;
  onClose: () => void;
  onStatusChange: (entryId: number, status: QueueStatus) => void;
}

type DrawerTab = "prontuario" | "receita" | "exames";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAIN_COLORS = [
  "bg-green-500", "bg-green-400", "bg-lime-400", "bg-yellow-300",
  "bg-yellow-400", "bg-orange-300", "bg-orange-400", "bg-orange-500",
  "bg-red-400", "bg-red-500", "bg-red-600",
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

const ROUTE_OPTIONS = ["oral", "IM", "IV", "tópico", "inalatório", "sublingual", "retal"];

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const now = new Date();
  const age = now.getFullYear() - birth.getFullYear();
  return `${age} anos`;
}

function parseList(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === "string") return val.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AllergyBanner({ patient }: { patient: any }) {
  const allergies = parseList(patient?.allergies);
  const chronic = parseList(patient?.chronic_conditions);
  const meds = parseList(patient?.current_medications);

  if (!allergies.length && !chronic.length && !meds.length) return null;

  return (
    <div className="space-y-2 px-5 pt-3">
      {allergies.length > 0 && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-800 dark:text-red-300 uppercase tracking-wide">
              Alérgico a:
            </p>
            <p className="text-xs text-red-700 dark:text-red-400">{allergies.join(" · ")}</p>
          </div>
        </div>
      )}
      {chronic.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2">
          <Activity className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Condições crônicas</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">{chronic.join(" · ")}</p>
          </div>
        </div>
      )}
      {meds.length > 0 && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2">
          <Pill className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300">Em uso atual</p>
            <p className="text-xs text-blue-700 dark:text-blue-400">{meds.join(" · ")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// CID autocomplete inline
function CidSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.length >= 2
    ? ORTHO_CIDS.filter(
        (c) =>
          c.code.toLowerCase().includes(query.toLowerCase()) ||
          c.label.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : [];

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Ex: M17.1 ou gonartrose..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
                onClick={() => {
                  const val = `${c.code} — ${c.label}`;
                  setQuery(val);
                  onChange(val);
                  setOpen(false);
                }}
              >
                <span className="text-xs font-bold text-blue-600 w-12 flex-shrink-0">{c.code}</span>
                <span className="text-xs text-slate-700 dark:text-slate-300">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Input style shared
const inp = "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";
const lbl = "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1";
const sectionTitle = "text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3";

// Medication row
interface Medication {
  name: string; dose: string; route: string; frequency: string; duration: string; instructions: string;
}
const emptyMed = (): Medication => ({ name: "", dose: "", route: "oral", frequency: "", duration: "", instructions: "" });

function MedRowInline({ med, index, total, onChange, onRemove }: {
  med: Medication; index: number; total: number;
  onChange: (k: keyof Medication, v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Medicamento {index + 1}</span>
        {total > 1 && (
          <button type="button" onClick={onRemove} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
            <Trash2 className="w-3 h-3" /> Remover
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className={lbl}>Nome *</label>
          <input className={inp} placeholder="Ex: Nimesulida 100mg" value={med.name} onChange={(e) => onChange("name", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Dose</label>
          <input className={inp} placeholder="1 comprimido" value={med.dose} onChange={(e) => onChange("dose", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Via</label>
          <select className={inp} value={med.route} onChange={(e) => onChange("route", e.target.value)}>
            {ROUTE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Frequência</label>
          <input className={inp} placeholder="8/8h, 12/12h..." value={med.frequency} onChange={(e) => onChange("frequency", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Duração</label>
          <input className={inp} placeholder="7 dias..." value={med.duration} onChange={(e) => onChange("duration", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Instruções</label>
          <input className={inp} placeholder="Tomar após as refeições..." value={med.instructions} onChange={(e) => onChange("instructions", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// Exam item
interface ExamItem { name: string; laterality: string; notes: string; }
const emptyExam = (): ExamItem => ({ name: "", laterality: "", notes: "" });

// Print prescription modal
function PrintModal({ rx, patient, onClose }: {
  rx: { date: string; medications: Medication[]; instructions: string };
  patient: any;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <style>{`
        @media print {
          body > *:not(#print-rx-root) { display: none !important; }
          #print-rx-root { position: fixed !important; inset: 0 !important; z-index: 9999 !important; background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div id="print-rx-root" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="no-print px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-slate-900 dark:text-slate-50 text-sm">Preview da Receita</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 bg-white">
          <div className="bg-white p-5 border border-gray-200 rounded-lg text-sm text-gray-900">
            <div className="text-center border-b-2 border-blue-800 pb-3 mb-5">
              <h1 className="text-lg font-bold text-blue-900">Dr. Valth Guimarães</h1>
              <p className="text-xs text-gray-600">Ortopedia e Traumatologia</p>
              <p className="text-xs text-gray-600">CRM/PB 1234</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5 text-xs">
              <div><span className="font-bold text-gray-500 uppercase">Paciente:</span><p className="font-semibold">{patient?.name}</p></div>
              <div><span className="font-bold text-gray-500 uppercase">Data:</span><p>{new Date(rx.date).toLocaleDateString("pt-BR")}</p></div>
              {patient?.cpf && <div><span className="font-bold text-gray-500 uppercase">CPF:</span><p className="font-mono">{patient.cpf}</p></div>}
            </div>
            <div className="mb-5">
              <p className="font-bold text-gray-700 uppercase text-xs tracking-wider mb-3 border-b border-gray-200 pb-1">Prescrição</p>
              <ol className="space-y-3">
                {rx.medications.map((m, i) => (
                  <li key={i} className="pl-2">
                    <p className="font-semibold">{i + 1}. {m.name}{m.dose && <span className="font-normal text-gray-600"> — {m.dose}</span>}</p>
                    <p className="text-gray-600 text-xs mt-0.5">{[m.route && `Via ${m.route}`, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
                    {m.instructions && <p className="text-gray-500 text-xs italic mt-0.5">Obs: {m.instructions}</p>}
                  </li>
                ))}
              </ol>
            </div>
            {rx.instructions && (
              <div className="mb-5 bg-gray-50 rounded p-3">
                <p className="font-bold text-gray-700 text-xs uppercase tracking-wider mb-1">Orientações</p>
                <p className="text-xs text-gray-700">{rx.instructions}</p>
              </div>
            )}
            <div className="mt-8 flex justify-end">
              <div className="text-center w-48">
                <div className="border-t-2 border-gray-800 mb-2 pt-2"></div>
                <p className="text-xs font-bold">Dr. Valth Guimarães</p>
                <p className="text-xs text-gray-500">CRM/PB 1234</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Prontuário ────────────────────────────────────────────────────────────

function TabProntuario({ patientId, patient }: { patientId: number; patient: any }) {
  const [consultType, setConsultType] = useState("retorno");
  // Anamnese
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [historyOfIllness, setHistoryOfIllness] = useState("");
  const [painLocation, setPainLocation] = useState("");
  const [durationQty, setDurationQty] = useState("");
  const [durationUnit, setDurationUnit] = useState("semanas");
  const [painScale, setPainScale] = useState<number | null>(null);
  const [aggravating, setAggravating] = useState("");
  const [relieving, setRelieving] = useState("");
  const [previousTreatments, setPreviousTreatments] = useState("");
  // Exame físico
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [temperature, setTemperature] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const imc = weight && height ? (parseFloat(weight) / Math.pow(parseFloat(height) / 100, 2)).toFixed(1) : null;
  const [physicalExam, setPhysicalExam] = useState("");
  // Testes ortopédicos
  const [specialTestsMap, setSpecialTestsMap] = useState<Record<string, string>>({});
  // Diagnóstico
  const [cid10, setCid10] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  // Conduta
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [returnDays, setReturnDays] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggleTest = (key: string) =>
    setSpecialTestsMap((prev) => {
      const next = { ...prev };
      if (next[key] !== undefined) delete next[key];
      else next[key] = "nao_realizado";
      return next;
    });

  const testsByRegion: Record<string, typeof ORTHO_TESTS> = {};
  ORTHO_TESTS.forEach((t) => {
    if (!testsByRegion[t.region]) testsByRegion[t.region] = [];
    testsByRegion[t.region].push(t);
  });

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
    ORTHO_TESTS.forEach((t) => { if (specialTestsMap[t.key] !== undefined) tests[t.key] = specialTestsMap[t.key]; });
    return Object.keys(tests).length > 0 ? JSON.stringify(tests) : null;
  };

  const handleSave = async () => {
    if (!chiefComplaint.trim()) { toast.error("Preencha a queixa principal"); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        date: new Date().toISOString(),
        type: consultType,
        chief_complaint: chiefComplaint || undefined,
        history_of_illness: historyOfIllness || undefined,
        pain_location: painLocation || undefined,
        symptom_duration: durationQty ? `${durationQty} ${durationUnit}` : undefined,
        aggravating_factors: aggravating || undefined,
        relieving_factors: relieving || undefined,
        previous_treatments: previousTreatments || undefined,
        pain_scale: painScale,
        physical_exam: physicalExam || undefined,
        vital_signs: buildVitalSigns(),
        special_tests: buildSpecialTests(),
        diagnosis: diagnosis || undefined,
        cid10: cid10 || undefined,
        treatment_plan: treatmentPlan || undefined,
        next_appointment: returnDays
          ? (() => { const d = new Date(); d.setDate(d.getDate() + parseInt(returnDays)); return d.toISOString().slice(0, 10); })()
          : undefined,
      };
      await consultationsApi.create(patientId, payload);
      toast.success("Prontuário salvo!");
      setSaved(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar prontuário");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 px-5 pb-6">
      {/* Tipo de consulta */}
      <div>
        <label className={lbl}>Tipo de consulta</label>
        <select className={inp} value={consultType} onChange={(e) => setConsultType(e.target.value)}>
          {CONSULT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* ── Anamnese ── */}
      <div className="space-y-3">
        <p className={sectionTitle}>Anamnese</p>
        <div>
          <label className={lbl}>Queixa principal *</label>
          <textarea className={inp + " min-h-[80px] resize-none"} placeholder="Motivo da consulta..." value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>História da doença atual</label>
          <textarea className={inp + " min-h-[80px] resize-none"} placeholder="Início, evolução..." value={historyOfIllness} onChange={(e) => setHistoryOfIllness(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>Localização da dor</label>
            <input className={inp} placeholder="Joelho direito, lombar..." value={painLocation} onChange={(e) => setPainLocation(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Duração</label>
            <div className="flex gap-2">
              <input type="number" min="1" className={inp + " w-20 flex-shrink-0"} placeholder="Qtd" value={durationQty} onChange={(e) => setDurationQty(e.target.value)} />
              <select className={inp} value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)}>
                {DURATION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* EVA */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={lbl + " mb-0"}>Escala de dor (EVA)</label>
            {painScale !== null ? (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${PAIN_COLORS[painScale]}`}>{painScale}/10</span>
            ) : (
              <span className="text-xs text-slate-400">não avaliado</span>
            )}
          </div>
          <input
            type="range" min="0" max="10" step="1"
            className="w-full h-2 appearance-none rounded-full cursor-pointer"
            style={{ background: painScale !== null ? `linear-gradient(to right, #ef4444 0%, #ef4444 ${painScale * 10}%, #e5e7eb ${painScale * 10}%, #e5e7eb 100%)` : "#e5e7eb" }}
            value={painScale ?? 0}
            onChange={(e) => setPainScale(parseInt(e.target.value))}
            onMouseDown={() => { if (painScale === null) setPainScale(0); }}
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>Sem dor</span><span>Dor máxima</span>
          </div>
          {painScale !== null && (
            <button type="button" onClick={() => setPainScale(null)} className="text-[10px] text-slate-400 underline mt-1">Limpar</button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Fatores de piora</label>
            <textarea className={inp + " min-h-[60px] resize-none"} placeholder="Movimento, esforço..." value={aggravating} onChange={(e) => setAggravating(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Fatores de melhora</label>
            <textarea className={inp + " min-h-[60px] resize-none"} placeholder="Repouso, calor..." value={relieving} onChange={(e) => setRelieving(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={lbl}>Tratamentos anteriores</label>
          <textarea className={inp + " min-h-[60px] resize-none"} placeholder="Fisioterapia, cirurgias, medicamentos..." value={previousTreatments} onChange={(e) => setPreviousTreatments(e.target.value)} />
        </div>
      </div>

      {/* ── Exame Físico ── */}
      <div className="space-y-3">
        <p className={sectionTitle}>Exame Físico</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>Pressão Arterial (mmHg)</label>
            <div className="flex items-center gap-1.5">
              <input type="number" className={inp} placeholder="120" value={bpSystolic} onChange={(e) => setBpSystolic(e.target.value)} />
              <span className="text-slate-400 font-bold">/</span>
              <input type="number" className={inp} placeholder="80" value={bpDiastolic} onChange={(e) => setBpDiastolic(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={lbl}>FC (bpm)</label>
            <input type="number" className={inp} placeholder="72" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Temperatura (°C)</label>
            <input type="number" step="0.1" className={inp} placeholder="36.5" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Peso (kg)</label>
            <input type="number" step="0.1" className={inp} placeholder="75" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Altura (cm)</label>
            <input type="number" className={inp} placeholder="175" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>IMC</label>
            <div className={inp + " flex items-center " + (imc ? "" : "text-slate-400")}>
              <span>{imc ?? "—"}</span>
              {imc && (
                <span className="ml-2 text-[10px] font-semibold text-blue-600">
                  {parseFloat(imc) < 18.5 ? "Abaixo peso" : parseFloat(imc) < 25 ? "Normal" : parseFloat(imc) < 30 ? "Sobrepeso" : "Obeso"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div>
          <label className={lbl}>Inspeção / Palpação</label>
          <textarea className={inp + " min-h-[70px] resize-none"} placeholder="Sem alterações / Edema leve..." value={physicalExam} onChange={(e) => setPhysicalExam(e.target.value)} />
        </div>
      </div>

      {/* ── Testes Ortopédicos ── */}
      <div className="space-y-2">
        <p className={sectionTitle}>Testes Ortopédicos Especiais</p>
        {Object.entries(testsByRegion).map(([region, tests]) => (
          <div key={region}>
            <p className="text-xs font-bold text-slate-400 mb-1.5">{region}</p>
            <div className="space-y-1.5">
              {tests.map((t) => {
                const active = specialTestsMap[t.key] !== undefined;
                return (
                  <div key={t.key} className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer min-w-[140px]">
                      <input type="checkbox" checked={active} onChange={() => toggleTest(t.key)} className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300" />
                      <span className="text-xs text-slate-700 dark:text-slate-300">{t.label}</span>
                    </label>
                    {active && (
                      <select className={inp + " text-xs py-1"} value={specialTestsMap[t.key]} onChange={(e) => setSpecialTestsMap((prev) => ({ ...prev, [t.key]: e.target.value }))}>
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

      {/* ── Diagnóstico ── */}
      <div className="space-y-3">
        <p className={sectionTitle}>Diagnóstico</p>
        <div>
          <label className={lbl}>CID-10</label>
          <CidSearch value={cid10} onChange={setCid10} />
        </div>
        <div>
          <label className={lbl}>Hipótese diagnóstica</label>
          <textarea className={inp + " min-h-[70px] resize-none"} placeholder="Diagnóstico principal e hipóteses..." value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        </div>
      </div>

      {/* ── Conduta ── */}
      <div className="space-y-3">
        <p className={sectionTitle}>Conduta</p>
        <div>
          <label className={lbl}>Plano de tratamento</label>
          <textarea className={inp + " min-h-[90px] resize-none"} placeholder="Medicamentos, fisioterapia, cirurgia..." value={treatmentPlan} onChange={(e) => setTreatmentPlan(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Retorno em (dias)</label>
          <div className="flex items-center gap-3">
            <input type="number" min="1" className={inp + " w-28"} placeholder="Ex: 30" value={returnDays} onChange={(e) => setReturnDays(e.target.value)} />
            {returnDays && (
              <span className="text-xs text-slate-500">
                {new Date(Date.now() + parseInt(returnDays) * 86400000).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Botão salvar */}
      {saved ? (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
          <p className="text-emerald-700 dark:text-emerald-300 font-semibold text-sm">Prontuário salvo!</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 text-sm"
        >
          {saving ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
          ) : (
            <><Save className="w-4 h-4" /> Salvar Prontuário</>
          )}
        </button>
      )}
    </div>
  );
}

// ── Tab: Receita ───────────────────────────────────────────────────────────────

function TabReceita({ patientId, patient }: { patientId: number; patient: any }) {
  const [medications, setMedications] = useState<Medication[]>([emptyMed()]);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loadingRx, setLoadingRx] = useState(true);
  const [printRx, setPrintRx] = useState<{ date: string; medications: Medication[]; instructions: string } | null>(null);

  useEffect(() => {
    prescriptionsApi.list(patientId)
      .then(setPrescriptions)
      .catch(() => {})
      .finally(() => setLoadingRx(false));
  }, [patientId]);

  const updateMed = (i: number, k: keyof Medication, v: string) =>
    setMedications((ms) => ms.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));

  const handleSave = async () => {
    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) { toast.error("Adicione pelo menos um medicamento"); return; }
    setSaving(true);
    try {
      const newRx = await prescriptionsApi.create(patientId, {
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

  const handlePrint = () => {
    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) { toast.error("Adicione pelo menos um medicamento para imprimir"); return; }
    setPrintRx({ date: new Date().toISOString().split("T")[0], medications: validMeds, instructions });
  };

  return (
    <div className="space-y-4 px-5 pb-6">
      {printRx && <PrintModal rx={printRx} patient={patient} onClose={() => setPrintRx(null)} />}

      <AllergyBanner patient={patient} />

      <div className="space-y-3">
        <p className={sectionTitle}>Nova Receita</p>
        {medications.map((med, i) => (
          <MedRowInline
            key={i}
            med={med}
            index={i}
            total={medications.length}
            onChange={(k, v) => updateMed(i, k, v)}
            onRemove={() => setMedications((ms) => ms.filter((_, idx) => idx !== i))}
          />
        ))}

        <button
          type="button"
          onClick={() => setMedications((ms) => [...ms, emptyMed()])}
          className="w-full py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2 text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar medicamento
        </button>

        <div>
          <label className={lbl}>Orientações gerais</label>
          <textarea className={inp + " min-h-[70px] resize-none"} placeholder="Evitar álcool, repouso, retorno em 7 dias..." value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold flex items-center justify-center gap-2 text-sm"
          >
            <Printer className="w-4 h-4" /> Imprimir
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 text-sm"
          >
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
            ) : (
              <><Save className="w-4 h-4" /> Salvar Receita</>
            )}
          </button>
        </div>
      </div>

      {/* Histórico */}
      {!loadingRx && prescriptions.length > 0 && (
        <div className="space-y-2">
          <p className={sectionTitle}>Receitas anteriores</p>
          {prescriptions.slice(0, 5).map((rx) => (
            <div key={rx.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatDate(rx.date)}</p>
                <button
                  onClick={() => setPrintRx({ date: rx.date, medications: rx.medications || [], instructions: rx.instructions || "" })}
                  className="p-1 text-slate-400 hover:text-blue-600"
                  title="Imprimir"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-0.5">
                {rx.medications?.slice(0, 3).map((m: any, i: number) => (
                  <p key={i} className="text-xs text-slate-600 dark:text-slate-400">
                    {i + 1}. {m.name}{m.dose ? ` — ${m.dose}` : ""}
                  </p>
                ))}
                {(rx.medications?.length || 0) > 3 && (
                  <p className="text-xs text-slate-400">+{rx.medications.length - 3} mais...</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Exames ────────────────────────────────────────────────────────────────

function TabExames({ patientId }: { patientId: number }) {
  const [items, setItems] = useState<ExamItem[]>([emptyExam()]);
  const [indication, setIndication] = useState("");
  const [urgency, setUrgency] = useState("eletivo");
  const [saving, setSaving] = useState(false);
  const [exams, setExams] = useState<any[]>([]);
  const [loadingEx, setLoadingEx] = useState(true);

  useEffect(() => {
    examsApi.list(patientId)
      .then(setExams)
      .catch(() => {})
      .finally(() => setLoadingEx(false));
  }, [patientId]);

  const addCommon = (name: string) => {
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (last.name === "") return prev.map((it, i) => i === prev.length - 1 ? { ...it, name } : it);
      return [...prev, { name, laterality: "", notes: "" }];
    });
  };

  const handleSave = async () => {
    const valid = items.filter((it) => it.name.trim());
    if (valid.length === 0) { toast.error("Adicione pelo menos um exame"); return; }
    setSaving(true);
    try {
      const newEx = await examsApi.create(patientId, {
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
      toast.error("Erro ao salvar solicitação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 px-5 pb-6">
      <div className="space-y-3">
        <p className={sectionTitle}>Nova Solicitação</p>

        {/* Atalhos */}
        <div>
          <label className={lbl}>Exames frequentes</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {COMMON_EXAMS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => addCommon(ex)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
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
                <label className={lbl}>Exame *</label>
                <input
                  className={inp}
                  placeholder="Nome do exame"
                  value={item.name}
                  onChange={(e) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, name: e.target.value } : it))}
                />
              </div>
              <div>
                <label className={lbl}>Lateralidade</label>
                <select
                  className={inp}
                  value={item.laterality}
                  onChange={(e) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, laterality: e.target.value } : it))}
                >
                  <option value="">—</option>
                  <option>Direito</option>
                  <option>Esquerdo</option>
                  <option>Bilateral</option>
                </select>
              </div>
            </div>
            {items.length > 1 && (
              <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} className="p-2 text-red-400 hover:text-red-600 mb-0.5">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setItems((p) => [...p, emptyExam()])}
          className="w-full py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2 text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar exame
        </button>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Urgência</label>
            <select className={inp} value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              <option value="eletivo">Eletivo</option>
              <option value="urgente">Urgente</option>
              <option value="emergencia">Emergência</option>
            </select>
          </div>
        </div>

        <div>
          <label className={lbl}>Indicação clínica</label>
          <textarea className={inp + " min-h-[70px] resize-none"} placeholder="CID, diagnóstico, motivo..." value={indication} onChange={(e) => setIndication(e.target.value)} />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 text-sm"
        >
          {saving ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
          ) : (
            <><FlaskConical className="w-4 h-4" /> Solicitar Exames</>
          )}
        </button>
      </div>

      {/* Histórico */}
      {!loadingEx && exams.length > 0 && (
        <div className="space-y-2">
          <p className={sectionTitle}>Solicitações anteriores</p>
          {exams.slice(0, 5).map((ex) => (
            <div key={ex.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatDate(ex.date)}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ex.urgency === "urgente" ? "bg-red-100 text-red-700" : ex.urgency === "emergencia" ? "bg-red-200 text-red-800" : "bg-slate-100 text-slate-600"}`}>
                  {ex.urgency}
                </span>
              </div>
              <div className="space-y-0.5">
                {ex.exams?.slice(0, 3).map((e: any, i: number) => (
                  <p key={i} className="text-xs text-slate-600 dark:text-slate-400">
                    {i + 1}. {e.name}{e.laterality ? ` — ${e.laterality}` : ""}
                  </p>
                ))}
                {(ex.exams?.length || 0) > 3 && (
                  <p className="text-xs text-slate-400">+{ex.exams.length - 3} mais...</p>
                )}
              </div>
              {ex.clinical_indication && (
                <p className="text-[11px] text-slate-400 mt-1 border-t border-slate-100 dark:border-slate-700 pt-1">
                  Indicação: {ex.clinical_indication}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Drawer ────────────────────────────────────────────────────────────────

export default function ConsultaDrawer({ entry, onClose, onStatusChange }: ConsultaDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("prontuario");
  const [patient, setPatient] = useState<any>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [busyStatus, setBusyStatus] = useState(false);

  useEffect(() => {
    setLoadingPatient(true);
    setPatient(null);
    patientsApi.get(entry.patient_id)
      .then(setPatient)
      .catch(() => toast.error("Erro ao carregar dados do paciente"))
      .finally(() => setLoadingPatient(false));
  }, [entry.patient_id]);

  const handleStatus = async (newStatus: QueueStatus) => {
    setBusyStatus(true);
    try {
      await onStatusChange(entry.id, newStatus);
    } finally {
      setBusyStatus(false);
    }
  };

  const allergies = parseList(patient?.allergies);

  const tabs: { key: DrawerTab; label: string; icon: React.ReactNode }[] = [
    { key: "prontuario", label: "Prontuário", icon: <ClipboardList className="w-4 h-4" /> },
    { key: "receita", label: "Receita", icon: <FileText className="w-4 h-4" /> },
    { key: "exames", label: "Exames", icon: <FlaskConical className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-5 pt-4 pb-3 space-y-3">
        {/* Top row: name + close */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 truncate">
              {entry.patient_name}
            </h2>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {patient?.birth_date && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{calcAge(patient.birth_date)}</span>
              )}
              {entry.patient_insurance && (
                <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                  {entry.patient_insurance}
                </span>
              )}
              {entry.reason && (
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">· {entry.reason}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Allergy banner in header */}
        {allergies.length > 0 && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-xs font-bold text-red-800 dark:text-red-300">
              Alérgico a: {allergies.join(", ")}
            </p>
          </div>
        )}

        {/* Status buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {entry.status === "waiting" && (
            <>
              <button
                onClick={() => handleStatus("attending")}
                disabled={busyStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" /> Chamar
              </button>
              <button
                onClick={() => handleStatus("absent")}
                disabled={busyStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
              >
                <UserX className="w-3.5 h-3.5" /> Ausente
              </button>
            </>
          )}
          {entry.status === "attending" && (
            <button
              onClick={() => handleStatus("attended")}
              disabled={busyStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Concluir Atendimento
            </button>
          )}
          {(entry.status === "attended" || entry.status === "absent") && (
            <button
              onClick={() => handleStatus("waiting")}
              disabled={busyStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> Recolocar na Fila
            </button>
          )}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            entry.status === "attending" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            : entry.status === "waiting" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          }`}>
            {entry.status === "attending" ? "Em Atendimento" : entry.status === "waiting" ? "Aguardando" : entry.status === "attended" ? "Atendido" : "Ausente"}
          </span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex-shrink-0 flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-all border-b-2 ${
              activeTab === key
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content (scrollable) ── */}
      <div className="flex-1 overflow-y-auto">
        {loadingPatient ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="pt-4">
            {activeTab === "prontuario" && (
              <TabProntuario patientId={entry.patient_id} patient={patient} />
            )}
            {activeTab === "receita" && (
              <TabReceita patientId={entry.patient_id} patient={patient} />
            )}
            {activeTab === "exames" && (
              <TabExames patientId={entry.patient_id} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
