import { api } from "./api";

/** Quantas guias o painel baixa ao mesmo tempo. O servidor também só rasteriza 2. */
export const GUIAS_AO_MESMO_TEMPO = 2;
/** Páginas por resposta. O endpoint recusa mais que isso. */
export const PAGINAS_POR_PEDIDO = 5;

export type PaginasGuia = { imgs: string[]; deitada: boolean };
export type SinalPaginas = { cancelado: boolean };

export function filaComLimite(limite: number) {
  let ativos = 0;
  const espera: Array<() => void> = [];
  return function enfileirar<T>(trabalho: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tocar = () => {
        ativos += 1;
        trabalho().then(resolve, reject).finally(() => {
          ativos -= 1;
          const proximo = espera.shift();
          if (proximo) proximo();
        });
      };
      if (ativos < limite) tocar();
      else espera.push(tocar);
    });
  };
}

export const baixarGuiaComVaga = filaComLimite(GUIAS_AO_MESMO_TEMPO);

/**
 * Baixa as páginas de uma guia em lotes de 5, um lote depois do outro.
 * Devolve null se o painel fechou no meio (não pinta folha pela metade).
 */
export async function baixarPaginasDaGuia(
  patientId: number,
  docId: number,
  sinal?: SinalPaginas,
): Promise<PaginasGuia | null> {
  const imgs: string[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let deitada = false;
  while (offset < total) {
    if (sinal?.cancelado) return null;
    const r = await api.get(`/patients/${patientId}/documents/${docId}/paginas`, {
      params: { offset, limite: PAGINAS_POR_PEDIDO },
      timeout: 60_000,
    });
    if (sinal?.cancelado) return null;
    const lote: string[] = r.data?.paginas || [];
    if (typeof r.data?.total === "number") total = r.data.total;
    deitada = (r.data?.largura_mm || 0) > (r.data?.altura_mm || 0);
    imgs.push(...lote);
    if (!lote.length) break;
    offset += lote.length;
  }
  if (sinal?.cancelado) return null;
  return { imgs, deitada };
}
