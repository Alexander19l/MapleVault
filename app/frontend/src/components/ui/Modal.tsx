import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'max';
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className = ''
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
        (el) => el.offsetParent !== null
      );

    // Diferido al siguiente frame: el panel del portal aún no existe en el DOM
    // en el mismo ciclo en el que isOpen pasa a true.
    const focusTimer = window.setTimeout(() => {
      const [first] = getFocusable();
      (first ?? panelRef.current)?.focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const withinPanel = active instanceof Node && panelRef.current?.contains(active);

      if (e.shiftKey) {
        if (active === first || !withinPanel) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !withinPanel) {
        e.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    max: "max-w-6xl"
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md maple-backdrop-enter"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`flex max-h-[calc(100dvh-2rem)] w-full ${sizes[size]} flex-col overflow-hidden rounded-2xl border border-[var(--border-medium)] bg-[var(--bg-secondary)] shadow-2xl maple-panel-enter no-drag ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Ventana de MapleVault'}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-medium)] bg-slate-950/40 select-none">
          <h3 className="text-sm font-bold tracking-wide text-[var(--text-main)]">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 hover:bg-slate-800 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-main)] maple-interactive cursor-pointer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
