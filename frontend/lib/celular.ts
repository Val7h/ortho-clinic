"use client";
// Peças comuns do app do consultório no celular (22/11/2026).

import { useEffect, useState } from "react";

export interface UsuarioCelular {
  id: number;
  name: string;
  role: "superadmin" | "admin" | "doctor" | "secretary";
}

/** Sem login: guarda para onde voltar e vai ao /login. */
export function useLoginCelular(): { usuario: UsuarioCelular | null; medico: boolean; pronto: boolean } {
  const [usuario, setUsuario] = useState<UsuarioCelular | null>(null);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    let u: UsuarioCelular | null = null;
    try {
      const token = localStorage.getItem("ortho_token");
      const raw = localStorage.getItem("ortho_user");
      if (token && raw) u = JSON.parse(raw);
    } catch {
      u = null;
    }
    if (!u) {
      try {
        const pid = pegarPid();
        sessionStorage.setItem("ortho_voltar_para", window.location.pathname.replace(/\/$/, "") + (pid ? `?pid=${pid}` : ""));
      } catch {}
      window.location.replace("/login");
      return;
    }
    try { sessionStorage.setItem("ortho_app_celular", "1"); } catch {}   // a tela de gravar mostra "‹ Início"
    setUsuario(u);
    setPronto(true);
  }, []);
  const medico = !!usuario && ["doctor", "admin", "superadmin"].includes(usuario.role);
  return { usuario, medico, pronto };
}

/** Paciente pelo ?pid= (sem useSearchParams: o build é estático). */
export function pegarPid(): number | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("pid");
  const n = v && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Reduz a foto no próprio aparelho: gira pela orientação, lado maior 1600 px, JPEG 0,85. */
export async function reduzirFoto(arquivo: File, lado = 1600): Promise<File> {
  let fonte: ImageBitmap | HTMLImageElement;
  try {
    fonte = await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    fonte = await new Promise<HTMLImageElement>((ok, erro) => {
      const img = new Image();
      const url = URL.createObjectURL(arquivo);
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("foto ilegível")); };
      img.src = url;
    });
  }
  const w = (fonte as any).naturalWidth || fonte.width;
  const h = (fonte as any).naturalHeight || fonte.height;
  const k = Math.min(1, lado / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sem canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(fonte as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ("close" in fonte && typeof (fonte as ImageBitmap).close === "function") (fonte as ImageBitmap).close();
  const blob: Blob = await new Promise((ok, erro) =>
    canvas.toBlob((b) => (b ? ok(b) : erro(new Error("falhou"))), "image/jpeg", 0.85),
  );
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}

/** Data de hoje no horário do Brasil (AAAA-MM-DD). */
export function hojeBR(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** A tela está visível? (a sala só pergunta ao servidor com a tela à vista) */
export function telaVisivel(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/** Mensagem de erro em português: sem resposta do servidor = "sem conexão" (nunca "Network Error"). */
export function erroCelular(e: any, padrao = "Sem conexão. Tente de novo."): string {
  if (!e?.response) return padrao;
  const d = e.response.data?.detail;
  if (typeof d === "string" && d.trim()) return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return padrao;
}
