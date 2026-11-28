// Itens alinhados da receita (regra permanente do Dr. Valth, 27/11).
//
// O texto da receita fica guardado como o medico escreveu, com o tracejado
// digitado a mao ("CELECOXIBE 200MG ------- 1CX"). Na hora de desenhar a folha,
// cada linha de remedio vira nome + quantidade (pontilhado flexivel entre os
// dois) e as linhas seguintes viram a posologia. Nada muda no banco.
//
// Regras (revisao independente de 28/11):
//  - linha que comeca com numero ("1- ", "2) ", "3. ") abre item NOVO, mesmo
//    sem quantidade; o numero digitado e mantido;
//  - quantidade so e aceita se comecar por algarismo ou UM/UMA/DOIS/DUAS e nao
//    parecer posologia ("3x ao dia", "7 DIAS", "8/8H"): assim "TOMAR 1 CP ----
//    SE DOR" e "12/12H ---- 7 DIAS" continuam posologia;
//  - linha em branco depois de uma posologia fecha o item (o que vem depois,
//    como "Orientacoes: retorno em 30 dias", e texto livre, sem recuo); a
//    linha em branco entre o remedio e a PRIMEIRA linha da posologia nao fecha
//    (e o formato do emissor: "NOME ---- 1CX\n\nTOMAR 1 CP");
//  - "USO ORAL", "USO TOPICO"... viram titulo de grupo; "Uso continuo" nao.

export type BlocoReceita =
  | { tipo: "via"; texto: string }
  | { tipo: "item"; numero: number | null; nome: string; qtd: string; posologia: string[] }
  | { tipo: "texto"; linhas: string[] };

const NUMERO = /^(\d{1,2})\s*[.)\-–]\s+/;
// Tracejado de 3+ marcas (aceita "- - - -"), separando nome e o resto.
const TRACEJADO = /^(.*?\S)\s*[-–—_.·](?:\s*[-–—_.·]){2,}\s*(.*)$/;
const TRACEJADO_NO_MEIO = /\s*[-–—_.·](?:\s*[-–—_.·]){2,}\s*/;
const VIA = /^uso\s+(oral|t[oó]pico|externo|interno|sublingual|retal|vaginal|nasal|oft[aá]lmico|ocular|otol[oó]gico|auricular|intramuscular|intravenoso|endovenoso|subcut[aâ]neo|injet[aá]vel|inalat[oó]rio|local|dermatol[oó]gico|im|ev|iv|sc)\b[^\d]{0,30}$/i;
const VERBO_POSOLOGIA = /^(tomar|aplicar|usar|passar|fazer|colocar|ingerir|pingar|massagear|manter|tomar,|diluir|dissolver|mastigar|repetir)\b/i;
const NAO_E_POSOLOGIA = /^(orienta[cç][oõ]es|obs\b|observa[cç]|retorno|retornar)/i;
const QTD_INICIO = /^(\d|(um|uma|dois|duas)\b)/i;
const QTD_PARECE_POSOLOGIA = /(^\d+\s*(x|vez|vezes)\b)|\d+\s*\/\s*\d+|\b(dias?|semanas?|m[eê]s|meses|horas?|h)\b/i;

function letras(s: string): number {
  return (s.match(/[A-Za-zÀ-ÿ]/g) || []).length;
}

function nomeValido(nome: string): boolean {
  return letras(nome) >= 3 && !VERBO_POSOLOGIA.test(nome);
}

function qtdValida(qtd: string): boolean {
  return qtd.length <= 40 && QTD_INICIO.test(qtd) && !QTD_PARECE_POSOLOGIA.test(qtd);
}

// Uma linha de remedio: { numero, nome, qtd, resto } ou null.
export function linhaDeItem(l: string): { numero: number | null; nome: string; qtd: string; resto: string } | null {
  const mNum = l.match(NUMERO);
  const numero = mNum ? Number(mNum[1]) : null;
  const corpo = mNum ? l.slice(mNum[0].length).trim() : l;
  const m = corpo.match(TRACEJADO);
  if (m) {
    const nome = m[1].trim();
    let depois = m[2].trim();
    let resto = "";
    // "PREDNISONA 20MG ---- 1 CX ---- TOMAR 1 CP": quantidade e o que vem antes do 2o tracejado.
    const meio = depois.match(TRACEJADO_NO_MEIO);
    if (meio && meio.index !== undefined) {
      resto = depois.slice(meio.index + meio[0].length).trim();
      depois = depois.slice(0, meio.index).trim();
    }
    if (!depois) {
      // tracejado sem quantidade: e remedio se o nome for de remedio (ou se veio numerado)
      if (numero !== null || nomeValido(nome)) return { numero, nome, qtd: "", resto };
      return null;
    }
    if (qtdValida(depois) && (numero !== null || nomeValido(nome))) return { numero, nome, qtd: depois, resto };
    // quantidade que nao e quantidade: so e item se veio numerado (a linha inteira e o nome)
    if (numero !== null) return { numero, nome: corpo, qtd: "", resto: "" };
    return null;
  }
  if (numero !== null && corpo) return { numero, nome: corpo, qtd: "", resto: "" };
  return null;
}

export function blocosDaReceita(texto: string): BlocoReceita[] | null {
  const blocos: BlocoReceita[] = [];
  let item: Extract<BlocoReceita, { tipo: "item" }> | null = null;
  let livre: Extract<BlocoReceita, { tipo: "texto" }> | null = null;
  let temItem = false;
  let emBranco = false;
  for (const bruta of (texto || "").replace(/\r/g, "").split("\n")) {
    const l = bruta.trim();
    if (!l) {
      livre = null;
      emBranco = true;
      if (item && item.posologia.length > 0) item = null;
      continue;
    }
    const it = linhaDeItem(l);
    if (it) {
      item = { tipo: "item", numero: it.numero, nome: it.nome, qtd: it.qtd, posologia: it.resto ? [it.resto] : [] };
      blocos.push(item); livre = null; temItem = true; emBranco = false;
      continue;
    }
    if (VIA.test(l)) {
      blocos.push({ tipo: "via", texto: l }); item = null; livre = null; emBranco = false;
      continue;
    }
    if (item && !NAO_E_POSOLOGIA.test(l) && !(emBranco && item.posologia.length > 0)) {
      item.posologia.push(l); emBranco = false;
      continue;
    }
    item = null;
    emBranco = false;
    if (!livre) { livre = { tipo: "texto", linhas: [] }; blocos.push(livre); }
    livre.linhas.push(l);
  }
  return temItem ? blocos : null;
}

// Numero mostrado de cada item: o que o medico digitou; sem numero, segue a contagem.
export function numerosDosItens(blocos: BlocoReceita[]): number[] {
  const out: number[] = [];
  let n = 0;
  for (const b of blocos) {
    if (b.tipo !== "item") continue;
    n = b.numero !== null ? b.numero : n + 1;
    out.push(n);
  }
  return out;
}
