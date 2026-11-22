"use client";

// App do celular (corte 2, 22/11/2026): agenda de HOJE, só leitura, por clínica com a cor dela.

import { CabecalhoCelular } from "@/components/celular/CabecalhoCelular";
import { useEffect, useState } from "react";
import { clinicApi } from "@/lib/api";
import { useLoginCelular, hojeBR } from "@/lib/celular";
import { erroCelular } from "@/lib/celular";

type Item = {
  source: string; id?: number; patient_id?: number | null; clinic_id: number; clinic_name: string; clinic_color?: string;
  start_time?: string; patient_name?: string; reason?: string; status?: string; queue_number?: number | null;
};

const STATUS: Record<string, string> = {
  scheduled: "Marcado", confirmed: "Confirmado", arrived: "Chegou", checked_in: "Chegou",
  attended: "Atendido", completed: "Atendido", absent: "Faltou", no_show: "Faltou", blocked: "Bloqueado",
};

export default function CelularAgenda() {
  const { pronto } = useLoginCelular();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!pronto) return;
    const hoje = hojeBR();
    clinicApi.week(hoje, hoje)
      .then((l: Item[]) => setItens((l || []).filter((x) => x.source === "appointment")))
      .catch((e) => setErro(erroCelular(e, "Não consegui abrir a agenda.")));
  }, [pronto]);

  const porClinica = new Map<number, { nome: string; cor: string; itens: Item[] }>();
  for (const i of itens || []) {
    const g = porClinica.get(i.clinic_id) || { nome: i.clinic_name, cor: i.clinic_color || "#64748b", itens: [] };
    g.itens.push(i);
    porClinica.set(i.clinic_id, g);
  }
  for (const g of Array.from(porClinica.values())) {
    g.itens.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "") || (a.queue_number || 0) - (b.queue_number || 0));
  }

  return (
    <div className="max-w-xl mx-auto px-4 pb-4 flex flex-col gap-4">
      <CabecalhoCelular tela="Agenda de hoje" />
      {erro && <p className="text-sm text-orange-700">{erro}</p>}
      {!erro && itens === null && <p className="text-slate-500">Abrindo…</p>}
      {itens && itens.length === 0 && <p className="text-slate-500">Ninguém marcado hoje.</p>}
      {Array.from(porClinica.entries()).map(([id, g]) => (
        <section key={id} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden" data-testid="clinica">
          <h2 className="px-4 py-2 font-bold text-white" style={{ background: g.cor }}>{g.nome} · {g.itens.filter((i) => i.status !== "blocked").length}</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {g.itens.map((i, n) => {
              const conteudo = (
                <>
                  <span className="w-14 shrink-0 font-mono text-sm text-slate-500">{i.start_time ? i.start_time.slice(0, 5) : i.queue_number ? `${i.queue_number}º` : ""}</span>
                  <span className="flex-1">
                    <span className="block font-semibold">{i.status === "blocked" ? "Bloqueado" : i.patient_name || "—"}</span>
                    {i.reason && i.status !== "blocked" && <span className="block text-xs text-slate-500">{i.reason}</span>}
                  </span>
                  <span className="text-xs text-slate-500">{STATUS[i.status || ""] || ""}</span>
                </>
              );
              return (
                <li key={i.id || n}>
                  {i.patient_id ? (
                    <a href={`/celular/paciente?pid=${i.patient_id}`} className="flex items-center gap-3 px-4 py-3">{conteudo}</a>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
