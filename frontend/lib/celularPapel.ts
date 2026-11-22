// O que cada login vê no app do celular (22/11/2026). Regras puras, testadas.
// Secretária: cadastro e as duas pastas (documento e carteirinha). Nunca anamnese nem Gravar.
// Médico: tudo da secretária + alergias, 3 últimas anamneses, documentos e Gravar consulta.

export type Papel = "superadmin" | "admin" | "doctor" | "secretary" | string | undefined | null;

export function ehMedico(papel: Papel): boolean {
  return papel === "doctor" || papel === "admin" || papel === "superadmin";
}

export type Cartao = { href: string; titulo: string; texto: string; emoji: string; cor: string; teste: string };

export function cartoesDoInicio(papel: Papel, pid?: number | null): Cartao[] {
  const q = pid ? `?pid=${pid}` : "";
  const c: Cartao[] = [
    { href: `/celular/foto${q}`, titulo: "Foto de documento", texto: "Documento pessoal e carteirinha do plano", emoji: "📷", cor: "bg-sky-600", teste: "cartao-foto" },
    { href: "/celular/agenda", titulo: "Agenda de hoje", texto: "Quem está marcado hoje", emoji: "📅", cor: "bg-emerald-600", teste: "cartao-agenda" },
    { href: "/celular/sala", titulo: "Sala de espera", texto: "Quem já chegou", emoji: "🪑", cor: "bg-amber-600", teste: "cartao-sala" },
  ];
  if (ehMedico(papel)) {
    c.push({ href: "/escriba-gravar", titulo: "Gravar consulta", texto: "Grava a consulta aberta no PC", emoji: "🎙️", cor: "bg-violet-600", teste: "cartao-gravar" });
  }
  return c;
}

export type Secao = "cadastro" | "pastas" | "alergias" | "anamneses" | "documentos" | "gravar";

export function secoesDaFicha(papel: Papel): Secao[] {
  return ehMedico(papel)
    ? ["cadastro", "alergias", "anamneses", "documentos", "gravar"]
    : ["cadastro", "pastas"];
}

/** Pastas que a secretária vê na ficha. */
export const PASTAS_SECRETARIA = ["identity", "insurance_card"];
