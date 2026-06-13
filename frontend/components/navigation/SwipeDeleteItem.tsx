"use client";

/**
 * SwipeDeleteItem — padrão swipe-to-delete para listas mobile
 *
 * Deslize item para esquerda revela botão "Excluir" em vermelho.
 * Toque fora ou swipe-right cancela.
 * Acessibilidade: botão de exclusão acessível por teclado/VoiceOver.
 *
 * Uso:
 *   <SwipeDeleteItem onDelete={() => handleDelete(id)}>
 *     <PatientCard patient={patient} />
 *   </SwipeDeleteItem>
 */

import { useRef, useState, ReactNode } from "react";
import { Trash2 } from "lucide-react";

interface SwipeDeleteItemProps {
  onDelete: () => void;
  label?: string;   // para aria-label do botão de exclusão
  children: ReactNode;
  disabled?: boolean;
}

const ACTION_WIDTH = 72; // px — largura do botão de exclusão revelado

export function SwipeDeleteItem({
  onDelete,
  label = "Excluir item",
  children,
  disabled = false,
}: SwipeDeleteItemProps) {
  const startX = useRef(0);
  const [offsetX, setOffsetX] = useState(0);   // 0 = fechado, -ACTION_WIDTH = aberto
  const [revealed, setRevealed] = useState(false);
  const dragging = useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!dragging.current || disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    // Clamp: só permite arrastar para esquerda, máximo ACTION_WIDTH + um pouco de bounce
    const clamped = Math.max(-(ACTION_WIDTH + 8), Math.min(0, dx + (revealed ? -ACTION_WIDTH : 0)));
    setOffsetX(clamped);
  }

  function handleTouchEnd() {
    dragging.current = false;
    // Se passou do meio, revela; senão fecha
    if (offsetX < -(ACTION_WIDTH / 2)) {
      setOffsetX(-ACTION_WIDTH);
      setRevealed(true);
    } else {
      setOffsetX(0);
      setRevealed(false);
    }
  }

  function handleClose() {
    setOffsetX(0);
    setRevealed(false);
  }

  function handleDelete() {
    handleClose();
    onDelete();
  }

  return (
    <div className="relative overflow-hidden">
      {/* Delete action button (revealed by swipe) */}
      <div
        aria-hidden={!revealed}
        className="absolute right-0 top-0 bottom-0 w-[72px] flex items-center justify-center bg-red-500"
        style={{ borderRadius: "0 12px 12px 0" }}
      >
        <button
          onClick={handleDelete}
          aria-label={label}
          tabIndex={revealed ? 0 : -1}
          className="flex flex-col items-center gap-1 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Trash2 className="w-5 h-5" aria-hidden="true" />
          <span className="text-[10px] font-semibold">Excluir</span>
        </button>
      </div>

      {/* Main content — draggable */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current ? "none" : "transform 0.2s ease-out",
        }}
        className="relative bg-white dark:bg-slate-950 z-10"
        onClick={revealed ? handleClose : undefined}
      >
        {children}
      </div>
    </div>
  );
}
