"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Trash2, Printer, ChevronDown, ChevronUp,
  ExternalLink, CheckCircle2, Search, X, Pill, AlertCircle,
  AlertTriangle, Activity, Pill as PillIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { api, prescriptionsApi, patientsApi } from "@/lib/api";
import { formatDate, resolveDynamicParam } from "@/lib/utils";

interface MemedConfig {
  enabled: boolean;
  token: string | null;
  sandbox: boolean;
}

interface Medication {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

interface ControlledPrescription {
  id?: string;
  date: string;
  medications: Medication[];
  instructions: string;
  controlType: "tarja_vermelha" | "tarja_preta" | "controlada";
}

const DEMO_CATALOG = [
  { name: "Nimesulida 100mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "5 dias", instructions: "Tomar após as refeições" },
  { name: "Ibuprofeno 600mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "7 dias", instructions: "Tomar com alimento" },
  { name: "Dipirona 500mg", dose: "1 comprimido", route: "oral", frequency: "6/6h se dor", duration: "5 dias", instructions: "Até 4 comprimidos/dia" },
  { name: "Paracetamol 750mg", dose: "1 comprimido", route: "oral", frequency: "6/6h se dor", duration: "5 dias", instructions: "" },
  { name: "Omeprazol 20mg", dose: "1 cápsula", route: "oral", frequency: "1x ao dia", duration: "30 dias", instructions: "Tomar 30 min antes do café" },
  { name: "Diclofenaco Potássico 50mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "7 dias", instructions: "Tomar com alimento" },
  { name: "Tramadol 50mg", dose: "1 cápsula", route: "oral", frequency: "8/8h se dor forte", duration: "5 dias", instructions: "Pode causar sonolência" },
  { name: "Pregabalina 75mg", dose: "1 cápsula", route: "oral", frequency: "12/12h", duration: "30 dias", instructions: "Não interromper abruptamente" },
];

const ROUTE_OPTIONS = ["oral", "IM", "IV", "tópico", "inalatório", "sublingual", "retal"];

const emptyMed = (): Medication => ({
  name: "", dose: "", route: "oral", frequency: "", duration: "", instructions: "",
});

// ─── Banners de alerta clínico ──────────────────────────────────────────────

function AllergyBanners({ patient }: { patient: any }) {
  const allergies: string[] = patient?.allergies
    ? (typeof patient.allergies === "string"
        ? patient.allergies.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(patient.allergies) ? patient.allergies : [])
    : [];

  const chronic: string[] = patient?.chronic_conditions
    ? (typeof patient.chronic_conditions === "string"
        ? patient.chronic_conditions.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(patient.chronic_conditions) ? patient.chronic_conditions : [])
    : [];

  const currentMeds: string[] = patient?.current_medications
    ? (typeof patient.current_medications === "string"
        ? patient.current_medications.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(patient.current_medications) ? patient.current_medications : [])
    : [];

  if (allergies.length === 0 && chronic.length === 0 && currentMeds.length === 0) return null;

  return (
    <div className="space-y-2 print:hidden">
      {allergies.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800 dark:text-red-300 uppercase tracking-wide">
              Atencao: Paciente Alergico
            </p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
              {allergies.join(" · ")}
            </p>
          </div>
        </div>
      )}

      {chronic.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-4 py-3">
          <Activity className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Condicoes Cronicas</p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              {chronic.join(" · ")}
            </p>
          </div>
        </div>
      )}

      {currentMeds.length > 0 && (
        <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg px-4 py-3">
          <PillIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-800 dark:text-blue-300">Em Uso Atual</p>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">
              {currentMeds.join(" · ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal de impressão de receita simples ────────────────────────────────────

function PrintPrescriptionModal({
  rx,
  patient,
  onClose,
}: {
  rx: { date: string; medications: Medication[]; instructions: string };
  patient: any;
  onClose: () => void;
}) {
  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:p-0" style={{ background: "rgba(0,0,0,0.55)" }}>
      {/* Estilos de impressão embutidos */}
      <style>{`
        @media print {
          body > *:not(#print-prescription-root) { display: none !important; }
          #print-prescription-root {
            position: fixed !important;
            inset: 0 !important;
            z-index: 9999 !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; }
        }
      `}</style>

      <div id="print-prescription-root" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header modal (some apenas na tela) */}
        <div className="no-print px-5 pt-5 pb-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-slate-900 dark:text-slate-50">Preview da Receita</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-semibold text-sm"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conteudo imprimivel */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          <div className="print-page bg-white p-6 border border-gray-200 rounded-lg text-sm text-gray-900">
            {/* Cabecalho */}
            <div className="text-center border-b-2 border-blue-800 pb-4 mb-6">
              <h1 className="text-xl font-bold text-blue-900">Dr. Valth Guimaraes</h1>
              <p className="text-sm text-gray-600">Ortopedia e Traumatologia</p>
              <p className="text-sm text-gray-600">CRM/PB 1234</p>
            </div>

            {/* Dados do paciente */}
            <div className="grid grid-cols-2 gap-3 mb-6 text-xs">
              <div>
                <span className="font-bold text-gray-500 uppercase">Paciente:</span>
                <p className="font-semibold">{patient?.name}</p>
              </div>
              <div>
                <span className="font-bold text-gray-500 uppercase">Data:</span>
                <p>{new Date(rx.date).toLocaleDateString("pt-BR")}</p>
              </div>
              {patient?.cpf && (
                <div>
                  <span className="font-bold text-gray-500 uppercase">CPF:</span>
                  <p className="font-mono">{patient.cpf}</p>
                </div>
              )}
              {patient?.birth_date && (
                <div>
                  <span className="font-bold text-gray-500 uppercase">Nasc.:</span>
                  <p>{new Date(patient.birth_date).toLocaleDateString("pt-BR")}</p>
                </div>
              )}
            </div>

            {/* Medicamentos */}
            {rx.medications.length > 0 && (
              <div className="mb-6">
                <p className="font-bold text-gray-700 uppercase text-xs tracking-wider mb-3 border-b border-gray-200 pb-1">Prescricao</p>
                <ol className="space-y-3">
                  {rx.medications.map((m, i) => (
                    <li key={i} className="pl-2">
                      <p className="font-semibold">
                        {i + 1}. {m.name}
                        {m.dose && <span className="font-normal text-gray-600"> — {m.dose}</span>}
                      </p>
                      <p className="text-gray-600 text-xs mt-0.5">
                        {[m.route && `Via ${m.route}`, m.frequency, m.duration].filter(Boolean).join(" · ")}
                      </p>
                      {m.instructions && (
                        <p className="text-gray-500 text-xs italic mt-0.5">Obs: {m.instructions}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Instrucoes gerais / texto livre */}
            {rx.instructions && (
              <div className="mb-6 bg-gray-50 rounded p-3">
                <p className="font-bold text-gray-700 text-xs uppercase tracking-wider mb-1">
                  {rx.medications.length === 0 ? "Prescricao" : "Orientacoes"}
                </p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap">{rx.instructions}</p>
              </div>
            )}

            {/* Assinatura */}
            <div className="mt-10 flex justify-end">
              <div className="text-center w-56">
                <div className="border-t-2 border-gray-800 mb-2 pt-2"></div>
                <p className="text-xs font-bold">Dr. Valth Guimaraes</p>
                <p className="text-xs text-gray-500">CRM/PB 1234</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(rx.date).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>

            {/* Rodape */}
            <div className="mt-8 pt-4 border-t border-gray-200 text-center text-[10px] text-gray-400">
              <p>OrthoClinic — Ortopedia e Traumatologia</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Memed Demo ─────────────────────────────────────────────────────────

function MemedDemoModal({
  patient,
  onConfirm,
  onClose,
}: {
  patient: any;
  onConfirm: (meds: Medication[], memedId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Medication[]>([]);

  const filtered = DEMO_CATALOG.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  const addMed = (m: (typeof DEMO_CATALOG)[0]) => {
    if (selected.find((s) => s.name === m.name)) return;
    setSelected((prev) => [...prev, { ...m }]);
  };

  const removeMed = (name: string) =>
    setSelected((prev) => prev.filter((m) => m.name !== name));

  const handleConfirm = () => {
    if (selected.length === 0) {
      toast.error("Selecione pelo menos um medicamento");
      return;
    }
    const fakeId = `DEMO-${Date.now()}`;
    onConfirm(selected, fakeId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
              <span className="text-white font-black text-sm">M</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 dark:text-slate-50 text-sm">Memed Prescricao</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">Demo</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {patient?.name || "Paciente"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-50"
              placeholder="Buscar medicamento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {selected.length > 0 && (
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex-shrink-0">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">
              Selecionados ({selected.length}):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selected.map((m) => (
                <div key={m.name} className="flex items-center gap-1 bg-white dark:bg-slate-700 border border-blue-200 dark:border-blue-700 rounded-full pl-2.5 pr-1 py-0.5">
                  <span className="text-xs text-blue-800 dark:text-blue-200 font-medium">{m.name}</span>
                  <button onClick={() => removeMed(m.name)} className="p-0.5 text-blue-400 hover:text-blue-600">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filtered.map((m) => {
            const isAdded = selected.find((s) => s.name === m.name);
            return (
              <button
                key={m.name}
                onClick={() => isAdded ? removeMed(m.name) : addMed(m)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-start gap-3 ${isAdded ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isAdded ? "bg-blue-600" : "bg-gray-100 dark:bg-slate-700"}`}>
                  {isAdded ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Pill className="w-4 h-4 text-gray-400 dark:text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isAdded ? "text-blue-900 dark:text-blue-200" : "text-gray-900 dark:text-slate-50"}`}>
                    {m.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    {m.dose} · {m.frequency} · {m.duration}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-4 border-t border-gray-200 dark:border-slate-700 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-50 hover:bg-gray-50 dark:hover:bg-slate-700">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={selected.length === 0} className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            Confirmar ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente de linha de medicamento ───────────────────────────────────────

function MedRow({
  med,
  index,
  total,
  onChange,
  onRemove,
}: {
  med: Medication;
  index: number;
  total: number;
  onChange: (k: keyof Medication, v: string) => void;
  onRemove: () => void;
}) {
  const inputCls = "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 text-sm";

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Medicamento {index + 1}
        </span>
        {total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remover
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome *</label>
          <input
            className={inputCls}
            placeholder="Ex: Nimesulida 100mg"
            value={med.name}
            onChange={(e) => onChange("name", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Dose</label>
          <input className={inputCls} placeholder="1 comprimido" value={med.dose} onChange={(e) => onChange("dose", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Via</label>
          <select
            className={inputCls}
            value={med.route}
            onChange={(e) => onChange("route", e.target.value)}
          >
            {ROUTE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Frequencia</label>
          <input className={inputCls} placeholder="8/8h, 12/12h..." value={med.frequency} onChange={(e) => onChange("frequency", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Duracao</label>
          <input className={inputCls} placeholder="7 dias..." value={med.duration} onChange={(e) => onChange("duration", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Instrucoes / Observacoes</label>
          <input className={inputCls} placeholder="Tomar apos as refeicoes..." value={med.instructions} onChange={(e) => onChange("instructions", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ─── Pagina principal ────────────────────────────────────────────────────────

export default function PrescriptionPage() {
  const params = useParams();
  const id = resolveDynamicParam(params?.id as string);
  if (!id) return <div>Paciente nao encontrado</div>;
  const pid = Number(id);

  const [tab, setTab] = useState<"simples" | "controlada">("simples");
  const [patient, setPatient] = useState<any>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);

  const [medications, setMedications] = useState<Medication[]>([emptyMed()]);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [printRx, setPrintRx] = useState<{ date: string; medications: Medication[]; instructions: string } | null>(null);
  const [freeTextMode, setFreeTextMode] = useState(false);
  const [freeText, setFreeText] = useState("");

  const [controlledMeds, setControlledMeds] = useState<Medication[]>([emptyMed()]);
  const [controlledInstructions, setControlledInstructions] = useState("");
  const [controlType, setControlType] = useState<"tarja_vermelha" | "tarja_preta" | "controlada">("tarja_vermelha");
  const [controlledFreeTextMode, setControlledFreeTextMode] = useState(false);
  const [controlledFreeText, setControlledFreeText] = useState("");
  const [savingControlled, setSavingControlled] = useState(false);
  const [controlledRx, setControlledRx] = useState<ControlledPrescription | null>(null);

  const [memedConfig, setMemedConfig] = useState<MemedConfig | null>(null);
  const [memedLoading, setMemedLoading] = useState(false);
  const [memedReady, setMemedReady] = useState(false);
  const [memedSaving, setMemedSaving] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const memedListenersAdded = useRef(false);

  const isDemo = memedConfig?.token === "demo";

  useEffect(() => {
    Promise.all([
      patientsApi.get(pid),
      prescriptionsApi.list(pid),
      api.get("/memed/config").then((r) => r.data).catch(() => null),
    ])
      .then(([p, rx, mc]) => {
        setPatient(p);
        setPrescriptions(rx);
        if (mc) setMemedConfig(mc);
      })
      .catch(() => toast.error("Erro ao carregar"));
  }, [pid]);

  const saveMemedPrescription = useCallback(
    async (meds: Medication[], memedId: string) => {
      setMemedSaving(true);
      try {
        const newRx = await prescriptionsApi.create(pid, {
          date: new Date().toISOString().split("T")[0],
          medications: meds,
          memed_id: memedId,
          instructions: "",
        });
        toast.success("Receita salva com sucesso!");
        setPrescriptions((prev) => [newRx, ...prev]);
      } catch {
        toast.error("Erro ao salvar receita");
      } finally {
        setMemedSaving(false);
      }
    },
    [pid],
  );

  const handleDemoConfirm = (meds: Medication[], memedId: string) => {
    setShowDemoModal(false);
    saveMemedPrescription(meds, memedId);
  };

  const registerMemedListeners = useCallback(() => {
    if (memedListenersAdded.current) return;
    memedListenersAdded.current = true;

    document.addEventListener("MdSinapsePrescricaoLoaded", () => {
      const sdk = (window as any).MdSinapsePrescricao;
      if (sdk && patient) {
        try {
          sdk.setPaciente({
            nome: patient.name || "",
            cpf: patient.cpf || "",
            dataNascimento: patient.birth_date || "",
          });
        } catch (_) {}
      }
      setMemedReady(true);
      setMemedLoading(false);
      toast.success("Memed carregado!");
    }, { once: true });

    document.addEventListener("MdSinapsePrescricaoSuccess", async (e: any) => {
      const detail = e.detail?.[0] || {};
      const memedId = String(detail?.prescricao?.id || Date.now());
      const memedMeds: any[] = detail?.prescricao?.medicamentos || [];
      const meds: Medication[] = memedMeds.length > 0
        ? memedMeds.map((m: any) => ({
            name: m.nome || m.name || "Medicamento",
            dose: m.quantidade || m.dose || "",
            route: m.via || "oral",
            frequency: m.posologia || m.frequency || "",
            duration: m.duracao || "",
            instructions: m.observacao || "",
          }))
        : [{ name: `Receita Memed #${memedId}`, dose: "", route: "", frequency: "", duration: "", instructions: "" }];
      await saveMemedPrescription(meds, memedId);
    });
  }, [patient, saveMemedPrescription]);

  const loadRealMemed = useCallback(() => {
    if (!memedConfig?.token || isDemo) return;
    if (memedLoading || memedReady) {
      try { (window as any).MdSinapsePrescricao?.openPrescription?.(); } catch (_) {}
      return;
    }
    setMemedLoading(true);
    registerMemedListeners();
    const baseUrl = memedConfig.sandbox ? "https://sandbox.memed.com.br" : "https://memed.com.br";
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.setAttribute("data-token", memedConfig.token);
    script.setAttribute("data-color", "#2563eb");
    script.src = `${baseUrl}/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js`;
    script.onerror = () => {
      setMemedLoading(false);
      toast.error("Erro ao carregar SDK do Memed");
    };
    document.head.appendChild(script);
  }, [memedConfig, memedLoading, memedReady, isDemo, registerMemedListeners]);

  const handleOpenMemed = () => {
    if (isDemo) {
      setShowDemoModal(true);
      return;
    }
    if (memedReady) {
      try { (window as any).MdSinapsePrescricao?.openPrescription?.(); } catch (_) {}
      return;
    }
    loadRealMemed();
  };

  const updateMed = (i: number, k: keyof Medication, v: string) =>
    setMedications((ms) => ms.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));

  const updateControlledMed = (i: number, k: keyof Medication) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setControlledMeds((ms) => ms.map((m, idx) => (idx === i ? { ...m, [k]: e.target.value } : m)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (freeTextMode) {
      if (!freeText.trim()) { toast.error("Escreva o conteudo da receita"); return; }
      setSaving(true);
      try {
        const newRx = await prescriptionsApi.create(pid, {
          date: new Date().toISOString().split("T")[0],
          medications: [],
          instructions: freeText,
        });
        toast.success("Receita salva!");
        setPrescriptions((prev) => [newRx, ...prev]);
        setFreeText("");
      } catch {
        toast.error("Erro ao salvar receita");
      } finally {
        setSaving(false);
      }
      return;
    }
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

  const handlePrintManual = () => {
    if (freeTextMode) {
      if (!freeText.trim()) { toast.error("Escreva o conteudo da receita para imprimir"); return; }
      setPrintRx({
        date: new Date().toISOString().split("T")[0],
        medications: [],
        instructions: freeText,
      });
      return;
    }
    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) { toast.error("Adicione pelo menos um medicamento para imprimir"); return; }
    setPrintRx({
      date: new Date().toISOString().split("T")[0],
      medications: validMeds,
      instructions,
    });
  };

  const handlePrintExisting = (rx: any) => {
    setPrintRx({
      date: rx.date,
      medications: rx.medications || [],
      instructions: rx.instructions || "",
    });
  };

  const handleControlledSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (controlledFreeTextMode) {
      if (!controlledFreeText.trim()) { toast.error("Escreva o conteudo da receita"); return; }
      const rx: ControlledPrescription = {
        id: `RX-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        medications: [],
        instructions: controlledFreeText,
        controlType,
      };
      setControlledRx(rx);
      toast.success("Receita controlada gerada!");
      return;
    }
    const validMeds = controlledMeds.filter((m) => m.name.trim());
    if (validMeds.length === 0) { toast.error("Adicione pelo menos um medicamento"); return; }
    const rx: ControlledPrescription = {
      id: `RX-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      medications: validMeds,
      instructions: controlledInstructions,
      controlType,
    };
    setControlledRx(rx);
    toast.success("Receita controlada gerada!");
  };

  const handleDelete = async (rxId: number) => {
    if (!confirm("Excluir esta receita?")) return;
    await prescriptionsApi.delete(pid, rxId);
    setPrescriptions((prev) => prev.filter((r) => r.id !== rxId));
    toast.success("Receita excluida");
  };

  if (!patient) return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar title="Prescricoes" subtitle={patient?.name} back={`/pacientes/${pid}`} />

      {showDemoModal && (
        <MemedDemoModal patient={patient} onConfirm={handleDemoConfirm} onClose={() => setShowDemoModal(false)} />
      )}

      {printRx && (
        <PrintPrescriptionModal rx={printRx} patient={patient} onClose={() => setPrintRx(null)} />
      )}

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Banners de alerta clinico */}
        <AllergyBanners patient={patient} />

        {/* Abas */}
        <div className="flex gap-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-1">
          <button
            onClick={() => setTab("simples")}
            className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-md transition-colors ${
              tab === "simples"
                ? "bg-brand-600 text-white"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50"
            }`}
          >
            Receita Simples
          </button>
          <button
            onClick={() => setTab("controlada")}
            className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-md transition-colors ${
              tab === "controlada"
                ? "bg-brand-600 text-white"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50"
            }`}
          >
            Receita Controlada
          </button>
        </div>

        {tab === "simples" && (
          <div className="space-y-6">
            {memedConfig?.enabled ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
                    <span className="text-white font-black text-base">M</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-slate-900 dark:text-slate-50">Receita Digital Memed</h2>
                      {isDemo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Demo</span>}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {isDemo ? "Simulacao com validade legal" : "Prescricao digital com envio por WhatsApp"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenMemed}
                  disabled={memedLoading || memedSaving}
                  className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2"
                >
                  {memedLoading ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Carregando...</>
                  ) : memedSaving ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  ) : (
                    <><ExternalLink className="w-4 h-4" /> Prescrever via Memed</>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-5">
                <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Integracao Memed disponivel</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Conecte o Memed para receitas digitais com validade legal.
                </p>
              </div>
            )}

            {/* Toggle receita manual */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
              <button
                type="button"
                onClick={() => setShowManual((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                {showManual ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showManual ? "Ocultar" : "Receita manual (papel)"}
              </button>
              <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
            </div>

            {showManual && (
              <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 dark:text-slate-50">Receita Manual</h3>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={freeTextMode}
                      onChange={(e) => setFreeTextMode(e.target.checked)}
                      className="w-4 h-4 rounded accent-brand-600"
                    />
                    Texto livre
                  </label>
                </div>

                {freeTextMode ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Conteudo da receita</label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 resize-none text-sm font-mono"
                      placeholder={"Ex:\n1. Nimesulida 100mg - 1 cp de 12/12h por 5 dias\n2. Omeprazol 20mg - 1 cp em jejum por 30 dias"}
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      rows={10}
                    />
                  </div>
                ) : (
                  <>
                    {medications.map((med, i) => (
                      <MedRow
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
                      className="w-full py-2.5 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Adicionar medicamento
                    </button>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Orientacoes gerais</label>
                      <textarea
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 resize-none text-sm"
                        placeholder="Evitar alcool, repouso, retorno em 7 dias..."
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handlePrintManual}
                    className="flex-1 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" /> Imprimir Receita
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-semibold"
                  >
                    {saving ? "Salvando..." : "Salvar Receita"}
                  </button>
                </div>
              </form>
            )}

            {/* Receitas anteriores */}
            {prescriptions.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 dark:text-slate-50">Receitas anteriores</h3>
                {prescriptions.map((rx) => (
                  <div key={rx.id} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{formatDate(rx.date)}</p>
                        {rx.memed_id && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded mt-1 inline-block">
                            Memed
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handlePrintExisting(rx)}
                          className="p-2 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                          title="Imprimir"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(rx.id)}
                          className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {rx.medications?.slice(0, 4).map((m: any, i: number) => (
                        <p key={i} className="text-sm text-slate-700 dark:text-slate-300">
                          <span className="font-medium">{i + 1}. {m.name}</span>
                          {m.dose && <span className="text-slate-500 dark:text-slate-400"> — {m.dose}</span>}
                          {m.frequency && <span className="text-slate-500 dark:text-slate-400">, {m.frequency}</span>}
                        </p>
                      ))}
                      {(rx.medications?.length || 0) > 4 && (
                        <p className="text-xs text-slate-400">+ {rx.medications.length - 4} medicamento(s)...</p>
                      )}
                    </div>
                    {rx.instructions && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic border-t border-slate-100 dark:border-slate-700 pt-2">
                        {rx.instructions}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "controlada" && (
          <div className="space-y-6">
            {!controlledRx ? (
              <form onSubmit={handleControlledSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="font-bold text-slate-900 dark:text-slate-50">Gerar Receita Controlada</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Com 2 vias para impressao (Via vermelha + Via branca)</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={controlledFreeTextMode}
                      onChange={(e) => setControlledFreeTextMode(e.target.checked)}
                      className="w-4 h-4 rounded accent-brand-600"
                    />
                    Texto livre
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Tipo de Receita *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "tarja_vermelha" as const, label: "Tarja Vermelha", desc: "Antibioticos, anti-inflamatorios" },
                      { value: "tarja_preta" as const, label: "Tarja Preta", desc: "Controlados (ANVISA)" },
                      { value: "controlada" as const, label: "Controlada", desc: "Receituario especial" },
                    ].map((opt) => (
                      <button key={opt.value} type="button" onClick={() => setControlType(opt.value)}
                        className={`p-3 border-2 rounded-lg transition-all text-left ${
                          controlType === opt.value
                            ? "border-brand-600 bg-brand-50 dark:bg-brand-900/20"
                            : "border-slate-200 dark:border-slate-700 hover:border-brand-400"
                        }`}>
                        <p className="font-semibold text-slate-900 dark:text-slate-50 text-sm">{opt.label}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {controlledFreeTextMode ? (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Conteudo da receita *</label>
                    <textarea className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 resize-none font-mono text-sm"
                      placeholder={"Ex:\n1. Tramadol 50mg - 1 cp de 8/8h se dor forte, por 5 dias"}
                      value={controlledFreeText}
                      onChange={(e) => setControlledFreeText(e.target.value)} rows={10} />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Medicamentos *</label>
                      {controlledMeds.map((med, i) => (
                        <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Med. {i + 1}</span>
                            {controlledMeds.length > 1 && (
                              <button type="button" onClick={() => setControlledMeds((ms) => ms.filter((_, idx) => idx !== i))}
                                className="p-1 text-red-500 hover:text-red-700">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <input className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50"
                                placeholder="Nome do medicamento" value={med.name} onChange={updateControlledMed(i, "name")} />
                            </div>
                            <input className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Dose" value={med.dose} onChange={updateControlledMed(i, "dose")} />
                            <input className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Frequencia" value={med.frequency} onChange={updateControlledMed(i, "frequency")} />
                            <input className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Duracao" value={med.duration} onChange={updateControlledMed(i, "duration")} />
                            <input className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Via" value={med.route} onChange={updateControlledMed(i, "route")} />
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => setControlledMeds((ms) => [...ms, emptyMed()])}
                        className="w-full py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2">
                        <Plus className="w-4 h-4" /> Adicionar
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Orientacoes</label>
                      <textarea className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 resize-none"
                        placeholder="Orientacoes gerais ao paciente..." value={controlledInstructions}
                        onChange={(e) => setControlledInstructions(e.target.value)} rows={3} />
                    </div>
                  </>
                )}

                <button type="submit" disabled={savingControlled}
                  className="w-full py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Gerar Receita com 2 Vias
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 border border-brand-200 dark:border-brand-800">
                  <div>
                    <p className="font-semibold text-brand-900 dark:text-brand-100">Receita gerada com sucesso!</p>
                    <p className="text-sm text-brand-700 dark:text-brand-200">ID: {controlledRx.id}</p>
                  </div>
                  <button onClick={() => { window.print(); }}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 flex items-center gap-2 font-semibold">
                    <Printer className="w-4 h-4" /> Imprimir 2 Vias
                  </button>
                </div>

                <div className="print:hidden space-y-2">
                  <button onClick={() => setControlledRx(null)}
                    className="w-full py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700">
                    Gerar Outra Receita
                  </button>
                </div>

                <div className="print:block hidden space-y-4">
                  <style>{`
                    @media print {
                      body { margin: 0; padding: 0; }
                      .print\\:hidden { display: none !important; }
                      .page-break { page-break-after: always; }
                    }
                  `}</style>
                  <ControlledPrescriptionPrint rx={controlledRx} patient={patient} />
                </div>

                <div className="print:hidden bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Preview para impressao (Clique em "Imprimir 2 Vias" para imprimir com corte no meio):
                  </p>
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded p-4 bg-slate-50 dark:bg-slate-900 text-xs overflow-x-auto">
                    <div className="whitespace-pre-wrap text-slate-800 dark:text-slate-100 font-mono text-[11px]">
                      {`╔═══════════════════════════════════════════╗
║         RECEITA MEDICA CONTROLADA        ║
║                                           ║
║  Paciente: ${patient?.name || "N/A"}
║  Data: ${new Date(controlledRx.date).toLocaleDateString("pt-BR")}
║  Tipo: ${controlledRx.controlType.replace("_", " ").toUpperCase()}
║                                           ║
║  MEDICAMENTOS:                            ║
${controlledRx.medications.length > 0
  ? controlledRx.medications.slice(0, 3).map((m, i) => `║  ${i + 1}. ${m.name.substring(0, 37)}║`).join("\n")
  : controlledRx.instructions.split("\n").slice(0, 3).map((l) => `║  ${l.substring(0, 40)}║`).join("\n")}
║                                           ║
║  [ESPACO PARA ASSINATURA DO MEDICO]      ║
║  __________ / __________ / __________    ║
║  CRM no: _____________                   ║
╚═══════════════════════════════════════════╝

Via Vermelha - Farmacia
Via Branca - Paciente`}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </PageWithSidebar>
  );
}

function ControlledPrescriptionPrint({ rx, patient }: { rx: ControlledPrescription; patient: any }) {
  return (
    <div className="space-y-8 text-sm">
      {[1, 2].map((via) => (
        <div key={via} className="p-8 border-4 border-dashed border-gray-400 bg-white min-h-96 flex flex-col">
          <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-red-600">
            <div>
              <h1 className="text-2xl font-bold">RECEITA MEDICA</h1>
              <p className="font-bold text-red-600">Via {via === 1 ? "VERMELHA" : "BRANCA"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">Dr. Valth Guimaraes</p>
              <p className="text-xs text-gray-500">CRM/PB 1234</p>
              <p className="font-mono text-xs">{new Date(rx.date).toLocaleDateString("pt-BR")}</p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 text-sm flex-1">
            <div>
              <p className="font-bold text-gray-600">PACIENTE:</p>
              <p className="font-bold">{patient?.name}</p>
            </div>
            <div>
              <p className="font-bold text-gray-600">DATA NASC:</p>
              <p>{patient?.birthdate ? new Date(patient.birthdate).toLocaleDateString("pt-BR") : "N/A"}</p>
            </div>
            <div>
              <p className="font-bold text-gray-600">CPF:</p>
              <p className="font-mono">{patient?.cpf || "N/A"}</p>
            </div>
            <div>
              <p className="font-bold text-gray-600">ENDERECO:</p>
              <p>{patient?.address_street || "N/A"}</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="font-bold text-gray-600 mb-2">MEDICAMENTOS:</p>
            {rx.medications.length > 0 ? (
              <table className="w-full text-xs border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border px-2 py-1 text-left">Medicamento</th>
                    <th className="border px-2 py-1 text-left">Dose</th>
                    <th className="border px-2 py-1 text-left">Freq.</th>
                    <th className="border px-2 py-1 text-left">Duracao</th>
                  </tr>
                </thead>
                <tbody>
                  {rx.medications.map((m, i) => (
                    <tr key={i}>
                      <td className="border px-2 py-1">{m.name}</td>
                      <td className="border px-2 py-1">{m.dose}</td>
                      <td className="border px-2 py-1">{m.frequency}</td>
                      <td className="border px-2 py-1">{m.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs whitespace-pre-wrap border border-gray-300 p-2">{rx.instructions}</p>
            )}
          </div>

          <div className="mt-auto pt-6 border-t-2 border-gray-300">
            <div className="flex justify-between">
              <div className="w-48">
                <div className="border-t border-gray-900 mb-1" style={{ height: "50px" }} />
                <p className="text-xs font-bold">Dr. Valth Guimaraes</p>
                <p className="text-xs">CRM/PB 1234</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
