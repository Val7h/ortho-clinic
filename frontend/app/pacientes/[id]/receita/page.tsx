"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Trash2, Printer, ChevronDown, ChevronUp,
  ExternalLink, CheckCircle2, Search, X, Pill, AlertCircle, Copy,
} from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { api, prescriptionsApi, patientsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

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

const emptyMed = (): Medication => ({
  name: "", dose: "", route: "", frequency: "", duration: "", instructions: "",
});

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
                <span className="font-bold text-gray-900 dark:text-slate-50 text-sm">Memed Prescrição</span>
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

export default function PrescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);

  const [tab, setTab] = useState<"simples" | "controlada">("simples");
  const [patient, setPatient] = useState<any>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);

  // Receita Simples
  const [medications, setMedications] = useState<Medication[]>([emptyMed()]);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // Receita Controlada
  const [controlledMeds, setControlledMeds] = useState<Medication[]>([emptyMed()]);
  const [controlledInstructions, setControlledInstructions] = useState("");
  const [controlType, setControlType] = useState<"tarja_vermelha" | "tarja_preta" | "controlada">("tarja_vermelha");
  const [savingControlled, setSavingControlled] = useState(false);
  const [controlledRx, setControlledRx] = useState<ControlledPrescription | null>(null);

  // Memed
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

  const updateMed = (i: number, k: keyof Medication) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setMedications((ms) => ms.map((m, idx) => (idx === i ? { ...m, [k]: e.target.value } : m)));

  const updateControlledMed = (i: number, k: keyof Medication) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setControlledMeds((ms) => ms.map((m, idx) => (idx === i ? { ...m, [k]: e.target.value } : m)));

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

  const handleControlledSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    toast.success("Receita excluída");
  };

  if (!patient) return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar title="Prescrições" subtitle={patient?.name} back={`/pacientes/${pid}`} />

      {showDemoModal && (
        <MemedDemoModal patient={patient} onConfirm={handleDemoConfirm} onClose={() => setShowDemoModal(false)} />
      )}

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* TABS */}
        <div className="flex gap-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-1">
          <button
            onClick={() => setTab("simples")}
            className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-md transition-colors ${
              tab === "simples"
                ? "bg-brand-600 text-white"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50"
            }`}
          >
            📋 Receita Simples
          </button>
          <button
            onClick={() => setTab("controlada")}
            className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-md transition-colors ${
              tab === "controlada"
                ? "bg-brand-600 text-white"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50"
            }`}
          >
            🔒 Receita Controlada
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* ABA 1: RECEITA SIMPLES (Memed + Manual) */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {tab === "simples" && (
          <div className="space-y-6">
            {/* Memed Card */}
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
                      {isDemo ? "Simulação com validade legal" : "Prescrição digital com envio por WhatsApp"}
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
                <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Integração Memed disponível</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Conecte o Memed para receitas digitais com validade legal.
                </p>
              </div>
            )}

            {/* Divider */}
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

            {/* Manual Form */}
            {showManual && (
              <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-slate-50">Receita Manual</h3>
                {medications.map((med, i) => (
                  <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Med. {i + 1}</span>
                      {medications.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setMedications((ms) => ms.filter((_, idx) => idx !== i))}
                          className="p-1 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome *</label>
                        <input
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50"
                          placeholder="Ex: Nimesulida 100mg"
                          value={med.name}
                          onChange={updateMed(i, "name")}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Dose</label>
                        <input className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="1 comprimido" value={med.dose} onChange={updateMed(i, "dose")} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Via</label>
                        <input className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Oral, tópica..." value={med.route} onChange={updateMed(i, "route")} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Frequência</label>
                        <input className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="8/8h..." value={med.frequency} onChange={updateMed(i, "frequency")} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Duração</label>
                        <input className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="7 dias..." value={med.duration} onChange={updateMed(i, "duration")} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Observações</label>
                        <input className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Tomar após as refeições..." value={med.instructions} onChange={updateMed(i, "instructions")} />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setMedications((ms) => [...ms, emptyMed()])}
                  className="w-full py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2 text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" /> Adicionar medicamento
                </button>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Orientações gerais</label>
                  <textarea
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 resize-none"
                    placeholder="Evitar álcool, repouso..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={3}
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-semibold"
                >
                  {saving ? "Salvando..." : "Salvar Receita Manual"}
                </button>
              </form>
            )}

            {/* History */}
            {prescriptions.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 dark:text-slate-50">Receitas anteriores</h3>
                {prescriptions.map((rx) => (
                  <div key={rx.id} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{formatDate(rx.date)}</p>
                        {rx.memed_id && <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-1 rounded mt-1 inline-block">Memed</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => window.print()} className="p-2 text-slate-400 hover:text-brand-600" title="Imprimir">
                          <Printer className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(rx.id)} className="p-2 text-slate-400 hover:text-red-600" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      {rx.medications?.map((m: any, i: number) => (
                        <p key={i} className="text-slate-700 dark:text-slate-300">
                          <span className="font-medium">{i + 1}. {m.name}</span>
                          {m.dose && <span className="text-slate-500 dark:text-slate-400"> — {m.dose}</span>}
                          {m.frequency && <span className="text-slate-500 dark:text-slate-400">, {m.frequency}</span>}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* ABA 2: RECEITA CONTROLADA (2 VIAS) */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {tab === "controlada" && (
          <div className="space-y-6">
            {!controlledRx ? (
              <form onSubmit={handleControlledSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-5">
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 dark:text-slate-50">Gerar Receita Controlada</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Com 2 vias para impressão (Via vermelha + Via branca)</p>
                </div>

                {/* Control Type Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Tipo de Receita *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "tarja_vermelha" as const, label: "🔴 Tarja Vermelha", desc: "Antibióticos, anti-inflamatórios" },
                      { value: "tarja_preta" as const, label: "⚫ Tarja Preta", desc: "Controlados (ANVISA)" },
                      { value: "controlada" as const, label: "🔒 Controlada", desc: "Receituário especial" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setControlType(opt.value)}
                        className={`p-3 border-2 rounded-lg transition-all text-left ${
                          controlType === opt.value
                            ? "border-brand-600 bg-brand-50 dark:bg-brand-900/20"
                            : "border-slate-200 dark:border-slate-700 hover:border-brand-400"
                        }`}
                      >
                        <p className="font-semibold text-slate-900 dark:text-slate-50 text-sm">{opt.label}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Medications */}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Medicamentos *</label>
                  {controlledMeds.map((med, i) => (
                    <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Med. {i + 1}</span>
                        {controlledMeds.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setControlledMeds((ms) => ms.filter((_, idx) => idx !== i))}
                            className="p-1 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <input
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50"
                            placeholder="Nome do medicamento"
                            value={med.name}
                            onChange={updateControlledMed(i, "name")}
                          />
                        </div>
                        <input className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Dose" value={med.dose} onChange={updateControlledMed(i, "dose")} />
                        <input className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Frequência" value={med.frequency} onChange={updateControlledMed(i, "frequency")} />
                        <input className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Duração" value={med.duration} onChange={updateControlledMed(i, "duration")} />
                        <input className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50" placeholder="Via" value={med.route} onChange={updateControlledMed(i, "route")} />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setControlledMeds((ms) => [...ms, emptyMed()])}
                    className="w-full py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Adicionar
                  </button>
                </div>

                {/* Instructions */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Orientações</label>
                  <textarea
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 resize-none"
                    placeholder="Orientações gerais ao paciente..."
                    value={controlledInstructions}
                    onChange={(e) => setControlledInstructions(e.target.value)}
                    rows={3}
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingControlled}
                  className="w-full py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2"
                >
                  <AlertCircle className="w-4 h-4" /> Gerar Receita com 2 Vias
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 border border-brand-200 dark:border-brand-800">
                  <div>
                    <p className="font-semibold text-brand-900 dark:text-brand-100">✅ Receita gerada com sucesso!</p>
                    <p className="text-sm text-brand-700 dark:text-brand-200">ID: {controlledRx.id}</p>
                  </div>
                  <button
                    onClick={() => {
                      window.print();
                    }}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 flex items-center gap-2 font-semibold"
                  >
                    <Printer className="w-4 h-4" /> Imprimir 2 Vias
                  </button>
                </div>

                <div className="print:hidden space-y-2">
                  <button
                    onClick={() => setControlledRx(null)}
                    className="w-full py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Gerar Outra Receita
                  </button>
                </div>

                {/* Print Preview */}
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

                {/* Screen Preview */}
                <div className="print:hidden bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Preview para impressão (Clique em "Imprimir 2 Vias" para imprimir com corte no meio):
                  </p>
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded p-4 bg-slate-50 dark:bg-slate-900 text-xs overflow-x-auto">
                    <div className="whitespace-pre-wrap text-slate-800 dark:text-slate-100 font-mono text-[11px]">
                      {`╔═══════════════════════════════════════════╗
║         RECEITA MÉDICA CONTROLADA        ║
║                                           ║
║  Paciente: ${patient?.name || "N/A"}
║  Data: ${new Date(controlledRx.date).toLocaleDateString("pt-BR")}
║  Tipo: ${controlledRx.controlType.replace("_", " ").toUpperCase()}
║                                           ║
║  MEDICAMENTOS:                            ║
${controlledRx.medications.slice(0, 3).map((m, i) => `║  ${i + 1}. ${m.name.substring(0, 37)}║`).join("\n")}
║                                           ║
║  [ESPAÇO PARA ASSINATURA DO MÉDICO]      ║
║  __________ / __________ / __________    ║
║  CRM nº: _____________                   ║
╚═══════════════════════════════════════════╝

Via Vermelha - Farmácia
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
  );
}

// Simple placeholder for ControlledPrescriptionPrint component
function ControlledPrescriptionPrint({ rx, patient }: { rx: ControlledPrescription; patient: any }) {
  return (
    <div className="space-y-8 text-sm">
      {[1, 2].map((via) => (
        <div key={via} className="p-8 border-4 border-dashed border-gray-400 bg-white min-h-96 flex flex-col">
          <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-red-600">
            <div>
              <h1 className="text-2xl font-bold">RECEITA MÉDICA</h1>
              <p className="font-bold text-red-600">Via {via === 1 ? "VERMELHA" : "BRANCA"}</p>
            </div>
            <div className="text-right">
              <p className="font-mono">{new Date(rx.date).toLocaleDateString("pt-BR")}</p>
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
              <p className="font-bold text-gray-600">ENDEREÇO:</p>
              <p>{patient?.address_street || "N/A"}</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="font-bold text-gray-600 mb-2">MEDICAMENTOS:</p>
            <table className="w-full text-xs border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 text-left">Medicamento</th>
                  <th className="border px-2 py-1 text-left">Dose</th>
                  <th className="border px-2 py-1 text-left">Freq.</th>
                  <th className="border px-2 py-1 text-left">Duração</th>
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
          </div>

          <div className="mt-auto pt-6 border-t-2 border-gray-300">
            <div className="flex justify-between">
              <div className="w-40">
                <div className="border-t border-gray-900 mb-1" style={{ height: "50px" }} />
                <p className="text-xs font-bold">Assinatura e Carimbo</p>
                <p className="text-xs">CRM / Data</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
