"use client";

// Fichário de remédios (13/10/2026). Pedido do Valth: "antigamente eu trabalhava
// em farmácia e tinha um fichário com todos os nomes comerciais e os preços".
// Base oficial: lista de preços da CMED (Anvisa) x Portaria 344 — ver
// backend/routers/medicamentos.py. Atualiza sozinha todo dia 15.

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { medicamentosApi, msgErro } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";

const RECEITA: Record<string, { rotulo: string; cor: string }> = {
  simples: { rotulo: "Receita simples", cor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  antimicrobiano: { rotulo: "Antimicrobiano (2 vias, retém)", cor: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  controle_especial: { rotulo: "Controle especial (branca, 2 vias)", cor: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
};

function rotuloReceita(r: any) {
  if (r.tipo_receita === "notificacao") {
    if (r.notificacao === "A") return { rotulo: "Notificação A (talão AMARELO)", cor: "bg-yellow-200 text-yellow-900" };
    if (r.notificacao === "B") return { rotulo: "Notificação B (talão AZUL)", cor: "bg-blue-200 text-blue-900" };
    return { rotulo: "Notificação especial", cor: "bg-red-100 text-red-800" };
  }
  return RECEITA[r.tipo_receita] || RECEITA.simples;
}

export default function RemediosPage() {
  const { user } = useProtectedPage();
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!user) return;
    const termo = q.trim();
    if (termo.length < 3) { setLista([]); return; }
    const t = setTimeout(() => {
      setBuscando(true);
      medicamentosApi.busca(termo)
        .then(setLista)
        .catch((e) => toast.error(msgErro(e, "Não consegui buscar")))
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, user]);

  return (
    <PageWithSidebar>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <NavBar title="Remédios" subtitle="Nome comercial, princípio ativo, tipo de receita e preço máximo (Anvisa)" />
        <main className="mx-auto max-w-4xl px-4 py-6 space-y-4">
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Digite a marca ou o princípio ativo (ex.: Adorlan, pregabalina, Coxeto)"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base"
          />
          {buscando && <p className="text-sm text-slate-500">Procurando…</p>}
          {!buscando && q.trim().length >= 3 && lista.length === 0 && (
            <p className="text-sm text-slate-500">Nada encontrado na lista da Anvisa com “{q}”.</p>
          )}
          <div className="space-y-2">
            {lista.map((r, i) => {
              const rec = rotuloReceita(r);
              return (
                <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{r.produto}</p>
                    <span className={`text-xs font-semibold rounded px-2 py-0.5 ${rec.cor}`}>{rec.rotulo}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{(r.substancia || "").toLowerCase()}</p>
                  <p className="text-xs text-slate-500 mt-1">{r.apresentacao}</p>
                  <p className="text-xs text-slate-500">
                    {r.laboratorio}
                    {r.preco_maximo_pe ? ` · preço máximo (PE): R$ ${r.preco_maximo_pe}` : ""}
                    {r.lista344 ? ` · Portaria 344: lista ${r.lista344}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">Fonte: lista de preços CMED/Anvisa e Anexo I da Portaria 344 (RDC 1.036/2026). Atualizada todo dia 15.</p>
        </main>
      </div>
    </PageWithSidebar>
  );
}
