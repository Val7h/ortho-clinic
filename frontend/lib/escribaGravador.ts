// Escriba integrado (fatia 1, 17/11/2026): grava a consulta pela tela do OrthoMedic.
//
// Porta da pagina antiga do Escriba (escriba-clinica/ao_vivo/pagina.html), com o mesmo reforco:
// - pedaco de 10 s, cada um e um arquivo completo;
// - o pedaco fica guardado no aparelho (IndexedDB) ate o servidor confirmar;
// - religa sozinho se o microfone cair, se a aba voltar (iPhone/iPad) ou se a pagina recarregar;
// - um so gravador e um so enviador por aparelho (trava entre abas).
//
// Regra dura: o microfone so liga por CLIQUE neste aparelho (Iniciar, Continuar, Reabrir,
// Ligar ou "Avisei — gravar"). Religar apos recarregar a pagina so vale para a gravacao que
// ESTE aparelho ja tinha ligado. O que vem de fora (servidor, outro aparelho) so pausa ou para.

import { useSyncExternalStore } from "react";
import { api, waitingRoomApi } from "./api";
import { PRE_LIMITE_MS, ItemPre, chavePre, chavesParaPodar, paraSubir } from "./escribaPreBuffer";

export type TipoAparelho = "pc" | "celular" | "ipad";
export type EstadoLocal = "parado" | "gravando" | "pausado";
export type Cor = "v" | "a" | "r" | "c"; // verde no ar, ambar guardando/pausado, vermelho parou, cinza pronto

export interface EstadoGravador {
  estado: EstadoLocal;
  religando: boolean;
  sessaoId: number | null;
  entryId: number | null;
  patientId: number | null;
  pendentes: number;
  cor: Cor;
  msg: string;
  semMicrofone: boolean;
  avisoPendente: number | null; // entryId que espera o clique "Avisei — gravar"
  outraAba: boolean;
  inicioMs: number | null; // inicio do trecho gravando agora
  acumMs: number;          // tempo ja gravado nesta consulta, antes do trecho atual
  preGravando: boolean;    // melhoria 5: depois do Finalizar, grava SO no aparelho para o proximo paciente
  preInicioMs: number | null;
}

export interface SessaoServidor {
  id: number;
  entry_id: number;
  patient_id: number;
  estado: "gravando" | "pausada" | "parada";
  aparelho_ativo: string | null;
  aparelho_tipo: TipoAparelho | null;
  ultimo_sinal: string | null;
  sinal_vivo: boolean;
  ativo: boolean;
  max_seq: number;
  entry_status: string | null;
  pericia?: boolean;
}

// ── E1 (23/11/2026): trava da pericia ──
// Audio de pericia e so da Escriba Pericial e nunca sai da maquina. Motivo/observacao com a
// PALAVRA "pericia" (sem maiuscula nem acento): nao liga, apaga a pre-gravacao e avisa.
// O servidor confere de novo (409) e e quem manda; esta conferencia so evita pedir aviso/microfone.
export const PERICIA_MSG = "Perícia: Escriba da clínica desligada";
export function ehPericia(...textos: (string | null | undefined)[]): boolean {
  return textos.some((t) => !!t && /(^|[^a-z0-9])pericias?($|[^a-z0-9])/.test(
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
}
const ehRecusaPericia = (e: any) => e?.response?.status === 409 && /per[ií]cia/i.test(String(e?.response?.data?.detail || ""));

/** Pericia: para o que estiver gravando aqui, apaga a pre-gravacao e mostra o aviso. Nunca liga nada. */
export async function bloquearPericia(entryId?: number | null) {
  if (pre || E.preGravando) await descartarPre();
  if (E.estado !== "parado" && (entryId == null || E.entryId === entryId)) {
    const sid = E.sessaoId;
    await pararLocal(PERICIA_MSG);
    if (sid != null) escribaGravarApi.estado(sid, "parada").catch(() => {});
  }
  if (entryId != null && E.avisoPendente === entryId) muda({ avisoPendente: null });
  luz("r", PERICIA_MSG);
}

const SEG_MS = 10_000;
const K_APARELHO = "escriba_aparelho";
const K_GRAVANDO = "escriba_gravando";
const kSeq = (sid: number) => `escriba_seq_${sid}`;
const kAuto = () => `escriba_auto_${escopo()}`;

const temJanela = typeof window !== "undefined";

// ── aparelho e usuario ──────────────────────────────────────────────────────
function escopo(): string {
  if (!temJanela) return "anon";
  try {
    const u = JSON.parse(localStorage.getItem("ortho_user") || "null");
    if (u?.id != null) return `u${u.id}`;
  } catch {}
  return "anon";
}

export function aparelhoId(): string {
  if (!temJanela) return "ssr";
  let id = "";
  try { id = localStorage.getItem(K_APARELHO) || ""; } catch {}
  if (!id) {
    const r = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    id = "ap-" + r;
    try { localStorage.setItem(K_APARELHO, id); } catch {}
  }
  return id;
}

export const ehIos = (): boolean =>
  temJanela && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1));

export function tipoDoAparelho(): TipoAparelho {
  if (!temJanela) return "pc";
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1)) return "ipad";
  if (/iPhone|iPod|Android.*Mobile|Mobile/.test(ua)) return "celular";
  if (/Android/.test(ua)) return "ipad"; // tablet Android: mostra como "iPad/tablet"
  return "pc";
}

// Preferencia por medico: ligar sozinho no Iniciar (padrao: ligado).
export function autoLigarAtivo(): boolean {
  try { return localStorage.getItem(kAuto()) !== "0"; } catch { return true; }
}
export function setAutoLigar(v: boolean) {
  try { localStorage.setItem(kAuto(), v ? "1" : "0"); } catch {}
  if (!v && pre) descartarPre("Ligar sozinho desmarcado: pré-gravação parada e apagada.");
  emitir();
}

// ── estado compartilhado (a coluna lilas, o chip e a tela /escriba-gravar leem daqui) ──
let E: EstadoGravador = {
  estado: "parado", religando: false, sessaoId: null, entryId: null, patientId: null, pendentes: 0,
  cor: "c", msg: "", semMicrofone: false, avisoPendente: null, outraAba: false, inicioMs: null, acumMs: 0,
  preGravando: false, preInicioMs: null,
};
const ouvintes = new Set<() => void>();
function emitir() { ouvintes.forEach((f) => { try { f(); } catch {} }); }
function muda(p: Partial<EstadoGravador>) { E = { ...E, ...p }; emitir(); }
function luz(cor: Cor, msg?: string) { muda(msg === undefined ? { cor } : { cor, msg }); }

export function useEscribaGravador(): EstadoGravador {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
    () => E,
    () => E,
  );
}
export const lerEstado = () => E;

// ── API do Escriba no servidor do OrthoMedic ─────────────────────────────────
export const escribaGravarApi = {
  atendimentoAtual: () => api.get("/escriba/atendimento-atual").then((r) => r.data as {
    entry: { id: number; patient_id: number; patient_name: string; status: string; clinic_id: number | null } | null;
    sessao: SessaoServidor | null; consentimento: boolean; pericia?: boolean;
  }),
  consentimento: (patientId: number) =>
    api.get(`/escriba/consentimento/${patientId}`).then((r) => r.data as { tem: boolean; criado_em: string | null }),
  registrarConsentimento: (patientId: number, entryId: number) =>
    api.post("/escriba/consentimento", { patient_id: patientId, entry_id: entryId }).then((r) => r.data),
  sessaoDaEntrada: (entryId: number) =>
    api.get(`/escriba/sessoes/entrada/${entryId}`, { params: { aparelho: aparelhoId() } }).then((r) => r.data as SessaoServidor | null),
  ligar: (entryId: number) =>
    api.post("/escriba/sessoes", { entry_id: entryId, aparelho: aparelhoId(), tipo: tipoDoAparelho() }).then((r) => r.data as SessaoServidor),
  sinal: (sid: number, gravando: boolean) =>
    api.post(`/escriba/sessoes/${sid}/sinal`, { aparelho: aparelhoId(), gravando }, { timeout: 10_000 }).then((r) => r.data as SessaoServidor),
  estado: (sid: number, estado: "pausada" | "parada") =>
    api.post(`/escriba/sessoes/${sid}/estado`, { estado, aparelho: aparelhoId() }).then((r) => r.data as SessaoServidor),
};

// ── fila persistente no aparelho (plano B: sem rede, guarda e manda depois) ──
interface ItemFila { k: string; sid: number; seq: number; ext: string; t_ms: number; blob: Blob; mem?: boolean }
let dbp: Promise<IDBDatabase> | null = null;
function banco(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((ok, er) => {
      const r = indexedDB.open("orthomedic_escriba", 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("f")) d.createObjectStore("f", { keyPath: "k" });
        if (!d.objectStoreNames.contains("pre")) d.createObjectStore("pre", { keyPath: "k" }); // pre-gravacao: NUNCA sobe sozinha
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => er(r.error);
    });
  }
  return dbp;
}
async function guarda(it: ItemFila) {
  const d = await banco();
  return new Promise<void>((ok, er) => {
    const t = d.transaction("f", "readwrite");
    t.objectStore("f").put(it);
    t.oncomplete = () => ok();
    t.onerror = t.onabort = () => er(t.error || new Error("IndexedDB"));
  });
}
async function apaga(k: string) {
  const d = await banco();
  return new Promise<void>((ok) => { const t = d.transaction("f", "readwrite"); t.objectStore("f").delete(k); t.oncomplete = () => ok(); t.onerror = () => ok(); });
}
async function todos(): Promise<ItemFila[]> {
  const d = await banco();
  return new Promise((ok) => { const r = d.transaction("f").objectStore("f").getAll(); r.onsuccess = () => ok(r.result as ItemFila[]); r.onerror = () => ok([]); });
}
async function conta(): Promise<number> {
  const d = await banco();
  return new Promise((ok) => { const r = d.transaction("f").objectStore("f").count(); r.onsuccess = () => ok(r.result); r.onerror = () => ok(0); });
}
// pre-gravacao (store "pre"): fica so no aparelho ate o proximo Iniciar com aviso
async function guardaPre(it: ItemPre) {
  const d = await banco();
  return new Promise<void>((ok, er) => {
    const t = d.transaction("pre", "readwrite");
    t.objectStore("pre").put(it);
    t.oncomplete = () => ok();
    t.onerror = t.onabort = () => er(t.error || new Error("IndexedDB"));
  });
}
async function todosPre(): Promise<ItemPre[]> {
  const d = await banco();
  return new Promise((ok) => { const r = d.transaction("pre").objectStore("pre").getAll(); r.onsuccess = () => ok(r.result as ItemPre[]); r.onerror = () => ok([]); });
}
async function apagaPre(ks: string[]) {
  if (!ks.length) return;
  const d = await banco();
  return new Promise<void>((ok) => { const t = d.transaction("pre", "readwrite"); ks.forEach((k) => t.objectStore("pre").delete(k)); t.oncomplete = () => ok(); t.onerror = () => ok(); });
}
async function limpaPre() {
  try {
    const d = await banco();
    await new Promise<void>((ok) => { const t = d.transaction("pre", "readwrite"); t.objectStore("pre").clear(); t.oncomplete = () => ok(); t.onerror = () => ok(); });
  } catch {}
}
const chave = (sid: number, seq: number) => `${String(sid).padStart(8, "0")}_${String(seq).padStart(6, "0")}`;
let memoria: ItemFila[] = []; // se o IndexedDB falhar, o pedaco fica na memoria e sobe do mesmo jeito
async function pendentes(): Promise<number> {
  let n = memoria.length;
  try { n += await conta(); } catch {}
  return n;
}

// Trava entre abas: so uma aba deste aparelho envia, e so uma grava.
function comTrava(nome: string, f: () => Promise<void>): Promise<boolean> {
  const locks = temJanela ? (navigator as any).locks : null;
  if (!locks?.request) return f().then(() => true);
  return locks.request(nome, { ifAvailable: true }, async (lock: any) => {
    if (!lock) return false;
    await f();
    return true;
  });
}

let enviando = false;
export async function enviaFila(): Promise<void> {
  if (enviando || !temJanela || !localStorage.getItem("ortho_token")) return;
  enviando = true;
  try {
    await comTrava("orthomedic-escriba-envio", async () => {
      let lista: ItemFila[] = [...memoria];
      try { lista = lista.concat(await todos()); } catch {}
      lista.sort((a, b) => (a.k < b.k ? -1 : 1));
      for (const it of lista) {
        try {
          await api.post(`/escriba/sessoes/${it.sid}/pedacos`, it.blob, {
            params: { aparelho: aparelhoId(), seq: it.seq, ext: it.ext, t_ms: it.t_ms },
            headers: { "Content-Type": "application/octet-stream" },
            timeout: 60_000,
          });
        } catch (e: any) {
          const st = e?.response?.status;
          // 404 (sessao de outra conta ou apagada), 413 e 422: nunca vai entrar; nao trava a fila por isso.
          // 409 de pericia (E1): o audio nao pode sair daqui; apaga o pedaco e para a gravacao desta sessao.
          const pericia = ehRecusaPericia(e);
          if (pericia && E.sessaoId === it.sid && E.estado !== "parado") bloquearPericia(E.entryId);
          if (!(st === 404 || st === 413 || st === 422 || pericia)) break;
        }
        if (it.mem) memoria = memoria.filter((x) => x !== it);
        else await apaga(it.k);
      }
    });
  } catch {}
  enviando = false;
  try { muda({ pendentes: await pendentes() }); } catch {}
}

// ── gravador ─────────────────────────────────────────────────────────────────
let stream: MediaStream | null = null;
let rec: (MediaRecorder & { esperado?: boolean; guardado?: Promise<void> }) | null = null;
let seq = 0;
let ultPedaco = 0, falhas = 0, mudo = 0, ultMudo = 0, escondidoEm = 0;
let timerCiclo: any = null, timerVigia: any = null, timerSinal: any = null, timerPing: any = null;
let ctxSom: AudioContext | null = null, analisador: AnalyserNode | null = null, fonte: MediaStreamAudioSourceNode | null = null;
let wake: any = null;
let soltarTrava: (() => void) | null = null;

function mime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
function paraRec(r: typeof rec): Promise<unknown> {
  if (!r) return Promise.resolve();
  r.esperado = true;
  try { if (r.state !== "inactive") r.stop(); } catch {}
  return Promise.race([r.guardado || Promise.resolve(), espera(4000)]);
}
const micVivo = () => !!(stream && stream.getAudioTracks().length && stream.getAudioTracks().every((t) => t.readyState === "live"));
const saudavel = () => micVivo() && !stream!.getAudioTracks().some((t) => t.muted) && !!rec && rec.state === "recording";

function novoPedaco() {
  if (!stream || E.sessaoId == null) return;
  const m = mime(), ext = m.includes("mp4") ? "m4a" : "webm";
  const r = new MediaRecorder(stream, m ? { mimeType: m } : undefined) as NonNullable<typeof rec>;
  const partes: Blob[] = [];
  const meuSid = E.sessaoId;
  r.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
  r.onerror = () => { if (r === rec && E.estado === "gravando") retoma("erro do gravador"); };
  let pronto: () => void = () => {};
  r.guardado = new Promise<void>((ok) => { pronto = ok; });
  r.onstop = async () => {
    const blob = new Blob(partes, { type: m || "audio/webm" });
    if (blob.size) { // o numero so sai aqui, com o audio na mao: pedaco vazio nao queima seq
      const meuSeq = seq++;
      const it: ItemFila = { k: chave(meuSid, meuSeq), sid: meuSid, seq: meuSeq, ext, t_ms: Date.now(), blob };
      ultPedaco = Date.now();
      try { await guarda(it); localStorage.setItem(kSeq(meuSid), String(seq)); }
      catch (e: any) { memoria.push({ ...it, mem: true }); luz("r", "Não consegui guardar o pedaço no aparelho: " + (e?.message || e)); }
    }
    pronto();
    enviaFila();
    if (!r.esperado && r === rec && E.estado === "gravando") retoma("o gravador parou sozinho");
  };
  r.start();
  rec = r;
}
function cicla() {
  if (E.estado !== "gravando" || E.religando || !rec) return;
  paraRec(rec);
  try { novoPedaco(); } catch { retoma("o gravador não reabriu"); }
}

async function ligaMic() {
  try { stream && stream.getTracks().forEach((t) => t.stop()); } catch {}
  const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
  stream = s; mudo = 0;
  s.getAudioTracks().forEach((t) => { t.onended = () => { if (stream === s && E.estado === "gravando") retoma("o microfone desligou"); }; });
  try { wake = await (navigator as any).wakeLock?.request("screen"); } catch {}
  try {
    if (!ctxSom) ctxSom = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctxSom!.resume?.();
    try { fonte?.disconnect(); } catch {}
    analisador = ctxSom!.createAnalyser(); analisador.fftSize = 1024;
    fonte = ctxSom!.createMediaStreamSource(s); fonte.connect(analisador);
  } catch { analisador = null; }
}
function soltaMic() {
  try { stream && stream.getTracks().forEach((t) => t.stop()); } catch {}
  stream = null;
  try { wake?.release?.(); } catch {}
  wake = null; analisador = null;
}

/** Tempo gravado nesta consulta, em segundos. */
export function segundosGravados(): number {
  return Math.floor((E.acumMs + (E.inicioMs ? Date.now() - E.inicioMs : 0)) / 1000);
}

/** Nivel do microfone de 0 a 1 (para o medidor da tela de gravar). */
export function nivelMic(): number {
  if (!analisador || E.estado !== "gravando") return 0;
  const buf = new Uint8Array(analisador.fftSize);
  analisador.getByteTimeDomainData(buf);
  let s = 0, max = 0;
  for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x; max = Math.max(max, Math.abs(x)); }
  const db = 20 * Math.log10(Math.max(1e-4, Math.sqrt(s / buf.length) * 1.8 + max * 0.25));
  return Math.max(0, Math.min(1, (db + 54) / 54));
}

function salvaFlag() {
  try {
    localStorage.setItem(K_GRAVANDO, JSON.stringify({ sessaoId: E.sessaoId, entryId: E.entryId, patientId: E.patientId, user: escopo() }));
  } catch {}
}
function tiraFlag() { try { localStorage.removeItem(K_GRAVANDO); } catch {} }

function paraTimers() {
  clearInterval(timerCiclo); clearInterval(timerVigia); clearInterval(timerSinal); clearInterval(timerPing);
  timerCiclo = timerVigia = timerSinal = timerPing = null;
}

async function pegaTravaGravador(): Promise<boolean> {
  if (soltarTrava) return true;
  const locks = temJanela ? (navigator as any).locks : null;
  if (!locks?.request) return true;
  return new Promise<boolean>((ok) => {
    locks.request("orthomedic-escriba-gravador", { ifAvailable: true }, (lock: any) => {
      if (!lock) { ok(false); return undefined; }
      ok(true);
      return new Promise<void>((solta) => { soltarTrava = () => { soltarTrava = null; solta(); }; });
    });
  });
}

function msgMicErro(e: any): string {
  const n = e?.name || "";
  if (n === "NotFoundError" || n === "OverconstrainedError" || n === "NotReadableError")
    return "Este aparelho não tem microfone livre. Grave pelo celular ou iPad: abra /escriba-gravar logado como médico, com a ficha aberta aqui.";
  if (n === "NotAllowedError" || n === "SecurityError")
    return "O navegador bloqueou o microfone. Libere o microfone para este site e aperte Ligar de novo.";
  return "Não consegui o microfone: " + (e?.message || n || "erro");
}

async function comeca(sessao: SessaoServidor) {
  let trava = await pegaTravaGravador();
  if (!trava) {
    // outra aba deste aparelho pode estar so pre-gravando: pede para ela soltar e tenta de novo
    try { canal()?.postMessage("solta-pre"); } catch {}
    await espera(1500);
    trava = await pegaTravaGravador();
  }
  if (!trava) {
    muda({ outraAba: true });
    luz("a", "Outra aba deste aparelho já está gravando. Use aquela aba.");
    throw new Error("outra aba");
  }
  if (rec && rec.state !== "inactive") await paraRec(rec);
  // nunca repetir um numero que o aparelho ou o servidor ja tem (o servidor ignora seq repetido)
  let s = 0;
  try { s = +(localStorage.getItem(kSeq(sessao.id)) || 0); } catch {}
  s = Math.max(s, (sessao.max_seq ?? -1) + 1);
  try { for (const it of [...memoria, ...(await todos())]) if (it.sid === sessao.id && it.seq >= s) s = it.seq + 1; } catch {}
  // Melhoria 5: a pre-gravacao entra PRIMEIRO nesta sessao (o servidor so cria a sessao com o aviso CFM registrado).
  let reusaMic = false;
  if (pre) {
    s += await consumirPre(sessao.id, s);
    reusaMic = micVivo(); // continuacao do mesmo clique: o microfone ja esta aberto, sem buraco
    try { localStorage.setItem(kSeq(sessao.id), String(s)); } catch {}
  }
  seq = s;
  const mesmaConsulta = E.entryId === sessao.entry_id;
  muda({ sessaoId: sessao.id, entryId: sessao.entry_id, patientId: sessao.patient_id, outraAba: false, acumMs: mesmaConsulta ? E.acumMs : 0 });
  try {
    if (!reusaMic) await ligaMic();
  } catch (e) {
    soltarTrava?.();
    throw e;
  }
  falhas = 0; ultPedaco = Date.now();
  muda({ estado: "gravando", religando: false, semMicrofone: false, avisoPendente: null, inicioMs: Date.now() });
  salvaFlag();
  novoPedaco();
  paraTimers();
  timerCiclo = setInterval(cicla, SEG_MS);
  timerVigia = setInterval(vigia, 3000);
  timerSinal = setInterval(darSinal, 10_000);
  // Ping de atividade a cada minuto: falando sem digitar, a consulta nao se suspende sozinha (15 min).
  timerPing = setInterval(() => { if (E.estado === "gravando" && E.entryId) waitingRoomApi.ping(E.entryId); }, 60_000);
  if (E.entryId) waitingRoomApi.ping(E.entryId);
}

async function retoma(motivo: string) {
  if (E.religando || E.estado !== "gravando" || (ehIos() && document.hidden)) return; // no iOS so pega o microfone com a aba na frente
  muda({ religando: true });
  clearInterval(timerCiclo);
  luz("a", `Religando o microfone (${motivo})…`);
  const velho = rec; rec = null; await paraRec(velho);
  try {
    await ligaMic();
    if (E.estado !== "gravando") { soltaMic(); throw new Error("parado no meio"); }
    ultPedaco = Date.now(); novoPedaco(); timerCiclo = setInterval(cicla, SEG_MS); falhas = 0;
    luz("v", `A gravação caiu e voltou sozinha (${motivo}). Pode seguir.`);
  } catch (e: any) {
    if (E.estado === "gravando") {
      falhas++;
      if (falhas >= 6) { pararLocal("Não consegui religar o microfone. Aperte Ligar de novo."); luz("r"); }
      else luz("a", `Tentando religar o microfone (${falhas}ª vez)…`);
    }
  }
  muda({ religando: false });
}

async function vigia() {
  if (E.estado !== "gravando" || E.religando) return;
  const fx = stream ? stream.getAudioTracks() : [];
  const morto = !fx.length || fx.some((t) => t.readyState !== "live") || !rec || rec.state !== "recording";
  mudo = fx.some((t) => t.muted) ? mudo + 1 : 0;                         // mudo por ~6 s = o iOS tomou o microfone
  const semPedaco = !document.hidden && Date.now() - ultPedaco > 2 * SEG_MS + 5000;
  const mudoMorto = mudo >= 2 && Date.now() - ultMudo > 60_000;
  if (mudoMorto) ultMudo = Date.now();
  if (morto || mudoMorto || semPedaco) { retoma(morto ? "o gravador parou" : mudoMorto ? "o microfone ficou mudo" : "nenhum pedaço novo"); return; }
  const n = await pendentes();
  muda({ pendentes: n });
  if (n > 1) luz("a", `Guardando no aparelho: ${n} pedaço(s) pendente(s). Envia sozinho quando a conexão voltar.`);
  else luz("v", "Gravando. O áudio está chegando ao servidor.");
}

async function darSinal() {
  if (E.sessaoId == null || E.estado !== "gravando") return;
  try {
    const s = await escribaGravarApi.sinal(E.sessaoId, true);
    seguirServidor(s);
  } catch {}
}

/** O que vem do servidor so pode pausar ou parar. */
function seguirServidor(s: SessaoServidor | null) {
  if (!s || s.id !== E.sessaoId || E.estado === "parado") return;
  if (s.pericia) { bloquearPericia(s.entry_id); return; }
  if (!s.ativo && s.estado === "gravando") {
    const onde = s.aparelho_tipo === "pc" ? "no PC" : s.aparelho_tipo === "ipad" ? "no iPad" : "no celular";
    pararLocal(`A gravação passou para outro aparelho (${onde}).`);
    return;
  }
  // Finalizar (entrada "attended") pode virar pre-gravacao; Parar em outro aparelho, nao.
  if (s.estado === "parada") { pararLocal("Consulta finalizada: gravação parada.", s.entry_status === "attended"); return; }
  if (s.estado === "pausada" && E.estado === "gravando") pausarLocal("Consulta suspensa: gravação pausada. Para voltar, aperte Ligar.");
}

function fechaTrecho(): Partial<EstadoGravador> {
  return { acumMs: E.acumMs + (E.inicioMs ? Date.now() - E.inicioMs : 0), inicioMs: null };
}

async function pausarLocal(msg: string) {
  paraTimers();
  muda({ estado: "pausado", ...fechaTrecho() });
  tiraFlag();
  const r = rec; rec = null;
  try { await paraRec(r); } catch {}
  soltaMic();
  soltarTrava?.();
  luz("a", msg);
  enviaFila();
}

async function pararLocal(msg: string, preGravar = false) {
  // pre-gravacao so como continuacao de uma gravacao que ESTE aparelho fazia (clique), e com "ligar sozinho"
  const continua = preGravar && msg !== PERICIA_MSG && E.estado === "gravando" && autoLigarAtivo() && micVivo() && !(temJanela && ehIos() && document.hidden);
  const corte = Date.now(); // tudo o que foi gravado antes daqui e do paciente que saiu
  paraTimers();
  const r = rec; rec = null;
  muda({ estado: "parado", ...fechaTrecho() });
  tiraFlag();
  try { await paraRec(r); } catch {}
  if (continua && E.estado === "parado" && micVivo()) {
    await iniciarPre(corte);
    luz("c", msg + " Pré-gravando só neste aparelho para o próximo paciente.");
  } else {
    soltaMic();
    soltarTrava?.();
    luz("c", msg);
  }
  enviaFila();
}

// ── melhoria 5: pre-gravacao entre pacientes (so no aparelho) ────────────────
// Depois do Finalizar, com "ligar sozinho" marcado, o microfone segue aberto (continuacao do clique)
// e os pedacos vao para o store "pre" do IndexedDB, NUNCA para a fila de envio. No proximo Iniciar
// com aviso CFM, os ultimos ate 3 min entram primeiro na sessao nova. Sem Iniciar em 3 min, Parar,
// aba fechada ou sem aviso: apaga tudo.
let pre: { corte: number; n: number } | null = null;
let recPre: (MediaRecorder & { descartar?: boolean; guardado?: Promise<void> }) | null = null;
let timerPreCiclo: any = null, timerPreVigia: any = null, timerPreFim: any = null;
let bc: BroadcastChannel | null = null;
function canal(): BroadcastChannel | null {
  if (!bc && temJanela && typeof BroadcastChannel !== "undefined") bc = new BroadcastChannel("orthomedic-escriba");
  return bc;
}

function paraTimersPre() {
  clearInterval(timerPreCiclo); clearInterval(timerPreVigia); clearTimeout(timerPreFim);
  timerPreCiclo = timerPreVigia = timerPreFim = null;
}

function novoPedacoPre() {
  if (!stream || !pre) return;
  const m = mime(), ext = m.includes("mp4") ? "m4a" : "webm";
  const r = new MediaRecorder(stream, m ? { mimeType: m } : undefined) as NonNullable<typeof recPre>;
  const partes: Blob[] = [];
  const meuCorte = pre.corte, ini = Date.now();
  r.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
  let pronto: () => void = () => {};
  r.guardado = new Promise<void>((ok) => { pronto = ok; });
  r.onstop = async () => {
    const blob = new Blob(partes, { type: m || "audio/webm" });
    if (blob.size && !r.descartar && pre && pre.corte === meuCorte && ini >= meuCorte) {
      const n = pre.n++;
      try { await guardaPre({ k: chavePre(ini, n), ini_ms: ini, t_ms: Date.now(), ext, blob, corte: meuCorte }); } catch {}
    }
    pronto();
  };
  r.start();
  recPre = r;
}

async function iniciarPre(corte: number) {
  paraTimersPre();
  pre = { corte, n: 0 };
  await limpaPre(); // nada de pre-gravacao antiga
  if (!pre || pre.corte !== corte) return;
  try { novoPedacoPre(); } catch { await descartarPre(); return; }
  muda({ preGravando: true, preInicioMs: corte });
  timerPreCiclo = setInterval(() => {
    if (!pre) return;
    const velho = recPre;
    if (velho) { try { if (velho.state !== "inactive") velho.stop(); } catch {} }
    try { novoPedacoPre(); } catch { descartarPre("O gravador parou: pré-gravação apagada."); }
  }, SEG_MS);
  timerPreVigia = setInterval(async () => {
    if (!pre) return;
    if (!micVivo() || !recPre || recPre.state !== "recording") { descartarPre("O microfone parou: pré-gravação apagada."); return; }
    try { await apagaPre(chavesParaPodar(await todosPre(), pre.corte, Date.now())); } catch {} // o mais velho se descarta
  }, 3000);
  timerPreFim = setTimeout(() => {
    if (pre && pre.corte === corte) descartarPre(`${Math.round(PRE_LIMITE_MS / 60_000)} min sem Iniciar Consulta: pré-gravação parada e apagada.`);
  }, PRE_LIMITE_MS);
}

/** Para a pre-gravacao e apaga tudo (Parar, 3 min sem Iniciar, aba fechada, sem aviso). */
export async function descartarPre(msg?: string) {
  if (!pre && !recPre && !E.preGravando) return;
  pre = null;
  paraTimersPre();
  const r = recPre; recPre = null;
  if (r) { r.descartar = true; try { if (r.state !== "inactive") r.stop(); } catch {} }
  await limpaPre();
  if (E.estado === "parado") { soltaMic(); soltarTrava?.(); }
  muda({ preGravando: false, preInicioMs: null });
  if (msg) luz("c", msg);
}

/** Passa a pre-gravacao para a fila da sessao nova, numerada antes dos pedacos novos. Devolve quantos. */
async function consumirPre(sid: number, seqInicial: number): Promise<number> {
  if (!pre) return 0;
  const corte = pre.corte;
  paraTimersPre();
  const r = recPre; recPre = null;
  if (r) { try { if (r.state !== "inactive") r.stop(); } catch {} await Promise.race([r.guardado || Promise.resolve(), espera(4000)]); }
  let n = 0;
  try {
    const lista = paraSubir(await todosPre(), corte, Date.now(), sid, seqInicial);
    for (const { item, seq: sq } of lista) {
      const it: ItemFila = { k: chave(sid, sq), sid, seq: sq, ext: item.ext, t_ms: item.t_ms, blob: item.blob };
      try { await guarda(it); } catch { memoria.push({ ...it, mem: true }); }
      n++;
    }
  } catch {}
  pre = null;
  await limpaPre();
  muda({ preGravando: false, preInicioMs: null });
  return n;
}

/** Segundos de pre-gravacao (para a linha discreta na coluna). */
export function segundosPre(): number {
  return E.preInicioMs ? Math.floor((Date.now() - E.preInicioMs) / 1000) : 0;
}

// ── o que as telas chamam ────────────────────────────────────────────────────

/** Liga a gravacao NESTE aparelho. So chamar a partir de um clique. */
export async function ligarPorClique(entryId: number, patientId: number): Promise<boolean> {
  try {
    // outra consulta gravando aqui: pausa aquela antes (a sessao dela continua para depois)
    if (E.estado !== "parado" && E.entryId !== entryId && E.sessaoId != null) {
      const velha = E.sessaoId;
      await pausarLocal("Trocando de paciente.");
      escribaGravarApi.estado(velha, "pausada").catch(() => {});
    }
    luz("a", "Ligando o microfone…");
    const s = await escribaGravarApi.ligar(entryId);
    await comeca(s);
    luz("v", "Gravando neste aparelho. Mantenha esta tela aberta.");
    return true;
  } catch (e: any) {
    const st = e?.response?.status;
    if (ehRecusaPericia(e)) {
      if (pre || E.preGravando) await descartarPre();
      muda({ religando: false, avisoPendente: null });
      luz("r", PERICIA_MSG);
      return false;
    }
    if (st === 409 && /aviso/i.test(e?.response?.data?.detail || "")) {
      muda({ avisoPendente: entryId, entryId, patientId });
      luz("c", "Falta o aviso de gravação deste paciente.");
      return false;
    }
    // (sem aviso, acima, a pre-gravacao espera o "Avisei - gravar"; o "Agora nao" apaga)
    if (pre) await descartarPre();
    if (e?.message === "outra aba") return false;
    const sem = !!e?.name;
    muda({ estado: "parado", religando: false, semMicrofone: sem && e.name !== "NotAllowedError" });
    tiraFlag();
    luz("r", e?.response ? (e.response.data?.detail || "O servidor recusou a gravação.") : msgMicErro(e));
    return false;
  }
}

/** O clique "Avisei — gravar": registra o aviso CFM e liga o microfone (o mesmo gesto). */
export async function aviseiEGravar(entryId: number, patientId: number): Promise<boolean> {
  try {
    await escribaGravarApi.registrarConsentimento(patientId, entryId);
  } catch {
    luz("r", "Não consegui registrar o aviso. Tente de novo.");
    return false;
  }
  muda({ avisoPendente: null });
  return ligarPorClique(entryId, patientId);
}

export function pedirAviso(entryId: number, patientId: number) {
  muda({ avisoPendente: entryId, entryId: E.estado === "parado" ? entryId : E.entryId, patientId: E.estado === "parado" ? patientId : E.patientId });
}
export function cancelarAviso() {
  muda({ avisoPendente: null });
  if (pre) descartarPre("Sem aviso de gravação: pré-gravação apagada.");
}

/** Pausar por clique (ou pelo Suspender do PC). */
export async function pausar() {
  if (E.estado !== "gravando" || E.sessaoId == null) return;
  const sid = E.sessaoId;
  await pausarLocal("Pausado. Para voltar, aperte Ligar.");
  escribaGravarApi.estado(sid, "pausada").catch(() => {});
}

/** Parar de vez (Finalizar ou clique em Parar). Finalizar com "ligar sozinho" pode virar pre-gravacao. */
export async function parar(msg = "Gravação parada.", opcoes?: { preGravar?: boolean }) {
  if (E.estado === "parado" && pre) await descartarPre();
  if (E.sessaoId == null) return;
  const sid = E.sessaoId;
  if (E.estado !== "parado") await pararLocal(msg, !!opcoes?.preGravar);
  escribaGravarApi.estado(sid, "parada").catch(() => {});
}

// ── religar sozinho: aba volta para a frente, pagina recarregou ──────────────
let autoPendente = false;
async function autoRetoma() {
  autoPendente = false;
  if (E.estado !== "parado") return;
  let f: { sessaoId: number; entryId: number; patientId: number; user: string } | null = null;
  try { f = JSON.parse(localStorage.getItem(K_GRAVANDO) || "null"); } catch {}
  if (!f || !f.sessaoId || f.user !== escopo() || !localStorage.getItem("ortho_token")) return;
  if (document.hidden) { autoPendente = true; return; }
  try {
    const s = await escribaGravarApi.sinal(f.sessaoId, false);
    if (s.pericia) { tiraFlag(); await bloquearPericia(); return; }
    if (s.estado !== "gravando" || !s.ativo || s.entry_status !== "attending") { tiraFlag(); return; }
    luz("a", "A página recarregou: religando a gravação…");
    await comeca(s);
    luz("v", "A página recarregou e a gravação voltou sozinha. Pode seguir.");
  } catch (e: any) {
    if (e?.message === "outra aba") return;
    if (e?.response) { tiraFlag(); return; }
    muda({ estado: "parado" });
    luz("r", "A página recarregou e a gravação parou. Aperte Ligar.");
  }
}

let iniciado = false;
function iniciar() {
  if (iniciado || !temJanela) return;
  iniciado = true;
  // religada sem toque: o iOS deixa o som suspenso ate o primeiro toque
  ["touchend", "click"].forEach((ev) => document.addEventListener(ev, () => { try { ctxSom?.state === "suspended" && ctxSom.resume(); } catch {} }, { passive: true }));
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && E.estado === "gravando") {
      try { wake = await (navigator as any).wakeLock?.request("screen"); } catch {}
      // no iPhone/iPad o microfone morre em segundo plano; ao voltar, religa sozinho (mesma sessao, seq continua)
      if (!saudavel() || (ehIos() && Date.now() - escondidoEm > 1500)) retoma("a aba voltou para a frente");
    } else if (document.visibilityState === "visible" && autoPendente) {
      autoRetoma();
    } else if (document.visibilityState === "hidden") {
      escondidoEm = Date.now();
      if (E.estado === "gravando" && ehIos()) luz("a", "Aba escondida: no iPhone e no iPad a gravação para. Ao voltar para esta aba, ela religa sozinha.");
    }
  });
  // Pre-gravacao nao sobrevive a aba fechada/recarregada: ao abrir, apaga o que sobrou (se nenhuma aba grava agora).
  (async () => {
    try {
      const locks = (navigator as any).locks;
      const q = locks?.query ? await locks.query() : null;
      const ocupado = !!q?.held?.some((l: any) => l.name === "orthomedic-escriba-gravador");
      if (!ocupado) await limpaPre();
    } catch {}
  })();
  window.addEventListener("pagehide", () => { if (pre) descartarPre(); });
  try {
    const c = canal();
    if (c) c.onmessage = (ev) => {
      if (ev.data === "solta-pre" && pre && E.estado === "parado") descartarPre("Outra aba deste aparelho começou a gravar: pré-gravação apagada.");
    };
  } catch {}
  setInterval(enviaFila, 5000);
  pendentes().then((n) => muda({ pendentes: n })).catch(() => {});
  setTimeout(autoRetoma, 400);
}
if (temJanela) setTimeout(iniciar, 0);
