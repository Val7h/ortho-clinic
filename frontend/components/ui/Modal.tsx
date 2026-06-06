'use client';

import React, { useEffect } from 'react';
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

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

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
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      // Add Escape key handler
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onOpenChange(false);
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-200"
        onClick={() => closeOnBackdrop && onOpenChange(false)}
      />

      {/* Modal */}
      <div
        className={`
          relative z-10 w-full
          animate-slide-in-up
          rounded-lg bg-white dark:bg-slate-950 shadow-xl
          ${sizeStyles[size]}
          mx-4
        `}
      >
        {/* Header */}
        {(title || description) && (
          <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4">
            {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-4">{children}</div>

        {/* Footer */}
        {footer && <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-4">{footer}</div>}

        {/* Close Button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 rounded"
          aria-label="Fechar"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
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
