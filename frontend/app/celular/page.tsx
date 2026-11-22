"use client";

// App do consultório no celular (22/11/2026): tela inicial.
// Um app só; os cartões mudam conforme o login (secretária ou médico).
// Instalação: site salvo na tela inicial (PWA), sem loja.

import { CabecalhoCelular } from "@/components/celular/CabecalhoCelular";
import { useEffect, useState } from "react";
import { useLoginCelular, pegarPid } from "@/lib/celular";
import { cartoesDoInicio } from "@/lib/celularPapel";

export default function CelularInicio() {
  const { usuario, medico, pronto } = useLoginCelular();
  const [pid, setPid] = useState<number | null>(null);
  const [instalado, setInstalado] = useState(true);
  const [iphone, setIphone] = useState(false);
  const [pedidoInstalar, setPedidoInstalar] = useState<any>(null);

  useEffect(() => {
    setPid(pegarPid());
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    setInstalado(!!standalone);
    setIphone(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const pegar = (e: any) => { e.preventDefault(); setPedidoInstalar(e); };
    window.addEventListener("beforeinstallprompt", pegar);
    return () => window.removeEventListener("beforeinstallprompt", pegar);
  }, []);

  if (!pronto || !usuario) {
    return <p className="p-6 text-center text-slate-500">Abrindo…</p>;
  }

  const cartoes = cartoesDoInicio(usuario.role, pid);

  return (
    <div className="max-w-xl mx-auto px-4 pb-4 flex flex-col gap-4">
      <CabecalhoCelular inicio tela={`Olá, ${usuario.name?.split(" ")[0] || "bem-vindo"}${medico ? "" : " · secretária"}`} />

      <nav className="grid grid-cols-1 gap-3">
        {cartoes.map((c) => (
          <a key={c.href} href={c.href} data-testid={c.teste}
            className={`flex items-center gap-4 rounded-2xl ${c.cor} text-white p-5 shadow active:scale-[.99]`}>
            <span className="text-4xl" aria-hidden>{c.emoji}</span>
            <span>
              <span className="block text-lg font-bold">{c.titulo}</span>
              <span className="block text-sm opacity-90">{c.texto}</span>
            </span>
          </a>
        ))}
      </nav>

      {!instalado && (
        <section className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm leading-relaxed" data-testid="como-instalar">
          <div className="flex items-center gap-3 mb-3">
            <img src="/icons/apple-touch-icon-180.png" alt="Ícone do OrthoMedic" width={56} height={56} className="rounded-2xl shadow" />
            <div>
              <p className="font-bold text-base">Instale o app OrthoMedic</p>
              <p className="text-xs text-slate-500">Fica na tela inicial com este ícone, como um aplicativo.</p>
            </div>
          </div>
          <div className={`rounded-xl p-3 mb-2 ${iphone ? "bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-300" : "bg-slate-50 dark:bg-slate-800"}`} data-testid="instalar-iphone">
            <p className="font-semibold mb-1">iPhone (Safari)</p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
              <li>Toque em <b>Adicionar à Tela de Início</b>.</li>
              <li>Toque em <b>Adicionar</b>.</li>
            </ol>
          </div>
          <div className={`rounded-xl p-3 ${!iphone ? "bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-300" : "bg-slate-50 dark:bg-slate-800"}`} data-testid="instalar-android">
            <p className="font-semibold mb-1">Android (Chrome)</p>
            {pedidoInstalar ? (
              <button type="button" onClick={() => { pedidoInstalar.prompt(); setPedidoInstalar(null); }}
                className="mt-1 mb-2 px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold">Instalar o app</button>
            ) : null}
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Toque no menu <b>⋮</b> (três pontinhos, no alto).</li>
              <li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}
