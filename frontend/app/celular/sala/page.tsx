"use client";

// App do celular (corte 2, 22/11/2026): sala de espera de HOJE, só leitura.
// Cuidado: a rota da sala suspende atendimento parado há 15 min. Por isso o
// celular só pergunta a cada 60 s e só com a tela à vista.

import { CabecalhoCelular } from "@/components/celular/CabecalhoCelular";
import { useEffect, useState } from "react";
import { waitingRoomApi } from "@/lib/api";
import { useLoginCelular, telaVisivel } from "@/lib/celular";
import { erroCelular } from "@/lib/celular";

type Entrada = { id: number; patient_id: number; patient_name: string; patient_insurance?: string | null; status: string; waited_minutes?: number | null; arrived_at?: string };

const STATUS: Record<string, { txt: string; cor: string }> = {
  waiting: { txt: "Esperando", cor: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  attending: { txt: "Em consulta", cor: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  suspended: { txt: "Pausado", cor: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  attended: { txt: "Atendido", cor: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" },
  absent: { txt: "Faltou", cor: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200" },
};
const SALA_INTERVALO_MS = 60_000;

export default function CelularSala() {
  const { pronto } = useLoginCelular();
  const [lista, setLista] = useState<Entrada[] | null>(null);
  const [erro, setErro] = useState("");
  const [hora, setHora] = useState("");

  useEffect(() => {
    if (!pronto) return;
    let vivo = true;
    let ultima = 0;
    const ler = () => {
      if (!telaVisivel() || Date.now() - ultima < SALA_INTERVALO_MS - 1000) return;
      ultima = Date.now();
      waitingRoomApi.today()
        .then((l: Entrada[]) => { if (vivo) { setLista(l || []); setErro(""); setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })); } })
        .catch((e) => { if (vivo) setErro(erroCelular(e, "Sem conexão. Tento de novo em 1 minuto.")); });
    };
    ler();
    const t = setInterval(ler, SALA_INTERVALO_MS);
    // ao voltar para a tela, atualiza — mas nunca antes de 60 s da última vez
    const voltou = () => ler();
    document.addEventListener("visibilitychange", voltou);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", voltou); };
  }, [pronto]);

  const ordem = ["attending", "waiting", "suspended", "attended", "absent"];
  const ordenada = [...(lista || [])].sort((a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status));

  return (
    <div className="max-w-xl mx-auto px-4 pb-4 flex flex-col gap-3">
      <CabecalhoCelular tela={hora ? `Sala de espera · atualizada ${hora}` : "Sala de espera"} />
      {erro && <p className="text-sm text-orange-700">{erro}</p>}
      {!erro && lista === null && <p className="text-slate-500">Abrindo…</p>}
      {lista && lista.length === 0 && <p className="text-slate-500">Ninguém na sala hoje.</p>}
      {ordenada.map((e) => {
        const s = STATUS[e.status] || { txt: e.status, cor: "bg-slate-100" };
        return (
          <a key={e.id} href={`/celular/paciente?pid=${e.patient_id}`} data-testid="sala-item"
            className="flex items-center gap-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3">
            <span className="flex-1">
              <span className="block font-semibold">{e.patient_name}</span>
              <span className="block text-xs text-slate-500">
                {e.patient_insurance || "Particular"}{e.status === "waiting" && e.waited_minutes != null ? ` · esperando há ${e.waited_minutes} min` : ""}
              </span>
            </span>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${s.cor}`}>{s.txt}</span>
          </a>
        );
      })}
      <p className="text-xs text-slate-500 text-center">Atualiza sozinha a cada minuto.</p>
    </div>
  );
}
