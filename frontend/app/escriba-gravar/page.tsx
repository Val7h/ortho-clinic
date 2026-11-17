"use client";

// Escriba integrado (fatia 1, 17/11/2026): tela de gravar pelo CELULAR ou pelo iPAD.
// Para quando o PC da clínica não tem microfone: a ficha fica aberta no PC e o
// aparelho grava. Logado como o médico, pega o atendimento EM CURSO dele e grava
// preso a esse atendimento (a mesma sessão que o PC usaria). A coluna lilás no PC
// mostra "gravando no celular/iPad".
//
// Regra dura: o microfone só liga por toque NESTA tela. Se a consulta mudar no PC
// (Suspender, Finalizar, outro paciente), aqui só pausa ou para.

import { useEffect, useRef, useState } from "react";
import * as escriba from "@/lib/escribaGravador";

type Atual = Awaited<ReturnType<typeof escriba.escribaGravarApi.atendimentoAtual>>;

const TEXTO_AVISO_CFM =
  "Esta consulta será gravada em áudio para o médico registrar no prontuário o que foi dito. " +
  "O áudio passa pelo servidor do OrthoMedic, protegido, e é apagado depois de transcrito. " +
  "Uma inteligência artificial ajuda a organizar o texto, e tudo é conferido pelo médico. " +
  "Quem não quiser ser gravado pode pedir para parar a qualquer momento.";

export default function EscribaGravarPage() {
  const g = escriba.useEscribaGravador();
  const [atual, setAtual] = useState<Atual | null>(null);
  const [erro, setErro] = useState("");
  const [logado, setLogado] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const barra = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tem = !!localStorage.getItem("ortho_token");
    setLogado(tem);
    if (!tem) {
      try { sessionStorage.setItem("ortho_voltar_para", "/escriba-gravar"); } catch {}
      return;
    }
    let vivo = true;
    const ler = () => escriba.escribaGravarApi.atendimentoAtual()
      .then((r) => { if (vivo) { setAtual(r); setErro(""); } })
      .catch((e) => { if (vivo) setErro(e?.response?.status === 403 ? "Só o login de médico grava a consulta." : "Sem conexão com o OrthoMedic. Tentando de novo…"); });
    ler();
    const t = setInterval(ler, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // medidor simples: mostra que o microfone está ouvindo
  useEffect(() => {
    let id = 0;
    const laco = () => {
      if (barra.current) barra.current.style.width = `${Math.round(escriba.nivelMic() * 100)}%`;
      id = requestAnimationFrame(laco);
    };
    id = requestAnimationFrame(laco);
    return () => cancelAnimationFrame(id);
  }, []);

  const entry = atual?.entry || null;
  const gravandoAqui = g.estado === "gravando";
  const pausadoAqui = g.estado === "pausado" && entry && g.entryId === entry.id;
  const outroAparelho = !!(atual?.sessao && atual.sessao.estado === "gravando" && atual.sessao.sinal_vivo
    && atual.sessao.aparelho_ativo !== escriba.aparelhoId() && !gravandoAqui);
  const precisaAviso = !!entry && !atual?.consentimento;

  const gravar = async () => {
    if (!entry || ocupado) return;
    setOcupado(true);
    try {
      if (precisaAviso) await escriba.aviseiEGravar(entry.id, entry.patient_id);
      else await escriba.ligarPorClique(entry.id, entry.patient_id);
      setAtual(await escriba.escribaGravarApi.atendimentoAtual().catch(() => atual));
    } finally { setOcupado(false); }
  };

  const corEstado = gravandoAqui ? (g.cor === "a" ? "bg-amber-500" : "bg-red-600") : g.cor === "r" ? "bg-orange-600" : "bg-slate-500";

  if (logado === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-violet-50 dark:bg-slate-950 text-center">
        <p className="text-lg font-bold text-violet-900 dark:text-violet-200">🎙️ Gravar consulta</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">Entre com o login de médico para gravar pelo celular ou iPad.</p>
        <a href="/login" className="px-5 py-3 rounded-xl bg-violet-600 text-white font-semibold">Entrar</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col gap-4 p-5 bg-violet-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 max-w-xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-violet-900 dark:text-violet-200">🎙️ Gravar consulta</h1>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full text-white ${corEstado}`} data-testid="estado">
          {gravandoAqui ? "● Gravando" : pausadoAqui ? "⏸ Pausado" : "Parado"}
        </span>
      </header>

      {erro && <p className="text-sm text-orange-700 dark:text-orange-300">{erro}</p>}

      <section className="rounded-xl border border-violet-300 dark:border-violet-800 bg-white dark:bg-slate-900 p-4">
        {entry ? (
          <>
            <p className="text-xs text-violet-500">Atendimento em curso</p>
            <p className="text-xl font-bold" data-testid="paciente">{entry.patient_name}</p>
          </>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Nenhuma consulta em andamento. Clique em <b>Iniciar Consulta</b> no PC; esta tela acha o paciente sozinha.
          </p>
        )}
      </section>

      {outroAparelho && (
        <p className="text-sm text-violet-800 dark:text-violet-300">
          Esta consulta já está gravando em outro aparelho. Se tocar em Gravar aqui, este aparelho assume e o outro para.
        </p>
      )}

      {entry && precisaAviso && !gravandoAqui && (
        <div className="rounded-xl border-2 border-violet-400 bg-white dark:bg-slate-900 p-4 text-sm leading-relaxed">
          <b>Aviso de gravação (CFM).</b> {TEXTO_AVISO_CFM}
        </div>
      )}

      <div className="h-3 rounded-full bg-violet-100 dark:bg-slate-800 overflow-hidden">
        <div ref={barra} className="h-full bg-green-500 transition-[width] duration-75" style={{ width: "0%" }} />
      </div>

      {!gravandoAqui ? (
        <button
          type="button"
          onClick={gravar}
          disabled={!entry || ocupado}
          data-testid="gravar"
          className="w-full py-5 rounded-2xl bg-red-600 text-white text-xl font-bold disabled:opacity-40 active:scale-[.99]"
        >
          {precisaAviso ? "Avisei — gravar" : pausadoAqui ? "● Continuar gravando" : "● Gravar"}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => escriba.pausar()} data-testid="pausar" className="py-5 rounded-2xl bg-amber-500 text-white text-lg font-bold">
            ⏸ Pausar
          </button>
          <button type="button" onClick={() => escriba.parar()} data-testid="parar" className="py-5 rounded-2xl bg-slate-700 text-white text-lg font-bold">
            ■ Parar
          </button>
        </div>
      )}

      {g.msg && <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="msg">{g.msg}</p>}
      {g.pendentes > 1 && <p className="text-xs text-amber-700">{g.pendentes} pedaço(s) guardados no aparelho, enviando…</p>}

      {escriba.ehIos() && (
        <p className="text-xs text-slate-500">
          <b>No iPhone e no iPad</b>, não troque de app nem bloqueie a tela: a gravação para. Deixe na tomada, com esta aba na frente.
          Se a página recarregar, a gravação volta sozinha.
        </p>
      )}
    </div>
  );
}
