// Escriba integrado, melhoria 5 (17/11/2026): pre-gravacao entre pacientes.
//
// Regras puras do buffer (sem IndexedDB, sem microfone), para testar em Node:
// - so fica o que comecou DEPOIS do "Finalizar" anterior (o corte);
// - so fica o que comecou nos ultimos JANELA ms (o mais velho se descarta);
// - sobe na ordem em que foi gravado, com seq a partir do proximo livre da sessao nova.

export const PRE_JANELA_MS = 3 * 60_000; // guarda so os ultimos 3 min
export const PRE_LIMITE_MS = 3 * 60_000; // 3 min sem Iniciar: para e descarta tudo

export interface ItemPre {
  k: string;      // chave no IndexedDB (ordem de gravacao)
  ini_ms: number; // inicio do pedaco
  t_ms: number;   // fim do pedaco (quando o audio ficou pronto)
  ext: string;
  blob: Blob;
  corte: number;  // o "Finalizar" que abriu esta pre-gravacao
}

export const chavePre = (iniMs: number, n: number) => `${String(iniMs).padStart(15, "0")}_${String(n).padStart(4, "0")}`;

/** Pode ficar no buffer? Comecou depois do corte e dentro da janela. */
export function valePre(it: Pick<ItemPre, "ini_ms" | "corte">, corte: number, agora: number, janelaMs = PRE_JANELA_MS): boolean {
  return it.corte === corte && it.ini_ms >= corte && it.ini_ms >= agora - janelaMs && it.ini_ms <= agora;
}

/** Chaves que devem sair do buffer agora (velhas, de outro corte ou anteriores ao Finalizar). */
export function chavesParaPodar(itens: ItemPre[], corte: number, agora: number, janelaMs = PRE_JANELA_MS): string[] {
  return itens.filter((it) => !valePre(it, corte, agora, janelaMs)).map((it) => it.k);
}

/** O que sobe, em ordem de gravacao, ja numerado para a sessao nova. */
export function paraSubir<T extends ItemPre>(itens: T[], corte: number, agora: number, sid: number, seqInicial: number,
  janelaMs = PRE_JANELA_MS): { item: T; sid: number; seq: number }[] {
  return itens
    .filter((it) => valePre(it, corte, agora, janelaMs))
    .sort((a, b) => (a.ini_ms - b.ini_ms) || (a.k < b.k ? -1 : 1))
    .map((item, i) => ({ item, sid, seq: seqInicial + i }));
}
