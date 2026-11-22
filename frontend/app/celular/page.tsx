"use client";

// App do consultório no celular (22/11/2026): tela inicial.
// Um app só; os cartões mudam conforme o login (secretária ou médico).
// Instalação: site salvo na tela inicial (PWA), sem loja.

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
    <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
      <header className="flex items-center gap-3 pt-2">
        <img src="/icons/celular-192.png" alt="" width={44} height={44} className="rounded-xl" />
        <div>
          <h1 className="text-xl font-bold">OrthoMedic</h1>
          <p className="text-sm text-slate-500">Olá, {usuario.name?.split(" ")[0] || "bem-vindo"}{medico ? "" : " · secretária"}</p>
        </div>
      </header>

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
          <p className="font-bold mb-1">Como instalar na tela inicial</p>
          {iphone ? (
            <p>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>.</p>
          ) : pedidoInstalar ? (
            <button type="button" onClick={() => { pedidoInstalar.prompt(); setPedidoInstalar(null); }}
              className="mt-1 px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold">Instalar o app</button>
          ) : (
            <p>No Chrome, toque nos <b>três pontinhos</b> e depois em <b>Adicionar à tela inicial</b>.</p>
          )}
        </section>
      )}
    </div>
  );
}
