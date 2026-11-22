// Controle das leituras de foto no celular (revisão 22/11/2026).
// Uma resposta de leitura só vale se o paciente ainda é o mesmo E é a última
// tentativa daquele documento. Trocar de paciente invalida tudo que estava pendente.

export interface Tentativa { tipo: string; n: number; pid: number | null }

export function criarControleDeTentativas() {
  let pid: number | null = null;
  const contador: Record<string, number> = {};
  let geracao = 0;
  return {
    trocarPaciente(novo: number | null) {
      pid = novo;
      geracao++;
      for (const k of Object.keys(contador)) contador[k]++;
    },
    iniciar(tipo: string): Tentativa & { g: number } {
      contador[tipo] = (contador[tipo] || 0) + 1;
      return { tipo, n: contador[tipo], pid, g: geracao };
    },
    vale(t: Tentativa & { g?: number }): boolean {
      return t.pid === pid && contador[t.tipo] === t.n && (t.g === undefined || t.g === geracao);
    },
    pacienteAtual: () => pid,
  };
}
