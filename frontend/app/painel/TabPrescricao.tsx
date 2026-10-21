"use client";

// Aba "Prescrição" — clone do jeito da Memed (13/10/2026, pedido do Valth:
// "veja como a Memed funciona e faça uma aba ... como um clone do Memed").
//
// Como funciona (igual à Memed):
//  1. Digita a marca ou o princípio -> aparecem as apresentações da base
//     oficial (CMED/Anvisa), com o tipo de receita em destaque.
//  2. Clica numa apresentação -> entra na lista com posologia sugerida.
//  3. Alertas na hora: alergia do cadastro, dois anti-inflamatórios juntos,
//     tramadol + antidepressivo, opioide + benzodiazepínico, corticoide + AINE,
//     e remédio que exige talão (Notificação A amarela / B azul).
//  4. "Gerar receitas" separa sozinho em simples / controle especial /
//     antimicrobiano, salva e abre a impressão da aba Receitas (mesmo papel).
// A receita sai no formato que ele já usa: "USO ORAL / NOME ---- QTD / posologia".

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Search, X, Pill, AlertTriangle, Printer, Plus } from "lucide-react";
import { medicamentosApi, prescriptionsApi, msgErro } from "@/lib/api";
import { controladoCitado } from "@/lib/medicamentosOrtopedia";

export type TipoRx = "simples" | "controle_especial" | "antimicrobiano";

interface ItemRx {
  uid: string;
  nome: string;          // como sai na receita: "ADORLAN 25MG"
  substancia: string;
  via: string;           // "USO ORAL", "USO IM", "USO TÓPICO"...
  tipo: TipoRx | "notificacao";
  notificacao?: string | null;
  classe?: string;
  quantidade: string;
  posologia: string;
}

export interface JobImpressao {
  date: string; medications: any[]; instructions: string; prescription_type: TipoRx;
  patientAddress?: string; patientPhone?: string;
}

const semAcento = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const reais = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// "25 MG COM CT BL ..." -> { dose: "25MG", forma: "COM" }
function resumirApresentacao(apr: string) {
  const a = (apr || "").toUpperCase();
  const dose = (a.match(/^\(?[\d.,+\s]+\)?\s*(MG\/ML|MG\/G|MCG\/H|MCG|MG|G|UI|%)/) || [""])[0].replace(/\s+/g, "");
  let forma = "";
  if (/ADES|TRANSD/.test(a)) forma = "ADESIVO";
  else if (/SOL INJ|INJ|AMP/.test(a)) forma = "INJ";
  else if (/CAP/.test(a)) forma = "CÁPSULA";
  else if (/COM|DRG/.test(a)) forma = "COMPRIMIDO";
  else if (/GEL|CREM|POM/.test(a)) forma = "TÓPICO";
  else if (/SOL OR|GOT|SUS|XPE/.test(a)) forma = "LÍQUIDO";
  return { dose, forma };
}
function viaDaForma(forma: string, apr: string) {
  if (forma === "INJ") return /\bIV\b|INTRAVEN/i.test(apr) ? "USO IV" : "USO IM";
  if (forma === "ADESIVO" || forma === "TÓPICO") return "USO TÓPICO";
  if (/SUBL|\bSL\b/i.test(apr)) return "USO SUBLINGUAL";
  return "USO ORAL";
}
function posologiasPara(forma: string) {
  if (forma === "INJ") return ["APLICAR 1 FA, IM, EM DOSE ÚNICA.", "APLICAR 1 FA, IM, EM DIAS ALTERNADOS.", "APLICAR 1 FA, IM, 1 VEZ AO DIA POR 3 DIAS."];
  if (forma === "ADESIVO") return ["APLICAR 1 ADESIVO NA PELE, TROCAR APÓS 7 DIAS.", "APLICAR 1 ADESIVO NA PELE, TROCAR APÓS 4 DIAS."];
  if (forma === "TÓPICO") return ["APLICAR NO LOCAL 3 VEZES AO DIA.", "APLICAR NO LOCAL 2 VEZES AO DIA POR 10 DIAS."];
  return ["TOMAR 1 CP DE 8 EM 8H POR 5 DIAS.", "TOMAR 1 CP DE 12 EM 12H POR 7 DIAS.", "TOMAR 1 CP AO DIA POR 2 SEMANAS.",
          "TOMAR 1 CP À NOITE.", "TOMAR 1 CP PELA MANHÃ, USO CONTÍNUO.", "TOMAR 1 CP DE 8 EM 8H SE DOR."];
}

const TIPO_ROTULO: Record<string, { txt: string; cls: string }> = {
  simples: { txt: "Simples", cls: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  controle_especial: { txt: "Controle especial · 2 vias", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  antimicrobiano: { txt: "Antimicrobiano · 2 vias", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  notificacaoA: { txt: "Talão AMARELO (Notificação A)", cls: "bg-yellow-200 text-yellow-900" },
  notificacaoB: { txt: "Talão AZUL (Notificação B)", cls: "bg-blue-200 text-blue-900" },
};
const rotulo = (tipo: string, notif?: string | null) =>
  tipo === "notificacao" ? (notif === "A" ? TIPO_ROTULO.notificacaoA : TIPO_ROTULO.notificacaoB) : (TIPO_ROTULO[tipo] || TIPO_ROTULO.simples);

// ── Alertas (regras simples e conhecidas da ortopedia) ──
const temSub = (itens: ItemRx[], termos: string[]) => itens.filter((i) => termos.some((t) => semAcento(i.substancia + " " + i.nome).includes(t)));
function alertas(itens: ItemRx[], alergiasTxt: string): string[] {
  const out: string[] = [];
  const al = semAcento(alergiasTxt);
  if (al.trim()) {
    for (const i of itens) {
      const partes = semAcento(i.substancia).split(/[;,+]/).map((p) => p.replace(/^(cloridrato|fosfato|sulfato|maleato|succinato|oxalato|besilato|dipropionato|acetato) de /, "").trim()).filter((p) => p.length > 4);
      const bate = partes.find((p) => al.includes(p.split(" ")[0])) || (al.includes(semAcento(i.nome).split(" ")[0]) ? i.nome : "");
      if (bate) out.push(`ALERGIA: o cadastro registra alergia que bate com ${i.nome} (${bate}).`);
    }
  }
  const aines = itens.filter((i) => (i.classe || "").toUpperCase().startsWith("M1A"));
  if (aines.length > 1) out.push(`Dois anti-inflamatórios juntos: ${aines.map((i) => i.nome).join(" + ")} — risco para estômago e rim.`);
  const opioide = temSub(itens, ["tramadol", "codeina", "buprenorfina", "morfina", "oxicodona", "tapentadol", "metadona", "fentanil"]);
  const serot = temSub(itens, ["duloxetina", "venlafaxina", "sertralina", "fluoxetina", "escitalopram", "paroxetina", "amitriptilina", "nortriptilina", "trazodona"]);
  if (temSub(itens, ["tramadol"]).length && serot.length) out.push(`Tramadol + ${serot.map((i) => i.nome).join(", ")}: risco de síndrome serotoninérgica e convulsão.`);
  const benzo = temSub(itens, ["clonazepam", "diazepam", "alprazolam", "bromazepam", "lorazepam", "zolpidem"]);
  if (opioide.length && benzo.length) out.push(`Opioide + ${benzo.map((i) => i.nome).join(", ")}: sedação e depressão respiratória.`);
  const cort = temSub(itens, ["dexametasona", "betametasona", "prednisona", "prednisolona", "deflazacorte", "metilprednisolona"]);
  if (cort.length && aines.length) out.push(`Corticoide + anti-inflamatório: proteger o estômago (omeprazol).`);
  for (const i of itens) if (i.tipo === "notificacao")
    out.push(`${i.nome}: exige ${i.notificacao === "A" ? "talão AMARELO (Notificação A)" : "talão AZUL (Notificação B)"} — fica fora das receitas impressas aqui.`);
  return out;
}

const RECENTES_KEY = "orthoclinic_prescricao_recentes";
function lerRecentes(): Omit<ItemRx, "uid">[] { try { return JSON.parse(localStorage.getItem(RECENTES_KEY) || "[]"); } catch { return []; } }
function guardarRecente(i: ItemRx) {
  try {
    const { uid, ...semUid } = i;
    const lista = [semUid, ...lerRecentes().filter((r) => r.nome !== i.nome)].slice(0, 24);
    localStorage.setItem(RECENTES_KEY, JSON.stringify(lista));
  } catch {}
}

export default function TabPrescricao({ patientId, patient, onImprimir }: {
  patientId: number; patient: any; onImprimir: (jobs: JobImpressao[]) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [itens, setItens] = useState<ItemRx[]>([]);
  const [recentes, setRecentes] = useState<Omit<ItemRx, "uid">[]>([]);
  const [salvando, setSalvando] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRecentes(lerRecentes()); }, []);
  useEffect(() => { setItens([]); setQ(""); }, [patientId]);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 3) { setResultados([]); return; }
    const t = setTimeout(() => {
      setBuscando(true);
      medicamentosApi.busca(termo).then(setResultados).catch(() => setResultados([])).finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // agrupa caixas diferentes da mesma apresentação (CMED repete por tamanho de caixa).
  // 21/10/2026 (Valth): "o Torxis existe com 7 e com 14 comprimidos e você mostra só uma".
  // Antes ficava só a 1ª caixa da lista — em ordem de texto "X 14" vem antes de "X 7",
  // então aparecia sempre a de 14 (R$ 173,26). Agora o grupo guarda TODAS as caixas,
  // cada uma com o seu preço, e ele escolhe clicando na caixa.
  const grupos = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of resultados) {
      const { dose, forma } = resumirApresentacao(r.apresentacao);
      const k = `${r.produto}|${dose}|${forma}`;
      if (!m.has(k)) m.set(k, { ...r, dose, forma, labs: new Set<string>(), caixas: [] as { n: number; min: number; max: number }[] });
      const g = m.get(k);
      g.labs.add(r.laboratorio);
      const n = parseInt(((r.apresentacao || "").toUpperCase().match(/X\s*(\d+)\s*$/) || [])[1] || "0", 10);
      const v = parseFloat(String(r.preco_maximo_pe || "").replace(/\./g, "").replace(",", "."));
      if (!n) continue;
      const c = g.caixas.find((x: any) => x.n === n);
      if (!c) g.caixas.push({ n, min: v, max: v });
      else if (!isNaN(v)) { c.min = isNaN(c.min) ? v : Math.min(c.min, v); c.max = isNaN(c.max) ? v : Math.max(c.max, v); }
    }
    const lista = Array.from(m.values());
    for (const g of lista) g.caixas.sort((a: any, b: any) => a.n - b.n);
    return lista.slice(0, 25);
  }, [resultados]);

  const adicionar = (r: any, caixa?: { n: number }) => {
    const nome = `${r.produto}${r.dose ? " " + r.dose : ""}`.toUpperCase();
    const unid = r.forma === "CÁPSULA" ? "CÁPS" : "CP";
    const item: ItemRx = {
      uid: Math.random().toString(36).slice(2), nome, substancia: (r.substancia || "").toLowerCase(),
      via: viaDaForma(r.forma, r.apresentacao), tipo: r.tipo_receita, notificacao: r.notificacao, classe: r.classe,
      quantidade: r.forma === "INJ" ? "1 FA" : r.forma === "ADESIVO" ? "4 ADESIVOS"
        : caixa && (r.forma === "COMPRIMIDO" || r.forma === "CÁPSULA") ? `1 CX (${caixa.n} ${unid})` : "1 CX",
      posologia: posologiasPara(r.forma)[0],
    };
    setItens((v) => [...v, item]); guardarRecente(item); setRecentes(lerRecentes());
    setQ(""); setResultados([]); buscaRef.current?.focus();
  };
  const adicionarRecente = (r: Omit<ItemRx, "uid">) => setItens((v) => [...v, { ...r, uid: Math.random().toString(36).slice(2) }]);
  const adicionarLivre = () => {
    const nome = q.trim().toUpperCase();
    if (!nome) return;
    const c = controladoCitado(nome);
    setItens((v) => [...v, { uid: Math.random().toString(36).slice(2), nome, substancia: c?.principio || "", via: "USO ORAL",
      tipo: (c?.tipo as TipoRx) || "simples", quantidade: "1 CX", posologia: "TOMAR 1 CP DE 12 EM 12H." }]);
    setQ(""); setResultados([]);
  };
  const mudar = (uid: string, campo: keyof ItemRx, valor: string) => setItens((v) => v.map((i) => (i.uid === uid ? { ...i, [campo]: valor } : i)));

  const listaAlertas = useMemo(() => alertas(itens, `${patient?.allergies || ""} ${patient?.alergias || ""}`), [itens, patient]);

  // texto no formato que ele já usa
  const montarTexto = (lista: ItemRx[]) => {
    const porVia = new Map<string, ItemRx[]>();
    for (const i of lista) porVia.set(i.via, [...(porVia.get(i.via) || []), i]);
    return Array.from(porVia.entries()).map(([via, is]) =>
      `${via}\n\n` + is.map((i) => `${i.nome} ${"-".repeat(Math.max(4, 48 - i.nome.length))} ${i.quantidade}\n\n${i.posologia}`).join("\n\n\n")
    ).join("\n\n\n");
  };

  const gerar = async () => {
    const imprimiveis = itens.filter((i) => i.tipo !== "notificacao");
    if (!imprimiveis.length) { toast.error("Nenhum remédio que possa sair nesta receita."); return; }
    setSalvando(true);
    try {
      const ordem: TipoRx[] = ["simples", "controle_especial", "antimicrobiano"];
      const jobs: JobImpressao[] = [];
      const endereco = [patient?.address_street, patient?.address_number, patient?.address_city, patient?.address_state].filter(Boolean).join(", ");
      for (const tipo of ordem) {
        const doTipo = imprimiveis.filter((i) => i.tipo === tipo);
        if (!doTipo.length) continue;
        const texto = montarTexto(doTipo);
        await prescriptionsApi.create(patientId, {
          date: hojeISO(), prescription_type: tipo, medications: [], instructions: texto,
          patient_address: endereco || undefined, patient_phone: patient?.phone || undefined,
        });
        jobs.push({ date: hojeISO(), medications: [], instructions: texto, prescription_type: tipo, patientAddress: endereco || undefined, patientPhone: patient?.phone || undefined });
      }
      toast.success(jobs.length > 1 ? `${jobs.length} receitas salvas (separadas por tipo)` : "Receita salva");
      setItens([]);
      onImprimir(jobs);
    } catch (e: any) {
      toast.error(msgErro(e, "Não consegui salvar a receita"));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input ref={buscaRef} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && grupos[0]) adicionar(grupos[0]); }}
          placeholder="Buscar remédio pela marca ou princípio ativo (ex.: Adorlan, pregabalina, Coxeto)"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
        {(grupos.length > 0 || (q.trim().length >= 3 && !buscando)) && (
          <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
            {grupos.map((r, i) => {
              const rt = rotulo(r.tipo_receita, r.notificacao);
              return (
                <button key={i} type="button" onClick={() => adicionar(r)}
                  className="w-full text-left px-3 py-2 hover:bg-teal-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.produto} {r.dose} <span className="font-normal text-slate-500">· {r.forma.toLowerCase()}</span></span>
                    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${rt.cls}`}>{rt.txt}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{(r.substancia || "").toLowerCase()} · {r.labs.size > 1 ? `${r.labs.size} laboratórios` : r.laboratorio}</p>
                  {r.caixas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.caixas.map((c: any) => (
                        <span key={c.n} role="button" tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); adicionar(r, c); }}
                          title="Preço máximo ao consumidor (PMC) em Pernambuco"
                          className="text-[11px] rounded border border-teal-300 dark:border-teal-700 px-1.5 py-0.5 text-teal-800 dark:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-900/40">
                          {c.n} {r.forma === "CÁPSULA" ? "cáps" : r.forma === "COMPRIMIDO" ? "cp" : "un"}{isNaN(c.min) ? "" : ` · R$ ${reais(c.min)}${c.max > c.min + 0.005 ? `–${reais(c.max)}` : ""}`}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
            {q.trim().length >= 3 && !buscando && (
              <button type="button" onClick={adicionarLivre} className="w-full text-left px-3 py-2 text-sm text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-slate-800 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Usar “{q.trim().toUpperCase()}” como texto livre (fórmula manipulada, outro remédio)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recentes */}
      {recentes.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 mb-1 font-semibold uppercase tracking-wide">Usados recentemente</p>
          <div className="flex flex-wrap gap-1.5">
            {recentes.slice(0, 14).map((r, i) => (
              <button key={i} type="button" onClick={() => adicionarRecente(r)}
                className="text-[11px] px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-300 hover:bg-teal-100">
                + {r.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Itens */}
      {itens.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-sm text-slate-500">
          <Pill className="w-5 h-5 mx-auto mb-1 opacity-60" />
          Busque um remédio acima. A receita é separada sozinha em simples, controle especial e antimicrobiano.
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((i) => {
            const rt = rotulo(i.tipo, i.notificacao);
            const forma = /USO IM|USO IV/.test(i.via) ? "INJ" : /TÓPICO/.test(i.via) ? (/ADES/i.test(i.quantidade) ? "ADESIVO" : "TÓPICO") : "COMPRIMIDO";
            return (
              <div key={i.uid} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{i.nome}</p>
                    {i.substancia && <p className="text-[11px] text-slate-500">{i.substancia}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${rt.cls}`}>{rt.txt}</span>
                    <button type="button" onClick={() => setItens((v) => v.filter((x) => x.uid !== i.uid))} className="p-1 text-slate-400 hover:text-red-600" title="Tirar da receita"><X className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <select value={i.via} onChange={(e) => mudar(i.uid, "via", e.target.value)} className="text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-1">
                    {["USO ORAL", "USO SUBLINGUAL", "USO IM", "USO IV", "USO TÓPICO"].map((v) => <option key={v}>{v}</option>)}
                  </select>
                  <input value={i.quantidade} onChange={(e) => mudar(i.uid, "quantidade", e.target.value.toUpperCase())} className="w-28 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1" placeholder="Quantidade" />
                </div>
                <input value={i.posologia} onChange={(e) => mudar(i.uid, "posologia", e.target.value.toUpperCase())} className="w-full text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5" placeholder="Posologia" />
                <div className="flex flex-wrap gap-1">
                  {posologiasPara(forma).map((p) => (
                    <button key={p} type="button" onClick={() => mudar(i.uid, "posologia", p)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${i.posologia === p ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>{p}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alertas */}
      {listaAlertas.length > 0 && (
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-1">
          {listaAlertas.map((a, k) => (
            <p key={k} className="text-xs text-red-800 dark:text-red-200 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{a}</p>
          ))}
        </div>
      )}

      {itens.length > 0 && (
        <div className="flex justify-end">
          <button type="button" onClick={gerar} disabled={salvando}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
            <Printer className="w-4 h-4" /> {salvando ? "Salvando…" : "Gerar receitas e imprimir"}
          </button>
        </div>
      )}
    </div>
  );
}
