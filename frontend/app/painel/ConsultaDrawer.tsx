"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  X, Play, CheckCircle, UserX, AlertTriangle, Activity, Pill,
  ClipboardList, Stethoscope, FileText, FlaskConical,
  Plus, Trash2, Printer, ChevronDown, ChevronUp, Save,
  Send, ClipboardCheck, Award, Camera, FileSearch2, Upload, ImageIcon, ZoomIn, ZoomOut,
  Pencil, Download,
} from "lucide-react";
import toast from "react-hot-toast";
import { patientsApi, consultationsApi, prescriptionsApi, prescriptionTemplatesApi, examsApi, evolutionApi, clinicApi } from "@/lib/api";
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

type DrawerTab = "anamnese" | "exames" | "receitas" | "encaminhamentos" | "procedimentos" | "atestados" | "laudos" | "fotos";

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
  { code: "S93.4", label: "Entorse e distensão do tornozelo" },
  { code: "M54.2", label: "Cervicalgia" },
  { code: "S42.2", label: "Fratura da diáfise do úmero" },
  { code: "S82.0", label: "Fratura da rótula" },
  { code: "M23.0", label: "Corpo livre em articulação do joelho" },
  { code: "M79.3", label: "Paniculite" },
  { code: "S72.1", label: "Fratura pertrocantérica do fêmur" },
  { code: "S62.5", label: "Fratura dos metacarpos" },
  { code: "M25.5", label: "Dor articular" },
  { code: "M79.6", label: "Dor em membro" },
  { code: "T14.0", label: "Fratura de região não especificada do corpo" },
  { code: "S00.9", label: "Traumatismo superficial não especificado da cabeça" },
];

const ROUTE_OPTIONS = ["oral", "tópico", "IM", "SC", "IV", "transdérmico", "intraarticular", "inalatório", "sublingual", "retal"];

const LS_EXAM_TEMPLATES_KEY = "orthoclinic_exam_templates";
const LS_EXAM_FONT_SIZE_KEY = "orthoclinic_exam_font_size";
const LS_EXAM_LINE_HEIGHT_KEY = "orthoclinic_exam_line_height";

// Quick exam templates built-in (ortopedia ambulatorial)
const EXAM_QUICK_TEMPLATES = [
  { name: "RNM Joelho", content: "SOLICITO: RESSONÂNCIA MAGNÉTICA DO JOELHO [D/E] SEM CONTRASTE\nINCIDÊNCIAS: Coronal, Sagital, Axial\nHD: LESÃO MENISCAL / LCA" },
  { name: "RX Coluna LS", content: "SOLICITO: RADIOGRAFIA DA COLUNA LOMBOSSACRA\nINCIDÊNCIAS: AP e Perfil\nHD: LOMBALGIA / ESPONDILODISCOARTROSE" },
  { name: "TC Coluna", content: "SOLICITO: TOMOGRAFIA COMPUTADORIZADA DA COLUNA LOMBAR\nHD: HÉRNIA DISCAL / ESTENOSE DO CANAL" },
  { name: "DXA", content: "SOLICITO: DENSITOMETRIA ÓSSEA\nREGIÕES: Coluna lombar L1-L4 e fêmur proximal bilateral\nHD: OSTEOPOROSE / OSTEOPENIA" },
  { name: "EMG", content: "SOLICITO: ELETRONEUROMIOGRAFIA DOS MEMBROS [SUPERIORES/INFERIORES]\nHD: SÍNDROME DO TÚNEL DO CARPO / RADICULOPATIA" },
  { name: "RNM Ombro", content: "SOLICITO: RESSONÂNCIA MAGNÉTICA DO OMBRO [D/E] SEM CONTRASTE\nINCIDÊNCIAS: Coronal, Sagital, Axial\nHD: LESÃO DO MANGUITO ROTADOR / IMPACTO SUBACROMIAL" },
  { name: "RX Joelho", content: "SOLICITO: RADIOGRAFIA DO JOELHO [D/E]\nINCIDÊNCIAS: AP, Perfil e Axial de Patela\nHD: GONARTROSE" },
  { name: "US Ombro", content: "SOLICITO: ULTRASSONOGRAFIA DO OMBRO [D/E]\nHD: TENDINOPATIA / BURSITE SUBACROMIAL" },
];

interface ExamTemplate {
  id: string;
  name: string;
  content: string;
}

function loadExamTemplates(): ExamTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_EXAM_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveExamTemplates(list: ExamTemplate[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_EXAM_TEMPLATES_KEY, JSON.stringify(list));
}

function loadExamFontSize(): 12 | 14 | 16 {
  if (typeof window === "undefined") return 14;
  const v = localStorage.getItem(LS_EXAM_FONT_SIZE_KEY);
  if (v === "12" || v === "14" || v === "16") return Number(v) as 12 | 14 | 16;
  return 14;
}

function loadExamLineHeight(): "normal" | "relaxed" {
  if (typeof window === "undefined") return "normal";
  const v = localStorage.getItem(LS_EXAM_LINE_HEIGHT_KEY);
  if (v === "relaxed") return "relaxed";
  return "normal";
}

// ── Drug-allergy alert groups ───────────────────────────────────────────────────
const DRUG_ALLERGY_GROUPS: { groupKeywords: string[]; drugKeywords: string[] }[] = [
  { groupKeywords: ["aine", "anti-inflamatório", "antiinflamatório", "nsaid", "aspirina", "asa", "aas"], drugKeywords: ["nimesulida", "diclofenaco", "meloxicam", "ibuprofeno", "celecoxib", "etoricoxib", "naproxeno", "piroxicam", "cetoprofeno", "tenoxicam"] },
  { groupKeywords: ["penicilina", "amoxicilina", "ampicilina"], drugKeywords: ["amoxicilina", "ampicilina", "amoxil"] },
  { groupKeywords: ["sulfa", "sulfonamida"], drugKeywords: ["sulfametoxazol", "bactrim"] },
  { groupKeywords: ["dipirona", "metamizol"], drugKeywords: ["dipirona", "novalgina"] },
];

function checkDrugAllergyAlert(medName: string, allergiesStr: string): string | null {
  if (!medName || !allergiesStr) return null;
  const name = medName.toLowerCase();
  const alrg = allergiesStr.toLowerCase();
  for (const grp of DRUG_ALLERGY_GROUPS) {
    const allergyMatches = grp.groupKeywords.some(k => alrg.includes(k)) || grp.drugKeywords.some(k => alrg.includes(k));
    const drugMatches = grp.drugKeywords.some(k => name.includes(k));
    if (allergyMatches && drugMatches) {
      return allergiesStr;
    }
  }
  return null;
}

// ── Ortho autocomplete medications ─────────────────────────────────────────────
interface OrthoMedPreset {
  name: string; dose: string; route: string; frequency: string; duration: string; instructions: string; prescriptionType: "simples" | "controle_especial" | "antimicrobiano";
}
const ORTHO_MEDICATIONS: OrthoMedPreset[] = [
  { name: "Nimesulida 100mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "5 dias", instructions: "Tomar após refeições", prescriptionType: "simples" },
  { name: "Diclofenaco Potássico 50mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "5 dias", instructions: "Tomar após refeições", prescriptionType: "simples" },
  { name: "Meloxicam 15mg", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "7 dias", instructions: "Tomar após refeição principal", prescriptionType: "simples" },
  { name: "Cetoprofeno 100mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "5 dias", instructions: "Tomar após refeições", prescriptionType: "simples" },
  { name: "Tramadol 50mg", dose: "1 cápsula", route: "oral", frequency: "8/8h", duration: "5 dias", instructions: "Pode causar sonolência", prescriptionType: "controle_especial" },
  { name: "Codeína 30mg", dose: "1 comprimido", route: "oral", frequency: "6/6h", duration: "3 dias", instructions: "Conforme necessidade de dor", prescriptionType: "controle_especial" },
  { name: "Ciclobenzaprina 5mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "7 dias", instructions: "Pode causar sonolência — evitar dirigir", prescriptionType: "simples" },
  { name: "Omeprazol 20mg", dose: "1 cápsula", route: "oral", frequency: "1x/dia", duration: "30 dias", instructions: "Tomar 30 min antes do café", prescriptionType: "simples" },
  { name: "Prednisolona 20mg", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "5 dias", instructions: "Tomar pela manhã após refeição", prescriptionType: "simples" },
  { name: "Dexametasona 4mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "3 dias", instructions: "Tomar após refeições", prescriptionType: "simples" },
  { name: "Tenoxicam 20mg", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "7 dias", instructions: "Tomar após refeição principal", prescriptionType: "simples" },
  { name: "Paracetamol 750mg", dose: "1 comprimido", route: "oral", frequency: "6/6h", duration: "5 dias", instructions: "Conforme necessidade — máx. 4 comprimidos/dia", prescriptionType: "simples" },
  { name: "Dipirona 500mg", dose: "2 comprimidos", route: "oral", frequency: "6/6h", duration: "3 dias", instructions: "Conforme necessidade de dor ou febre", prescriptionType: "simples" },
  { name: "Gabapentina 300mg", dose: "1 cápsula", route: "oral", frequency: "8/8h", duration: "30 dias", instructions: "Aumentar dose gradualmente conforme orientação", prescriptionType: "simples" },
  { name: "Pregabalina 75mg", dose: "1 cápsula", route: "oral", frequency: "12/12h", duration: "30 dias", instructions: "Pode causar sonolência e tontura", prescriptionType: "simples" },
  { name: "Alopurinol 300mg", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "30 dias", instructions: "Tomar após refeição principal — manter hidratação", prescriptionType: "simples" },
  { name: "Colchicina 0,5mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "5 dias", instructions: "Suspender se diarreia ou dor abdominal intensa", prescriptionType: "simples" },
  { name: "Condroitina + Glucosamina", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "90 dias", instructions: "Tomar após refeição", prescriptionType: "simples" },
  { name: "Carisoprodol + Diclofenaco", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "5 dias", instructions: "Tomar após refeições — pode causar sonolência", prescriptionType: "simples" },
  { name: "Enoxaparina 40mg/0,4ml", dose: "0,4ml", route: "SC", frequency: "1x/dia", duration: "Conforme protocolo", instructions: "Aplicar no abdome — alternar lado", prescriptionType: "simples" },
];

// ── Referral text templates ─────────────────────────────────────────────────────
const REFERRAL_TEXT_TEMPLATES = [
  { type: "fisioterapia", name: "Gonartrose (fortalecimento)", text: "Paciente portador(a) de gonartrose (CID: M17.1). Solicito avaliação e início de programa de fortalecimento muscular de quadríceps e isquiotibiais, visando melhora funcional e alívio da dor." },
  { type: "fisioterapia", name: "Pós-op LCA", text: "Paciente em pós-operatório de reconstrução do ligamento cruzado anterior. Solicito fisioterapia pós-operatória conforme protocolo de reabilitação de LCA." },
  { type: "fisioterapia", name: "Lombalgia crônica", text: "Paciente com lombalgia crônica (CID: M54.5). Solicito avaliação e programa de fisioterapia para fortalecimento do core e reabilitação funcional." },
  { type: "fisioterapia", name: "Síndrome do ombro", text: "Paciente com síndrome do manguito rotador (CID: M75.1). Solicito avaliação e tratamento fisioterápico — cinesioterapia e fortalecimento do manguito." },
  { type: "especialidade", name: "Lombalgia → Neurologia", text: "Paciente com lombalgia crônica e sinais de radiculopatia. Solicito avaliação neurológica para investigação diagnóstica e conduta especializada." },
  { type: "especialidade", name: "Suspeita reumatológica", text: "Paciente com artralgia poliarticular de padrão inflamatório. Solicito avaliação reumatológica para investigação de doença reumatológica sistêmica." },
  { type: "colega", name: "Segunda opinião cirúrgica", text: "Encaminho o(a) paciente para avaliação e segunda opinião cirúrgica. Segue resumo clínico e exames anexos para sua apreciação." },
  { type: "outro", name: "Clínica da dor", text: "Paciente com dor crônica de difícil controle. Solicito avaliação multidisciplinar em clínica especializada em dor para otimização do tratamento analgésico." },
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
  id: string; name: string; dose: string; route: string; frequency: string; duration: string; instructions: string; quantity?: string;
}
const emptyMed = (): Medication => ({ id: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now() + Math.random()), name: "", dose: "", route: "oral", frequency: "", duration: "", instructions: "", quantity: "" });

function MedRowInline({ med, index, total, onChange, onRemove, allergyWarning }: {
  med: Medication; index: number; total: number;
  onChange: (k: keyof Medication, v: string) => void;
  onRemove: () => void;
  allergyWarning?: string | null;
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
      {allergyWarning && (
        <div className="flex items-start gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded px-2 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700 dark:text-red-300 font-semibold">ATENÇÃO: paciente refere alergia a {allergyWarning}. Confirme antes de prescrever.</p>
        </div>
      )}
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
        <div>
          <label className={lbl}>Qtd. total (QSP)</label>
          <input className={inp} placeholder="Ex: 10 comprimidos" value={med.quantity || ""} onChange={(e) => onChange("quantity", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Instruções</label>
          <input className={inp} placeholder="Tomar após as refeições..." value={med.instructions} onChange={(e) => onChange("instructions", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Tipos de Receita ──────────────────────────────────────────────────────────

type PrescriptionType = "simples" | "controle_especial" | "antimicrobiano" | "notificacao_ab";

// Alias de compatibilidade com valores antigos do banco
function normalizePrescriptionType(t: string): PrescriptionType {
  if (t === "especial_azul") return "controle_especial";
  if (t === "especial_amarelo") return "controle_especial";
  if (t === "simples" || t === "controle_especial" || t === "antimicrobiano" || t === "notificacao_ab") return t as PrescriptionType;
  return "simples";
}

const PRESCRIPTION_TYPE_LABELS: Record<PrescriptionType, string> = {
  simples: "Simples (Branca)",
  controle_especial: "Controle Especial (RCE)",
  antimicrobiano: "Antimicrobiano (ATB)",
  notificacao_ab: "Notificação A/B (SESA)",
};

// Print prescription modal — 3 tipos que o médico pode imprimir + aviso para A/B
function PrintModal({ rx, patient, clinic, onClose }: {
  rx: {
    date: string;
    medications: Medication[];
    instructions: string;
    prescription_type: PrescriptionType;
    patientAddress?: string;
    patientPhone?: string;
  };
  patient: any;
  clinic?: any;
  onClose: () => void;
}) {
  const type = normalizePrescriptionType(rx.prescription_type);
  const isRCE = type === "controle_especial";
  const isATB = type === "antimicrobiano";
  const vias = (isRCE || isATB) ? 2 : 1;
  const headerColor = isRCE ? "#5c3a00" : isATB ? "#003580" : "#0F2D5E";
  const viaLabels = (isRCE || isATB) ? ["1ª VIA — FARMÁCIA", "2ª VIA — PACIENTE"] : ["VIA ÚNICA"];

  const dateStr = (() => {
    const d = new Date(rx.date + "T12:00:00");
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  })();

  // Folha para RCE (Controle Especial — Portaria 344/98)
  const RCESheet = ({ viaLabel, viaIndex }: { viaLabel: string; viaIndex: number }) => (
    <div style={{
      background: "white",
      border: `2px solid ${headerColor}`,
      borderRadius: "8px",
      padding: "18px",
      marginBottom: viaIndex < vias - 1 ? "0" : "0",
      fontSize: "12px",
      color: "#111",
    }}>
      {/* Cabeçalho */}
      <div style={{ borderBottom: `2px solid ${headerColor}`, paddingBottom: "10px", marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "15px", margin: "0 0 1px 0", color: headerColor }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Ortopedia e Traumatologia</p>
            <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
            {clinic?.phone && <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Tel: {clinic.phone}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontWeight: 700, fontSize: "10px", color: headerColor, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px 0" }}>Receita de Controle Especial</p>
            <p style={{ fontWeight: 700, fontSize: "11px", color: headerColor, margin: "0" }}>{viaLabel}</p>
          </div>
        </div>
      </div>

      {/* Paciente */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "12px", fontSize: "11px" }}>
        <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "9px" }}>Paciente: </span><span style={{ fontWeight: 600 }}>{patient?.name}</span></div>
        <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "9px" }}>Data: </span><span>{dateStr}</span></div>
        {patient?.cpf && <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "9px" }}>CPF: </span><span style={{ fontFamily: "monospace" }}>{patient.cpf}</span></div>}
        {patient?.birth_date && <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "9px" }}>Nasc.: </span><span>{new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}</span></div>}
      </div>

      {/* Medicamentos */}
      <div style={{ marginBottom: "12px", borderBottom: "1px solid #ddd", paddingBottom: "10px" }}>
        {rx.medications.map((m, i) => (
          <div key={i} style={{ marginBottom: "8px" }}>
            <p style={{ fontWeight: 600, margin: "0 0 1px 0" }}>{i + 1}. {m.name}{m.dose ? ` — ${m.dose}` : ""}</p>
            <p style={{ color: "#555", fontSize: "10px", margin: "0 0 1px 0" }}>{[m.route && `Via ${m.route}`, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
            {m.instructions && <p style={{ color: "#777", fontSize: "10px", fontStyle: "italic", margin: "0" }}>Obs: {m.instructions}</p>}
          </div>
        ))}
        {rx.instructions && (
          <p style={{ color: "#555", fontSize: "10px", marginTop: "6px", fontStyle: "italic" }}>Orientações: {rx.instructions}</p>
        )}
      </div>

      {/* Assinatura e validade */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "10px" }}>
        <div style={{ fontSize: "10px", color: "#888" }}>
          <p style={{ margin: "0 0 3px 0" }}>Portaria SVS/MS 344/98</p>
          <p style={{ margin: "0" }}>Validade: 30 dias a partir de {dateStr}</p>
        </div>
        <div style={{ textAlign: "center", width: "180px" }}>
          <p style={{ fontSize: "10px", color: "#555", margin: "0 0 4px 0" }}>{clinic ? `${clinic.city}/${clinic.state}` : "_____________"} , {dateStr}</p>
          <div style={{ borderTop: `1px solid ${headerColor}`, paddingTop: "4px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "10px", color: "#666", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Folha para ATB (RDC ANVISA 20/2011)
  const ATBSheet = ({ viaLabel, viaIndex }: { viaLabel: string; viaIndex: number }) => (
    <div style={{
      background: "white",
      border: `2px solid ${headerColor}`,
      borderRadius: "8px",
      padding: "18px",
      fontSize: "12px",
      color: "#111",
    }}>
      {/* Cabeçalho */}
      <div style={{ borderBottom: `2px solid ${headerColor}`, paddingBottom: "10px", marginBottom: "12px" }}>
        <p style={{ fontWeight: 700, fontSize: "11px", color: headerColor, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px 0", textAlign: "center" }}>
          Receita para Antimicrobianos — RDC ANVISA 20/2011
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "10px", color: "#555", textTransform: "uppercase", margin: "0 0 2px 0" }}>Prescritor</p>
            <p style={{ fontWeight: 700, fontSize: "14px", margin: "0 0 1px 0", color: headerColor }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "10px", color: "#555", margin: "0" }}>Especialidade: Ortopedia e Traumatologia</p>
            <p style={{ fontSize: "10px", color: "#555", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
            {clinic?.phone && <p style={{ fontSize: "10px", color: "#555", margin: "0" }}>Tel: {clinic.phone}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontWeight: 700, fontSize: "11px", color: headerColor, margin: "0" }}>{viaLabel}</p>
            <p style={{ fontSize: "10px", color: "#888", margin: "4px 0 0 0" }}>Data: {dateStr}</p>
          </div>
        </div>
      </div>

      {/* Dados do paciente */}
      <div style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "8px", marginBottom: "12px", fontSize: "10px" }}>
        <p style={{ fontWeight: 700, color: "#555", textTransform: "uppercase", fontSize: "9px", margin: "0 0 6px 0" }}>Identificação do Paciente</p>
        <p style={{ margin: "0 0 3px 0" }}><strong>Paciente:</strong> {patient?.name}</p>
        {patient?.cpf && <p style={{ margin: "0 0 3px 0" }}><strong>CPF:</strong> {patient.cpf}</p>}
        {rx.patientAddress && <p style={{ margin: "0 0 3px 0" }}><strong>Endereço:</strong> {rx.patientAddress}</p>}
        {rx.patientPhone && <p style={{ margin: "0" }}><strong>Telefone:</strong> {rx.patientPhone}</p>}
      </div>

      {/* Medicamentos */}
      <div style={{ marginBottom: "12px", borderBottom: "1px solid #ddd", paddingBottom: "10px" }}>
        <p style={{ fontWeight: 700, color: "#444", textTransform: "uppercase", fontSize: "9px", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>Prescrição</p>
        {rx.medications.map((m, i) => (
          <div key={i} style={{ marginBottom: "8px" }}>
            <p style={{ fontWeight: 600, margin: "0 0 1px 0" }}>{i + 1}. {m.name}{m.dose ? ` — ${m.dose}` : ""}</p>
            <p style={{ color: "#555", fontSize: "10px", margin: "0 0 1px 0" }}>{[m.route && `Via ${m.route}`, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
            {m.instructions && <p style={{ color: "#777", fontSize: "10px", fontStyle: "italic", margin: "0" }}>Obs: {m.instructions}</p>}
          </div>
        ))}
        {rx.instructions && (
          <p style={{ color: "#555", fontSize: "10px", marginTop: "6px", fontStyle: "italic" }}>Orientações: {rx.instructions}</p>
        )}
      </div>

      {/* Assinatura */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <p style={{ fontSize: "9px", color: "#aaa", margin: "0" }}>Antibiótico de uso sob prescrição médica — RDC ANVISA 20/2011</p>
        <div style={{ textAlign: "center", width: "180px" }}>
          <div style={{ borderTop: `1px solid ${headerColor}`, paddingTop: "4px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "10px", color: "#666", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Folha para Receita Simples
  const SimplesSheet = () => (
    <div style={{
      background: "white",
      border: `2px solid ${headerColor}`,
      borderRadius: "8px",
      padding: "20px",
      fontSize: "13px",
      color: "#111",
    }}>
      {/* Cabeçalho */}
      <div style={{ borderBottom: `2px solid ${headerColor}`, paddingBottom: "12px", marginBottom: "14px", textAlign: "center" }}>
        <h1 style={{ fontSize: "16px", fontWeight: 700, color: headerColor, margin: "0 0 2px 0" }}>Dr. Valth Guimarães</h1>
        <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Ortopedia e Traumatologia</p>
        <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
        {clinic?.phone && <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Tel: {clinic.phone}</p>}
      </div>

      {/* Dados do paciente */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px", fontSize: "12px" }}>
        <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "10px" }}>Paciente: </span><span style={{ fontWeight: 600 }}>{patient?.name}</span></div>
        <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "10px" }}>Data: </span><span>{dateStr}</span></div>
        {patient?.cpf && <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "10px" }}>CPF: </span><span style={{ fontFamily: "monospace" }}>{patient.cpf}</span></div>}
        {patient?.birth_date && <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "10px" }}>Nasc.: </span><span>{new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}</span></div>}
      </div>

      {/* Medicamentos */}
      <div style={{ marginBottom: "14px" }}>
        <p style={{ fontWeight: 700, color: "#444", textTransform: "uppercase", fontSize: "10px", letterSpacing: "1px", borderBottom: "1px solid #ddd", paddingBottom: "4px", marginBottom: "10px" }}>Prescrição</p>
        <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {rx.medications.map((m, i) => (
            <li key={i} style={{ marginBottom: "10px", paddingLeft: "4px" }}>
              <p style={{ fontWeight: 600, margin: "0 0 2px 0" }}>{i + 1}. {m.name}{m.dose ? ` — ${m.dose}` : ""}</p>
              <p style={{ color: "#555", fontSize: "11px", margin: "0 0 2px 0" }}>{[m.route && `Via ${m.route}`, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
              {m.instructions && <p style={{ color: "#777", fontSize: "11px", fontStyle: "italic", margin: "0" }}>Obs: {m.instructions}</p>}
            </li>
          ))}
        </ol>
      </div>

      {rx.instructions && (
        <div style={{ background: "#f8f8f8", borderRadius: "4px", padding: "10px", marginBottom: "14px" }}>
          <p style={{ fontWeight: 700, color: "#444", textTransform: "uppercase", fontSize: "10px", marginBottom: "4px" }}>Orientações</p>
          <p style={{ fontSize: "11px", color: "#555", margin: 0 }}>{rx.instructions}</p>
        </div>
      )}

      {/* Assinatura */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
        <div style={{ textAlign: "center", width: "200px" }}>
          <div style={{ borderTop: `2px solid ${headerColor}`, paddingTop: "6px", marginBottom: "2px" }}></div>
          <p style={{ fontSize: "12px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
          <p style={{ fontSize: "11px", color: "#666", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
          <p style={{ fontSize: "10px", color: "#888", margin: "4px 0 0 0" }}>Válido por 30 dias</p>
        </div>
      </div>
    </div>
  );

  const labelMap: Record<PrescriptionType, string> = {
    simples: "Receita Simples — 1 via",
    controle_especial: "Controle Especial (RCE) — 2 vias",
    antimicrobiano: "Antimicrobiano (ATB) — 2 vias",
    notificacao_ab: "Notificação A/B",
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <style>{`
        @media print {
          body > *:not(#print-rx-root) { display: none !important; }
          #print-rx-root { position: fixed !important; inset: 0 !important; z-index: 9999 !important; background: white !important; padding: 10px !important; }
          .no-print { display: none !important; }
          .rx-via-break { page-break-after: always; margin-bottom: 0 !important; }
          .rx-cut-line { display: block !important; }
        }
        .rx-cut-line { display: none; }
      `}</style>
      <div id="print-rx-root" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="no-print px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-50 text-sm">Preview da Receita</h2>
            <p className="text-xs text-slate-500 mt-0.5">{labelMap[type]}</p>
          </div>
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
          {type === "simples" && <SimplesSheet />}
          {type === "controle_especial" && viaLabels.map((label, idx) => (
            <div key={idx}>
              <div className={idx < vias - 1 ? "rx-via-break" : ""}>
                <RCESheet viaLabel={label} viaIndex={idx} />
              </div>
              {idx < vias - 1 && (
                <div className="rx-cut-line" style={{ textAlign: "center", color: "#aaa", fontSize: "10px", margin: "4px 0", letterSpacing: "2px", borderTop: "1px dashed #ccc", paddingTop: "4px" }}>
                  ✂ recortar aqui
                </div>
              )}
            </div>
          ))}
          {type === "antimicrobiano" && viaLabels.map((label, idx) => (
            <div key={idx}>
              <div className={idx < vias - 1 ? "rx-via-break" : ""}>
                <ATBSheet viaLabel={label} viaIndex={idx} />
              </div>
              {idx < vias - 1 && (
                <div className="rx-cut-line" style={{ textAlign: "center", color: "#aaa", fontSize: "10px", margin: "4px 0", letterSpacing: "2px", borderTop: "1px dashed #ccc", paddingTop: "4px" }}>
                  ✂ recortar aqui
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Memed SDK Integration ───────────────────────────────────────────────────────
// SDK Memed Sinapse Prescricao v3.25
// JWT lido de data-token na <script> tag (autenticação automática no carregamento).
// Após o download do script principal, o SDK carrega MdHub + md-privacy de forma
// dinâmica — window.MdSinapsePrescricao só fica disponível depois disso (~2-5s).
// SecurityErrors no console = bug interno do SDK (cross-origin iframe), não-fatal.

declare global {
  interface Window {
    MdSinapsePrescricao?: {
      setToken: (jwt: string) => void;
      command: { send: (module: string, action: string, data?: any) => Promise<any> };
      event: { add: (event: string, cb: (data: any) => void) => void };
    };
  }
}

const MEMED_SDK_URL =
  "https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js";

// ── Singleton de módulo (fora do React) ────────────────────────────────────────
// Garante que o SDK é inicializado uma única vez por sessão do navegador,
// mesmo que o componente seja montado/desmontado várias vezes.
type SdkStatus = "idle" | "loading" | "ready" | "error";
let _sdkStatus: SdkStatus = "idle";
let _sdkActiveJwt: string | null = null;
let _sdkLoadPromise: Promise<void> | null = null;

function _isoToBR(iso: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return undefined;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function _fetchMemedToken(): Promise<string> {
  const API = process.env.NEXT_PUBLIC_API_URL || "https://ortho-clinic-ldcd.onrender.com";
  const bearerToken = typeof window !== "undefined" ? localStorage.getItem("orthoclinic_token") : null;
  const res = await fetch(`${API}/memed/token`, {
    headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
  });
  if (!res.ok) throw new Error(`Memed /token retornou HTTP ${res.status}`);
  const data = await res.json();
  if (data.valid === false) {
    // Token com data desatualizada — falha imediata com mensagem clara ao usuário
    throw new Error(`Token Memed expirado (${data.date}). Atualize MEMED_JWT no Render.`);
  }
  return data.token as string;
}

function _injectScript(jwt: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MEMED_SDK_URL;
    script.type = "text/javascript";
    script.setAttribute("data-token", jwt); // autenticação automática no load

    script.onload = () => {
      // MdHub é carregado dinamicamente após o script principal — poll até 20s
      let ticks = 0;
      const timer = setInterval(() => {
        if (window.MdSinapsePrescricao) { clearInterval(timer); resolve(); return; }
        if (++ticks > 200) { clearInterval(timer); reject(new Error("Memed: MdHub não inicializou em 20s")); }
      }, 100);
    };

    script.onerror = () => reject(new Error("Memed: falha ao baixar SDK (verifique conexão)"));
    document.head.appendChild(script);
  });
}

async function _ensureSdkReady(jwt: string): Promise<void> {
  // Já pronto
  if (_sdkStatus === "ready" && window.MdSinapsePrescricao) return;

  // Já em carregamento — reutiliza a mesma promise
  if (_sdkStatus === "loading" && _sdkLoadPromise) {
    await _sdkLoadPromise;
    return;
  }

  _sdkStatus = "loading";
  _sdkActiveJwt = jwt;

  // Script já está no DOM (ex: segunda chamada após erro recuperado)
  const existingScript = document.querySelector(`script[src="${MEMED_SDK_URL}"]`);
  if (existingScript) {
    _sdkLoadPromise = new Promise<void>((resolve, reject) => {
      if (window.MdSinapsePrescricao) { resolve(); return; }
      let ticks = 0;
      const timer = setInterval(() => {
        if (window.MdSinapsePrescricao) { clearInterval(timer); resolve(); return; }
        if (++ticks > 200) { clearInterval(timer); reject(new Error("Memed: timeout aguardando MdHub")); }
      }, 100);
    });
  } else {
    _sdkLoadPromise = _injectScript(jwt);
  }

  try {
    await _sdkLoadPromise;
    _sdkStatus = "ready";
  } catch (err) {
    _sdkStatus = "error";
    _sdkLoadPromise = null; // permite retry na próxima chamada
    // Garante que iframes residuais do Memed não bloqueiem cliques na UI
    document.querySelectorAll<HTMLIFrameElement>('iframe[src*="memed.com.br"]').forEach((f) => {
      f.style.pointerEvents = "none";
    });
    throw err;
  }
}

async function openMemed(patient: any, _clinic: any): Promise<void> {
  // 1. JWT fresco do backend (env var MEMED_JWT no Render)
  const jwt = await _fetchMemedToken();

  // 2. Carrega e inicializa o SDK (idempotente)
  await _ensureSdkReady(jwt);

  const sdk = window.MdSinapsePrescricao!;

  // 3. Renova token se mudou desde a última abertura
  if (jwt !== _sdkActiveJwt) {
    try { sdk.setToken(jwt); } catch (_) {}
    _sdkActiveJwt = jwt;
  }

  // 4. Registra callbacks de ciclo de vida (SDK ignora duplicatas)
  try {
    sdk.event.add("prescricao:encerramento", () => toast.success("Prescrição finalizada no Memed!"));
    sdk.event.add("logout:token-invalido", () => toast.error("Sessão Memed expirada — recarregue a página."));
  } catch (_) {}

  // 5. Pré-preenche dados do paciente
  try {
    sdk.command.send("platform.patient-management", "setPatient", {
      nome:            patient?.full_name || patient?.name || "",
      data_nascimento: _isoToBR(patient?.date_of_birth || patient?.birth_date || ""),
      telefone:        patient?.phone || undefined,
      cpf:             patient?.cpf   || undefined,
    });
  } catch (_) {}

  // 6. Abre o módulo de prescrição
  sdk.command.send("hub", "core:moduleShow", "plataforma.prescricao");
}

// ── Tab: Prontuário ────────────────────────────────────────────────────────────

const formatDateBR = (dateStr: string) => {
  const d = new Date(dateStr + "T12:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const formatDateBRFull = (dateStr: string) => {
  const d = new Date(dateStr + "T12:00:00");
  const dias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// Evolution type
interface Evolution {
  id: number;
  patient_id: number;
  entry_date: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

// SOAP/templates for prontuario
const PRONTUARIO_TEMPLATES = [
  { name: "SOAP", text: "QP: \nHDA: \nEF: \nHD: \nConduta: " },
  { name: "Retorno", text: "Retorno - \nEvolução: \nEF atual: \nConduta: " },
  { name: "Pós-op", text: "POD: \nFerida: \nDor (0-10): \nFisio: \nRetorno em: " },
  { name: "Urgência", text: "Chegou ao consultório com \nMecanismo: \nEF: \nRX: \nConduta: " },
];

function insertAtCursor(el: HTMLTextAreaElement, text: string): string {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const before = el.value.substring(0, start);
  const after = el.value.substring(end);
  return before + text + after;
}

function TabProntuario({ patientId }: { patientId: number }) {
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);
  const [recentlySavedId, setRecentlySavedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date();
  const todayBRFull = formatDateBRFull(today.toISOString().split("T")[0]);
  const todayISO = today.toISOString().split("T")[0];

  useEffect(() => {
    setLoading(true);
    setEvolutions([]);
    evolutionApi
      .list(patientId)
      .then((data) => setEvolutions(data as Evolution[]))
      .catch(() => toast.error("Erro ao carregar evoluções"))
      .finally(() => setLoading(false));
  }, [patientId]);

  // Scroll to bottom whenever evolutions array grows
  useEffect(() => {
    if (scrollRef.current && evolutions.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [evolutions.length]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 400) + "px";
  }, [newText]);

  const handleSave = async () => {
    if (!newText.trim()) {
      toast.error("Digite a evolução antes de salvar");
      return;
    }
    setSaving(true);
    try {
      const created = await evolutionApi.create(patientId, {
        entry_date: todayISO,
        content: newText.trim(),
      });
      setEvolutions((prev) => [...prev, created as Evolution]);
      setNewText("");
      setRecentlySavedId((created as Evolution).id);
      setTimeout(() => setRecentlySavedId(null), 2500);
      toast.success("Evolução registrada!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar evolução");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (ev: Evolution) => {
    if (!editText.trim()) return;
    setEditSaving(true);
    try {
      const now = new Date();
      const tag = `\n[editado em ${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}]`;
      const newContent = editText.trim() + tag;
      await (evolutionApi as any).update(ev.id, { content: newContent });
      setEvolutions(prev => prev.map(e => e.id === ev.id ? { ...e, content: newContent } : e));
      setEditingId(null);
      toast.success("Evolução atualizada");
    } catch {
      // fallback: update locally only if API not available
      const now = new Date();
      const tag = `\n[editado em ${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}]`;
      setEvolutions(prev => prev.map(e => e.id === ev.id ? { ...e, content: editText.trim() + tag } : e));
      setEditingId(null);
      toast.success("Evolução atualizada (local)");
    } finally {
      setEditSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSave();
    }
  };

  const insertTemplate = (templateText: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setNewText(prev => prev + templateText);
      return;
    }
    const updated = insertAtCursor(ta, templateText);
    setNewText(updated);
    setTimeout(() => {
      const pos = ta.selectionStart + templateText.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
    }, 0);
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Histórico header ── */}
      {!loading && evolutions.length > 0 && (
        <div className="flex items-center justify-between px-5 pt-2 pb-1 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <span className="text-xs text-slate-500">
            {evolutions.length} evolução{evolutions.length !== 1 ? "ões" : ""}
            {evolutions.length > 0 ? ` · ${formatDateBR(evolutions[0].entry_date)} até ${formatDateBR(evolutions[evolutions.length - 1].entry_date)}` : ""}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollTo(0, 0)}
              title="Ir ao início"
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)}
              title="Ir ao fim"
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Documento evolutivo (scrollável) ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pt-2 pb-2 min-h-0"
        style={{ maxHeight: "calc(100vh - 440px)", minHeight: "120px" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : evolutions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <FileText className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">Nenhuma evolução registrada</p>
            <p className="text-xs text-slate-400 text-center max-w-48">Esta é a primeira consulta deste paciente. Registre a evolução inicial abaixo.</p>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            {evolutions.map((ev) => (
              <div
                key={ev.id}
                className={`border-l-4 border-blue-500 bg-slate-50 dark:bg-slate-800 rounded-r-lg p-3 group transition-all duration-1000 ${recentlySavedId === ev.id ? "ring-2 ring-green-400 ring-offset-1" : ""}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{formatDateBRFull(ev.entry_date)}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">{ev.content.length} car.</span>
                    <button
                      type="button"
                      title="Editar evolução"
                      onClick={() => { setEditingId(ev.id); setEditText(ev.content); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-blue-600"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {editingId === ev.id ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full font-mono text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 border border-blue-300 dark:border-blue-600 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={5}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Cancelar</button>
                      <button type="button" onClick={() => handleEditSave(ev)} disabled={editSaving} className="px-3 py-1 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {editSaving ? "Salvando..." : "Salvar edição"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-mono">{ev.content}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Área de nova entrada (fixa no bottom) ── */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 px-5 pt-3 pb-4 bg-white dark:bg-slate-900">
        {/* Templates rápidos */}
        <div className="flex flex-wrap gap-1 mb-2">
          {PRONTUARIO_TEMPLATES.map(tpl => (
            <button
              key={tpl.name}
              type="button"
              onClick={() => insertTemplate(tpl.text)}
              className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              {tpl.name}
            </button>
          ))}
        </div>

        {/* Label com data de hoje */}
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{todayBRFull}</span>
          <span className="text-[11px] text-slate-400 ml-1">(hoje)</span>
        </div>

        <textarea
          ref={textareaRef}
          className="w-full font-mono text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 resize-none placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ minHeight: "120px", maxHeight: "400px" }}
          placeholder="Queixa principal, história da doença, exame físico, hipótese diagnóstica e conduta..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-slate-400">Ctrl+Enter para salvar · {newText.length} caracteres</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !newText.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-semibold text-sm"
          >
            {saving ? (
              <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> Salvar</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Receita ───────────────────────────────────────────────────────────────

const PRESCRIPTION_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  simples:           { label: "Simples",   cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  controle_especial: { label: "RCE 2 vias", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  antimicrobiano:    { label: "ATB 2 vias", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  notificacao_ab:    { label: "Notif. A/B", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  // aliases legados
  especial_azul:     { label: "RCE 2 vias", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  especial_amarelo:  { label: "RCE 2 vias", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

const RX_TYPE_OPTIONS: { value: PrescriptionType; label: string; activeClass: string }[] = [
  { value: "simples",           label: "Simples (Branca)",          activeClass: "border-slate-600 bg-slate-600 text-white" },
  { value: "controle_especial", label: "Controle Especial (RCE)",   activeClass: "border-amber-600 bg-amber-600 text-white" },
  { value: "antimicrobiano",    label: "Antimicrobiano (ATB)",       activeClass: "border-blue-600 bg-blue-600 text-white" },
];

function TabReceita({ patientId, patient, clinic }: { patientId: number; patient: any; clinic?: any }) {
  const [rxType, setRxType] = useState<PrescriptionType>("simples");
  const [medications, setMedications] = useState<Medication[]>([emptyMed()]);
  const [instructions, setInstructions] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loadingRx, setLoadingRx] = useState(true);
  const [printRx, setPrintRx] = useState<{
    date: string; medications: Medication[]; instructions: string;
    prescription_type: PrescriptionType; patientAddress?: string; patientPhone?: string;
  } | null>(null);

  // Templates
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState("");
  const [confirmDeleteTemplateId, setConfirmDeleteTemplateId] = useState<number | null>(null);
  const [showAllRx, setShowAllRx] = useState(false);

  // Autocomplete
  const [medSuggestions, setMedSuggestions] = useState<{ idx: string; list: OrthoMedPreset[] }[]>([]);

  // Memed
  const [memedLoading, setMemedLoading] = useState(false);

  useEffect(() => {
    prescriptionsApi.list(patientId)
      .then(setPrescriptions)
      .catch(() => {})
      .finally(() => setLoadingRx(false));
    prescriptionTemplatesApi.list()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [patientId]);

  // Pré-preenche endereço e telefone do cadastro do paciente
  useEffect(() => {
    if (!patient) return;
    const parts = [
      patient.address_street,
      patient.address_city,
      patient.address_state,
    ].filter(Boolean);
    setPatientAddress(parts.join(", "));
    setPatientPhone(patient.phone || "");
  }, [patient]);

  const updateMed = (id: string, k: keyof Medication, v: string) =>
    setMedications((ms) => ms.map((m) => (m.id === id ? { ...m, [k]: v } : m)));

  const isNotificacaoAB = rxType === "notificacao_ab";
  const isATB = rxType === "antimicrobiano";

  const handleSave = async () => {
    if (isNotificacaoAB) { toast.error("Notificação A/B não pode ser impressa pelo médico — use formulários SESA"); return; }
    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) { toast.error("Adicione pelo menos um medicamento"); return; }
    setSaving(true);
    try {
      const newRx = await prescriptionsApi.create(patientId, {
        date: new Date().toISOString().split("T")[0],
        prescription_type: rxType,
        medications: validMeds,
        instructions,
      });
      toast.success("Receita salva!");
      setPrescriptions((prev) => [newRx, ...prev]);
      setMedications([emptyMed()]);
      setInstructions("");
      setPatientAddress("");
      setPatientPhone("");
    } catch {
      toast.error("Erro ao salvar receita");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (isNotificacaoAB) return;
    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) { toast.error("Adicione pelo menos um medicamento para imprimir"); return; }
    setPrintRx({
      date: new Date().toISOString().split("T")[0],
      medications: validMeds,
      instructions,
      prescription_type: rxType,
      patientAddress: patientAddress || undefined,
      patientPhone: patientPhone || undefined,
    });
  };

  const handleLoadTemplate = (tmpl: any) => {
    setRxType(normalizePrescriptionType(tmpl.prescription_type || "simples"));
    setMedications(tmpl.medications?.length ? tmpl.medications : [emptyMed()]);
    setInstructions(tmpl.instructions || "");
    setShowTemplateDropdown(false);
    toast.success(`Modelo "${tmpl.name}" carregado`);
  };

  const handleSaveTemplate = async () => {
    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) { toast.error("Adicione medicamentos antes de salvar modelo"); return; }
    if (!showSaveTemplateInput) { setShowSaveTemplateInput(true); setTemplateNameInput(""); return; }
    if (!templateNameInput.trim()) { toast.error("Informe um nome para o modelo"); return; }
    setSavingTemplate(true);
    try {
      const tmpl = await prescriptionTemplatesApi.create({
        name: templateNameInput.trim(),
        prescription_type: rxType,
        medications: validMeds,
        instructions,
      });
      setTemplates((prev) => [...prev, tmpl].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Modelo "${templateNameInput.trim()}" salvo!`);
      setShowSaveTemplateInput(false);
      setTemplateNameInput("");
    } catch {
      toast.error("Erro ao salvar modelo");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    setConfirmDeleteTemplateId(null);
    try {
      await prescriptionTemplatesApi.delete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success("Modelo removido");
    } catch {
      toast.error("Erro ao remover modelo");
    }
  };

  return (
    <div className="space-y-4 px-5 pb-6">
      {printRx && <PrintModal rx={printRx} patient={patient} clinic={clinic} onClose={() => setPrintRx(null)} />}

      {/* ── Tipo de Receita ── */}
      <div>
        <p className={sectionTitle}>Tipo de Receita</p>
        <div className="flex gap-2 flex-wrap">
          {RX_TYPE_OPTIONS.map(({ value, label, activeClass }) => (
            <button
              key={value}
              type="button"
              onClick={() => setRxType(value)}
              className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                rxType === value
                  ? activeClass
                  : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Badges informativos por tipo */}
        {rxType === "controle_especial" && (
          <div className="mt-2 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">2 VIAS — Portaria SVS/MS 344/98 · Imprime 2 vias (farmácia + paciente)</p>
          </div>
        )}
        {rxType === "antimicrobiano" && (
          <div className="mt-2 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">2 VIAS — RDC ANVISA 20/2011 · Campos obrigatórios: endereço e telefone do paciente</p>
          </div>
        )}
      </div>

      {/* ── Box informativo Notificação A/B ── */}
      {isNotificacaoAB && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">ℹ️</span>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Notificação de Receita A e B</p>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Formulários <strong>pré-numerados emitidos pela SESA estadual</strong> (Secretaria Estadual de Saúde).
            O médico <strong>NÃO pode imprimir</strong> esses formulários — eles têm numeração controlada pelo governo.
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Solicite os talonários na <strong>Secretaria Estadual de Saúde da Paraíba (SES-PB)</strong> ou
            da <strong>Secretaria Estadual de Saúde de Pernambuco (SES-PE)</strong>.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            Exemplos: morfina, codeína, tramadol em altas doses, metilfenidato, anfetaminas.
          </p>
        </div>
      )}

      {/* ── Conteúdo do formulário (oculto para Notificação A/B) ── */}
      {!isNotificacaoAB && (
        <>
          {/* ── Modelos + Memed ── */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setShowTemplateDropdown((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold"
              >
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" />
                  Carregar Modelo
                </span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showTemplateDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                  {loadingTemplates ? (
                    <p className="text-xs text-slate-400 p-3 text-center">Carregando...</p>
                  ) : templates.length === 0 ? (
                    <p className="text-xs text-slate-400 p-3 text-center">Nenhum modelo salvo</p>
                  ) : (
                    <ul className="max-h-48 overflow-y-auto">
                      {templates.map((tmpl) => (
                        <li key={tmpl.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                          {confirmDeleteTemplateId === tmpl.id ? (
                            <div className="flex items-center gap-2 px-3 py-2">
                              <span className="text-xs text-red-600 flex-1">Remover "{tmpl.name}"?</span>
                              <button type="button" onClick={() => handleDeleteTemplate(tmpl.id)} className="text-[11px] px-2 py-0.5 bg-red-500 text-white rounded">Sim</button>
                              <button type="button" onClick={() => setConfirmDeleteTemplateId(null)} className="text-[11px] px-2 py-0.5 border border-slate-300 rounded text-slate-600">Não</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                className="flex-1 text-left px-3 py-2"
                                onClick={() => handleLoadTemplate(tmpl)}
                              >
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{tmpl.name}</p>
                                <p className="text-[10px] text-slate-400">{PRESCRIPTION_TYPE_LABELS[normalizePrescriptionType(tmpl.prescription_type)] || tmpl.prescription_type} · {tmpl.medications?.length || 0} med.</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTemplateId(tmpl.id)}
                                className="p-2 text-red-400 hover:text-red-600 flex-shrink-0"
                                title="Remover modelo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={memedLoading}
              onClick={async () => {
                if (!patient) { toast.error("Dados do paciente ainda não carregados"); return; }
                setMemedLoading(true);
                try {
                  await openMemed(patient, clinic);
                } catch (err: any) {
                  const msg = err?.message || "Erro ao carregar Memed";
                  toast.error(msg.includes("expirado") ? msg : "Erro ao abrir Memed. Tente novamente.");
                  console.error("[Memed]", err);
                } finally {
                  setMemedLoading(false);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {memedLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Pill className="w-3.5 h-3.5" />
              )}
              Prescrever via Memed
            </button>
          </div>

          {/* ── Banner de Alergias ── */}
          <AllergyBanner patient={patient} />

          {/* ── Campos extras ATB: endereço e telefone do paciente ── */}
          {isATB && (
            <div className="space-y-2 border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50/40 dark:bg-blue-900/10">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Dados obrigatórios do paciente (RDC 20/2011)</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className={lbl}>Endereço do paciente *</label>
                  <input className={inp} placeholder="Rua, nº, bairro, cidade/UF" value={patientAddress} onChange={(e) => setPatientAddress(e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Telefone do paciente *</label>
                  <input className={inp} placeholder="(83) 9xxxx-xxxx" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Medicamentos ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={sectionTitle + " mb-0"}>Medicamentos</p>
              <button
                type="button"
                onClick={() => setMedications((ms) => [...ms, emptyMed()])}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>

            {medications.map((med, i) => (
              <MedRowInline
                key={med.id}
                med={med}
                index={i}
                total={medications.length}
                onChange={(k, v) => updateMed(med.id, k, v)}
                onRemove={() => setMedications((ms) => ms.filter((m) => m.id !== med.id))}
                allergyWarning={checkDrugAllergyAlert(med.name, (patient?.allergies || ""))}
              />
            ))}

            <div>
              <label className={lbl}>Orientações gerais</label>
              <textarea className={inp + " min-h-[70px] resize-none"} placeholder="Evitar álcool, repouso, retorno em 7 dias..." value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
            </div>

            {/* ── Inline save template input ── */}
            {showSaveTemplateInput && (
              <div className="flex gap-2 items-center p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <input
                  autoFocus
                  className={inp + " flex-1"}
                  placeholder="Nome do modelo..."
                  value={templateNameInput}
                  onChange={e => setTemplateNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setShowSaveTemplateInput(false); }}
                />
                <button type="button" onClick={handleSaveTemplate} disabled={savingTemplate} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">Confirmar</button>
                <button type="button" onClick={() => setShowSaveTemplateInput(false)} className="px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-600">Cancelar</button>
              </div>
            )}

            {/* ── Ações ── */}
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> Salvar Modelo
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold"
                title="Imprimir sem salvar"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 text-sm"
              >
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Salvar Receita</>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Histórico ── */}
      {loadingRx ? (
        <div className="space-y-2 px-0 pt-2">
          <p className={sectionTitle}>Receitas anteriores</p>
          {[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />)}
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="flex items-center gap-2 py-2">
          <Pill className="w-4 h-4 text-slate-300" />
          <p className="text-xs text-slate-400 italic">Nenhuma receita anterior registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={sectionTitle + " mb-0"}>Receitas anteriores</p>
            {prescriptions.length > 5 && (
              <button type="button" onClick={() => setShowAllRx(v => !v)} className="text-xs text-blue-600 hover:underline">
                {showAllRx ? "Mostrar menos" : `Ver todas (${prescriptions.length})`}
              </button>
            )}
          </div>
          {(showAllRx ? prescriptions : prescriptions.slice(0, 5)).map((rx) => {
            const badge = PRESCRIPTION_TYPE_BADGE[rx.prescription_type] || PRESCRIPTION_TYPE_BADGE["simples"];
            return (
              <div key={rx.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatDate(rx.date)}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setRxType(normalizePrescriptionType(rx.prescription_type || "simples"));
                        setMedications(rx.medications?.length ? rx.medications.map((m: any) => ({ ...emptyMed(), ...m })) : [emptyMed()]);
                        setInstructions(rx.instructions || "");
                        toast.success("Receita carregada para edição");
                      }}
                      className="p-1 text-slate-400 hover:text-green-600"
                      title="Repetir esta receita"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPrintRx({
                        date: rx.date,
                        medications: rx.medications || [],
                        instructions: rx.instructions || "",
                        prescription_type: normalizePrescriptionType(rx.prescription_type || "simples"),
                      })}
                      className="p-1 text-slate-400 hover:text-blue-600"
                      title="Imprimir"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {rx.medications?.slice(0, 3).map((m: any, i: number) => (
                    <p key={i} className="text-xs text-slate-600 dark:text-slate-400">
                      {i + 1}. {m.name}{m.dose ? ` — ${m.dose}` : ""}{m.frequency ? ` · ${m.frequency}` : ""}{m.duration ? ` · ${m.duration}` : ""}
                    </p>
                  ))}
                  {(rx.medications?.length || 0) > 3 && (
                    <p className="text-xs text-slate-400">+{rx.medications.length - 3} mais...</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Exames ────────────────────────────────────────────────────────────────

// Modal de impressão de pedido de exame
function PrintExamModal({ text, patientName, clinic, onClose, fontSize = 14, lineHeight = "normal" }: {
  text: string;
  patientName: string;
  clinic?: any;
  onClose: () => void;
  fontSize?: 12 | 14 | 16;
  lineHeight?: "normal" | "relaxed";
}) {
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <style>{`
        @media print {
          body > *:not(#print-exam-root) { display: none !important; }
          #print-exam-root { position: fixed !important; inset: 0 !important; z-index: 9999 !important; background: white !important; padding: 20px !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div id="print-exam-root" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        <div className="no-print px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-slate-900 dark:text-slate-50 text-sm">Preview — Pedido de Exame</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-6 bg-white" style={{ fontFamily: "monospace", fontSize: "13px", color: "#111" }}>
          <div style={{ borderBottom: "2px solid #0F2D5E", paddingBottom: "10px", marginBottom: "12px", textAlign: "center" }}>
            <p style={{ fontWeight: 700, fontSize: "15px", margin: "0 0 2px 0", color: "#0F2D5E" }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Ortopedia e Traumatologia · CRM/PB 6326 | CRM/PE 16551</p>
            {clinic?.phone && <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Tel: {clinic.phone}</p>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "12px" }}>
            <span><strong>Paciente:</strong> {patientName}</span>
            <span><strong>Data:</strong> {dateStr}</span>
          </div>
          <div style={{ borderTop: "1px solid #ccc", borderBottom: "1px solid #ccc", padding: "12px 0", margin: "0 0 16px 0", whiteSpace: "pre-wrap", lineHeight: lineHeight === "relaxed" ? "1.6" : "1.4", fontSize: `${fontSize}px` }}>
            {text}
          </div>
          <div style={{ textAlign: "right", marginTop: "24px" }}>
            <div style={{ display: "inline-block", textAlign: "center", width: "220px" }}>
              <div style={{ borderTop: "1px solid #0F2D5E", paddingTop: "4px" }}>
                <p style={{ fontSize: "12px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
                <p style={{ fontSize: "11px", color: "#666", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
                <p style={{ fontSize: "10px", color: "#999", margin: "4px 0 0 0" }}>Assinatura e Carimbo</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabExames({ patientId, patient, clinic }: { patientId: number; patient: any; clinic?: any }) {
  const [freeText, setFreeText] = useState("");
  const [saving, setSaving] = useState(false);
  const [exams, setExams] = useState<any[]>([]);
  const [loadingEx, setLoadingEx] = useState(true);
  const [loadingError, setLoadingError] = useState(false);

  // Modelos de solicitação
  const [examTemplates, setExamTemplates] = useState<ExamTemplate[]>(() => loadExamTemplates());

  // Controle de fonte
  const [fontSize, setFontSize] = useState<12 | 14 | 16>(() => loadExamFontSize());
  const [lineHeight, setLineHeight] = useState<"normal" | "relaxed">(() => loadExamLineHeight());

  // Impressão
  const [printText, setPrintText] = useState<string | null>(null);

  // Inline save template
  const [showSaveExamTemplateInput, setShowSaveExamTemplateInput] = useState(false);
  const [examTemplateNameInput, setExamTemplateNameInput] = useState("");

  // Expanded history card
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchExams = () => {
    setLoadingEx(true);
    setLoadingError(false);
    examsApi.list(patientId)
      .then(setExams)
      .catch(() => { setLoadingError(true); toast.error("Erro ao carregar histórico de exames"); })
      .finally(() => setLoadingEx(false));
  };

  useEffect(() => { fetchExams(); }, [patientId]);

  // Auto-resize textarea
  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 160)}px`;
  };

  // Modelos
  const handleSaveTemplate = () => {
    if (!freeText.trim()) return;
    if (!showSaveExamTemplateInput) { setShowSaveExamTemplateInput(true); setExamTemplateNameInput(""); return; }
    if (!examTemplateNameInput.trim()) { toast.error("Informe um nome para o modelo"); return; }
    const newTemplate: ExamTemplate = { id: String(Date.now()), name: examTemplateNameInput.trim(), content: freeText };
    const updated = [...examTemplates, newTemplate];
    setExamTemplates(updated);
    saveExamTemplates(updated);
    toast.success("Modelo salvo");
    setShowSaveExamTemplateInput(false);
    setExamTemplateNameInput("");
  };

  const handleLoadTemplate = (id: string) => {
    const tpl = examTemplates.find((t) => t.id === id);
    if (!tpl) return;
    if (freeText.trim() && freeText !== tpl.content) {
      if (!window.confirm("Substituir o texto atual pelo modelo?")) return;
    }
    setFreeText(tpl.content);
    setTimeout(autoResize, 0);
    textareaRef.current?.focus();
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = examTemplates.filter((t) => t.id !== id);
    setExamTemplates(updated);
    saveExamTemplates(updated);
  };

  // Fonte
  const handleFontSize = (size: 12 | 14 | 16) => {
    setFontSize(size);
    if (typeof window !== "undefined") localStorage.setItem(LS_EXAM_FONT_SIZE_KEY, String(size));
  };

  const handleLineHeight = (lh: "normal" | "relaxed") => {
    setLineHeight(lh);
    if (typeof window !== "undefined") localStorage.setItem(LS_EXAM_LINE_HEIGHT_KEY, lh);
  };

  // Salvar
  const handleSave = async () => {
    if (!freeText.trim()) { toast.error("Digite a solicitação antes de salvar"); return; }
    setSaving(true);
    try {
      const newEx = await examsApi.create(patientId, {
        date: new Date().toISOString().split("T")[0],
        exams: [],
        free_text: freeText.trim(),
      });
      toast.success("Solicitação salva!");
      setExams((prev) => [newEx, ...prev]);
      setFreeText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      toast.error("Erro ao salvar solicitação");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSave();
    }
  };

  // Preview de texto para histórico
  const examPreview = (ex: any): string => {
    if (ex.free_text) return ex.free_text.slice(0, 80) + (ex.free_text.length > 80 ? "..." : "");
    if (ex.exams?.length) return ex.exams.map((e: any) => e.name).join(", ").slice(0, 80);
    return "—";
  };

  const patientName = patient?.name || "Paciente";

  return (
    <div className="space-y-0 pb-6">
      {printText !== null && (
        <PrintExamModal text={printText} patientName={patientName} clinic={clinic} onClose={() => setPrintText(null)} fontSize={fontSize} lineHeight={lineHeight} />
      )}

      {/* ── Seção: Modelos ── */}
      <div className="px-5 pt-1 pb-3 border-b border-slate-100 dark:border-slate-800">
        <p className={sectionTitle + " mb-2"}>Modelos Rápidos</p>
        {/* Built-in quick templates */}
        <div className="flex flex-wrap gap-1 mb-2">
          {EXAM_QUICK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              onClick={() => {
                if (freeText.trim() && freeText !== tpl.content) {
                  if (!window.confirm("Substituir o texto atual pelo modelo?")) return;
                }
                setFreeText(tpl.content);
                setTimeout(autoResize, 0);
                textareaRef.current?.focus();
              }}
              className="text-[11px] px-2 py-0.5 rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-semibold"
            >
              {tpl.name}
            </button>
          ))}
        </div>
        {/* User saved templates */}
        {examTemplates.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {examTemplates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => handleLoadTemplate(tpl.id)}
                  className="text-[11px] font-mono px-2 py-0.5 rounded-l border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  title={tpl.content.slice(0, 120)}
                >
                  {tpl.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(tpl.id)}
                  className="text-[10px] px-1 py-0.5 rounded-r border border-l-0 border-slate-300 dark:border-slate-600 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Excluir modelo"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Seção: Solicitação ── */}
      <div className="px-5 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <p className={sectionTitle}>Solicitação</p>

        {/* Controles de impressão */}
        <div className="flex items-center justify-end gap-3 mb-1.5">
          <span className="text-[10px] text-slate-400">Impressão:</span>
          <div className="flex items-center gap-1">
            {([12, 14, 16] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => handleFontSize(sz)}
                className={`px-2 py-0.5 text-[10px] border rounded transition-colors ${
                  fontSize === sz
                    ? "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-700 dark:border-slate-200"
                    : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {sz === 12 ? "P" : sz === 14 ? "M" : "G"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(["normal", "relaxed"] as const).map((lh) => (
              <button
                key={lh}
                type="button"
                onClick={() => handleLineHeight(lh)}
                className={`px-2 py-0.5 text-[10px] border rounded transition-colors ${
                  lineHeight === lh
                    ? "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-700 dark:border-slate-200"
                    : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {lh === "normal" ? "1×" : "1,5×"}
              </button>
            ))}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          className="w-full font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 resize-none placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ minHeight: "160px", fontSize: `${fontSize}px`, lineHeight: lineHeight === "relaxed" ? "1.6" : "1.4" }}
          placeholder={"SOLICITO: [TIPO DE EXAME] — [REGIÃO ANATÔMICA] [D/E]\nINCIDÊNCIAS: \nHD: "}
          value={freeText}
          onChange={(e) => { setFreeText(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
        />

        {/* Inline save template input */}
        {showSaveExamTemplateInput && (
          <div className="flex gap-2 items-center mt-2 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            <input
              autoFocus
              className={inp + " flex-1"}
              placeholder="Nome do modelo..."
              value={examTemplateNameInput}
              onChange={e => setExamTemplateNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setShowSaveExamTemplateInput(false); }}
            />
            <button type="button" onClick={handleSaveTemplate} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold">Confirmar</button>
            <button type="button" onClick={() => setShowSaveExamTemplateInput(false)} className="px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-600">Cancelar</button>
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-slate-400">Ctrl+Enter para salvar</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!freeText.trim()}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold"
              title="Salvar como modelo"
            >
              <Save className="w-3.5 h-3.5" /> Salvar Modelo
            </button>
            <button
              type="button"
              onClick={() => { if (!freeText.trim()) { toast.error("Digite a solicitação antes de imprimir"); return; } setPrintText(freeText); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold text-xs"
            >
              {saving ? (
                <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
              ) : (
                <><CheckCircle className="w-3.5 h-3.5" /> Salvar</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Seção: Histórico ── */}
      <div className="px-5 pt-3">
        <p className={sectionTitle}>Histórico</p>
        {loadingEx ? (
          <div className="space-y-2">
            {[1,2].map(i => <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />)}
          </div>
        ) : loadingError ? (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300 flex-1">Não foi possível carregar o histórico. Verifique a conexão.</p>
            <button type="button" onClick={fetchExams} className="text-xs text-blue-600 hover:underline flex-shrink-0">Tentar novamente</button>
          </div>
        ) : exams.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Nenhuma solicitação anterior.</p>
        ) : (
          <div className="space-y-2">
            {exams.slice(0, 10).map((ex) => (
              <div key={ex.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">{formatDate(ex.date)}</p>
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">{examPreview(ex)}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedExamId(expandedExamId === ex.id ? null : ex.id)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                      title={expandedExamId === ex.id ? "Recolher" : "Expandir"}
                    >
                      {expandedExamId === ex.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintText(ex.free_text || ex.exams?.map((e: any) => `SOLICITO: ${e.name}${e.laterality ? ` — ${e.laterality}` : ""}`).join("\n") || "")}
                      className="p-1 text-slate-400 hover:text-blue-600"
                      title="Imprimir"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {expandedExamId === ex.id && (ex.free_text || ex.exams?.length > 0) && (
                  <pre className="text-xs font-mono whitespace-pre-wrap text-slate-600 dark:text-slate-400 mt-2 max-h-40 overflow-y-auto border-t border-slate-200 dark:border-slate-700 pt-2">
                    {ex.free_text || ex.exams?.map((e: any) => `SOLICITO: ${e.name}${e.laterality ? ` — ${e.laterality}` : ""}`).join("\n")}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Constants: new tabs ────────────────────────────────────────────────────────

const REFERRAL_TYPES = [
  { value: "fisioterapia", label: "Fisioterapia", icon: "Activity" },
  { value: "especialidade", label: "Especialidade", icon: "Stethoscope" },
  { value: "colega", label: "Colega Ortopedista", icon: "Award" },
  { value: "outro", label: "Outro", icon: "FileText" },
];

const SPECIALTY_OPTIONS = [
  "Neurologia", "Neurocirurgia", "Reumatologia", "Medicina do Esporte", "Fisiatria",
  "Angiologia / Cirurgia Vascular", "Oncologia Ortopédica", "Cirurgia da Mão",
  "Cirurgia do Tornozelo e Pé", "Clínica da Dor", "Geriatria", "Medicina do Trabalho",
  "Ortopedia Pediátrica", "Outra",
];

const PHYSIO_MODALITY_OPTIONS = [
  "Cinesioterapia / Fortalecimento", "Fisioterapia pós-operatória", "Hidroterapia",
  "RPG", "Eletroterapia / TENS", "Terapia manual", "Outro",
];

const PROCEDURE_TEMPLATES = [
  { name: "Artrocentese joelho", text: "Realizada artrocentese do joelho [D/E] com agulha 18G. Aspirado aproximadamente [volume]ml de líquido sinovial com aspecto [claro/turvo/hemático].\nOrientações: repouso de 24h, curativo local. Retornar se dor, febre ou recidiva da coleção." },
  { name: "Infiltração joelho — corticoide", text: "Realizada infiltração articular do joelho [D/E] — compartimento [medial/lateral/femoropatelar] — com Triancinolona 40mg + Lidocaína 2% 2ml.\nAnestesia: Lidocaína infiltrativa local.\nIntercorrências: nenhuma.\nOrientações: repouso de 24h, gelo local por 20 min 3x/dia por 3 dias. Retorno em 4 semanas." },
  { name: "Infiltração joelho — ácido hialurônico", text: "Realizada infiltração intra-articular do joelho [D/E] com ácido hialurônico (1 ampola).\nAnestesia: Lidocaína tópica.\nIntercorrências: nenhuma.\nOrientações: repouso de 24h, evitar esforços por 48h. Retorno em 1 semana." },
  { name: "Infiltração ombro — subacromial", text: "Realizada infiltração subacromial do ombro [D/E] com Triancinolona 40mg + Lidocaína 2% 2ml.\nAnestesia: Lidocaína infiltrativa local.\nIntercorrências: nenhuma.\nOrientações: repouso relativo de 24h, gelo local por 20 min 3x/dia por 3 dias. Retorno em 4 semanas." },
  { name: "Bloqueio coluna", text: "Realizado bloqueio periradicular em [nível vertebral] com Betametasona 12mg + Lidocaína 2% 3ml sob orientação radioscópica.\nAnestesia: Lidocaína infiltrativa.\nIntercorrências: nenhuma.\nOrientações: repouso de 24h, evitar esforços por 48h. Retorno em 2 semanas." },
  { name: "Retirada de fio de Kirschner", text: "Realizada retirada de fio de Kirschner [localização] sob anestesia local com Lidocaína 2%.\nTécnica: remoção com alicate de corte e extração com porta-agulha.\nFerita: limpa, sem sinais de infecção.\nOrientações: curativo simples, troca em 48h. Retornar se sinais de infecção." },
  { name: "Curativo pós-operatório", text: "Realizado curativo de ferida operatória [localização]. Ferida com boa evolução cicatricial, bordas coaptadas, sem sinais de infecção, hematoma ou deiscência.\nOrientações: manter curativo limpo e seco, trocar a cada 48h ou se molhar. Retornar se sinais de infecção." },
  { name: "Buddy taping — dedo", text: "Realizado buddy taping (imobilização relativa) do dedo [indicador/médio/anular/mínimo] [D/E] ao dedo adjacente com espaçador de gaze.\nOrientações: manter a imobilização por 3 semanas, mobilizar os outros dedos. Retorno em 2 semanas." },
  { name: "Drenagem hematoma subungeal", text: "Realizada drenagem de hematoma subungeal do [dedo] [D/E] com agulha aquecida (trefina).\nEvacuado conteúdo hemático sem intercorrências.\nOrientações: curativo compressivo local, manter limpo. Retornar em 1 semana." },
  { name: "Retirada de pontos", text: "Realizada retirada de pontos cirúrgicos de [localização]. Ferida operatória com boa cicatrização, sem sinais de infecção.\nOrientações: manter curativo simples por mais 24h. Liberado para banho." },
  { name: "Imobilização gesso/tala", text: "Realizada imobilização com tala gessada [tipo] em [posição]. Paciente orientado sobre cuidados.\nOrientações: não molhar o gesso, elevar o membro, retornar se edema excessivo, dor intensa ou alteração da cor dos dedos. Retorno em 4 semanas." },
  { name: "Redução de luxação", text: "Realizada redução de luxação [articulação] [D/E] sob analgesia local. Controle radiológico evidenciou redução adequada.\nOrientações: imobilização por [período], retorno em 1 semana para reavaliação." },
];

const CERTIFICATE_TYPES = [
  { value: "trabalho", label: "Atividades de trabalho" },
  { value: "acidente_trabalho", label: "Acidente de trabalho (CAT)" },
  { value: "esportes", label: "Atividades físicas / esportes" },
  { value: "escola", label: "Atividades escolares" },
  { value: "geral", label: "Atividades em geral" },
];

const OBS_CHIPS = [
  "Uso de muletas",
  "Membro em repouso elevado",
  "Restrição para esforço físico",
  "Restrição para levantamento de peso",
  "Proibido dirigir",
  "Pode exercer função administrativa",
];

const LAUDO_TEMPLATES = [
  { name: "Perícia INSS — Joelho", text: "LAUDO MÉDICO\n\n1. QUEIXA PRINCIPAL\n\n2. HISTÓRIA DA DOENÇA ATUAL\n\n3. ANTECEDENTES PESSOAIS E CIRÚRGICOS\n\n4. EXAME FÍSICO\n   - Inspeção:\n   - Palpação:\n   - Amplitude de Movimento (ADM):\n     Flexão: ___° (normal 135°)\n     Extensão: ___° (normal 0°)\n   - Testes Especiais: Lachman ___ | McMurray ___ | Varo/Valgo ___\n\n5. EXAMES COMPLEMENTARES\n   Exame: | Data: | Achados:\n\n6. DIAGNÓSTICO\n   CID-10:\n\n7. CAPACIDADE FUNCIONAL\n   [ ] Apto para trabalho habitual\n   [ ] Parcialmente incapaz — restrições:\n   [ ] Incapaz temporariamente — prazo estimado:\n   [ ] Incapaz permanentemente\n\n8. CONCLUSÃO\n" },
  { name: "Autorização cirúrgica (Plano)", text: "LAUDO PARA AUTORIZAÇÃO DE PROCEDIMENTO CIRÚRGICO\n\n1. IDENTIFICAÇÃO DO PROCEDIMENTO\n   Procedimento solicitado:\n   Código TUSS/CBHPM:\n\n2. DIAGNÓSTICO\n   CID-10:\n\n3. JUSTIFICATIVA CLÍNICA\n   Paciente portador(a) de...\n\n4. EXAMES QUE EMBASAM A INDICAÇÃO\n\n5. TRATAMENTO CONSERVADOR REALIZADO\n   Sim ( ) — duração:\n   Não ( ) — justificativa:\n\n6. URGÊNCIA\n   ( ) Eletiva  ( ) Urgente  ( ) Emergência\n\n7. CONCLUSÃO\n   Solicito autorização para realização do procedimento acima justificado.\n" },
  { name: "Acidente de trabalho (CAT)", text: "LAUDO DE ACIDENTE DE TRABALHO\n\n1. DESCRIÇÃO DO ACIDENTE\n   Data/hora:\n   Local:\n   Mecanismo do trauma:\n\n2. LESÕES ENCONTRADAS\n\n3. NEXO CAUSAL\n   As lesões descritas são compatíveis com o mecanismo de acidente informado.\n\n4. DIAGNÓSTICO\n   CID-10:\n\n5. TRATAMENTO NECESSÁRIO\n\n6. CONCLUSÃO\n" },
  { name: "Sequela pós-traumática", text: "LAUDO DE AVALIAÇÃO DE SEQUELA PÓS-TRAUMÁTICA\n\n1. IDENTIFICAÇÃO DO EVENTO\n   Data do trauma:\n   Mecanismo:\n\n2. HISTÓRICO DE TRATAMENTO\n\n3. ESTADO ATUAL\n   Queixa atual:\n   Exame físico:\n   Exames complementares:\n\n4. DIAGNÓSTICO\n   CID-10:\n\n5. SEQUELA\n   Descrição da sequela:\n   Limitação funcional:\n   Grau estimado de incapacidade (tabela SUSEP): ____%\n\n6. CONCLUSÃO\n" },
  { name: "Laudo de joelho (RX/RM)", text: "LAUDO MÉDICO — JOELHO\n\nExame: {EXAME}\nLado: {LADO}\n\n1. ACHADOS CLÍNICOS\n\n2. ACHADOS DE IMAGEM\n\n3. DIAGNÓSTICO\n   CID-10:\n\n4. CONCLUSÃO\n" },
  { name: "Laudo de coluna (RX/RM)", text: "LAUDO MÉDICO — COLUNA VERTEBRAL\n\nExame: {EXAME}\nSegmento: {SEGMENTO}\n\n1. ACHADOS CLÍNICOS\n\n2. ACHADOS DE IMAGEM\n\n3. DIAGNÓSTICO\n   CID-10:\n\n4. CONCLUSÃO\n" },
  { name: "Relatório médico livre", text: "RELATÓRIO MÉDICO\n\nIlmo(a). Sr(a).,\n\nEncaminho o(a) paciente abaixo, cujos dados e informações clínicas seguem:\n\n" },
];

const LAUDO_FINALIDADE_OPTIONS = [
  "INSS / Perícia Previdenciária",
  "Seguradora / Seguro de Vida",
  "Plano de Saúde (autorização cirúrgica)",
  "Junta Médica / Concurso",
  "Judicial / Processo Trabalhista",
  "Relatório Médico Geral",
];

// ── Generic Print Modal ────────────────────────────────────────────────────────

function PrintDocModal({ title, content, onClose }: { title: string; content: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <style>{`
        @media print {
          body > *:not(#print-doc-root) { display: none !important; }
          #print-doc-root { position: fixed !important; inset: 0 !important; z-index: 9999 !important; background: white !important; padding: 16px !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div id="print-doc-root" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="no-print px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-slate-900 dark:text-slate-50 text-sm">{title}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {content}
        </div>
      </div>
    </div>
  );
}

function DrHeader({ clinic }: { clinic?: any }) {
  return (
    <div style={{ borderBottom: "2px solid #0F2D5E", paddingBottom: "12px", marginBottom: "16px", textAlign: "center" }}>
      <p style={{ fontWeight: 700, fontSize: "16px", color: "#0F2D5E", margin: "0 0 2px 0" }}>Dr. Valth Guimarães</p>
      <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Ortopedia e Traumatologia</p>
      <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
      {clinic?.phone && <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Tel: {clinic.phone}</p>}
    </div>
  );
}

// ── Tab: Encaminhamentos ───────────────────────────────────────────────────────

function TabEncaminhamentos({ patient, clinic }: { patient: any; clinic?: any }) {
  const [refType, setRefType] = useState("fisioterapia");
  const [specialty, setSpecialty] = useState("");
  const [specialtyOther, setSpecialtyOther] = useState("");
  const [physioModality, setPhysioModality] = useState("");
  const [colleagueName, setColleagueName] = useState("");
  const [cid, setCid] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [printData, setPrintData] = useState<{ typeLabel: string; text: string; cid: string; colleagueName: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  const cityState = clinic ? `${clinic.city}/${clinic.state}` : "_________";

  const autoResizeRef = () => {
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 160)}px`;
  };

  const resolvedSpecialty = specialty === "Outra" ? specialtyOther : specialty;
  const typeLabel = refType === "especialidade" && resolvedSpecialty
    ? resolvedSpecialty
    : refType === "fisioterapia" && physioModality
    ? `Fisioterapia — ${physioModality}`
    : refType === "colega" ? "Colega Ortopedista"
    : REFERRAL_TYPES.find(r => r.value === refType)?.label ?? refType;

  const handlePrint = () => {
    if (!text.trim()) { toast.error("Descreva o encaminhamento antes de imprimir"); return; }
    setPrintData({ typeLabel, text, cid, colleagueName });
  };

  const filteredTemplates = REFERRAL_TEXT_TEMPLATES.filter(t => t.type === refType);

  const printContent = printData && (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: "13px" }}>
      <DrHeader clinic={clinic} />
      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <p style={{ fontWeight: 700, fontSize: "14px", textTransform: "uppercase", letterSpacing: "1px", color: "#0F2D5E", margin: 0 }}>Encaminhamento Médico</p>
      </div>
      {printData.colleagueName && (
        <p style={{ marginBottom: "12px" }}>Prezado(a) Dr(a). <strong>{printData.colleagueName}</strong>,</p>
      )}
      <p style={{ marginBottom: "6px" }}><strong>Paciente:</strong> {patient?.name}</p>
      {patient?.birth_date && <p style={{ marginBottom: "6px" }}><strong>Data de Nasc.:</strong> {new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}</p>}
      {patient?.phone && <p style={{ marginBottom: "6px" }}><strong>Telefone:</strong> {patient.phone}</p>}
      {patient?.patient_insurance && <p style={{ marginBottom: "6px" }}><strong>Convênio:</strong> {patient.patient_insurance}</p>}
      {printData.cid && <p style={{ marginBottom: "12px" }}><strong>Diagnóstico/Hipótese (CID-10):</strong> {printData.cid}</p>}
      <p style={{ marginBottom: "16px" }}><strong>Encaminhar para:</strong> {printData.typeLabel}</p>
      <div style={{ background: "#f8f8f8", borderLeft: "3px solid #0F2D5E", padding: "12px", marginBottom: "24px", whiteSpace: "pre-wrap", fontSize: "12px" }}>
        {printData.text}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "32px" }}>
        <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>{cityState}, {dateStr}</p>
        <div style={{ textAlign: "center", width: "200px" }}>
          <div style={{ borderTop: "2px solid #0F2D5E", paddingTop: "6px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "11px", color: "#666", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="px-5 pb-5 space-y-4">
      {printData && printContent && (
        <PrintDocModal title="Encaminhamento" content={printContent} onClose={() => setPrintData(null)} />
      )}

      <div>
        <label className={lbl}>Tipo de Encaminhamento</label>
        <div className="flex flex-wrap gap-2">
          {REFERRAL_TYPES.map(rt => {
            const IconComp = rt.icon === "Activity" ? Activity : rt.icon === "Stethoscope" ? Stethoscope : rt.icon === "Award" ? Award : FileText;
            return (
              <button
                key={rt.value}
                type="button"
                onClick={() => setRefType(rt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  refType === rt.value
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-400"
                }`}
              >
                <IconComp className="w-3.5 h-3.5" /> {rt.label}
              </button>
            );
          })}
        </div>
      </div>

      {refType === "fisioterapia" && (
        <div>
          <label className={lbl}>Modalidade de Fisioterapia</label>
          <select className={inp} value={physioModality} onChange={e => setPhysioModality(e.target.value)}>
            <option value="">— selecionar modalidade —</option>
            {PHYSIO_MODALITY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      {refType === "especialidade" && (
        <div>
          <label className={lbl}>Especialidade</label>
          <select className={inp} value={specialty} onChange={e => setSpecialty(e.target.value)}>
            <option value="">— selecionar especialidade —</option>
            {SPECIALTY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {specialty === "Outra" && (
            <input className={inp + " mt-2"} placeholder="Especifique a especialidade..." value={specialtyOther} onChange={e => setSpecialtyOther(e.target.value)} />
          )}
        </div>
      )}

      {refType === "colega" && (
        <div>
          <label className={lbl}>Nome do colega (opcional)</label>
          <input className={inp} placeholder="Ex: Dr. João Silva — Ortopedia do Joelho" value={colleagueName} onChange={e => setColleagueName(e.target.value)} />
        </div>
      )}

      {/* CID */}
      <div>
        <label className={lbl}>CID-10 / Hipótese Diagnóstica</label>
        <CidSearch value={cid} onChange={setCid} />
      </div>

      {/* Templates de texto rápidos */}
      {filteredTemplates.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 mb-1 font-semibold uppercase tracking-wide">Modelos rápidos</p>
          <div className="flex flex-wrap gap-1.5">
            {filteredTemplates.map(tpl => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => { setText(tpl.text); setTimeout(autoResizeRef, 0); textRef.current?.focus(); }}
                className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={lbl}>Motivo / Histórico / Conduta Solicitada</label>
        <textarea
          ref={textRef}
          className={`${inp} resize-none`}
          style={{ minHeight: "160px" }}
          placeholder={`Paciente ${patient?.name || "{nome}"}, portador(a) de...\n\nExames realizados: ...\n\nHipótese diagnóstica: ...\n\nConduta solicitada: avaliar e tratar conforme protocolo.`}
          value={text}
          onChange={e => { setText(e.target.value); autoResizeRef(); }}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) { toast.error("Descreva o encaminhamento antes de salvar"); return; }
            toast.success("Encaminhamento registrado (local)");
          }}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold text-xs"
        >
          <Save className="w-3.5 h-3.5" /> Salvar
        </button>
        <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs">
          <Printer className="w-3.5 h-3.5" /> Salvar e Imprimir
        </button>
      </div>
    </div>
  );
}

// ── Tab: Procedimentos ────────────────────────────────────────────────────────

function TabProcedimentos({ patientId, patient, clinic }: { patientId: number; patient: any; clinic?: any }) {
  const [text, setText] = useState("");
  const [cid, setCid] = useState("");
  const [procedureTime, setProcedureTime] = useState("");
  const [printData, setPrintData] = useState<{ text: string; cid: string; time: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  const defaultTime = `${String(today.getHours()).padStart(2,"0")}:${String(today.getMinutes()).padStart(2,"0")}`;
  const cityState = clinic ? `${clinic.city}/${clinic.state}` : "_________";

  // init time
  useEffect(() => { setProcedureTime(defaultTime); }, []);

  const autoResizeProc = () => {
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 200)}px`;
  };

  // Reset template select when text is cleared
  useEffect(() => {
    // nothing to reset (using chip buttons now)
  }, [text]);

  const handleSelectTemplate = (tmpl: typeof PROCEDURE_TEMPLATES[0]) => {
    if (text.trim() && text !== tmpl.text) {
      if (!window.confirm("Substituir o texto atual pelo modelo?")) return;
    }
    setText(tmpl.text);
    setTimeout(autoResizeProc, 0);
    textRef.current?.focus();
  };

  const printContent = printData && (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: "13px" }}>
      <DrHeader clinic={clinic} />
      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <p style={{ fontWeight: 700, fontSize: "14px", textTransform: "uppercase", letterSpacing: "1px", color: "#0F2D5E", margin: 0 }}>Relatório de Procedimento</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px", fontSize: "12px" }}>
        <p style={{ margin: 0 }}><strong>Paciente:</strong> {patient?.name}</p>
        <p style={{ margin: 0 }}><strong>Data:</strong> {dateStr}{printData.time ? ` às ${printData.time}` : ""}</p>
        {patient?.birth_date && <p style={{ margin: 0 }}><strong>Nasc.:</strong> {new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}</p>}
      </div>
      {printData.cid && (
        <p style={{ marginBottom: "12px", fontSize: "12px" }}><strong>CID-10:</strong> {printData.cid}</p>
      )}
      <div style={{ background: "#f8f8f8", padding: "14px", border: "1px solid #ddd", borderRadius: "4px", marginBottom: "24px", whiteSpace: "pre-wrap", lineHeight: "1.6", fontSize: "12px" }}>
        {printData.text}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "32px" }}>
        <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>{cityState}, {dateStr}</p>
        <div style={{ textAlign: "center", width: "200px" }}>
          <div style={{ borderTop: "2px solid #0F2D5E", paddingTop: "6px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "11px", color: "#666", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
          </div>
          <div style={{ borderTop: "1px solid #ccc", marginTop: "24px", paddingTop: "4px" }}>
            <p style={{ fontSize: "11px", color: "#888", margin: "0" }}>Paciente (Ciente e de acordo): _____________________</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="px-5 pb-5 space-y-4">
      {printData && printContent && (
        <PrintDocModal title="Relatório de Procedimento" content={printContent} onClose={() => setPrintData(null)} />
      )}

      {/* Orientação */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
        <p className="text-xs text-blue-700 dark:text-blue-300">Selecione um modelo para preencher rapidamente, ou escreva diretamente o procedimento realizado.</p>
      </div>

      {/* Template chips */}
      <div>
        <label className={lbl}>Modelos de Procedimento</label>
        <div className="flex flex-wrap gap-1.5">
          {PROCEDURE_TEMPLATES.map(t => (
            <button
              key={t.name}
              type="button"
              onClick={() => handleSelectTemplate(t)}
              className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* CID */}
      <div>
        <label className={lbl}>CID-10 / Indicação</label>
        <CidSearch value={cid} onChange={setCid} />
      </div>

      {/* Hora */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Hora do procedimento</label>
          <input type="time" className={inp} value={procedureTime} onChange={e => setProcedureTime(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={lbl}>Descrição técnica do procedimento</label>
        <textarea
          ref={textRef}
          className={`${inp} resize-none font-mono`}
          style={{ minHeight: "200px" }}
          placeholder={"Ex: Realizada infiltração articular do joelho direito com...\n\nOrientações: repouso de 24h..."}
          value={text}
          onChange={e => { setText(e.target.value); autoResizeProc(); }}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => { if (!text.trim()) { toast.error("Descreva o procedimento antes de imprimir"); return; } setPrintData({ text, cid, time: procedureTime }); }}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold"
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir
        </button>
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) { toast.error("Descreva o procedimento antes de salvar"); return; }
            setPrintData({ text, cid, time: procedureTime });
            toast.success("Procedimento registrado");
          }}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2 text-sm"
        >
          <CheckCircle className="w-4 h-4" /> Salvar Procedimento
        </button>
      </div>
    </div>
  );
}

// ── Tab: Atestados ────────────────────────────────────────────────────────────

function TabAtestados({ patient, clinic }: { patient: any; clinic?: any }) {
  const [cid, setCid] = useState("");
  const [days, setDays] = useState("1");
  const [certType, setCertType] = useState("trabalho");
  const [obs, setObs] = useState("");
  const todayStr = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [printData, setPrintData] = useState<{ cid: string; days: string; certType: string; obs: string; startDate: string } | null>(null);

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  const cityState = clinic ? `${clinic.city}/${clinic.state}` : "_________";
  const typeLabel = CERTIFICATE_TYPES.find(c => c.value === certType)?.label ?? certType;

  const returnDate = useMemo(() => {
    if (!startDate || !days || Number(days) < 1) return null;
    const d = new Date(startDate + "T12:00:00");
    d.setDate(d.getDate() + Number(days));
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  }, [startDate, days]);

  const addObsChip = (chip: string) => {
    setObs(prev => prev ? prev + "; " + chip : chip);
  };

  const printContent = useMemo(() => {
    if (!printData) return null;
    const pTypeLabel = CERTIFICATE_TYPES.find(c => c.value === printData.certType)?.label ?? printData.certType;
    const startFormatted = formatDateBR(printData.startDate);
    const retDate = (() => {
      const d = new Date(printData.startDate + "T12:00:00");
      d.setDate(d.getDate() + Number(printData.days));
      return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
    })();
    return (
      <div style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: "13px" }}>
        <DrHeader clinic={clinic} />
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <p style={{ fontWeight: 700, fontSize: "15px", textTransform: "uppercase", letterSpacing: "2px", color: "#0F2D5E", margin: 0 }}>Atestado Médico</p>
        </div>
        {printData.certType === "acidente_trabalho" && (
          <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: "4px", padding: "8px 12px", marginBottom: "12px", fontSize: "11px", color: "#92400E" }}>
            Atenção: este afastamento requer emissão de CAT pelo empregador em até 24h (Lei 8.213/91). Oriente o paciente.
          </div>
        )}
        <div style={{ lineHeight: "1.8", marginBottom: "24px" }}>
          <p>
            Atesto que o(a) paciente <strong>{patient?.name}</strong>
            {patient?.cpf ? `, CPF ${patient.cpf},` : ""}
            {patient?.birth_date ? ` nascido(a) em ${new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")},` : ""}
            {" "}encontra-se em avaliação médica nesta data e necessita afastar-se de <strong>{pTypeLabel}</strong> pelo
            período de <strong>{printData.days} dia{Number(printData.days) !== 1 ? "s" : ""}</strong>, a partir de {startFormatted}, com retorno previsto para <strong>{retDate}</strong>.
          </p>
          {printData.cid && (
            <p style={{ marginTop: "12px" }}>
              <strong>CID-10:</strong> {printData.cid}
            </p>
          )}
          {printData.obs && (
            <p style={{ marginTop: "12px", color: "#555", fontSize: "12px" }}>
              <strong>Restrições/Observações:</strong> {printData.obs}
            </p>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "40px" }}>
          <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>{cityState}, {dateStr}</p>
          <div style={{ textAlign: "center", width: "200px" }}>
            <div style={{ borderTop: "2px solid #0F2D5E", paddingTop: "6px" }}>
              <p style={{ fontSize: "12px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
              <p style={{ fontSize: "11px", color: "#666", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
            </div>
          </div>
        </div>
        <p style={{ fontSize: "10px", color: "#aaa", textAlign: "center", marginTop: "24px" }}>Válido somente com assinatura e carimbo do médico</p>
      </div>
    );
  }, [printData, patient, clinic]);

  return (
    <div className="px-5 pb-5 space-y-4">
      {printData && printContent && (
        <PrintDocModal title="Atestado Médico" content={printContent} onClose={() => setPrintData(null)} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Data de início do afastamento *</label>
          <input type="date" className={inp} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Tipo de afastamento</label>
          <select className={inp} value={certType} onChange={e => setCertType(e.target.value)}>
            {CERTIFICATE_TYPES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {certType === "acidente_trabalho" && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">Este afastamento requer emissão de CAT pelo empregador em até 24h (Lei 8.213/91). Oriente o paciente.</p>
        </div>
      )}

      <div>
        <label className={lbl}>Dias de afastamento *</label>
        {/* Quick day buttons */}
        <div className="flex gap-1.5 mb-1.5">
          {[1, 3, 7, 14, 30].map(d => (
            <button key={d} type="button" onClick={() => setDays(String(d))} className={`px-2.5 py-1 text-xs rounded border transition-all font-semibold ${days === String(d) ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-400"}`}>{d}d</button>
          ))}
        </div>
        <input
          type="number"
          min="1"
          max="365"
          className={inp}
          value={days}
          onChange={e => setDays(e.target.value)}
        />
        {returnDate && (
          <p className="text-xs text-slate-500 mt-1">Retorno previsto: <strong>{returnDate}</strong></p>
        )}
      </div>

      <div>
        <label className={lbl}>CID-10 <span className="text-red-500 font-normal">(exigido para empresas com PCMSO e INSS)</span></label>
        <CidSearch value={cid} onChange={setCid} />
      </div>

      <div>
        <label className={lbl}>Restrições / Observações</label>
        {/* Chips rápidos */}
        <div className="flex flex-wrap gap-1 mb-1.5">
          {OBS_CHIPS.map(chip => (
            <button key={chip} type="button" onClick={() => addObsChip(chip)} className="text-[11px] px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              + {chip}
            </button>
          ))}
        </div>
        <textarea
          className={`${inp} resize-none min-h-[80px]`}
          rows={3}
          placeholder="Ex: restrição para levantamento de peso; pode exercer função administrativa sentado..."
          value={obs}
          onChange={e => setObs(e.target.value)}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            if (!startDate || !days || Number(days) < 1) { toast.error("Informe os dias de afastamento"); return; }
            toast.success("Atestado registrado (local)");
          }}
          className="flex items-center gap-1.5 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold text-xs"
        >
          <Save className="w-3.5 h-3.5" /> Salvar
        </button>
        <button
          type="button"
          onClick={() => {
            if (!startDate || !days || Number(days) < 1) { toast.error("Informe os dias de afastamento"); return; }
            setPrintData({ cid, days, certType, obs, startDate });
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs"
        >
          <Printer className="w-3.5 h-3.5" /> Salvar e Imprimir
        </button>
      </div>
    </div>
  );
}

// ── Tab: Laudos ───────────────────────────────────────────────────────────────

function TabLaudos({ patient, clinic }: { patient: any; clinic?: any }) {
  const [text, setText] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [cid, setCid] = useState("");
  const [funcCapacity, setFuncCapacity] = useState("");
  const [funcDetail, setFuncDetail] = useState("");
  const [printData, setPrintData] = useState<{ text: string; finalidade: string; cid: string; funcCapacity: string; funcDetail: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  const cityState = clinic ? `${clinic.city}/${clinic.state}` : "_________";

  // Draft autosave
  const draftKey = `orthoclinic_laudo_draft_${patient?.id || "0"}`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setText(parsed.text || "");
        setFinalidade(parsed.finalidade || "");
        setCid(parsed.cid || "");
        if (parsed.text) toast.success("Rascunho de laudo restaurado", { icon: "📄" });
      } catch {}
    }
  }, [draftKey]);

  useEffect(() => {
    if (!text.trim()) return;
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem(draftKey, JSON.stringify({ text, finalidade, cid }));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [text, finalidade, cid, draftKey]);

  const autoResizeLaudo = () => {
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 300)}px`;
  };

  const hasPlaceholders = /\{[A-Z]+\}/g.test(text);

  const handleTemplate = (name: string) => {
    const t = LAUDO_TEMPLATES.find(lt => lt.name === name);
    if (!t) return;
    if (text.trim() && text !== t.text) {
      if (!window.confirm("Substituir o texto atual pelo modelo?")) return;
    }
    setText(t.text);
    setTimeout(autoResizeLaudo, 0);
    textRef.current?.focus();
  };

  const printContent = useMemo(() => {
    if (!printData) return null;
    const age = patient?.birth_date ? calcAge(patient.birth_date) : "";
    return (
      <div style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: "13px" }}>
        <DrHeader clinic={clinic} />
        {printData.finalidade && (
          <div style={{ textAlign: "center", marginBottom: "12px" }}>
            <p style={{ fontWeight: 700, fontSize: "12px", textTransform: "uppercase", color: "#0F2D5E", margin: 0, letterSpacing: "0.5px" }}>LAUDO MÉDICO — {printData.finalidade.toUpperCase()}</p>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "16px", fontSize: "11px", border: "1px solid #eee", borderRadius: "4px", padding: "8px" }}>
          <p style={{ margin: 0 }}><strong>Paciente:</strong> {patient?.name}</p>
          <p style={{ margin: 0 }}><strong>Data da avaliação:</strong> {dateStr}</p>
          {patient?.birth_date && <p style={{ margin: 0 }}><strong>Nasc.:</strong> {new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}{age ? ` (${age})` : ""}</p>}
          {patient?.cpf && <p style={{ margin: 0 }}><strong>CPF:</strong> {patient.cpf}</p>}
        </div>
        {printData.cid && (
          <p style={{ fontWeight: 700, marginBottom: "12px", fontSize: "12px", borderLeft: "3px solid #0F2D5E", paddingLeft: "8px" }}>CID-10: {printData.cid}</p>
        )}
        <div style={{ borderTop: "1px solid #ddd", paddingTop: "14px", whiteSpace: "pre-wrap", lineHeight: "1.7", fontSize: "12px", marginBottom: "16px" }}>
          {printData.text}
        </div>
        {printData.funcCapacity && (
          <div style={{ borderTop: "2px solid #0F2D5E", paddingTop: "10px", marginBottom: "24px" }}>
            <p style={{ fontWeight: 700, fontSize: "12px", marginBottom: "4px" }}>Conclusão Funcional:</p>
            <p style={{ fontSize: "12px" }}>{printData.funcCapacity}{printData.funcDetail ? ` — ${printData.funcDetail}` : ""}</p>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "32px" }}>
          <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>{cityState}, {dateStr}</p>
          <div style={{ textAlign: "center", width: "220px" }}>
            <div style={{ borderTop: "2px solid #0F2D5E", paddingTop: "6px" }}>
              <p style={{ fontSize: "12px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
              <p style={{ fontSize: "11px", color: "#666", margin: "0" }}>CRM/PB 6326 | CRM/PE 16551</p>
              <p style={{ fontSize: "10px", color: "#888", margin: "2px 0 0 0" }}>Assinatura, Carimbo e RQE</p>
            </div>
          </div>
        </div>
      </div>
    );
  }, [printData, patient, clinic]);

  return (
    <div className="px-5 pb-5 space-y-4">
      {printData && printContent && (
        <PrintDocModal title="Laudo Médico" content={printContent} onClose={() => setPrintData(null)} />
      )}

      {/* Finalidade */}
      <div>
        <label className={lbl}>Finalidade do Laudo *</label>
        <select className={inp} value={finalidade} onChange={e => setFinalidade(e.target.value)}>
          <option value="">— selecionar finalidade —</option>
          {LAUDO_FINALIDADE_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Templates */}
      <div>
        <label className={lbl}>Modelos</label>
        <div className="flex flex-wrap gap-1.5">
          {LAUDO_TEMPLATES.map(t => (
            <button
              key={t.name}
              type="button"
              onClick={() => handleTemplate(t.name)}
              className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* CID */}
      <div>
        <label className={lbl}>CID-10 Principal *</label>
        <CidSearch value={cid} onChange={setCid} />
      </div>

      {/* Texto */}
      <div>
        <label className={lbl}>Texto do Laudo</label>
        {hasPlaceholders && (
          <div className="flex items-center gap-2 mb-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded px-2 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300">Preencha os campos marcados com {"{ }"} antes de imprimir.</p>
          </div>
        )}
        <textarea
          ref={textRef}
          className={`${inp} resize-none font-mono`}
          style={{ minHeight: "300px" }}
          placeholder="Escreva o laudo aqui ou selecione um modelo acima..."
          value={text}
          onChange={e => { setText(e.target.value); autoResizeLaudo(); }}
        />
      </div>

      {/* Conclusão funcional */}
      <div>
        <label className={lbl}>Conclusão Funcional (opcional)</label>
        <select className={inp + " mb-2"} value={funcCapacity} onChange={e => setFuncCapacity(e.target.value)}>
          <option value="">— selecionar —</option>
          <option value="Sem limitação funcional">Sem limitação funcional</option>
          <option value="Limitação parcial">Limitação parcial</option>
          <option value="Incapacidade temporária">Incapacidade temporária</option>
          <option value="Incapacidade permanente">Incapacidade permanente</option>
        </select>
        {(funcCapacity === "Limitação parcial" || funcCapacity === "Incapacidade temporária") && (
          <input className={inp} placeholder={funcCapacity === "Limitação parcial" ? "Atividades restritas a..." : "Estimativa de prazo (dias/semanas)..."} value={funcDetail} onChange={e => setFuncDetail(e.target.value)} />
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) { toast.error("Escreva o laudo antes de imprimir"); return; }
            if (hasPlaceholders) { toast.error("Preencha todos os campos { } antes de imprimir"); return; }
            if (typeof window !== "undefined") localStorage.removeItem(draftKey);
            setPrintData({ text, finalidade, cid, funcCapacity, funcDetail });
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs"
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir Laudo
        </button>
      </div>
    </div>
  );
}

// ── Tab: Fotos ────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://ortho-clinic-ldcd.onrender.com";

interface PatientDocument {
  id: number;
  file_url: string;
  title: string | null;
  date: string;
  category?: string;
  notes?: string | null;
}

function TabFotos({ patientId }: { patientId: number }) {
  const [photos, setPhotos] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("orthoclinic_token") : null;
    const h: Record<string, string> = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, []);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/patients/${patientId}/documents?category=photo`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setPhotos(Array.isArray(data) ? data : (data.items ?? []));
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Pre-check file sizes
    const fileArr = Array.from(files);
    const oversized = fileArr.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`${oversized.map(f => f.name).join(", ")} excedem 10MB. Comprima antes de enviar.`);
      return;
    }
    setUploading(true);
    setUploadProgress({ current: 0, total: fileArr.length });
    let uploaded = 0;
    const errors: string[] = [];
    for (const file of fileArr) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name || "Foto de exame");
      fd.append("category", "photo");
      fd.append("date", new Date().toISOString().split("T")[0]);
      try {
        const res = await fetch(`${API_URL}/patients/${patientId}/documents/upload`, {
          method: "POST",
          headers: authHeaders,
          body: fd,
        });
        if (res.ok) { uploaded++; }
        else { errors.push(file.name); }
      } catch { errors.push(file.name); }
      setUploadProgress(p => p ? { ...p, current: p.current + 1 } : null);
    }
    setUploading(false);
    setUploadProgress(null);
    if (uploaded > 0) { toast.success(`${uploaded} foto${uploaded > 1 ? "s" : ""} enviada${uploaded > 1 ? "s" : ""}!`); fetchPhotos(); }
    if (errors.length > 0) toast.error(`Falha ao enviar: ${errors.join(", ")}`);
    else if (uploaded === 0) toast.error("Erro ao enviar foto");
  };

  const handleDelete = async (docId: number) => {
    if (!confirm("Remover esta foto?")) return;
    setDeletingId(docId);
    try {
      await fetch(`${API_URL}/patients/${patientId}/documents/${docId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      setPhotos(prev => prev.filter(p => p.id !== docId));
      if (zoomedIndex !== null && photos[zoomedIndex]?.id === docId) setZoomedIndex(null);
      toast.success("Foto removida");
    } catch { toast.error("Erro ao remover"); }
    finally { setDeletingId(null); }
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (zoomedIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setZoomedIndex(i => i !== null ? Math.min(i + 1, photos.length - 1) : null);
      if (e.key === "ArrowLeft") setZoomedIndex(i => i !== null ? Math.max(i - 1, 0) : null);
      if (e.key === "Escape") setZoomedIndex(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomedIndex, photos.length]);

  const zoomedPhoto = zoomedIndex !== null ? photos[zoomedIndex] : null;

  return (
    <div className="px-5 pb-5">
      {/* Lightbox */}
      {zoomedPhoto && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
          onClick={() => setZoomedIndex(null)}
        >
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white disabled:opacity-30"
            onClick={e => { e.stopPropagation(); setZoomedIndex(i => i !== null ? Math.max(i - 1, 0) : null); }}
            disabled={zoomedIndex === 0}
          >
            <ChevronUp className="w-5 h-5 -rotate-90" />
          </button>
          <img src={zoomedPhoto.file_url} alt={zoomedPhoto.title || "Foto"} className="max-w-[85vw] max-h-[85vh] rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white" onClick={() => setZoomedIndex(null)}>
            <X className="w-5 h-5" />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white disabled:opacity-30"
            onClick={e => { e.stopPropagation(); setZoomedIndex(i => i !== null ? Math.min(i + 1, photos.length - 1) : null); }}
            disabled={zoomedIndex === photos.length - 1}
          >
            <ChevronDown className="w-5 h-5 -rotate-90" />
          </button>
          {zoomedPhoto.title && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">{zoomedPhoto.title}</p>
          )}
          <p className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">{(zoomedIndex ?? 0) + 1} / {photos.length}</p>
        </div>
      )}

      {/* Upload area */}
      <div className="mb-4 space-y-2">
        <div
          className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
        >
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleUpload(e.target.files)} />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">{uploadProgress ? `Enviando ${uploadProgress.current} de ${uploadProgress.total}...` : "Enviando..."}</p>
              {uploadProgress && (
                <div className="w-40 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Camera className="w-8 h-8 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Toque para adicionar fotos</p>
              <p className="text-xs text-slate-400">Ou arraste as imagens aqui — aceita múltiplas</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-semibold"
        >
          <Camera className="w-3.5 h-3.5" /> Abrir câmera
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <ImageIcon className="w-12 h-12 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Documentação fotográfica</p>
          <p className="text-xs text-slate-400 text-center max-w-56">Registre RX fotografado, evolução de feridas, aspecto pós-operatório ou lesões cutâneas. Aceita múltiplas fotos de uma vez.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((photo, idx) => (
            <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 aspect-square">
              <img
                src={photo.file_url}
                alt={photo.title || "Foto"}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setZoomedIndex(idx)}
              />
              {/* Always visible controls (bottom bar) */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/50 px-2 py-1">
                <p className="text-white text-[10px] truncate flex-1 mr-1">{photo.title || "Foto"}</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setZoomedIndex(idx)}
                    className="p-1 bg-white/20 hover:bg-white/40 rounded text-white"
                    title="Ampliar"
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { const a = document.createElement("a"); a.href = photo.file_url; a.download = photo.title || "foto"; a.target = "_blank"; a.click(); }}
                    className="p-1 bg-white/20 hover:bg-white/40 rounded text-white"
                    title="Download"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(photo.id)}
                    disabled={deletingId === photo.id}
                    className="p-1 bg-red-500/80 hover:bg-red-600 rounded text-white disabled:opacity-50"
                    title="Remover"
                  >
                    {deletingId === photo.id ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Drawer ────────────────────────────────────────────────────────────────

export default function ConsultaDrawer({ entry, onClose, onStatusChange }: ConsultaDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("anamnese");
  const [patient, setPatient] = useState<any>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [busyStatus, setBusyStatus] = useState(false);
  const [clinic, setClinic] = useState<any>(null);

  useEffect(() => {
    setLoadingPatient(true);
    setPatient(null);
    patientsApi.get(entry.patient_id)
      .then(setPatient)
      .catch(() => toast.error("Erro ao carregar dados do paciente"))
      .finally(() => setLoadingPatient(false));
  }, [entry.patient_id]);

  useEffect(() => {
    if (!entry.clinic_id) return;
    clinicApi.get(entry.clinic_id)
      .then(setClinic)
      .catch(() => {}); // silencioso — telefone é opcional
  }, [entry.clinic_id]);

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
    { key: "anamnese",        label: "Anamnese",         icon: <ClipboardList className="w-3.5 h-3.5" /> },
    { key: "exames",          label: "Exames",            icon: <FlaskConical className="w-3.5 h-3.5" /> },
    { key: "receitas",        label: "Receitas",          icon: <FileText className="w-3.5 h-3.5" /> },
    { key: "encaminhamentos", label: "Encaminh.",         icon: <Send className="w-3.5 h-3.5" /> },
    { key: "procedimentos",   label: "Procedimentos",     icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
    { key: "atestados",       label: "Atestados",         icon: <Award className="w-3.5 h-3.5" /> },
    { key: "laudos",          label: "Laudos",            icon: <FileSearch2 className="w-3.5 h-3.5" /> },
    { key: "fotos",           label: "Fotos",             icon: <Camera className="w-3.5 h-3.5" /> },
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

      {/* ── Tabs (scrollable) ── */}
      <div className="flex-shrink-0 overflow-x-auto border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 scrollbar-none" style={{ scrollbarWidth: "none" }}>
        <div className="flex min-w-max">
          {tabs.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1 px-3 py-2.5 text-[11px] font-semibold transition-all border-b-2 whitespace-nowrap ${
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
      </div>

      {/* ── Tab content (scrollable) ── */}
      <div className="flex-1 overflow-y-auto">
        {loadingPatient ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="pt-4">
            {activeTab === "anamnese"        && <TabProntuario patientId={entry.patient_id} />}
            {activeTab === "exames"          && <TabExames patientId={entry.patient_id} patient={patient} clinic={clinic} />}
            {activeTab === "receitas"        && <TabReceita patientId={entry.patient_id} patient={patient} clinic={clinic} />}
            {activeTab === "encaminhamentos" && <TabEncaminhamentos patient={patient} clinic={clinic} />}
            {activeTab === "procedimentos"   && <TabProcedimentos patientId={entry.patient_id} patient={patient} clinic={clinic} />}
            {activeTab === "atestados"       && <TabAtestados patient={patient} clinic={clinic} />}
            {activeTab === "laudos"          && <TabLaudos patient={patient} clinic={clinic} />}
            {activeTab === "fotos"           && <TabFotos patientId={entry.patient_id} />}
          </div>
        )}
      </div>
    </div>
  );
}
