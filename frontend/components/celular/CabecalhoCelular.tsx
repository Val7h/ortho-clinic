// Cabeçalho único do app do celular (22/11/2026): logotipo + "OrthoMedic",
// nome da tela e o botão de voltar ao início do app. Igual em todas as telas.
// Azul #12294E até atrás da barra do iPhone (statusBarStyle black-translucent).

export function CabecalhoCelular({ tela, inicio = false, direita, voltar }: {
  tela?: string; inicio?: boolean; direita?: React.ReactNode;
  /** 22/11: tela aberta a partir de outra (ex.: foto pela ficha) ganha "‹ Voltar" para ela. */
  voltar?: string;
}) {
  return (
    <header
      className="sticky top-0 z-30 -mx-4 text-white shadow-md"
      style={{ background: "#12294E", paddingTop: "env(safe-area-inset-top)" }}
      data-testid="cabecalho-celular"
    >
      <div className="max-w-xl mx-auto flex items-center gap-3 px-4 py-3">
        <a href="/celular" className="flex items-center gap-3 min-w-0 flex-1" aria-label="Início do app OrthoMedic">
          <img src="/icons/celular-192.png" alt="" width={40} height={40} className="rounded-xl ring-1 ring-white/20 shrink-0" />
          <span className="min-w-0">
            <span className="block text-lg font-bold leading-tight tracking-wide">
              Ortho<span style={{ color: "#3FBFA0" }}>Medic</span>
            </span>
            {tela && <span className="block text-xs text-white/75 truncate">{tela}</span>}
          </span>
        </a>
        {direita}
        {voltar && (
          <a href={voltar} className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold active:bg-white/25" data-testid="voltar">
            ‹ Voltar
          </a>
        )}
        {!inicio && (
          <a href="/celular" className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold active:bg-white/25" data-testid="voltar-inicio">
            ‹ Início
          </a>
        )}
      </div>
    </header>
  );
}
