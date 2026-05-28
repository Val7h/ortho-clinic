"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Printer, ChevronDown, ChevronUp, ExternalLink, CheckCircle2 } from "lucide-react";
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

const emptyMed = (): Medication => ({
  name: "", dose: "", route: "", frequency: "", duration: "", instructions: "",
});

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
  const memedListenersAdded = useRef(false);

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

  // ── Memed: register global event listeners once ────────────────────────────
  const registerMemedListeners = useCallback(
    (patientData: any) => {
      if (memedListenersAdded.current) return;
      memedListenersAdded.current = true;

      // SDK loaded — set patient context
      document.addEventListener("MdSinapsePrescricaoLoaded", () => {
        const sdk = (window as any).MdSinapsePrescricao;
        if (!sdk) return;
        try {
          sdk.setPaciente({
            nome: patientData?.name || "",
            cpf: patientData?.cpf || "",
            dataNascimento: patientData?.birth_date || "",
          });
        } catch (_) {}
        setMemedReady(true);
        setMemedLoading(false);
        toast.success("Memed carregado — clique em Prescrever");
      });

      // Prescription saved successfully in Memed
      document.addEventListener("MdSinapsePrescricaoSuccess", async (e: any) => {
        setMemedSaving(true);
        try {
          const detail = e.detail?.[0] || {};
          const memedId = String(detail?.prescricao?.id || "");
          const memedMeds = (detail?.prescricao?.medicamentos || []) as any[];

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

          const newRx = await prescriptionsApi.create(pid, {
            date: new Date().toISOString().split("T")[0],
            medications: meds,
            memed_id: memedId,
            instructions: "",
          });

          toast.success("Receita Memed salva com sucesso!");
          setPrescriptions((prev) => [newRx, ...prev]);
        } catch {
          toast.error("Erro ao salvar receita do Memed");
        } finally {
          setMemedSaving(false);
        }
      });

      // Widget closed without saving
      document.addEventListener("MdSinapsePrescricaoClose", () => {
        // silently ignore
      });
    },
    [pid],
  );

  // ── Load Memed SDK on demand ───────────────────────────────────────────────
  const handleLoadMemed = useCallback(() => {
    if (!memedConfig?.enabled || !memedConfig.token) return;
    if (memedLoading || memedReady) {
      // Already loaded — just open the widget
      try {
        (window as any).MdSinapsePrescricao?.openPrescription?.();
      } catch (_) {}
      return;
    }

    setMemedLoading(true);
    registerMemedListeners(patient);

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
      toast.error("Erro ao carregar SDK do Memed. Verifique sua conexão.");
    };
    document.head.appendChild(script);
  }, [memedConfig, memedLoading, memedReady, patient, registerMemedListeners]);

  // ── Open Memed widget after ready ─────────────────────────────────────────
  const handleOpenMemed = () => {
    if (!memedReady) {
      handleLoadMemed();
      return;
    }
    try {
      (window as any).MdSinapsePrescricao?.openPrescription?.();
    } catch (_) {
      toast.error("Erro ao abrir o Memed. Recarregue a página.");
    }
  };

  // ── Manual form ───────────────────────────────────────────────────────────
  const updateMed =
    (i: number, k: keyof Medication) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMedications((ms) =>
        ms.map((m, idx) => (idx === i ? { ...m, [k]: e.target.value } : m)),
      );
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) {
      toast.error("Adicione pelo menos um medicamento");
      return;
    }
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
    <div className="min-h-screen bg-gray-50">
      <NavBar title="Receita Médica" subtitle={patient?.name} back={`/pacientes/${pid}`} />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── Memed card ─────────────────────────────────────────────────── */}
        {memedConfig?.enabled ? (
          <div className="card p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
                <span className="text-white font-black text-base tracking-tight">M</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-900">Receita Digital Memed</h2>
                  {memedConfig.sandbox && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">
                      Sandbox
                    </span>
                  )}
                  {memedReady && (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Prescrição digital com validade legal e envio por WhatsApp/SMS
                </p>
              </div>
            </div>

            {/* Benefits */}
            <ul className="text-sm text-gray-600 space-y-1">
              {[
                "Acesso à bula completa e posologia sugerida",
                "Alerta automático de interações medicamentosas",
                "Envio da receita digital diretamente para o paciente",
                "Armazenamento seguro e rastreável",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5 flex-shrink-0">✓</span>
                  {b}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <button
              type="button"
              onClick={handleOpenMemed}
              disabled={memedLoading || memedSaving}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
            >
              {memedLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Carregando Memed...
                </>
              ) : memedSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Salvando receita...
                </>
              ) : memedReady ? (
                <>
                  <ExternalLink className="w-4 h-4" />
                  Abrir Prescrição Memed
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  Prescrever via Memed
                </>
              )}
            </button>

            {memedReady && (
              <p className="text-xs text-center text-gray-400">
                Caso o widget não abra, clique no botão azul flutuante na tela
              </p>
            )}
          </div>
        ) : (
          /* ── Memed não configurado — banner informativo ──────────────── */
          <div className="card p-5 border-l-4 border-blue-400" style={{ background: "#eff6ff" }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white font-black text-sm">M</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-blue-900 mb-1">
                  Integração Memed disponível
                </h3>
                <p className="text-sm text-blue-700 mb-3">
                  Conecte sua conta Memed para emitir receitas digitais com validade legal, bula integrada e envio automático para o paciente.
                </p>
                <div className="space-y-1.5">
                  {[
                    { n: 1, t: <>Acesse <strong>memed.com.br</strong> e cadastre-se com seu CRM</> },
                    { n: 2, t: <>No painel Memed → <strong>Integrações</strong> → copie seu <strong>Token de API</strong></> },
                    { n: 3, t: <>No Render, adicione a variável <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">MEMED_TOKEN</code> no backend</> },
                    { n: 4, t: <>Defina também <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">MEMED_SANDBOX=false</code> em produção</> },
                  ].map(({ n, t }) => (
                    <div key={n} className="flex items-start gap-2 text-sm text-blue-700">
                      <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">
                        {n}
                      </span>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Divider + toggle manual form ───────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap transition-colors"
          >
            {showManual ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            {showManual ? "Ocultar receita manual" : "Receita manual (papel)"}
          </button>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* ── Manual prescription form ────────────────────────────────────── */}
        {showManual && (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <h2 className="section-title">Receita Manual</h2>

            {medications.map((med, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Medicamento {i + 1}
                  </span>
                  {medications.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setMedications((ms) => ms.filter((_, idx) => idx !== i))
                      }
                      className="p-1 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">Nome do medicamento *</label>
                    <input
                      className="input"
                      placeholder="Ex: Nimesulida 100mg"
                      value={med.name}
                      onChange={updateMed(i, "name")}
                    />
                  </div>
                  <div>
                    <label className="label">Dose</label>
                    <input
                      className="input"
                      placeholder="1 comprimido"
                      value={med.dose}
                      onChange={updateMed(i, "dose")}
                    />
                  </div>
                  <div>
                    <label className="label">Via</label>
                    <input
                      className="input"
                      placeholder="Oral, tópica..."
                      value={med.route}
                      onChange={updateMed(i, "route")}
                    />
                  </div>
                  <div>
                    <label className="label">Frequência</label>
                    <input
                      className="input"
                      placeholder="8/8h, 2x ao dia..."
                      value={med.frequency}
                      onChange={updateMed(i, "frequency")}
                    />
                  </div>
                  <div>
                    <label className="label">Duração</label>
                    <input
                      className="input"
                      placeholder="7 dias, contínuo..."
                      value={med.duration}
                      onChange={updateMed(i, "duration")}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Observações</label>
                    <input
                      className="input"
                      placeholder="Tomar após as refeições..."
                      value={med.instructions}
                      onChange={updateMed(i, "instructions")}
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setMedications((ms) => [...ms, emptyMed()])}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar medicamento
            </button>

            <div>
              <label className="label">Orientações gerais</label>
              <textarea
                className="input min-h-[80px] resize-none"
                placeholder="Evitar álcool, repouso, retornar em caso de piora..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full"
            >
              {saving ? "Salvando..." : "Salvar Receita Manual"}
            </button>
          </form>
        )}

        {/* ── Prescription history ───────────────────────────────────────── */}
        {prescriptions.length > 0 && (
          <div className="space-y-3">
            <h2 className="section-title">Receitas anteriores</h2>
            {prescriptions.map((rx) => (
              <div key={rx.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-700">
                      {formatDate(rx.date)}
                    </span>
                    {rx.memed_id && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        <span className="font-black text-[10px]">M</span>
                        Memed #{rx.memed_id}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => window.print()}
                      className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Imprimir"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rx.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  {rx.medications?.map((m: any, i: number) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">
                        {i + 1}. {m.name}
                      </span>
                      {m.dose && (
                        <span className="text-gray-500"> — {m.dose}</span>
                      )}
                      {m.frequency && (
                        <span className="text-gray-500">, {m.frequency}</span>
                      )}
                      {m.duration && (
                        <span className="text-gray-500">, {m.duration}</span>
                      )}
                    </div>
                  ))}
                </div>

                {rx.instructions && (
                  <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">
                    {rx.instructions}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
