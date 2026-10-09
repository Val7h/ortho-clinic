"use client";

// 09/10 (Valth): em 17/09, na CTO, 15 de 16 anamneses nunca chegaram ao
// servidor. O que foi digitado pode ter ficado como rascunho no navegador do
// computador onde ele escreveu. Esta página varre os rascunhos DESTE
// navegador e mostra os dias que não existem no prontuário, para salvar com
// um clique. Nada é apagado daqui — o rascunho continua onde estava.

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { evolutionApi, patientsApi, msgErro } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";

const CABECALHO_RE = /^──\s(\d{2}\/\d{2}\/\d{4})(?:\s·\s([^─]+?))?\s──$/;

type Bloco = { dataISO: string; tipo: string | null; texto: string };

function lerFolha(folha: string): Bloco[] {
  const blocos: (Bloco & { linhas: string[] })[] = [];
  const soltas: string[] = [];
  for (const linha of folha.split("\n")) {
    const m = linha.trim().match(CABECALHO_RE);
    if (m) {
      const [d, mm, a] = m[1].split("/");
      blocos.push({ dataISO: `${a}-${mm}-${d}`, tipo: (m[2] || "").trim() || null, texto: "", linhas: [] });
    } else if (blocos.length) {
      blocos[blocos.length - 1].linhas.push(linha);
    } else {
      soltas.push(linha);
    }
  }
  if (blocos.length && soltas.join("").trim()) blocos[0].linhas.unshift(...soltas);
  return blocos.map((b) => ({ dataISO: b.dataISO, tipo: b.tipo, texto: b.linhas.join("\n").trim() }));
}

type Achado = {
  chave: string;
  patientId: number;
  nome: string;
  dataISO: string; // "" quando o rascunho antigo não tinha data
  tipo: string | null;
  texto: string;
  salvo?: boolean;
};

const dataBR = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "sem data");

export default function RecuperarRascunhosPage() {
  const { user } = useProtectedPage();
  const [achados, setAchados] = useState<Achado[]>([]);
  const [varrendo, setVarrendo] = useState(true);
  const [rascunhosLidos, setRascunhosLidos] = useState(0);
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setVarrendo(true);
      const chaves: { chave: string; pid: number; antigo: boolean }[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || "";
          const m = k.match(/^orthoclinic_anamnese_(folha|draft)_[^_]+_(\d+)$/);
          if (m) chaves.push({ chave: k, pid: Number(m[2]), antigo: m[1] === "draft" });
        }
      } catch {}
      setRascunhosLidos(chaves.length);
      const lista: Achado[] = [];
      for (const c of chaves) {
        let bruto = "";
        try { bruto = localStorage.getItem(c.chave) || ""; } catch {}
        if (!bruto.trim()) continue;
        let nome = `Paciente ${c.pid}`;
        let datasNoServidor = new Set<string>();
        try {
          const p = await patientsApi.get(c.pid);
          nome = p?.name || nome;
          const evs: any[] = await evolutionApi.list(c.pid);
          datasNoServidor = new Set(
            evs.filter((e) => (e.content || "").replace(/^\[[^\]]*\]\s*/, "").trim()).map((e) => e.entry_date),
          );
        } catch { continue; }
        const blocos: Bloco[] = c.antigo
          ? [{ dataISO: "", tipo: null, texto: bruto.trim() }]
          : lerFolha(bruto).filter((b) => b.texto.trim());
        for (const b of blocos) {
          if (b.dataISO && datasNoServidor.has(b.dataISO)) continue;
          lista.push({ chave: c.chave, patientId: c.pid, nome, ...b });
        }
      }
      lista.sort((a, b) => a.dataISO.localeCompare(b.dataISO) || a.nome.localeCompare(b.nome));
      setAchados(lista);
      setVarrendo(false);
    })();
  }, [user]);

  const salvar = async (i: number) => {
    const a = achados[i];
    if (!a.dataISO) { toast.error("Escolha a data dessa anamnese antes de salvar."); return; }
    const id = `${a.chave}|${a.dataISO}|${i}`;
    setSalvando(id);
    try {
      await evolutionApi.create(a.patientId, {
        entry_date: a.dataISO,
        content: (a.tipo ? `[${a.tipo.toUpperCase()}]\n` : "") + a.texto,
      });
      setAchados((prev) => prev.map((x, j) => (j === i ? { ...x, salvo: true } : x)));
      toast.success(`Anamnese de ${a.nome} (${dataBR(a.dataISO)}) salva no prontuário`);
    } catch (e: any) {
      toast.error(msgErro(e, "Não consegui salvar"));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <PageWithSidebar>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <NavBar title="Recuperar anamneses" subtitle="Rascunhos que ficaram neste computador" />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Recuperar anamneses não salvas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mostra o que ficou guardado <strong>neste computador</strong> e não está no prontuário. Abra esta página em cada
            computador onde o senhor atendeu (ex.: o da CTO). Confira o texto e clique em salvar.
          </p>
        </div>

        {varrendo && <p className="text-sm text-slate-500">Procurando rascunhos neste computador…</p>}

        {!varrendo && achados.length === 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-600 dark:text-slate-300">
            Nenhuma anamnese perdida neste computador ({rascunhosLidos} rascunho(s) conferido(s), todos já estão no prontuário).
          </div>
        )}

        {achados.map((a, i) => (
          <div key={`${a.chave}-${a.dataISO}-${i}`} className={`rounded-lg border p-4 space-y-2 ${a.salvo ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20" : "border-amber-300 bg-amber-50 dark:bg-amber-900/20"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                {a.nome} <span className="font-normal text-slate-500">· {dataBR(a.dataISO)}{a.tipo ? ` · ${a.tipo}` : ""}</span>
              </p>
              {a.salvo ? (
                <span className="text-sm font-semibold text-emerald-700">✓ Salva no prontuário</span>
              ) : (
                <div className="flex items-center gap-2">
                  {!a.dataISO && (
                    <input type="date" className="text-sm border rounded px-2 py-1"
                      onChange={(e) => setAchados((prev) => prev.map((x, j) => (j === i ? { ...x, dataISO: e.target.value } : x)))} />
                  )}
                  <button type="button" onClick={() => salvar(i)} disabled={salvando !== null}
                    className="text-sm px-3 py-1.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50">
                    Salvar no prontuário
                  </button>
                </div>
              )}
            </div>
            <pre className="whitespace-pre-wrap text-[13px] text-slate-700 dark:text-slate-200 font-sans">{a.texto}</pre>
          </div>
        ))}
      </main>
      </div>
    </PageWithSidebar>
  );
}
