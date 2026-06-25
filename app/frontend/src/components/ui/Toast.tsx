import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />,
  error: <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />,
  info: <Info className="h-4 w-4 text-sky-400 shrink-0" />,
};

const styles: Record<ToastType, string> = {
  success: 'border-emerald-500/20 bg-emerald-950/30',
  error: 'border-red-500/20 bg-red-950/30',
  warning: 'border-amber-500/20 bg-amber-950/20',
  info: 'border-sky-500/20 bg-sky-950/20',
};

const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animación de entrada
    const showTimer = setTimeout(() => setVisible(true), 10);
    // Auto-dismiss
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.duration ?? 4000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={`flex items-start space-x-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl text-sm font-medium text-[var(--text-main)] transition-all duration-300 ${
        styles[toast.type]
      } ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ minWidth: '280px', maxWidth: '400px' }}
    >
      <div className="mt-0.5">{icons[toast.type]}</div>
      <p className="flex-1 text-[13px] leading-snug text-[var(--text-main)]">{toast.message}</p>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300); }}
        className="p-0.5 text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors cursor-pointer shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

// ===== TOAST CONTAINER =====

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      className="fixed bottom-5 right-5 z-[200] flex flex-col-reverse space-y-reverse space-y-2"
      aria-live="polite"
      aria-label="Notificaciones"
    >
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

// ===== HOOK =====

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message, duration }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useMemo(() => ({
    success: (msg: string, dur?: number) => addToast(msg, 'success', dur),
    error: (msg: string, dur?: number) => addToast(msg, 'error', dur),
    warning: (msg: string, dur?: number) => addToast(msg, 'warning', dur),
    info: (msg: string, dur?: number) => addToast(msg, 'info', dur),
  }), [addToast]);

  return { toasts, dismissToast, toast };
}
