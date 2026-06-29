"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  X, Play, CheckCircle, UserX, AlertTriangle, Activity, Pill,
  ClipboardList, Stethoscope, FileText, FlaskConical,
  Plus, Trash2, Printer, ChevronDown, ChevronUp, Save,
} from "lucide-react";
import toast from "react-hot-toast";
import { patientsApi, consultationsApi, prescriptionsApi, examsApi, evolutionApi } from "@/lib/api";
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
              <TabProntuario patientId={entry.patient_id} />
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
