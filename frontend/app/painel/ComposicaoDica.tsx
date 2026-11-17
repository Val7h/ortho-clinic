"use client";

// 17/11/2026 (Valth): ao digitar a marca na receita, aparece embaixo, pequeno, a composição
// pela base pública da ANVISA — "Insit = pregabalina". Só mostra; nunca mexe no texto dele.
import { useEffect, useRef, useState } from "react";
import { medicamentosApi } from "@/lib/api";

const ACENTO = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");   // acentos (NFD)
const CACHE = new Map<string, string>();   // nome normalizado -> "Insit = pregabalina" ("" = nada)

const PALAVRA_INSTRUCAO = /^(uso|tomar|tome|aplicar|aplique|via|fazer|usar|colocar|obs|orienta\w*|retorno|em|se|apos|após|repouso|evitar)$/i;

/** Nome do remédio numa linha da receita: palavras antes da primeira com número, de "----" ou de "—". */
export function nomeDaLinha(linha: string): string {
  const l = (linha || "").replace(/^\s*(?:\d+\s*[.)-]|[-*•])\s*/, "").split(/-{2,}|—|–|:/)[0];
  const pal: string[] = [];
  for (const w of l.trim().split(/\s+/)) {
    if (!w || /\d/.test(w)) break;
    if (pal.length === 0 && PALAVRA_INSTRUCAO.test(w)) return "";
    pal.push(w.replace(/[*_]/g, ""));
    if (pal.length >= 4) break;
  }
  return pal.join(" ").trim();
}

/** Linha onde está o cursor (texto livre). */
export function linhaNoCursor(texto: string, pos: number | null | undefined): string {
  const p = Math.max(0, Math.min(pos ?? texto.length, texto.length));
  const ini = texto.lastIndexOf("\n", p - 1) + 1;
  const fim = texto.indexOf("\n", p);
  return texto.slice(ini, fim === -1 ? texto.length : fim);
}

function titulo(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export default function ComposicaoDica({ nome, className = "" }: { nome: string; className?: string }) {
  const [dica, setDica] = useState("");
  const ultimo = useRef("");

  useEffect(() => {
    const chave = (nome || "").normalize("NFD").replace(ACENTO, "").toLowerCase().trim();
    ultimo.current = chave;
    if (chave.length < 3) { setDica(""); return; }
    if (CACHE.has(chave)) { setDica(CACHE.get(chave) || ""); return; }
    const t = setTimeout(() => {
      medicamentosApi.composicao(chave).then((itens) => {
        const it = itens?.[0];
        const txt = it ? `${titulo(it.marca)} = ${it.composicao}` : "";
        CACHE.set(chave, txt);
        if (ultimo.current === chave) setDica(txt);
      }).catch(() => { /* sem rede ou sem rota: não mostra nada */ });
    }, 400);
    return () => clearTimeout(t);
  }, [nome]);

  if (!dica) return null;
  return (
    <p className={`text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate ${className}`} title={`${dica} (ANVISA)`}>
      {dica}
    </p>
  );
}
