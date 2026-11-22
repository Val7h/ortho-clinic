"use client";

// App do celular (corte 2, 22/11/2026): ficha do paciente, SÓ LEITURA.
// Secretária: cadastro e a aba Documentos completa, só leitura (nada de apagar no app).
// Médico: cadastro, alergias, 3 últimas anamneses, documentos e Gravar consulta.

import { CabecalhoCelular } from "@/components/celular/CabecalhoCelular";
import { useEffect, useState } from "react";
import { consultationsApi, patientDocsApi, patientsApi } from "@/lib/api";
import { useLoginCelular, pegarPid } from "@/lib/celular";
import { erroCelular } from "@/lib/celular";
import { secoesDaFicha } from "@/lib/celularPapel";
import { formatar } from "@/lib/conferirLeitura";

type Doc = { id: number; title: string; category: string; category_label?: string; date: string; file_url?: string | null; mime_type?: string | null };

const CADASTRO: [string, string][] = [
  ["cpf", "CPF"], ["birthdate", "Nascimento"], ["rg", "RG"], ["phone", "Telefone"],
  ["insurance", "Convênio"], ["insurance_plan", "Plano"], ["insurance_number", "Nº da carteirinha"],
  ["address_city", "Cidade"],
];

function curto(s: string | null | undefined, n = 220): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export default function CelularPaciente() {
  const { usuario, pronto } = useLoginCelular();
  const [pid, setPid] = useState<number | null>(null);
  const [p, setP] = useState<any>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [consultas, setConsultas] = useState<any[]>([]);
  const [erro, setErro] = useState("");

  const secoes = secoesDaFicha(usuario?.role);

  useEffect(() => {
    if (!pronto || !usuario) return;
    const id = pegarPid();
    setPid(id);
    if (!id) { setErro("Paciente não informado."); return; }
    patientsApi.get(id).then(setP).catch((e) => setErro(erroCelular(e, "Paciente não encontrado.")));
    const s = secoesDaFicha(usuario.role);
    if (s.includes("documentos")) {
      patientDocsApi.list(id, { limit: 50 }).then((l: Doc[]) => setDocs(l || [])).catch(() => setDocs([]));
    }
    if (s.includes("anamneses")) {
      consultationsApi.list(id)
        .then((l: any[]) => setConsultas([...(l || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3)))
        .catch(() => setConsultas([]));
    }
  }, [pronto, usuario]);

  if (!pronto) return <p className="p-6 text-center text-slate-500">Abrindo…</p>;

  return (
    <div className="max-w-xl mx-auto px-4 pb-24 flex flex-col gap-3">
      <CabecalhoCelular tela="Ficha do paciente" />
      {erro && <p className="text-sm text-orange-700">{erro}</p>}
      {p && (
        <>
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4" data-testid="secao-cadastro">
            <p className="text-xl font-bold">{p.name}</p>
            <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
              {CADASTRO.map(([k, r]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-500">{r}</dt>
                  <dd>{formatar(k, p[k])}</dd>
                </div>
              ))}
            </dl>
          </section>

          {secoes.includes("alergias") && (
            <section className={`rounded-2xl border-2 p-4 ${p.allergies ? "border-red-400 bg-red-50 dark:bg-red-950/40" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`} data-testid="secao-alergias">
              <p className="text-sm font-bold">Alergias</p>
              <p className="text-base">{p.allergies || "Nenhuma registrada"}</p>
            </section>
          )}

          {secoes.includes("anamneses") && (
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4" data-testid="secao-anamneses">
              <p className="text-sm font-bold mb-2">Últimas anamneses</p>
              {consultas.length === 0 && <p className="text-sm text-slate-500">Nenhuma consulta registrada.</p>}
              {consultas.map((c) => (
                <div key={c.id} className="border-t border-slate-100 dark:border-slate-800 py-2 first:border-0">
                  <p className="text-xs text-slate-500">{formatar("birthdate", String(c.date || "").slice(0, 10))}{c.cid10 ? ` · ${c.cid10}` : ""}</p>
                  {c.chief_complaint && <p className="text-sm"><b>Queixa:</b> {curto(c.chief_complaint)}</p>}
                  {c.history_of_illness && <p className="text-sm">{curto(c.history_of_illness)}</p>}
                  {c.diagnosis && <p className="text-sm"><b>Diagnóstico:</b> {curto(c.diagnosis, 140)}</p>}
                </div>
              ))}
            </section>
          )}

          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4" data-testid="secao-documentos">
            <p className="text-sm font-bold mb-2">Documentos</p>
            {docs.length === 0 && <p className="text-sm text-slate-500">Nenhum ainda.</p>}
            <ul className="flex flex-col gap-2">
              {docs.map((d) => (
                <li key={d.id}>
                  {d.file_url ? (
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                      {d.mime_type?.startsWith("image/") ? (
                        <img src={d.file_url} alt="" className="w-14 h-14 object-cover rounded-lg bg-slate-100" loading="lazy" />
                      ) : (
                        <span className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl" aria-hidden>📄</span>
                      )}
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">{d.title}</span>
                        <span className="block text-xs text-slate-500">{d.category_label || d.category} · {formatar("birthdate", d.date)}</span>
                      </span>
                    </a>
                  ) : (
                    <span className="block text-sm">{d.title} <span className="text-xs text-slate-500">· {formatar("birthdate", d.date)}</span></span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <div className="fixed bottom-0 inset-x-0 p-3 bg-white/95 dark:bg-slate-950/95 border-t border-slate-200 dark:border-slate-800">
            <div className="max-w-xl mx-auto grid grid-cols-1 gap-2">
              <a href={`/celular/foto?pid=${pid}`} className="block text-center py-3 rounded-2xl bg-sky-600 text-white font-bold" data-testid="fotografar">📷 Fotografar documento</a>
              {secoes.includes("gravar") && (
                <a href="/escriba-gravar" className="block text-center py-3 rounded-2xl bg-violet-600 text-white font-bold" data-testid="gravar">🎙️ Gravar consulta</a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
