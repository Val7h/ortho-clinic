// Catálogo de remédios da ortopedia/dor pelos NOMES COMERCIAIS (13/10/2026).
//
// Pedido do Valth: "para você saber reconhecer sempre que eu escrever".
// Serve para o sistema decidir sozinho o tipo de receita quando ele escreve a
// marca (ex.: "TROL PAR", "INSIT", "CYMBI") em vez do princípio ativo.
//
// Regras:
// - Só entra marca conferida. A pesquisa automática inventou marcas e errou
//   classificação (disse que dipirona é controlada) — nada daquilo entrou cru.
// - "controle_especial" = receita branca em 2 vias (é o que o OrthoClinic imprime).
// - notificacao "A" = opioide forte: talão AMARELO (Notificação A).
//   notificacao "B" = benzodiazepínico (Rivotril etc.): talão AZUL (Notificação B).
//   O sistema não imprime notificação — só avisa na hora de salvar.
// - Etoricoxibe (Coxeto/Arcoxia) e buprenorfina (Lusanda) em 2 vias: regra do
//   próprio Valth (07/10/2026).
// - Carisoprodol pronto (Torsilax, Tandrilax, Mioflex): receita SIMPLES —
//   RDC 999/2025 pôs a substância na B1, mas o Adendo libera o remédio pronto.

export type TipoReceita = "simples" | "controle_especial";

export interface MedicamentoCatalogo {
  principio: string;
  grupo: "opioide" | "dor crônica" | "anti-inflamatório" | "analgésico" | "relaxante muscular" | "corticoide";
  tipo: TipoReceita;
  notificacao?: "A" | "B";
  marcas: string[]; // minúsculas, sem acento
}

export const MEDICAMENTOS_ORTOPEDIA: MedicamentoCatalogo[] = [
  // ── Opioides ──
  { principio: "Tramadol", grupo: "opioide", tipo: "controle_especial", marcas: ["tramadol", "tramal", "tramadon", "sylador"] },
  { principio: "Tramadol + paracetamol", grupo: "opioide", tipo: "controle_especial", marcas: ["trol par", "trolpar", "ultracet", "paratram"] },
  { principio: "Tramadol + diclofenaco", grupo: "opioide", tipo: "controle_especial", marcas: ["adorlan"] },
  { principio: "Codeína + paracetamol", grupo: "opioide", tipo: "controle_especial", marcas: ["codeina", "codein", "tylex"] },
  { principio: "Buprenorfina (adesivo)", grupo: "opioide", tipo: "controle_especial", marcas: ["buprenorfina", "lusanda", "restiva"] },
  { principio: "Morfina", grupo: "opioide", tipo: "controle_especial", notificacao: "A", marcas: ["morfina", "dimorf"] },
  { principio: "Oxicodona", grupo: "opioide", tipo: "controle_especial", notificacao: "A", marcas: ["oxicodona", "oxycontin"] },
  { principio: "Metadona", grupo: "opioide", tipo: "controle_especial", notificacao: "A", marcas: ["metadona", "mytedom"] },
  { principio: "Tapentadol", grupo: "opioide", tipo: "controle_especial", notificacao: "A", marcas: ["tapentadol", "palexis"] },
  { principio: "Fentanil (adesivo)", grupo: "opioide", tipo: "controle_especial", notificacao: "A", marcas: ["fentanil", "durogesic"] },

  // ── Dor crônica / neuropática ──
  { principio: "Pregabalina", grupo: "dor crônica", tipo: "controle_especial", marcas: ["pregabalina", "lyrica", "prebictal", "insit"] },
  { principio: "Gabapentina", grupo: "dor crônica", tipo: "controle_especial", marcas: ["gabapentina", "neurontin", "gabaneurin", "progresse"] },
  { principio: "Duloxetina", grupo: "dor crônica", tipo: "controle_especial", marcas: ["duloxetina", "cymbalta", "cymbi", "velija"] },
  { principio: "Venlafaxina", grupo: "dor crônica", tipo: "controle_especial", marcas: ["venlafaxina", "efexor", "venlift", "alenthus"] },
  { principio: "Desvenlafaxina", grupo: "dor crônica", tipo: "controle_especial", marcas: ["desvenlafaxina", "pristiq"] },
  { principio: "Amitriptilina", grupo: "dor crônica", tipo: "controle_especial", marcas: ["amitriptilina", "tryptanol", "amytril"] },
  { principio: "Nortriptilina", grupo: "dor crônica", tipo: "controle_especial", marcas: ["nortriptilina", "pamelor"] },
  { principio: "Carbamazepina", grupo: "dor crônica", tipo: "controle_especial", marcas: ["carbamazepina", "tegretol"] },
  { principio: "Clonazepam", grupo: "dor crônica", tipo: "controle_especial", notificacao: "B", marcas: ["clonazepam", "rivotril"] },

  // ── Anti-inflamatórios ──
  { principio: "Etoricoxibe", grupo: "anti-inflamatório", tipo: "controle_especial", marcas: ["etoricoxibe", "arcoxia", "coxeto"] },
  { principio: "Diclofenaco", grupo: "anti-inflamatório", tipo: "simples", marcas: ["diclofenaco", "voltaren", "cataflam"] },
  { principio: "Aceclofenaco", grupo: "anti-inflamatório", tipo: "simples", marcas: ["aceclofenaco", "proflam", "biofenac"] },
  { principio: "Cetoprofeno", grupo: "anti-inflamatório", tipo: "simples", marcas: ["cetoprofeno", "profenid"] },
  { principio: "Cetorolaco", grupo: "anti-inflamatório", tipo: "simples", marcas: ["cetorolaco", "toragesic", "ketto"] },
  { principio: "Ibuprofeno", grupo: "anti-inflamatório", tipo: "simples", marcas: ["ibuprofeno", "alivium", "advil"] },
  { principio: "Naproxeno", grupo: "anti-inflamatório", tipo: "simples", marcas: ["naproxeno", "flanax"] },
  { principio: "Nimesulida", grupo: "anti-inflamatório", tipo: "simples", marcas: ["nimesulida", "nisulid"] },
  { principio: "Meloxicam", grupo: "anti-inflamatório", tipo: "simples", marcas: ["meloxicam", "movatec"] },
  { principio: "Piroxicam", grupo: "anti-inflamatório", tipo: "simples", marcas: ["piroxicam", "feldene"] },
  { principio: "Tenoxicam", grupo: "anti-inflamatório", tipo: "simples", marcas: ["tenoxicam", "tilatil"] },
  { principio: "Celecoxibe", grupo: "anti-inflamatório", tipo: "simples", marcas: ["celecoxibe", "celebra"] },
  { principio: "Etodolaco", grupo: "anti-inflamatório", tipo: "simples", marcas: ["etodolaco", "larc"] },

  // ── Analgésicos ──
  { principio: "Dipirona", grupo: "analgésico", tipo: "simples", marcas: ["dipirona", "novalgina", "anador"] },
  { principio: "Paracetamol", grupo: "analgésico", tipo: "simples", marcas: ["paracetamol", "tylenol"] },

  // ── Relaxantes musculares ──
  { principio: "Ciclobenzaprina", grupo: "relaxante muscular", tipo: "simples", marcas: ["ciclobenzaprina", "miosan", "mirtax"] },
  { principio: "Orfenadrina + dipirona + cafeína", grupo: "relaxante muscular", tipo: "simples", marcas: ["dorflex"] },
  { principio: "Carisoprodol + associações", grupo: "relaxante muscular", tipo: "simples", marcas: ["carisoprodol", "torsilax", "tandrilax", "mioflex"] },
  { principio: "Tiocolchicosídeo", grupo: "relaxante muscular", tipo: "simples", marcas: ["tiocolchicosideo", "coltrax"] },
  { principio: "Tizanidina", grupo: "relaxante muscular", tipo: "simples", marcas: ["tizanidina", "sirdalud"] },
  { principio: "Baclofeno", grupo: "relaxante muscular", tipo: "simples", marcas: ["baclofeno", "lioresal"] },

  // ── Corticoides ──
  { principio: "Dexametasona", grupo: "corticoide", tipo: "simples", marcas: ["dexametasona", "decadron", "dexador", "dexalgen"] },
  { principio: "Betametasona", grupo: "corticoide", tipo: "simples", marcas: ["betametasona", "diprospan", "celestone", "duoflam"] },
  { principio: "Prednisona", grupo: "corticoide", tipo: "simples", marcas: ["prednisona", "meticorten"] },
  { principio: "Prednisolona", grupo: "corticoide", tipo: "simples", marcas: ["prednisolona", "predsim"] },
  { principio: "Deflazacorte", grupo: "corticoide", tipo: "simples", marcas: ["deflazacorte", "calcort"] },
  { principio: "Metilprednisolona", grupo: "corticoide", tipo: "simples", marcas: ["metilprednisolona", "medrol", "solu-medrol", "depo-medrol"] },
];

const semAcento = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Palavra inteira (evita "insit" casar dentro de outra palavra).
function contemTermo(texto: string, termo: string): boolean {
  const esc = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(texto);
}

/** Todos os remédios do catálogo citados no texto (marca ou princípio). */
export function remediosCitados(texto: string): MedicamentoCatalogo[] {
  const t = semAcento(texto);
  return MEDICAMENTOS_ORTOPEDIA.filter((m) => m.marcas.some((marca) => contemTermo(t, marca)));
}

/** O controlado vence: se qualquer remédio citado é controlado, devolve ele. */
export function controladoCitado(texto: string): MedicamentoCatalogo | undefined {
  return remediosCitados(texto).find((m) => m.tipo === "controle_especial");
}

/** Remédios que exigem talão de NOTIFICAÇÃO (A = amarelo; B = azul). */
export function exigeNotificacao(texto: string): MedicamentoCatalogo[] {
  return remediosCitados(texto).filter((m) => m.notificacao === "A" || m.notificacao === "B");
}
