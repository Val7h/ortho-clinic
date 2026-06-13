"use client";

/**
 * PullToRefresh
 *
 * Wrapper que adiciona pull-to-refresh ao conteúdo de uma página.
 * - Detecta swipe-down quando scrollY === 0
 * - Mostra indicador animado (spinner + "Atualizando...")
 * - Chama onRefresh() e aguarda a Promise
 * - Acessível: aria-live para anunciar ao screen reader
 *
 * Uso:
 *   <PullToRefresh onRefresh={fetchData}>
 *     {children}
 *   </PullToRefresh>
 */

import { useRef, useState, useCallback, ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  /** Desativa a feature (ex: em desktop) */
  disabled?: boolean;
}

const THRESHOLD = 72; // px de pull antes de acionar

export function PullToRefresh({ onRefresh, children, disabled = false }: PullToRefreshProps) {
  const startY = useRef(0);
  const [pullY, setPullY] = useState(0);   // 0-1 (progresso)
  const [refreshing, setRefreshing] = useState(false);
  const touchActive = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (disabled || refreshing) return;
      // Só ativa quando no topo da página
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        touchActive.current = true;
      }
    },
    [disabled, refreshing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!touchActive.current || disabled || refreshing) return;
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 0) {
        // Elastic dampening: slow down pull as it extends
        const progress = Math.min(diff / (THRESHOLD * 1.5), 1);
        setPullY(progress);
      }
    },
    [disabled, refreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!touchActive.current) return;
    touchActive.current = false;

    if (pullY >= 0.8 && !refreshing) {
      setRefreshing(true);
      setPullY(1);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  }, [pullY, refreshing, onRefresh]);

  const indicatorHeight = Math.round(pullY * 52);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* Pull indicator */}
      <div
        aria-live="polite"
        aria-label={refreshing ? "Atualizando..." : undefined}
        style={{ height: refreshing ? 52 : indicatorHeight, opacity: Math.max(pullY, refreshing ? 1 : 0) }}
        className="overflow-hidden flex items-center justify-center transition-all duration-200"
      >
        <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
          <RefreshCw
            className={["w-4 h-4", refreshing ? "animate-spin" : ""].join(" ")}
            style={{ transform: `rotate(${Math.round(pullY * 360)}deg)` }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium">
            {refreshing ? "Atualizando..." : pullY >= 0.8 ? "Solte para atualizar" : "Puxe para atualizar"}
          </span>
        </div>
      </div>

      {children}
    </div>
  );
}
