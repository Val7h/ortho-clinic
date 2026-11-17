// 16/11/2026 (Valth): o cronômetro da consulta fica AMARELO depois de 10 min e
// VERMELHO depois de 15 min. Cada médico pode trocar os limites (clicando no
// cronômetro da ficha); fica guardado por usuário neste aparelho.

export interface CronoLimites { amarelo: number; vermelho: number } // minutos

const PADRAO: CronoLimites = { amarelo: 10, vermelho: 15 };

function chave(): string {
  let u = "anon";
  try {
    const raw = localStorage.getItem("ortho_user");
    if (raw) { const j = JSON.parse(raw); if (j?.id != null) u = `u${j.id}`; }
  } catch {}
  return `orthomedic_crono_limites_${u}`;
}

export function lerCronoLimites(): CronoLimites {
  if (typeof window === "undefined") return PADRAO;
  try {
    const j = JSON.parse(localStorage.getItem(chave()) || "null");
    if (j && j.amarelo > 0 && j.vermelho > j.amarelo) return { amarelo: +j.amarelo, vermelho: +j.vermelho };
  } catch {}
  return PADRAO;
}

export function salvarCronoLimites(l: CronoLimites): void {
  try { localStorage.setItem(chave(), JSON.stringify(l)); } catch {}
  try { window.dispatchEvent(new Event("crono-limites")); } catch {}
}

export type CronoFaixa = "verde" | "amarelo" | "vermelho";

export function faixaDoCrono(seg: number, l: CronoLimites = lerCronoLimites()): CronoFaixa {
  if (seg >= l.vermelho * 60) return "vermelho";
  if (seg >= l.amarelo * 60) return "amarelo";
  return "verde";
}

// Pergunta os dois limites ao médico (janelinha simples do navegador).
export function editarCronoLimites(): void {
  const at = lerCronoLimites();
  const a = window.prompt("Cronômetro fica AMARELO a partir de quantos minutos?", String(at.amarelo));
  if (a === null) return;
  const v = window.prompt("E fica VERMELHO a partir de quantos minutos?", String(at.vermelho));
  if (v === null) return;
  const na = Math.round(Number(a)), nv = Math.round(Number(v));
  if (!(na > 0 && nv > na)) { window.alert("O vermelho precisa ser maior que o amarelo."); return; }
  salvarCronoLimites({ amarelo: na, vermelho: nv });
}
