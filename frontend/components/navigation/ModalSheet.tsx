"use client";

/**
 * ModalSheet — bottom sheet em mobile, dialog centrado em desktop
 *
 * Props:
 *   open       — controla visibilidade
 *   onClose    — callback de fechamento
 *   title      — título do header
 *   size       — "sm" | "md" | "lg" | "full"
 *   children
 *
 * Comportamentos mobile:
 *   - Abre como bottom sheet com borda arredondada no topo
 *   - Swipe-down para fechar
 *   - Drag handle visual
 *
 * Comportamentos desktop:
 *   - Dialog centrado com max-w configurável
 *
 * Acessibilidade:
 *   - role="dialog" aria-modal aria-labelledby
 *   - ESC para fechar
 *   - Focus trap
 *   - Backdrop clicável fecha
 */

import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
import { useSwipeClose } from "@/components/navigation/useSwipeClose";

type SheetSize = "sm" | "md" | "lg" | "full";

interface ModalSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: SheetSize;
  children: React.ReactNode;
  /** Se true, impede fechar clicando no backdrop */
  persistent?: boolean;
}

const SIZE_CLASS: Record<SheetSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  full: "sm:max-w-2xl",
};

export function ModalSheet({
  open,
  onClose,
  title,
  size = "md",
  children,
  persistent = false,
}: ModalSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const swipeHandlers = useSwipeClose({ onClose, direction: "down" });

  // ESC + focus trap
  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !persistent) onClose();
      if (e.key === "Tab") {
        const el = panelRef.current;
        if (!el) return;
        const focusable = el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // Auto-focus first focusable
    setTimeout(() => {
      const el = panelRef.current;
      const first = el?.querySelector<HTMLElement>(
        'input, textarea, button:not([aria-label="Fechar"])'
      );
      first?.focus();
    }, 50);

    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, persistent]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        data-testid="modal-backdrop"
        onClick={persistent ? undefined : onClose}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      />

      {/* Posicionamento: bottom em mobile, center em sm+ */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        data-testid="modal-sheet"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none"
      >
        <div
          ref={panelRef}
          {...swipeHandlers}
          className={[
            "pointer-events-auto",
            "w-full bg-white dark:bg-slate-950",
            // Mobile: bottom sheet
            "rounded-t-2xl",
            // Desktop: centered dialog
            `sm:rounded-2xl ${SIZE_CLASS[size]}`,
            "shadow-2xl",
            "max-h-[92vh] flex flex-col",
            "animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-250 ease-out",
          ].join(" ")}
        >
          {/* Drag handle (mobile only) */}
          <div
            aria-hidden="true"
            className="sm:hidden flex justify-center pt-3 pb-1 shrink-0 cursor-grab"
          >
            <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* Header */}
          {title && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h2
                id={titleId}
                className="text-base font-bold text-slate-900 dark:text-slate-50"
              >
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Scrollable content */}
          <div className="overflow-y-auto overscroll-contain flex-1 px-5 py-5">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
