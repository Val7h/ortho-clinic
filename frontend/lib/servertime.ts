// Hora do SERVIDOR, não a do computador.
//
// 07/10 (Valth): o cronômetro do atendimento mostrava 3min37s logo depois de
// iniciar — o relógio do computador dele estava ~3 min adiantado e o cronômetro
// subtraía "agora do PC" menos "início gravado pelo servidor". Aqui guardamos a
// diferença entre os dois relógios, aprendida do cabeçalho `Date` de cada
// resposta da API, e `serverNow()` devolve o "agora" já corrigido.
let offsetMs = 0;

export function atualizarRelogioDoServidor(dateHeader?: string | null): void {
  if (!dateHeader) return;
  const srv = new Date(dateHeader).getTime();
  if (!Number.isFinite(srv)) return;
  // o cabeçalho Date tem precisão de 1 s: +500 ms centraliza o erro
  offsetMs = srv + 500 - Date.now();
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}
