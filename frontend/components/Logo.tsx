'use client';

/**
 * Logomarca OrthoClinic "Articulação" (Opção 2 — aprovada pelo Dr. Valth):
 * o "O" de Ortho desenhado como articulação bola-e-soquete (quadril),
 * gradiente navy→azul com esfera ciano. Marca do PRODUTO (a marca da
 * clínica usuária — OrthoMedic — vive na sidebar e nos documentos).
 */
export function Logo({ width = 40, height = 40 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-lg"
    >
      <defs>
        <linearGradient id="ocg-logo" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0F2D5E" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#ocg-logo)" />
      <path d="M50 18 a32 32 0 1 0 32 32" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
      <circle cx="63" cy="37" r="14" fill="#22d3ee" />
      <circle cx="58" cy="32" r="4" fill="#fff" opacity="0.85" />
    </svg>
  );
}

export function LogoWithText({ width = 200 }: { width?: number }) {
  return (
    <div className="flex items-center gap-3">
      <Logo width={50} height={50} />
      <div className="leading-tight">
        <h1 className="text-lg font-bold text-white tracking-wide">OrthoClinic</h1>
        <p className="text-xs text-blue-100 font-medium">Premium Edition</p>
      </div>
    </div>
  );
}
