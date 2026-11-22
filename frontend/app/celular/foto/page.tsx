"use client";

// App do celular (22/11/2026): foto do DOCUMENTO PESSOAL e da CARTEIRINHA DO PLANO.
// 1) escolhe o paciente  2) tira as fotos  3) "Confira a leitura"  4) "Usar estes dados".
// Nada é guardado antes do último toque. As fotos vão para as pastas "Documento
// pessoal" e "Carteirinha do plano" da aba Documentos (pasta protegida, só com login)
// e o cadastro recebe só o que foi aceito.

import { useEffect, useRef, useState } from "react";
import { api, msgErro, patientsApi, waitingRoomApi } from "@/lib/api";
import { useLoginCelular, pegarPid, reduzirFoto } from "@/lib/celular";
import {
  montarLinhas, podeUsar, dadosAceitos, escolher, formatar, soDigitos, cpfValido,
  type Linha, type Leitura, type Origem,
} from "@/lib/conferirLeitura";

type Paciente = { id: number; name: string; cpf?: string | null; birthdate?: string | null; [k: string]: any };
type Foto = { arquivo: File; previa: string; estado: "lendo" | "lida" | "falhou"; leitura?: Leitura; erro?: string };

const DOCS: { tipo: Origem; titulo: string; emoji: string }[] = [
  { tipo: "identity", titulo: "Documento pessoal", emoji: "🪪" },
  { tipo: "insurance_card", titulo: "Carteirinha do plano", emoji: "💳" },
];

const COR: Record<string, string> = {
  amarelo: "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/40",
  verde: "border-green-500 bg-green-50 dark:bg-green-950/40",
  laranja: "border-orange-500 bg-orange-50 dark:bg-orange-950/40",
  cinza: "border-slate-300 bg-slate-100 dark:bg-slate-800",
};
const SELO: Record<string, string> = { amarelo: "Cadastro vazio", verde: "Igual", laranja: "Diferente", cinza: "Não leu" };

export default function CelularFoto() {
  const { pronto } = useLoginCelular();
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [erroPaciente, setErroPaciente] = useState("");
  const [fotos, setFotos] = useState<Partial<Record<Origem, Foto>>>({});
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [cpfDeOutro, setCpfDeOutro] = useState<{ id: number; name: string } | null>(null);
  const [checandoCpf, setChecandoCpf] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  // paciente vindo do ?pid=
  useEffect(() => {
    if (!pronto) return;
    const pid = pegarPid();
    if (pid) {
      patientsApi.get(pid).then(setPaciente).catch((e) => setErroPaciente(msgErro(e, "Paciente não encontrado.")));
    }
  }, [pronto]);

  const leituras: Partial<Record<Origem, Leitura>> = {};
  for (const d of DOCS) if (fotos[d.tipo]?.leitura) leituras[d.tipo] = fotos[d.tipo]!.leitura;
  const chaveLeituras = JSON.stringify(leituras);

  // CPF lido que já é de OUTRO paciente: confere antes de liberar o botão.
  useEffect(() => {
    if (!paciente) return;
    const lidos = Object.values(leituras).map((l) => soDigitos(l?.campos?.cpf)).filter((c) => cpfValido(c));
    const cpf = lidos.find((c) => c !== soDigitos(paciente.cpf));
    if (!cpf) { setCpfDeOutro(null); return; }
    let vivo = true;
    setChecandoCpf(true);
    patientsApi.list(cpf)
      .then((lista: Paciente[]) => {
        if (!vivo) return;
        const outro = (lista || []).find((p) => p.id !== paciente.id && soDigitos(p.cpf) === cpf);
        setCpfDeOutro(outro ? { id: outro.id, name: outro.name } : null);
      })
      .catch(() => { if (vivo) setCpfDeOutro({ id: 0, name: "não deu para conferir" }); })
      .finally(() => { if (vivo) setChecandoCpf(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveLeituras, paciente?.id]);

  // monta o "Confira a leitura" de novo quando muda uma leitura (mantém as escolhas já feitas)
  useEffect(() => {
    if (!paciente) { setLinhas([]); return; }
    const novas = montarLinhas({ cadastro: paciente, leituras, cpfDeOutro });
    setLinhas((velhas) => novas.map((n) => {
      const v = velhas.find((x) => x.campo === n.campo);
      return v && !n.travado && v.escolha !== null && n.opcoes.some((o) => o.chave === v.escolha)
        && JSON.stringify(v.opcoes) === JSON.stringify(n.opcoes) ? { ...n, escolha: v.escolha } : n;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveLeituras, cpfDeOutro, paciente]);

  const tirarFoto = async (tipo: Origem, arquivo: File | undefined) => {
    if (!arquivo) return;
    setResultado(null);
    let pequena: File;
    try {
      pequena = await reduzirFoto(arquivo);
    } catch {
      setFotos((f) => ({ ...f, [tipo]: { arquivo, previa: "", estado: "falhou", erro: "Não consegui abrir a foto. Tire de novo." } }));
      return;
    }
    const previa = URL.createObjectURL(pequena);
    setFotos((f) => {
      if (f[tipo]?.previa) URL.revokeObjectURL(f[tipo]!.previa);
      return { ...f, [tipo]: { arquivo: pequena, previa, estado: "lendo" } };
    });
    try {
      const fd = new FormData();
      fd.append("file", pequena);
      fd.append("tipo", tipo);
      const r = await api.post("/patients/ler-foto", fd).then((x) => x.data);
      setFotos((f) => ({ ...f, [tipo]: { arquivo: pequena, previa, estado: "lida", leitura: { campos: r.campos || {}, motivos: r.motivos || {} } } }));
    } catch (e) {
      setFotos((f) => ({ ...f, [tipo]: { arquivo: pequena, previa, estado: "falhou", erro: msgErro(e, "A leitura falhou. Tente de novo.") } }));
    }
  };

  const temFoto = DOCS.some((d) => fotos[d.tipo]);
  const lendo = DOCS.some((d) => fotos[d.tipo]?.estado === "lendo");
  const algumaLida = DOCS.some((d) => fotos[d.tipo]?.estado === "lida");
  const liberado = temFoto && !lendo && !checandoCpf && !enviando && podeUsar(linhas);

  const guardar = async (soFotos: boolean) => {
    if (!paciente || enviando) return;
    setEnviando(true);
    setResultado(null);
    const guardadas: string[] = [];
    try {
      for (const d of DOCS) {
        const f = fotos[d.tipo];
        if (!f?.arquivo || !f.previa) continue;
        const fd = new FormData();
        fd.append("category", d.tipo);
        fd.append("file", f.arquivo);
        await api.post(`/patients/${paciente.id}/documents/foto-cadastro`, fd, { timeout: 60_000 });
        guardadas.push(d.titulo);
      }
    } catch (e) {
      setResultado({ ok: false, texto: `Não consegui guardar a foto: ${msgErro(e)}. ${guardadas.length ? `Já guardada: ${guardadas.join(", ")}.` : "Nada foi guardado."}` });
      setEnviando(false);
      return;
    }
    const dados = soFotos ? {} : dadosAceitos(linhas);
    if (Object.keys(dados).length) {
      try {
        const novo = await patientsApi.update(paciente.id, dados);
        setPaciente((p) => ({ ...(p || {}), ...novo }));
      } catch (e) {
        setResultado({ ok: false, texto: `Fotos guardadas, mas o cadastro não mudou: ${msgErro(e)}` });
        setEnviando(false);
        return;
      }
    }
    const n = Object.keys(dados).length;
    setResultado({ ok: true, texto: `Pronto. ${guardadas.length ? `Foto guardada em Documentos (${guardadas.join(" e ")}). ` : ""}${n ? `${n} dado(s) do cadastro atualizado(s).` : "Cadastro sem mudança."}` });
    setFotos({});
    setEnviando(false);
  };

  if (!pronto) return <p className="p-6 text-center text-slate-500">Abrindo…</p>;

  return (
    <div className="max-w-xl mx-auto p-4 flex flex-col gap-4 pb-24">
      <header className="flex items-center justify-between pt-2">
        <a href="/celular" className="text-sky-700 dark:text-sky-300 font-semibold">‹ Início</a>
        <h1 className="text-lg font-bold">Foto de documento</h1>
        <span className="w-12" />
      </header>

      {!paciente ? (
        <EscolherPaciente onEscolher={(p) => { setPaciente(p); setFotos({}); setResultado(null); }} erro={erroPaciente} />
      ) : (
        <>
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">Paciente</p>
              <p className="text-lg font-bold" data-testid="paciente">{paciente.name}</p>
            </div>
            <button type="button" onClick={() => { setPaciente(null); setFotos({}); setResultado(null); }}
              className="text-sm text-sky-700 dark:text-sky-300 font-semibold">Trocar</button>
          </section>

          <div className="grid grid-cols-1 gap-3">
            {DOCS.map((d) => (
              <BotaoFoto key={d.tipo} titulo={d.titulo} emoji={d.emoji} foto={fotos[d.tipo]}
                desativado={enviando} onArquivo={(a) => tirarFoto(d.tipo, a)} />
            ))}
          </div>

          {temFoto && !lendo && algumaLida && linhas.length > 0 && (
            <section className="flex flex-col gap-2" data-testid="confira">
              <h2 className="text-base font-bold">Confira a leitura</h2>
              <p className="text-xs text-slate-500">Amarelo entra no cadastro vazio. Laranja precisa de um toque.</p>
              {linhas.map((l) => (
                <LinhaConfira key={l.campo} l={l} onEscolher={(chave) => setLinhas((ls) => escolher(ls, l.campo, chave))} />
              ))}
              {checandoCpf && <p className="text-sm text-slate-500">Conferindo o CPF…</p>}
            </section>
          )}

          {resultado && (
            <p className={`rounded-xl p-3 text-sm font-semibold ${resultado.ok ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" : "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200"}`}
              data-testid="resultado">{resultado.texto}</p>
          )}

          {temFoto && (
            <div className="fixed bottom-0 inset-x-0 p-3 bg-white/95 dark:bg-slate-950/95 border-t border-slate-200 dark:border-slate-800">
              <div className="max-w-xl mx-auto">
                {algumaLida ? (
                  <button type="button" disabled={!liberado} onClick={() => guardar(false)} data-testid="usar"
                    className="w-full py-4 rounded-2xl bg-green-600 text-white text-lg font-bold disabled:opacity-40">
                    {enviando ? "Guardando…" : lendo ? "Lendo a foto…" : podeUsar(linhas) ? "Usar estes dados" : "Decida os itens em laranja"}
                  </button>
                ) : (
                  <button type="button" disabled={lendo || enviando} onClick={() => guardar(true)} data-testid="so-fotos"
                    className="w-full py-4 rounded-2xl bg-slate-700 text-white text-lg font-bold disabled:opacity-40">
                    {enviando ? "Guardando…" : lendo ? "Lendo a foto…" : "Guardar só as fotos"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BotaoFoto({ titulo, emoji, foto, desativado, onArquivo }: {
  titulo: string; emoji: string; foto?: Foto; desativado: boolean; onArquivo: (a: File | undefined) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border-2 border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900 overflow-hidden">
      <button type="button" disabled={desativado} onClick={() => ref.current?.click()}
        className="w-full flex items-center gap-4 p-5 text-left active:bg-sky-50 dark:active:bg-slate-800 disabled:opacity-50">
        <span className="text-4xl" aria-hidden>{emoji}</span>
        <span className="flex-1">
          <span className="block text-lg font-bold">{titulo}</span>
          <span className="block text-sm text-slate-500">
            {!foto ? "Toque para fotografar" : foto.estado === "lendo" ? "Lendo a foto…" : foto.estado === "lida" ? "Lida. Toque para tirar de novo" : (foto.erro || "Não deu para ler")}
          </span>
        </span>
        {foto?.previa && <img src={foto.previa} alt="" className="w-16 h-16 object-cover rounded-lg" />}
      </button>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { onArquivo(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

function LinhaConfira({ l, onEscolher }: { l: Linha; onEscolher: (chave: string) => void }) {
  const foto = l.opcoes.find((o) => o.chave === "foto");
  return (
    <div className={`rounded-xl border-2 p-3 ${COR[l.cor]}`} data-testid={`linha-${l.campo}`} data-cor={l.cor}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{l.rotulo}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{SELO[l.cor]}</span>
      </div>
      {l.cor === "verde" && <p className="text-base">{formatar(l.campo, l.atual)}</p>}
      {l.cor === "cinza" && <p className="text-sm text-slate-600 dark:text-slate-300">{l.motivo}</p>}
      {l.cor === "amarelo" && foto && (
        <label className="flex items-center gap-3 mt-1">
          <input type="checkbox" className="w-6 h-6" checked={l.escolha === "foto"}
            onChange={(e) => onEscolher(e.target.checked ? "foto" : "manter")} />
          <span className="text-base">{formatar(l.campo, foto.valor)}</span>
        </label>
      )}
      {l.cor === "laranja" && (
        <>
          {l.motivo && <p className="text-xs text-orange-800 dark:text-orange-300 mt-1">{l.motivo}</p>}
          {!l.travado && (
            <div className="grid grid-cols-1 gap-2 mt-2">
              {l.opcoes.map((o) => (
                <button key={o.chave} type="button" onClick={() => onEscolher(o.chave)}
                  className={`text-left rounded-lg border-2 px-3 py-2 ${l.escolha === o.chave ? "border-orange-600 bg-white dark:bg-slate-900 font-bold" : "border-transparent bg-white/60 dark:bg-slate-900/60"}`}>
                  <span className="block text-xs text-slate-500">{o.rotulo}</span>
                  <span className="block text-base">{formatar(l.campo, o.valor)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EscolherPaciente({ onEscolher, erro }: { onEscolher: (p: Paciente) => void; erro: string }) {
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Paciente[]>([]);
  const [sala, setSala] = useState<{ patient_id: number; patient_name: string; status: string }[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    waitingRoomApi.today().then((l: any[]) => setSala((l || []).filter((e) => e.status !== "absent"))).catch(() => setSala([]));
  }, []);

  useEffect(() => {
    const t = busca.trim();
    if (t.length < 3) { setAchados([]); return; }
    let vivo = true;
    const id = setTimeout(() => {
      setBuscando(true);
      patientsApi.list(t).then((l: Paciente[]) => { if (vivo) setAchados((l || []).slice(0, 15)); })
        .catch(() => { if (vivo) setAchados([]); })
        .finally(() => { if (vivo) setBuscando(false); });
    }, 350);
    return () => { vivo = false; clearTimeout(id); };
  }, [busca]);

  const abrir = (id: number) => patientsApi.get(id).then(onEscolher).catch(() => {});

  return (
    <section className="flex flex-col gap-3">
      {erro && <p className="text-sm text-orange-700">{erro}</p>}
      <label className="text-sm font-semibold" htmlFor="busca">Qual paciente?</label>
      <input id="busca" type="search" inputMode="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)}
        placeholder="Nome ou CPF" className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-lg" />
      {buscando && <p className="text-sm text-slate-500">Procurando…</p>}
      {achados.map((p) => (
        <button key={p.id} type="button" onClick={() => abrir(p.id)}
          className="text-left rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3">
          <span className="block font-bold">{p.name}</span>
          <span className="block text-xs text-slate-500">{p.cpf ? `CPF ${formatar("cpf", p.cpf)}` : "Sem CPF"}{p.birthdate ? ` · ${formatar("birthdate", p.birthdate)}` : ""}</span>
        </button>
      ))}
      {busca.trim().length < 3 && sala.length > 0 && (
        <>
          <p className="text-sm font-semibold mt-2">Na sala de espera hoje</p>
          {sala.map((e, i) => (
            <button key={`${e.patient_id}-${i}`} type="button" onClick={() => abrir(e.patient_id)}
              className="text-left rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 font-bold">
              {e.patient_name}
            </button>
          ))}
        </>
      )}
    </section>
  );
}
