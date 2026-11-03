"use client";

// Impressora da clínica (03/11/2026).
// Valth: documento pronto na consulta sai SOZINHO na impressora da clínica.
// Este computador fica com esta página aberta (Chrome com --kiosk-printing):
// a cada 5 s ela olha a fila da clínica, desenha o documento com o MESMO papel
// que o médico imprime na consulta e manda direto para a impressora padrão do
// Windows. Depois de imprimir, marca como impresso e passa para o próximo.
// Ver docs/impressora/LEIA.md.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clinicApi, printJobsApi, msgErro } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";
import { RxSheets, ExamSheet, ReportSheet, normalizePrescriptionType } from "../painel/ConsultaDrawer";

type Job = {
  id: number;
  kind: "receita" | "exame" | "laudo" | "encaminhamento";
  ref_id: number;
  created_at: string;
  opcoes: any;
  clinic: any;
  patient: any;
  documento: any;
};

const NOME_TIPO: Record<string, string> = {
  receita: "Receita",
  exame: "Pedido de exame",
  laudo: "Laudo / atestado",
  encaminhamento: "Encaminhamento",
};

const CHAVE_CLINICA = "ortho_impressora_clinic_id";
const INTERVALO_MS = 5000;

function horaAgora(d = new Date()): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// A folha do pedido — exatamente os componentes que a tela da consulta usa.
function Folha({ job }: { job: Job }) {
  const d = job.documento || {};
  const dataISO = String(d.date || "").slice(0, 10) || undefined;
  const op = job.opcoes || {};
  if (job.kind === "receita") {
    return (
      <RxSheets
        rx={{
          date: dataISO || new Date().toISOString().slice(0, 10),
          medications: d.medications || [],
          instructions: d.instructions || "",
          prescription_type: normalizePrescriptionType(d.prescription_type || "simples"),
          patientAddress: d.patient_address || undefined,
          patientPhone: d.patient_phone || undefined,
        }}
        patient={job.patient}
        clinic={job.clinic}
        formato={op.rx_formato && typeof op.rx_formato === "object"
          ? { tamanho: typeof op.rx_formato.tamanho === "number" ? op.rx_formato.tamanho : null, justificar: !!op.rx_formato.justificar }
          : undefined}
      />
    );
  }
  if (job.kind === "exame") {
    const texto = d.free_text || (d.exams || []).map((e: any) => `SOLICITO: ${e.name}${e.laterality ? ` — ${e.laterality}` : ""}`).join("\n") || "";
    const fonte = [12, 14, 16].includes(op.exam_font) ? op.exam_font : 14;
    return (
      <ExamSheet
        text={texto}
        patientName={job.patient?.name || ""}
        patient={job.patient}
        clinic={job.clinic}
        dataISO={dataISO}
        fontSize={fonte}
        lineHeight={op.exam_line === "relaxed" ? "relaxed" : "normal"}
      />
    );
  }
  return (
    <ReportSheet
      item={{ id: `re${job.ref_id}`, tipo: "relatorio", label: d.title || "", reportType: d.report_type || job.kind, titulo: d.title || "", conteudo: d.content || "", dataISO: dataISO || "" }}
      patient={job.patient}
      clinic={job.clinic}
    />
  );
}

// Espera as imagens da folha (logomarca) carregarem antes de imprimir.
async function esperarImagens(el: HTMLElement | null) {
  if (!el) return;
  const imgs = Array.from(el.querySelectorAll("img"));
  await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise<void>((res) => {
    img.addEventListener("load", () => res(), { once: true });
    img.addEventListener("error", () => res(), { once: true });
    setTimeout(res, 8000);
  })));
}

// window.print() + espera o "afterprint". Com --kiosk-printing o Chrome manda
// direto para a impressora padrão, sem janela.
function imprimir(): Promise<void> {
  return new Promise((res) => {
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      window.removeEventListener("afterprint", fim);
      res();
    };
    window.addEventListener("afterprint", fim);
    window.print();
    setTimeout(fim, 3000);
  });
}

export default function ImpressoraPage() {
  const { user, loading } = useProtectedPage();
  const [clinicId, setClinicId] = useState<number | null>(null);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [nomeClinica, setNomeClinica] = useState<string>("");
  const [fila, setFila] = useState<Job[]>([]);
  const [atual, setAtual] = useState<Job | null>(null);
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [ultimaConsulta, setUltimaConsulta] = useState<string>("");
  const [erro, setErro] = useState<string>("");
  const [impressos, setImpressos] = useState<{ quando: string; tipo: string; paciente: string }[]>([]);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const ocupado = useRef(false);
  // Impresso mas o servidor não confirmou: tenta marcar de novo, NUNCA reimprime.
  const semConfirmar = useRef<Set<number>>(new Set());
  const jaImpressos = useRef<Set<number>>(new Set());

  // clinic_id: do endereço (?clinic_id=5) ou o último escolhido neste computador.
  useEffect(() => {
    let id: number | null = null;
    try {
      const q = new URLSearchParams(window.location.search).get("clinic_id");
      if (q && Number(q) > 0) {
        id = Number(q);
        localStorage.setItem(CHAVE_CLINICA, String(id));
      } else {
        const s = localStorage.getItem(CHAVE_CLINICA);
        if (s && Number(s) > 0) id = Number(s);
      }
    } catch { /* sem localStorage: usa o seletor */ }
    setClinicId(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    clinicApi.list().then((l: any[]) => setClinicas(Array.isArray(l) ? l : [])).catch(() => {});
  }, [user]);

  // Tela sempre acesa enquanto a página estiver aberta (quando o navegador deixa).
  useEffect(() => {
    let lock: any = null;
    const pedir = async () => {
      try { lock = await (navigator as any).wakeLock?.request("screen"); } catch { /* sem suporte */ }
    };
    pedir();
    const voltar = () => { if (document.visibilityState === "visible") pedir(); };
    document.addEventListener("visibilitychange", voltar);
    return () => { document.removeEventListener("visibilitychange", voltar); try { lock?.release(); } catch {} };
  }, []);

  const consultar = useCallback(async () => {
    if (!clinicId || ocupado.current) return;
    try {
      for (const id of Array.from(semConfirmar.current)) {
        try { await printJobsApi.done(id); semConfirmar.current.delete(id); } catch { /* tenta no próximo ciclo */ }
      }
      const r = await printJobsApi.pending(clinicId);
      const jobs: Job[] = (r?.jobs || []).filter((j: Job) => !jaImpressos.current.has(j.id));
      setNomeClinica(r?.clinic?.name || "");
      setFila(jobs);
      setConectado(true);
      setErro("");
      setUltimaConsulta(horaAgora());
      if (jobs.length && !ocupado.current) {
        ocupado.current = true;
        setAtual(jobs[0]);
      }
    } catch (e: any) {
      setConectado(false);
      setErro(msgErro(e, "Sem conexão com o servidor"));
    }
  }, [clinicId]);

  useEffect(() => {
    if (!user || !clinicId) return;
    consultar();
    const t = setInterval(consultar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [user, clinicId, consultar]);

  // Um pedido por vez: desenha, imprime, marca impresso, passa para o próximo.
  useEffect(() => {
    if (!atual) return;
    let cancelado = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 300));
      await esperarImagens(portalRef.current);
      await new Promise((r) => setTimeout(r, 300));
      if (cancelado) return;
      await imprimir();
      jaImpressos.current.add(atual.id);
      try { await printJobsApi.done(atual.id); } catch { semConfirmar.current.add(atual.id); }
      setImpressos((prev) => [{ quando: horaAgora(), tipo: NOME_TIPO[atual.kind] || atual.kind, paciente: atual.patient?.name || "" }, ...prev].slice(0, 10));
      setFila((prev) => prev.filter((j) => j.id !== atual.id));
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelado) return;
      ocupado.current = false;
      setAtual(null);
      consultar();
    })();
    return () => { cancelado = true; ocupado.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual]);

  const escolherClinica = (id: number) => {
    try { localStorage.setItem(CHAVE_CLINICA, String(id)); } catch {}
    setClinicId(id);
    setFila([]);
    setConectado(null);
  };

  if (loading || !user) {
    return <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-500 text-lg">Carregando…</div>;
  }

  const nome = nomeClinica || clinicas.find((c) => c.id === clinicId)?.name || (clinicId ? `Clínica ${clinicId}` : "");

  return (
    <div className="imp-tela min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-6 md:p-10">
      <style>{`
        @media print {
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          body > *:not([data-print-portal]) { display: none !important; }
          #imp-print-portal { display: block !important; position: static !important; width: 100% !important; background: #fff !important; }
          @page { size: A4 portrait; margin: 10mm 12mm; }
          .rx-via-break { page-break-after: always; break-after: page; margin-bottom: 0 !important; }
          .rx-cut-line { display: none !important; }
        }
        .rx-cut-line { display: none; }
      `}</style>

      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Impressora da clínica</h1>
          {nome && <p className="text-xl text-slate-500 dark:text-slate-400 mt-1">{nome}</p>}
        </div>

        {!clinicId ? (
          <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-6 space-y-4">
            <p className="text-xl font-semibold">Escolha a clínica deste computador:</p>
            <div className="flex flex-wrap gap-3">
              {clinicas.map((c) => (
                <button key={c.id} onClick={() => escolherClinica(c.id)}
                  className="px-5 py-3 rounded-xl bg-blue-600 text-white text-lg font-semibold hover:bg-blue-700">
                  {c.name}{c.city ? ` — ${c.city}` : ""}
                </button>
              ))}
              {!clinicas.length && <p className="text-slate-500">Carregando clínicas…</p>}
            </div>
          </div>
        ) : (
          <>
            <div className={`rounded-2xl border-2 p-6 ${conectado === false ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"}`}>
              <p className="text-2xl font-bold">
                {conectado === null ? "Conectando…" : conectado ? "● Ligada — esperando documentos" : "● Sem conexão — tentando de novo"}
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-lg">
                <div><span className="text-slate-500">Na fila: </span><strong>{fila.length}</strong></div>
                <div><span className="text-slate-500">Última consulta: </span><strong>{ultimaConsulta || "—"}</strong></div>
                <div><span className="text-slate-500">Último impresso: </span><strong>{impressos[0]?.quando || "—"}</strong></div>
              </div>
              {atual && (
                <p className="mt-3 text-xl font-semibold text-blue-700 dark:text-blue-300">
                  Imprimindo agora: {NOME_TIPO[atual.kind]} — {atual.patient?.name}
                </p>
              )}
              {conectado === false && erro && <p className="mt-2 text-base text-red-700 dark:text-red-300">{erro}</p>}
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 space-y-3 text-lg leading-relaxed">
              <p className="text-xl font-bold">Para a equipe da clínica</p>
              <ol className="list-decimal pl-6 space-y-2">
                <li><strong>Deixe esta janela ABERTA</strong> o dia todo. Pode deixar atrás de outras janelas, mas <strong>não feche</strong>.</li>
                <li>Quando o Dr. Valth mandar um documento, ele <strong>sai sozinho na impressora</strong>. Não precisa clicar em nada.</li>
                <li>Mantenha a impressora <strong>ligada e com papel</strong>.</li>
                <li>Se aparecer <strong>&quot;Sem conexão&quot;</strong>, confira a internet. A página tenta de novo sozinha.</li>
                <li>Se pedir para entrar (login), entre com o usuário da clínica. Depois <strong>feche esta janela e abra de novo pelo atalho</strong> &quot;Impressora OrthoMedic&quot;.</li>
              </ol>
            </div>

            {impressos.length > 0 && (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6">
                <p className="text-xl font-bold mb-3">Impressos agora há pouco</p>
                <ul className="space-y-1 text-lg">
                  {impressos.map((i, k) => (
                    <li key={k}><span className="text-slate-500">{i.quando}</span> · {i.tipo} — {i.paciente}</li>
                  ))}
                </ul>
              </div>
            )}

            {clinicas.length > 1 && (
              <div className="text-base text-slate-500">
                Trocar a clínica deste computador:{" "}
                <select value={clinicId} onChange={(e) => escolherClinica(Number(e.target.value))}
                  className="ml-2 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-800">
                  {clinicas.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</option>)}
                </select>
              </div>
            )}
          </>
        )}
      </div>

      {/* O papel de verdade — direto no body, fora da tela, só para a impressora. */}
      {atual && typeof document !== "undefined" && createPortal(
        <div id="imp-print-portal" data-print-portal ref={portalRef} style={{ display: "none" }}>
          <Folha job={atual} />
        </div>,
        document.body,
      )}
    </div>
  );
}
