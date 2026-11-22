// Junção da anamnese quando o servidor recusa o save com 409 (o registro mudou
// por fora — anamnese_add, outra aba, outro aparelho).

// 21/10 (Valth): a tela aberta apagava o que entrou por fora (Marinaldo,
// Lígia, Cleonice). No 409, junta: texto atual do servidor + as linhas que o
// médico ACRESCENTOU nesta tela (as que não estavam no texto que ela leu).
// Melhor repetir uma linha do que perder uma.
export function juntarAnamnese(servidor: string, base: string, minha: string): string {
  const naBase = new Set(base.split("\n").map(l => l.trim()).filter(Boolean));
  const noServidor = new Set(servidor.split("\n").map(l => l.trim()).filter(Boolean));
  const novas = minha.split("\n").filter(l => l.trim() && !naBase.has(l.trim()) && !noServidor.has(l.trim()));
  return novas.length ? `${servidor.trimEnd()}\n${novas.join("\n")}` : servidor;
}

// 22/11 (revisão 19/11): depois do 409 o texto juntado ia para o servidor, mas a
// tela continuava com o texto antigo — e o autosave seguinte gravava a tela por
// cima, apagando o acréscimo de fora. Agora a tela passa a mostrar a folha do
// servidor (já juntada). Se ele digitou enquanto salvava, o que digitou é
// juntado de novo, para não perder nada. O espaço/Enter do fim da tela é
// mantido (o servidor guarda sem ele; 16/11: "junta uma palavra com outra").
export function folhaDepoisDaJuncao(doServidor: string, folhaSalva: string, folhaAgora: string): string {
  const fim = (folhaAgora.match(/\s*$/) || [""])[0];
  if (folhaAgora === folhaSalva) return doServidor.trimEnd() + fim;
  return juntarAnamnese(doServidor, folhaSalva, folhaAgora).trimEnd() + fim;
}
