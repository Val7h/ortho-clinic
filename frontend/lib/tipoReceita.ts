// 22/11/2026 (revisão do lote 3): UMA regra só no front para o tipo de receita.
// Mesma lista e mesma tradução do servidor (backend/routers/patient_prescriptions.py:
// TIPOS_RECEITA e TIPOS_LEGADOS).

export type TipoReceita = "simples" | "controle_especial" | "antimicrobiano";

export const TIPOS_RECEITA: readonly TipoReceita[] = ["simples", "controle_especial", "antimicrobiano"];

// Valores antigos do banco -> tipo atual (papel de 2 vias).
export const TIPOS_LEGADOS: Record<string, TipoReceita> = {
  especial_azul: "controle_especial",
  especial_amarelo: "controle_especial",
  notificacao_ab: "controle_especial",
};

/** Tipo válido (já traduzido do legado) ou null quando o valor não é tipo de receita. */
export function tipoReceitaValido(t: unknown): TipoReceita | null {
  if (typeof t !== "string") return null;
  if ((TIPOS_RECEITA as readonly string[]).includes(t)) return t as TipoReceita;
  return TIPOS_LEGADOS[t] ?? null;
}
