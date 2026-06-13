'use client';

/**
 * Modal — accessible dialog (WCAG 2.1 AA)
 *
 * Accessibility features:
 *  - role="dialog" aria-modal="true" (ARIA 1.1 dialog pattern)
 *  - aria-labelledby wired to the title element
 *  - aria-describedby wired to the description element
 *  - Focus trap: Tab / Shift+Tab cycle inside the dialog
 *  - Escape key closes the dialog
 *  - Focus returns to the trigger element on close
 *  - Backdrop click closes (unless closeOnBackdrop=false)
 *  - Scroll-lock while open
 *  - Reduced-motion: animation is suppressed via CSS
 *  - Portal renders above all other content (z-50)
 */

import React, { useEffect, useRef, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
}

const sizeStyles: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) => {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Remember the element that opened the modal so we can restore focus on close
  const triggerRef = useRef<Element | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Capture the trigger element when the modal opens
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    } else {
      // Restore focus when the modal closes
      if (triggerRef.current && 'focus' in triggerRef.current) {
        (triggerRef.current as HTMLElement).focus();
      }
    }
  }, [open]);

  // Scroll-lock + ESC + focus trap
  useEffect(() => {
    if (!open) return;

    // Scroll-lock
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog on open
    const panel = panelRef.current;
    if (panel) {
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        panel.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }

      if (e.key === 'Tab' && panel) {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) { e.preventDefault(); return; }

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

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      // aria-hidden the rest of the page content while the dialog is open
      // (next-themes adds role to html — we target the backdrop instead)
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 transition-opacity duration-200"
        aria-hidden="true"
        onClick={() => closeOnBackdrop && close()}
      />

      {/* Dialog panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={[
          'relative z-10 w-full mx-4',
          'animate-slide-in-up',
          'rounded-xl bg-white dark:bg-slate-950',
          'border border-slate-200 dark:border-slate-800',
          'shadow-xl dark:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)]',
          'outline-none',
          sizeStyles[size],
        ].join(' ')}
      >
        {/* Header */}
        {(title || description) && (
          <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4">
            {title && (
              <h2
                id={titleId}
                className="text-lg font-semibold text-slate-900 dark:text-slate-50"
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                id={descId}
                className="mt-1 text-sm text-slate-600 dark:text-slate-400"
              >
                {description}
              </p>
            )}
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-4">
            {footer}
          </div>
        )}

        {/* Close button */}
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className={[
            'absolute right-4 top-4',
            'rounded-lg p-1',
            'text-slate-400 dark:text-slate-500',
            'hover:text-slate-600 dark:hover:text-slate-300',
            'hover:bg-slate-100 dark:hover:bg-slate-800',
            'transition-colors duration-150',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1',
            'focus-visible:outline-[var(--oc-focus-ring)]',
          ].join(' ')}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
};

export const useModal = (initialOpen = false) => {
  const [open, setOpen] = React.useState(initialOpen);
  return {
    open,
    onOpenChange: setOpen,
    openModal: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen((prev) => !prev),
  };
};
