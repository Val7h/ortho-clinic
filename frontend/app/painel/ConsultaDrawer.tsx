"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  X, Play, CheckCircle, UserX, AlertTriangle, Activity, Pill,
  ClipboardList, Stethoscope, FileText, FlaskConical,
  Plus, Trash2, Printer, ChevronDown, ChevronUp, Save,
} from "lucide-react";
import toast from "react-hot-toast";
import { patientsApi, consultationsApi, prescriptionsApi, prescriptionTemplatesApi, examsApi, evolutionApi } from "@/lib/api";
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

const DEFAULT_FREQUENT_EXAMS = [
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

const LS_FREQUENT_EXAMS_KEY = "orthoclinic_frequent_exams";
const LS_EXAM_TEMPLATES_KEY = "orthoclinic_exam_templates";
const LS_EXAM_FONT_SIZE_KEY = "orthoclinic_exam_font_size";
const LS_EXAM_LINE_HEIGHT_KEY = "orthoclinic_exam_line_height";

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
function PrintModal({ rx, patient, onClose }: {
  rx: {
    date: string;
    medications: Medication[];
    instructions: string;
    prescription_type: PrescriptionType;
    patientAddress?: string;
    patientPhone?: string;
  };
  patient: any;
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
            <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>CRM/PB 1234 | CRM/PE 5678</p>
            <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Tel: (83) 99347-6410</p>
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
          <p style={{ fontSize: "10px", color: "#888", margin: "0 0 4px 0" }}>_____________ , ___/___/______</p>
          <div style={{ borderTop: `1px solid ${headerColor}`, paddingTop: "4px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "10px", color: "#666", margin: "0" }}>CRM/PB 1234 | CRM/PE 5678</p>
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
            <p style={{ fontSize: "10px", color: "#555", margin: "0" }}>CRM/PB 1234 | CRM/PE 5678</p>
            <p style={{ fontSize: "10px", color: "#555", margin: "0" }}>Tel: (83) 99347-6410</p>
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
            <p style={{ fontSize: "10px", color: "#666", margin: "0" }}>CRM/PB 1234 | CRM/PE 5678</p>
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
        <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>CRM/PB 1234 | CRM/PE 5678</p>
        <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Tel: (83) 99347-6410</p>
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
          <p style={{ fontSize: "11px", color: "#666", margin: "0" }}>CRM/PB 1234 | CRM/PE 5678</p>
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

// ── Modal Memed ────────────────────────────────────────────────────────────────

function MemedModal({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("memed_token") || "";
    return "";
  });
  const [saved, setSaved] = useState(false);

  const hasToken = typeof window !== "undefined" && !!localStorage.getItem("memed_token");

  const handleSave = () => {
    if (!token.trim()) return;
    localStorage.setItem("memed_token", token.trim());
    setSaved(true);
    toast.success("Token Memed salvo!");
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900 dark:text-slate-50">Integração Memed</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        {hasToken && !saved ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Integração Memed configurada</p>
            <p className="text-xs text-slate-500 mb-4">Em breve disponível nesta tela.</p>
            <button
              onClick={() => { localStorage.removeItem("memed_token"); setToken(""); setSaved(false); }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remover token
            </button>
          </div>
        ) : saved ? (
          <div className="text-center py-4">
            <p className="text-sm text-green-700 font-semibold">Token salvo com sucesso!</p>
            <p className="text-xs text-slate-500 mt-1">A integração estará disponível em breve.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              A integração com o Memed permite prescrição digital. Para ativar, forneça seu token de acesso Memed.
            </p>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Token Memed</label>
                <input
                  className={inp}
                  type="password"
                  placeholder="Cole seu token de acesso aqui..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <button
                onClick={handleSave}
                disabled={!token.trim()}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold text-sm"
              >
                Salvar Token
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab: Prontuário ────────────────────────────────────────────────────────────

const formatDateBR = (dateStr: string) => {
  const d = new Date(dateStr + "T12:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
};

function TabProntuario({ patientId }: { patientId: number }) {
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date();
  const todayBR = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getFullYear()).slice(2)}`;
  const todayISO = today.toISOString().split("T")[0];

  useEffect(() => {
    setLoading(true);
    setEvolutions([]);
    evolutionApi
      .list(patientId)
      .then((data) => setEvolutions(data))
      .catch(() => toast.error("Erro ao carregar evoluções"))
      .finally(() => setLoading(false));
  }, [patientId]);

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
      setEvolutions((prev) => [...prev, created]);
      setNewText("");
      // Scroll para o final do documento após salvar
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
      toast.success("Evolução registrada!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar evolução");
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

  return (
    <div className="flex flex-col h-full">
      {/* ── Documento evolutivo (scrollável) ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pt-2 pb-2 min-h-0"
        style={{ maxHeight: "calc(100vh - 420px)", minHeight: "120px" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : evolutions.length === 0 ? (
          <p className="text-xs text-slate-400 italic font-mono py-4">Nenhuma anotação anterior.</p>
        ) : (
          <div className="font-mono text-sm text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
            {evolutions.map((ev, idx) => (
              <span key={ev.id}>
                <span className="font-semibold">{formatDateBR(ev.entry_date)}</span>
                {" "}
                {ev.content}
                {idx < evolutions.length - 1 ? "\n" : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Área de nova entrada (fixa no bottom) ── */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 px-5 pt-3 pb-4 bg-white dark:bg-slate-900">
        {/* Label com data de hoje */}
        <div className="flex items-center gap-1 mb-1.5">
          <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-300">
            {todayBR}
          </span>
          <span className="text-xs text-slate-400 ml-1">(hoje)</span>
        </div>

        <textarea
          ref={textareaRef}
          className="w-full font-mono text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 resize-none placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={5}
          placeholder="Digite a evolução clínica..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-slate-400">Ctrl+Enter para salvar</span>
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

function TabReceita({ patientId, patient }: { patientId: number; patient: any }) {
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

  // Memed
  const [showMemed, setShowMemed] = useState(false);

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

  const updateMed = (i: number, k: keyof Medication, v: string) =>
    setMedications((ms) => ms.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));

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
    const name = window.prompt("Nome do modelo:");
    if (!name?.trim()) return;
    setSavingTemplate(true);
    try {
      const tmpl = await prescriptionTemplatesApi.create({
        name: name.trim(),
        prescription_type: rxType,
        medications: validMeds,
        instructions,
      });
      setTemplates((prev) => [...prev, tmpl].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Modelo "${name}" salvo!`);
    } catch {
      toast.error("Erro ao salvar modelo");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: number, name: string) => {
    if (!window.confirm(`Remover modelo "${name}"?`)) return;
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
      {printRx && <PrintModal rx={printRx} patient={patient} onClose={() => setPrintRx(null)} />}
      {showMemed && <MemedModal onClose={() => setShowMemed(false)} />}

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
                        <li key={tmpl.id} className="flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700">
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
                            onClick={() => handleDeleteTemplate(tmpl.id, tmpl.name)}
                            className="p-2 text-red-400 hover:text-red-600 flex-shrink-0"
                            title="Remover modelo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowMemed(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
            >
              <Pill className="w-3.5 h-3.5" />
              Via Memed
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
                key={i}
                med={med}
                index={i}
                total={medications.length}
                onChange={(k, v) => updateMed(i, k, v)}
                onRemove={() => setMedications((ms) => ms.filter((_, idx) => idx !== i))}
              />
            ))}

            <div>
              <label className={lbl}>Orientações gerais</label>
              <textarea className={inp + " min-h-[70px] resize-none"} placeholder="Evitar álcool, repouso, retorno em 7 dias..." value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
            </div>

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
      {!loadingRx && prescriptions.length > 0 && (
        <div className="space-y-2">
          <p className={sectionTitle}>Receitas anteriores</p>
          {prescriptions.slice(0, 8).map((rx) => {
            const badge = PRESCRIPTION_TYPE_BADGE[rx.prescription_type] || PRESCRIPTION_TYPE_BADGE["simples"];
            return (
              <div key={rx.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatDate(rx.date)}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  </div>
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
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Exames ────────────────────────────────────────────────────────────────

function loadFrequentExams(): string[] {
  if (typeof window === "undefined") return DEFAULT_FREQUENT_EXAMS;
  try {
    const stored = localStorage.getItem(LS_FREQUENT_EXAMS_KEY);
    if (stored) return JSON.parse(stored) as string[];
  } catch {}
  return DEFAULT_FREQUENT_EXAMS;
}

function saveFrequentExams(list: string[]) {
  try {
    localStorage.setItem(LS_FREQUENT_EXAMS_KEY, JSON.stringify(list));
  } catch {}
}

// Modal de impressão de pedido de exame
function PrintExamModal({ text, patientName, onClose, fontSize = 14, lineHeight = "normal" }: {
  text: string;
  patientName: string;
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
            <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Ortopedia e Traumatologia · CRM/PB 1234 | CRM/PE 5678</p>
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
                <p style={{ fontSize: "11px", color: "#666", margin: "0" }}>CRM/PB 1234 | CRM/PE 5678</p>
                <p style={{ fontSize: "10px", color: "#999", margin: "4px 0 0 0" }}>Assinatura e Carimbo</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabExames({ patientId, patient }: { patientId: number; patient: any }) {
  const [freeText, setFreeText] = useState("");
  const [saving, setSaving] = useState(false);
  const [exams, setExams] = useState<any[]>([]);
  const [loadingEx, setLoadingEx] = useState(true);

  // Exames frequentes
  const [frequentExams, setFrequentExams] = useState<string[]>(() => loadFrequentExams());
  const [editingFrequent, setEditingFrequent] = useState(false);
  const [newExamInput, setNewExamInput] = useState("");

  // Modelos de solicitação
  const [examTemplates, setExamTemplates] = useState<ExamTemplate[]>(() => loadExamTemplates());

  // Controle de fonte
  const [fontSize, setFontSize] = useState<12 | 14 | 16>(() => loadExamFontSize());
  const [lineHeight, setLineHeight] = useState<"normal" | "relaxed">(() => loadExamLineHeight());

  // Impressão
  const [printText, setPrintText] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    examsApi.list(patientId)
      .then(setExams)
      .catch(() => {})
      .finally(() => setLoadingEx(false));
  }, [patientId]);

  // Auto-resize textarea
  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 160)}px`;
  };

  // Clicar num atalho: append ao textarea
  const handleShortcut = (name: string) => {
    const line = `SOLICITO: ${name}`;
    setFreeText((prev) => {
      const next = prev.trim() ? `${prev.trimEnd()}\n${line}` : line;
      return next;
    });
    setTimeout(autoResize, 0);
    textareaRef.current?.focus();
  };

  // Edição da lista de frequentes
  const updateFrequent = (list: string[]) => {
    setFrequentExams(list);
    saveFrequentExams(list);
  };

  const handleAddFrequent = () => {
    if (!newExamInput.trim()) return;
    updateFrequent([...frequentExams, newExamInput.trim()]);
    setNewExamInput("");
  };

  const handleRemoveFrequent = (idx: number) => {
    updateFrequent(frequentExams.filter((_, i) => i !== idx));
  };

  const handleRestoreDefault = () => {
    updateFrequent(DEFAULT_FREQUENT_EXAMS);
  };

  // Modelos
  const handleSaveTemplate = () => {
    if (!freeText.trim()) return;
    const name = window.prompt("Nome do modelo:");
    if (!name?.trim()) return;
    const newTemplate: ExamTemplate = { id: String(Date.now()), name: name.trim(), content: freeText };
    const updated = [...examTemplates, newTemplate];
    setExamTemplates(updated);
    saveExamTemplates(updated);
    toast.success("Modelo salvo");
  };

  const handleLoadTemplate = (id: string) => {
    const tpl = examTemplates.find((t) => t.id === id);
    if (!tpl) return;
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
        <PrintExamModal text={printText} patientName={patientName} onClose={() => setPrintText(null)} fontSize={fontSize} lineHeight={lineHeight} />
      )}

      {/* ── Seção: Exames Frequentes ── */}
      <div className="px-5 pt-1 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <p className={sectionTitle + " mb-0"}>Exames Frequentes</p>
          {!editingFrequent ? (
            <button
              type="button"
              onClick={() => setEditingFrequent(true)}
              className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Editar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditingFrequent(false)}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
            >
              Fechar edição
            </button>
          )}
        </div>

        {!editingFrequent ? (
          <div className="flex flex-wrap gap-1.5">
            {frequentExams.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => handleShortcut(ex)}
                className="text-[11px] font-mono px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {frequentExams.map((ex, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded px-2 py-1">
                  <span className="flex-1 text-xs font-mono text-slate-700 dark:text-slate-300 truncate">{ex}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFrequent(idx)}
                    className="text-red-400 hover:text-red-600 flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={inp + " text-xs flex-1"}
                placeholder="Nome do novo exame..."
                value={newExamInput}
                onChange={(e) => setNewExamInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddFrequent(); } }}
              />
              <button
                type="button"
                onClick={handleAddFrequent}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
              >
                Adicionar
              </button>
            </div>
            <button
              type="button"
              onClick={handleRestoreDefault}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Restaurar padrão
            </button>

            {/* Modelos salvos (visível só no modo edição) */}
            {examTemplates.length > 0 && (
              <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Modelos salvos</p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {examTemplates.map((tpl) => (
                    <div key={tpl.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded px-2 py-1">
                      <span className="flex-1 text-xs text-slate-700 dark:text-slate-300 truncate">{tpl.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="text-red-400 hover:text-red-600 flex-shrink-0"
                        title="Excluir modelo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Seção: Solicitação ── */}
      <div className="px-5 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <p className={sectionTitle}>Solicitação</p>

        {/* Dropdown de modelos */}
        {examTemplates.length > 0 && (
          <div className="mb-2">
            <select
              className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue=""
              onChange={(e) => { if (e.target.value) { handleLoadTemplate(e.target.value); e.target.value = ""; } }}
            >
              <option value="">📋 Carregar Modelo...</option>
              {examTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Controles de fonte */}
        <div className="flex items-center justify-end gap-3 mb-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 mr-1">Fonte:</span>
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
            <span className="text-[10px] text-slate-400 mr-1">Espaçamento:</span>
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
          placeholder={"SOLICITO: RNM DO JOELHO DIREITO SEM CONTRASTE\nHD: LESÃO MENISCAL"}
          value={freeText}
          onChange={(e) => { setFreeText(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
        />
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
              💾 Salvar Modelo
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
          <div className="flex items-center justify-center h-12">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : exams.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Nenhuma solicitação anterior.</p>
        ) : (
          <div className="space-y-2">
            {exams.slice(0, 10).map((ex) => (
              <div key={ex.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">{formatDate(ex.date)}</p>
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">{examPreview(ex)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPrintText(ex.free_text || ex.exams?.map((e: any) => `SOLICITO: ${e.name}${e.laterality ? ` — ${e.laterality}` : ""}`).join("\n") || "")}
                  className="flex-shrink-0 p-1 text-slate-400 hover:text-blue-600"
                  title="Imprimir"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
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
              <TabProntuario patientId={entry.patient_id} />
            )}
            {activeTab === "receita" && (
              <TabReceita patientId={entry.patient_id} patient={patient} />
            )}
            {activeTab === "exames" && (
              <TabExames patientId={entry.patient_id} patient={patient} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
