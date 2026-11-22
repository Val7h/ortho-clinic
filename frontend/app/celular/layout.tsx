import type { Metadata, Viewport } from "next";

// App do consultório no celular (22/11/2026). PWA: o site salvo na tela inicial,
// sem loja. Manifesto PRÓPRIO (/manifest-celular.json): o manifest.json do site
// e o sw-push.js continuam intocados. Sem service worker aqui.
// Next 14: metadata e viewport de layout aninhado se juntam aos do layout raiz de
// forma rasa (a chave definida aqui substitui a de cima; as outras continuam).
export const metadata: Metadata = {
  title: "OrthoMedic",
  applicationName: "OrthoMedic",
  manifest: "/manifest-celular.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/celular-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "OrthoMedic",
    // letra branca sobre o cabeçalho azul (#12294E), que desce até atrás da barra do iPhone
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#12294E",
};

export default function CelularLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">{children}</div>;
}
