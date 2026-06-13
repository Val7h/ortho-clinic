"use client";

/**
 * useSwipeClose
 *
 * Retorna handlers de toque para fechar um painel deslizando.
 * direction: "left" → deslize para esquerda fecha (drawer lateral esquerdo)
 *            "right" → deslize para direita fecha (drawer lateral direito)
 *            "down"  → deslize para baixo fecha (bottom sheet)
 *
 * threshold: distância mínima em px para acionar (padrão 80px)
 */

import { useRef } from "react";

type Direction = "left" | "right" | "down" | "up";

interface UseSwipeCloseOptions {
  onClose: () => void;
  direction?: Direction;
  threshold?: number;
}

export function useSwipeClose({
  onClose,
  direction = "left",
  threshold = 80,
}: UseSwipeCloseOptions) {
  const startX = useRef(0);
  const startY = useRef(0);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;

    const triggered =
      (direction === "left" && dx < -threshold) ||
      (direction === "right" && dx > threshold) ||
      (direction === "down" && dy > threshold) ||
      (direction === "up" && dy < -threshold);

    if (triggered) onClose();
  }

  return { onTouchStart, onTouchEnd };
}
