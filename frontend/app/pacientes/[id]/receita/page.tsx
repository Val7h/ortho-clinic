"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Trash2, Printer, ChevronDown, ChevronUp,
  ExternalLink, CheckCircle2, Search, X, Pill, AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { api, prescriptionsApi, patientsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
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

// ── Demo medications catalog ───────────────────────────────────────────────────
const DEMO_CATALOG = [
  { name: "Nimesulida 100mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "5 dias", instructions: "Tomar após as refeições" },
  { name: "Ibuprofeno 600mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "7 dias", instructions: "Tomar com alimento" },
  { name: "Dipirona 500mg", dose: "1 comprimido", route: "oral", frequency: "6/6h se dor", duration: "5 dias", instructions: "Até 4 comprimidos/dia" },
  { name: "Paracetamol 750mg", dose: "1 comprimido", route: "oral", frequency: "6/6h se dor", duration: "5 dias", instructions: "" },
  { name: "Omeprazol 20mg", dose: "1 cápsula", route: "oral", frequency: "1x ao dia", duration: "30 dias", instructions: "Tomar 30 min antes do café" },
  { name: "Diclofenaco Potássico 50mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "7 dias", instructions: "Tomar com alimento" },
  { name: "Tramadol 50mg", dose: "1 cápsula", route: "oral", frequency: "8/8h se dor forte", duration: "5 dias", instructions: "Pode causar sonolência" },
  { name: "Pregabalina 75mg", dose: "1 cápsula", route: "oral", frequency: "12/12h", duration: "30 dias", instructions: "Não interromper abruptamente" },
  { name: "Ciclobenzaprina 5mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "7 dias", instructions: "Pode causar sonolência" },
  { name: "Meloxicam 15mg", dose: "1 comprimido", route: "oral", frequency: "1x ao dia", duration: "7 dias", instructions: "Tomar com alimento" },
  { name: "Celecoxibe 200mg", dose: "1 cápsula", route: "oral", frequency: "1x ao dia", duration: "14 dias", instructions: "" },
  { name: "Metformina 850mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "uso contínuo", instructions: "Tomar durante as refeições" },
  { name: "Dexametasona 4mg", dose: "1 comprimido", route: "oral", frequency: "1x ao dia", duration: "5 dias", instructions: "Tomar pela manhã" },
  { name: "Prednisona 20mg", dose: "1 comprimido", route: "oral", frequency: "1x ao dia", duration: "5 dias", instructions: "Tomar pela manhã com alimento" },
  { name: "Vitamina D3 2000UI", dose: "1 cápsula", route: "oral", frequency: "1x ao dia", duration: "90 dias", instructions: "Tomar com a refeição principal" },
  { name: "Cálcio + Vitamina D 600mg/400UI", dose: "1 comprimido", route: "oral", frequency: "2x ao dia", duration: "uso contínuo", instructions: "" },
  { name: "Colchicina 0,5mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "3 dias", instructions: "Iniciar ao primeiro sinal de crise" },
  { name: "Alopurinol 300mg", dose: "1 comprimido", route: "oral", frequency: "1x ao dia", duration: "uso contínuo", instructions: "Não usar durante crise aguda" },
  { name: "Ácido Acetilsalicílico 100mg", dose: "1 comprimido", route: "oral", frequency: "1x ao dia", duration: "uso contínuo", instructions: "Tomar após o café" },
  { name: "Voltaren Emulgel 1%", dose: "aplicar camada fina", route: "tópica", frequency: "3x ao dia", duration: "14 dias", instructions: "Massagear até absorção completa" },
];

const emptyMed = (): Medication => ({
  name: "", dose: "", route: "", frequency: "", duration: "", instructions: "",
});

// ── Demo Modal ─────────────────────────────────────────────────────────────────
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
              <span className="text-white font-black text-sm">M</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-sm">Memed Prescrição</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">Demo</span>
              </div>
              <p className="text-xs text-gray-500">
                {patient?.name || "Paciente"} · Simulação do widget real
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar medicamento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Selected */}
        {selected.length > 0 && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex-shrink-0">
            <p className="text-xs font-semibold text-blue-700 mb-1.5">
              Selecionados ({selected.length}):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selected.map((m) => (
                <div key={m.name} className="flex items-center gap-1 bg-white border border-blue-200 rounded-full pl-2.5 pr-1 py-0.5">
                  <span className="text-xs text-blue-800 font-medium">{m.name}</span>
                  <button
                    onClick={() => removeMed(m.name)}
                    className="p-0.5 text-blue-400 hover:text-blue-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Catalog list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((m) => {
            const isAdded = selected.find((s) => s.name === m.name);
            return (
              <button
                key={m.name}
                onClick={() => isAdded ? removeMed(m.name) : addMed(m)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex items-start gap-3 ${isAdded ? "bg-blue-50" : ""}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isAdded ? "bg-blue-600" : "bg-gray-100"}`}>
                  {isAdded
                    ? <CheckCircle2 className="w-4 h-4 text-white" />
                    : <Pill className="w-4 h-4 text-gray-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isAdded ? "text-blue-900" : "text-gray-900"}`}>
                    {m.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {m.dose} · {m.frequency} · {m.duration}
                  </p>
                  {m.instructions && (
                    <p className="text-xs text-gray-400 mt-0.5 italic">{m.instructions}</p>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <Pill className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum medicamento encontrado</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.length === 0}
            className="btn-primary flex-1"
          >
            Confirmar prescrição ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function PrescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);

  const [patient, setPatient] = useState<any>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [medications, setMedications] = useState<Medication[]>([emptyMed()]);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const [memedConfig, setMemedConfig] = useState<MemedConfig | null>(null);
  const [memedLoading, setMemedLoading] = useState(false);
  const [memedReady, setMemedReady] = useState(false);
  const [memedSaving, setMemedSaving] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const memedListenersAdded = useRef(false);

  const isDemo = memedConfig?.token === "demo";

  // ── Load data ──────────────────────────────────────────────────────────────
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

  // ── Save prescription from Memed (real or demo) ───────────────────────────
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

  // ── Handle demo confirm ────────────────────────────────────────────────────
  const handleDemoConfirm = (meds: Medication[], memedId: string) => {
    setShowDemoModal(false);
    saveMemedPrescription(meds, memedId);
  };

  // ── Register real Memed SDK listeners ─────────────────────────────────────
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
      toast.success("Memed carregado — clique em Prescrever");
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

  // ── Load real Memed SDK ────────────────────────────────────────────────────
  const loadRealMemed = useCallback(() => {
    if (!memedConfig?.token || isDemo) return;
    if (memedLoading || memedReady) {
      try { (window as any).MdSinapsePrescricao?.openPrescription?.(); } catch (_) {}
      return;
    }
    setMemedLoading(true);
    registerMemedListeners();
    const baseUrl = memedConfig.sandbox
      ? "https://sandbox.memed.com.br"
      : "https://memed.com.br";
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

  // ── Primary Memed action button ───────────────────────────────────────────
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

  // ── Manual form ───────────────────────────────────────────────────────────
  const updateMed = (i: number, k: keyof Medication) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setMedications((ms) =>
        ms.map((m, idx) => (idx === i ? { ...m, [k]: e.target.value } : m)),
      );

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

  const handleDelete = async (rxId: number) => {
    if (!confirm("Excluir esta receita?")) return;
    await prescriptionsApi.delete(pid, rxId);
    setPrescriptions((prev) => prev.filter((r) => r.id !== rxId));
    toast.success("Receita excluída");
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar title="Receita Médica" subtitle={patient?.name} back={`/pacientes/${pid}`} />

      {/* Demo modal */}
      {showDemoModal && (
        <MemedDemoModal
          patient={patient}
          onConfirm={handleDemoConfirm}
          onClose={() => setShowDemoModal(false)}
        />
      )}

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── Memed card (configured — real or demo) ──────────────────────── */}
        {memedConfig?.enabled ? (
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
                <span className="text-white font-black text-base">M</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-gray-900">Receita Digital Memed</h2>
                  {isDemo && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">
                      Demo
                    </span>
                  )}
                  {memedConfig.sandbox && !isDemo && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">
                      Sandbox
                    </span>
                  )}
                  {memedReady && !isDemo && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isDemo
                    ? "Simulação — substitua MEMED_TOKEN pelo seu token real"
                    : "Prescrição digital com validade legal e envio por WhatsApp/SMS"}
                </p>
              </div>
            </div>

            {isDemo && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  <strong>Modo demonstração ativo.</strong> O fluxo e o armazenamento são reais — só o token Memed é fictício.
                  Quando tiver sua conta Memed, substitua <code className="bg-amber-100 px-1 rounded">MEMED_TOKEN=demo</code> pelo seu token real no Render.
                </p>
              </div>
            )}

            <ul className="text-sm text-gray-600 space-y-1">
              {[
                "Busca rápida em mais de 15 mil medicamentos",
                "Alerta automático de interações medicamentosas",
                "Envio da receita digital para o paciente (WhatsApp/SMS)",
                "Armazenamento seguro e rastreável",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5 flex-shrink-0">✓</span>
                  {b}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleOpenMemed}
              disabled={memedLoading || memedSaving}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
            >
              {memedLoading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Carregando Memed...</>
              ) : memedSaving ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando receita...</>
              ) : memedReady && !isDemo ? (
                <><ExternalLink className="w-4 h-4" /> Abrir Prescrição Memed</>
              ) : (
                <><ExternalLink className="w-4 h-4" /> Prescrever via Memed</>
              )}
            </button>

            {memedReady && !isDemo && (
              <p className="text-xs text-center text-gray-400">
                Caso o widget não abra, clique no botão azul flutuante na tela
              </p>
            )}
          </div>

        ) : (
          /* ── Memed não configurado ─────────────────────────────────────── */
          <div className="card p-5 border-l-4 border-blue-400" style={{ background: "#eff6ff" }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white font-black text-sm">M</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-blue-900 mb-1">Integração Memed disponível</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Conecte o Memed para receitas digitais com validade legal e envio automático ao paciente.
                </p>
                <div className="space-y-1.5">
                  {[
                    { n: 1, t: <>Acesse <strong>memed.com.br</strong> e cadastre-se com seu CRM</> },
                    { n: 2, t: <>No painel Memed → <strong>Integrações</strong> → copie seu Token de API</> },
                    { n: 3, t: <>No Render, adicione <code className="bg-blue-100 px-1 rounded font-mono text-xs">MEMED_TOKEN</code> no backend</> },
                  ].map(({ n, t }) => (
                    <div key={n} className="flex items-start gap-2 text-sm text-blue-700">
                      <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">{n}</span>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap transition-colors"
          >
            {showManual ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showManual ? "Ocultar receita manual" : "Receita manual (papel)"}
          </button>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* ── Manual form ─────────────────────────────────────────────────── */}
        {showManual && (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <h2 className="section-title">Receita Manual</h2>
            {medications.map((med, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Medicamento {i + 1}</span>
                  {medications.length > 1 && (
                    <button type="button" onClick={() => setMedications((ms) => ms.filter((_, idx) => idx !== i))} className="p-1 text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">Nome do medicamento *</label>
                    <input className="input" placeholder="Ex: Nimesulida 100mg" value={med.name} onChange={updateMed(i, "name")} />
                  </div>
                  <div>
                    <label className="label">Dose</label>
                    <input className="input" placeholder="1 comprimido" value={med.dose} onChange={updateMed(i, "dose")} />
                  </div>
                  <div>
                    <label className="label">Via</label>
                    <input className="input" placeholder="Oral, tópica..." value={med.route} onChange={updateMed(i, "route")} />
                  </div>
                  <div>
                    <label className="label">Frequência</label>
                    <input className="input" placeholder="8/8h, 2x ao dia..." value={med.frequency} onChange={updateMed(i, "frequency")} />
                  </div>
                  <div>
                    <label className="label">Duração</label>
                    <input className="input" placeholder="7 dias, contínuo..." value={med.duration} onChange={updateMed(i, "duration")} />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Observações</label>
                    <input className="input" placeholder="Tomar após as refeições..." value={med.instructions} onChange={updateMed(i, "instructions")} />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setMedications((ms) => [...ms, emptyMed()])} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Adicionar medicamento
            </button>
            <div>
              <label className="label">Orientações gerais</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Evitar álcool, repouso, retornar em caso de piora..." value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? "Salvando..." : "Salvar Receita Manual"}
            </button>
          </form>
        )}

        {/* ── History ─────────────────────────────────────────────────────── */}
        {prescriptions.length > 0 && (
          <div className="space-y-3">
            <h2 className="section-title">Receitas anteriores</h2>
            {prescriptions.map((rx) => (
              <div key={rx.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-700">{formatDate(rx.date)}</span>
                    {rx.memed_id && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        <span className="font-black text-[10px]">M</span>
                        {rx.memed_id.startsWith("DEMO-") ? "Demo" : `#${rx.memed_id}`}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => window.print()} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors" title="Imprimir">
                      <Printer className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(rx.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {rx.medications?.map((m: any, i: number) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">{i + 1}. {m.name}</span>
                      {m.dose && <span className="text-gray-500"> — {m.dose}</span>}
                      {m.frequency && <span className="text-gray-500">, {m.frequency}</span>}
                      {m.duration && <span className="text-gray-500">, {m.duration}</span>}
                    </div>
                  ))}
                </div>
                {rx.instructions && (
                  <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">{rx.instructions}</p>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
