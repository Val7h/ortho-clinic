// "Confira a leitura" do app do celular (22/11/2026) — regras PURAS, sem tela.
// Compara o que a foto leu (documento pessoal e/ou carteirinha) com o cadastro.
//   amarelo = cadastro vazio: já vem aceito (dá para desmarcar)
//   verde   = igual ao cadastro: nada muda
//   laranja = diferente: precisa de 1 toque (Manter / Usar o da foto)
//   cinza   = não leu (com o motivo)
// Nada é gravado aqui. A tela só manda ao servidor o que `dadosAceitos` devolver.

export type Origem = "identity" | "insurance_card";
export type Cor = "amarelo" | "verde" | "laranja" | "cinza";

export interface Leitura {
  campos: Record<string, string | null>;
  motivos?: Record<string, string>;
}

export interface Opcao {
  chave: string; // "manter" | "foto" | "identity" | "insurance_card"
  rotulo: string;
  valor: string | null;
}

export interface Linha {
  campo: string;
  rotulo: string;
  atual: string | null;
  cor: Cor;
  motivo?: string;
  opcoes: Opcao[];
  escolha: string | null; // null = falta decidir
  travado?: boolean;
  /** Amarelo de CPF/nascimento: só entra com "Conferi" (ou corrigindo o valor). */
  conferir?: boolean;
}

export const CAMPOS: { campo: string; rotulo: string; de: Origem[] }[] = [
  { campo: "name", rotulo: "Nome", de: ["identity", "insurance_card"] },
  { campo: "birthdate", rotulo: "Nascimento", de: ["identity", "insurance_card"] },
  { campo: "cpf", rotulo: "CPF", de: ["identity", "insurance_card"] },
  { campo: "rg", rotulo: "RG", de: ["identity"] },
  { campo: "insurance", rotulo: "Convênio", de: ["insurance_card"] },
  { campo: "insurance_plan", rotulo: "Plano", de: ["insurance_card"] },
  { campo: "insurance_number", rotulo: "Nº da carteirinha", de: ["insurance_card"] },
];

const ROTULO_ORIGEM: Record<Origem, string> = { identity: "Do documento", insurance_card: "Da carteirinha" };

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

export function soDigitos(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

export function cpfValido(cpf: string | null | undefined): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}

function vazio(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Dois valores do mesmo campo dizem a mesma coisa? */
export function iguais(campo: string, a: string | null | undefined, b: string | null | undefined): boolean {
  if (vazio(a) || vazio(b)) return false;
  const x = String(a), y = String(b);
  switch (campo) {
    case "cpf":
    case "insurance_number":
      return soDigitos(x) === soDigitos(y);
    case "birthdate":
      return x.slice(0, 10) === y.slice(0, 10);
    case "rg":
      return semAcento(x).replace(/[^0-9A-Z]/g, "") === semAcento(y).replace(/[^0-9A-Z]/g, "");
    case "insurance": {
      // "UNIMED CAMPINA GRANDE" × "Unimed" = mesmo convênio
      const p = semAcento(x), q = semAcento(y);
      return p === q || p.includes(q) || q.includes(p);
    }
    default:
      return semAcento(x) === semAcento(y);
  }
}

export function formatar(campo: string, v: string | null | undefined): string {
  if (vazio(v)) return "—";
  const s = String(v);
  if (campo === "birthdate" && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [a, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${a}`;
  }
  if (campo === "cpf") {
    const d = soDigitos(s);
    if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return s;
}

export interface Entrada {
  cadastro: Record<string, any>;
  leituras: Partial<Record<Origem, Leitura>>;
  /** CPFs lidos (só dígitos) que já são de OUTRO paciente — a tela confere TODOS antes. */
  cpfsDeOutros?: Record<string, { id: number; name: string }>;
}

/** Cadastro vazio nestes campos: não entra sozinho, exige "Conferi" (como no LemonMedic). */
export const EXIGE_CONFERIR = ["cpf", "birthdate"];

export function montarLinhas({ cadastro, leituras, cpfsDeOutros }: Entrada): Linha[] {
  const linhas: Linha[] = [];
  for (const { campo, rotulo, de } of CAMPOS) {
    const lidas = de.filter((o) => leituras[o]);
    if (!lidas.length) continue; // aquele documento não foi fotografado
    const atual = vazio(cadastro?.[campo]) ? null : String(cadastro[campo]);

    const valores: { origem: Origem; valor: string }[] = [];
    const motivos: string[] = [];
    for (const o of lidas) {
      const v = leituras[o]!.campos?.[campo];
      if (!vazio(v)) {
        if (campo === "cpf" && !cpfValido(v)) { motivos.push("CPF com dígito errado"); continue; }
        valores.push({ origem: o, valor: String(v).trim() });
      } else {
        const m = leituras[o]!.motivos?.[campo];
        if (m) motivos.push(m);
      }
    }

    if (!valores.length) {
      linhas.push({ campo, rotulo, atual, cor: "cinza", motivo: motivos[0] || "Não deu para ler", opcoes: [], escolha: "manter" });
      continue;
    }

    // Trava ANTES de qualquer escolha: algum CPF lido (documento OU carteirinha) já é de outro paciente.
    if (campo === "cpf" && cpfsDeOutros) {
      const dono = valores.map((v) => cpfsDeOutros[soDigitos(v.valor)]).find(Boolean);
      if (dono) {
        linhas.push({
          campo, rotulo, atual, cor: "laranja", travado: true,
          motivo: `Este CPF já é de outro paciente (${dono.name}). Não será gravado.`,
          opcoes: [{ chave: "manter", rotulo: "Manter", valor: atual }], escolha: "manter",
        });
        continue;
      }
    }

    // Documento e carteirinha dizem coisas diferentes: avisa e ela escolhe.
    const distintos = valores.filter((v, i) => valores.findIndex((w) => iguais(campo, w.valor, v.valor)) === i);
    if (distintos.length > 1) {
      const opcoes: Opcao[] = [];
      opcoes.push(atual ? { chave: "manter", rotulo: "Manter", valor: atual } : { chave: "manter", rotulo: "Deixar vazio", valor: null });
      for (const v of distintos) {
        if (atual && iguais(campo, atual, v.valor)) continue;
        opcoes.push({ chave: v.origem, rotulo: ROTULO_ORIGEM[v.origem], valor: v.valor });
      }
      linhas.push({ campo, rotulo, atual, cor: "laranja", motivo: "Documento e carteirinha estão diferentes", opcoes, escolha: null });
      continue;
    }

    const lido = distintos[0].valor;
    if (atual && iguais(campo, atual, lido)) {
      linhas.push({ campo, rotulo, atual, cor: "verde", opcoes: [], escolha: "manter" });
      continue;
    }
    const foto: Opcao = { chave: "foto", rotulo: "Usar o da foto", valor: lido };
    if (!atual) {
      const conferir = EXIGE_CONFERIR.includes(campo);
      linhas.push({
        campo, rotulo, atual, cor: "amarelo", conferir,
        opcoes: [{ chave: "manter", rotulo: "Deixar vazio", valor: null }, foto],
        escolha: conferir ? null : "foto",
      });
    } else {
      linhas.push({ campo, rotulo, atual, cor: "laranja", opcoes: [{ chave: "manter", rotulo: "Manter", valor: atual }, foto], escolha: null });
    }
  }
  return linhas;
}

/** "Usar estes dados" só acende quando todo laranja foi decidido. */
export function podeUsar(linhas: Linha[]): boolean {
  return linhas.every((l) => l.escolha !== null);
}

/** Só o que foi aceito e muda o cadastro. CPF travado ou inválido nunca entra. */
export function dadosAceitos(linhas: Linha[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of linhas) {
    if (l.travado || l.escolha === null || l.escolha === "manter") continue;
    const op = l.opcoes.find((o) => o.chave === l.escolha);
    if (!op || vazio(op.valor)) continue;
    if (l.campo === "cpf" && !cpfValido(op.valor)) continue;
    if (l.atual && iguais(l.campo, l.atual, op.valor)) continue;
    out[l.campo] = l.campo === "cpf" ? soDigitos(op.valor) : String(op.valor);
  }
  return out;
}

export function escolher(linhas: Linha[], campo: string, chave: string): Linha[] {
  return linhas.map((l) => (l.campo === campo && !l.travado ? { ...l, escolha: chave } : l));
}

/** Desfaz o "Conferi": volta a pedir decisão. */
export function desconferir(linhas: Linha[], campo: string): Linha[] {
  return linhas.map((l) => (l.campo === campo && !l.travado ? { ...l, escolha: null } : l));
}

/** Data digitada (DD/MM/AAAA ou AAAA-MM-DD) → AAAA-MM-DD, só se for real e entre 1900 e hoje. */
export function dataDigitada(s: string, hoje: Date = new Date()): string | null {
  const t = (s || "").trim();
  let a: number, m: number, d: number;
  let r = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (r) { d = +r[1]; m = +r[2]; a = +r[3]; }
  else if ((r = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { a = +r[1]; m = +r[2]; d = +r[3]; }
  else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (a < 1900 || dt.getTime() > hoje.getTime()) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Corrigir o valor da foto conta como conferido — se o valor corrigido for válido. */
export function corrigir(linhas: Linha[], campo: string, digitado: string): Linha[] {
  return linhas.map((l) => {
    if (l.campo !== campo || l.travado) return l;
    let valor: string | null = digitado.trim();
    let motivo: string | undefined;
    if (campo === "cpf") {
      valor = cpfValido(valor) ? soDigitos(valor) : null;
      if (!valor) motivo = "CPF com dígito errado";
    } else if (campo === "birthdate") {
      valor = dataDigitada(valor);
      if (!valor) motivo = "Data impossível. Use DD/MM/AAAA";
    } else if (!valor) {
      valor = null;
    }
    const opcoes = l.opcoes.some((o) => o.chave === "foto")
      ? l.opcoes.map((o) => (o.chave === "foto" ? { ...o, rotulo: "Corrigido", valor: valor ?? o.valor } : o))
      : [...l.opcoes, { chave: "foto", rotulo: "Corrigido", valor: valor ?? "" }];
    return { ...l, opcoes, escolha: valor ? "foto" : null, motivo: motivo ?? (valor ? undefined : l.motivo) };
  });
}
