import React, { lazy, Suspense, useCallback, useRef, useState, useEffect } from 'react';
import { Maximize2, Minimize2, MoveDiagonal2, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ChatMessage } from '../../types';
import { AssistantLoadingIndicator } from './AssistantLoadingIndicator';

const ChatRuntime = lazy(() => import('./ChatRuntime').then(module => ({
  default: module.ChatRuntime
})));

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PanelSize {
  width: number;
  height: number;
}

const CHAT_RESTORE_SIZE_STORAGE_KEY = 'maplevault:chat-panel-restore-size';
const DEFAULT_PANEL_SIZE: PanelSize = { width: 420, height: 580 };
const MIN_PANEL_SIZE: PanelSize = { width: 340, height: 420 };
const EXPANDED_PANEL_SIZE: PanelSize = { width: 820, height: 780 };
const CHAT_EDGE_MARGIN = 12;
const ELECTRON_TITLEBAR_SAFE_TOP = 44;

const getChatSafeTop = () => (
  (window as Window & { electronAPI?: unknown }).electronAPI
    ? ELECTRON_TITLEBAR_SAFE_TOP
    : CHAT_EDGE_MARGIN
);

const clampPanelSize = (size: PanelSize): PanelSize => {
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const maxWidth = Math.max(300, viewportWidth - CHAT_EDGE_MARGIN * 2);
  const maxHeight = Math.max(
    320,
    viewportHeight - CHAT_EDGE_MARGIN - getChatSafeTop()
  );
  return {
    width: Math.min(maxWidth, Math.max(Math.min(MIN_PANEL_SIZE.width, maxWidth), size.width)),
    height: Math.min(maxHeight, Math.max(Math.min(MIN_PANEL_SIZE.height, maxHeight), size.height))
  };
};

const getStoredPanelSize = (): PanelSize => {
  try {
    const stored = JSON.parse(localStorage.getItem(CHAT_RESTORE_SIZE_STORAGE_KEY) || '');
    if (Number.isFinite(stored?.width) && Number.isFinite(stored?.height)) {
      return clampPanelSize(stored);
    }
  } catch {
    // Un valor antiguo o corrupto no debe impedir abrir el asistente.
  }
  return clampPanelSize(DEFAULT_PANEL_SIZE);
};

export const ChatPanel: React.FC<ChatPanelProps> = ({ 
  isOpen, 
  onClose
}) => {
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [featuredPrompts, setFeaturedPrompts] = useState<string[]>([]);
  const [panelSize, setPanelSize] = useState<PanelSize>(getStoredPanelSize);
  const [isExpanded, setIsExpanded] = useState(false);
  const previousPanelSize = useRef<PanelSize>(DEFAULT_PANEL_SIZE);
  const resizeCleanup = useRef<(() => void) | null>(null);

  // Cargar configuración de IA
  useEffect(() => {
    if (isOpen) {
      checkAiStatus();
      loadCapabilities();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isExpanded) {
      localStorage.setItem(CHAT_RESTORE_SIZE_STORAGE_KEY, JSON.stringify(panelSize));
    }
  }, [isExpanded, panelSize]);

  useEffect(() => {
    const handleViewportChange = () => {
      setPanelSize(current => clampPanelSize(isExpanded ? EXPANDED_PANEL_SIZE : current));
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) handleViewportChange();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('focus', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('focus', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeCleanup.current?.();
    };
  }, [isExpanded]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      if (!isOpen) return;

      setHistoryLoaded(false);
      try {
        const history = await api.getChatHistory();
        if (cancelled) return;

        setHistoryMessages(history || []);
      } catch (err) {
        console.error('Error al cargar historial del chat:', err);
        if (!cancelled) setHistoryMessages([]);
      } finally {
        if (!cancelled) {
          setHistoryLoaded(true);
          setHistoryVersion(version => version + 1);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setShowClearConfirm(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showClearConfirm) {
        setShowClearConfirm(false);
        return;
      }
      onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, showClearConfirm]);

  const checkAiStatus = async () => {
    try {
      const settings = await api.getAISettings();
      setIsAiEnabled(settings?.enabled || false);
    } catch (err) {
      console.error(err);
    }
  };

  const loadCapabilities = async () => {
    try {
      const capabilities = await api.getChatCapabilities();
      setFeaturedPrompts((capabilities.featuredPrompts || []).map(item => item.prompt).slice(0, 4));
    } catch (err) {
      console.error('Error al cargar capacidades del asistente:', err);
      setFeaturedPrompts([]);
    }
  };

  const beginResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsExpanded(false);

    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = panelSize;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setPanelSize(clampPanelSize({
        width: startSize.width - (moveEvent.clientX - startX),
        height: startSize.height - (moveEvent.clientY - startY)
      }));
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeCleanup.current = null;
    };

    resizeCleanup.current?.();
    resizeCleanup.current = stopResize;
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize, { once: true });
    window.addEventListener('pointercancel', stopResize, { once: true });
  }, [panelSize]);

  const toggleExpanded = () => {
    if (isExpanded) {
      setPanelSize(clampPanelSize(previousPanelSize.current));
      setIsExpanded(false);
      return;
    }

    previousPanelSize.current = panelSize;
    setPanelSize(clampPanelSize(EXPANDED_PANEL_SIZE));
    setIsExpanded(true);
  };

  const handleClearHistory = async () => {
    try {
      await api.clearChatHistory();
      setHistoryMessages([]);
      setHistoryLoaded(true);
      setHistoryVersion(version => version + 1);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Error al borrar historial:', err);
    }
  };

  return (
    <TooltipProvider>
        <div
        data-testid="maple-chat-panel"
        data-expanded={isExpanded}
        className={`no-drag fixed bottom-3 right-3 z-[60] isolate flex min-h-0 min-w-0 max-w-[calc(100vw-24px)] origin-bottom-right flex-col rounded-xl border border-[var(--border-medium)] bg-[var(--bg-secondary)] shadow-2xl transition-[opacity,transform,width,height] duration-200 ${
          isOpen ? 'maple-panel-enter scale-100 opacity-100' : 'scale-90 opacity-0 pointer-events-none'
        }`}
        style={{
          width: panelSize.width,
          height: panelSize.height,
          maxHeight: `calc(100dvh - ${CHAT_EDGE_MARGIN + getChatSafeTop()}px)`
        }}
      >
        <button
          type="button"
          onPointerDown={beginResize}
          data-testid="chat-resize-handle"
          className="no-drag absolute -left-1 -top-1 z-20 hidden h-7 w-7 shrink-0 cursor-nwse-resize items-center justify-center rounded-md border border-[var(--border-medium)] bg-[var(--bg-panel)] p-0 text-[var(--text-dim)] shadow-md hover:text-white sm:flex"
          aria-label="Redimensionar panel del asistente"
          title="Arrastra para cambiar el tamaño"
        >
          <MoveDiagonal2 className="h-3.5 w-3.5" />
        </button>

        {/* Cabecera */}
        <div className="no-drag flex min-h-13 shrink-0 select-none items-center justify-between gap-2 border-b border-white/5 bg-black/40 px-3 py-2.5 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 items-center space-x-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] shadow-md">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-xs font-bold uppercase tracking-wider text-white">Maple Assistant</h3>
              {isAiEnabled ? (
                <p className="flex min-w-0 items-center text-[9px] font-bold text-green-400">
                  <span className="mr-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-400"></span>
                  <span className="truncate">Llama 3.2 activo</span>
                </p>
              ) : (
                <p className="flex min-w-0 items-center text-[9px] font-bold text-emerald-400">
                  <span className="mr-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400"></span>
                  <span className="truncate">Motor local activo</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={toggleExpanded}
              data-testid="chat-toggle-size"
              className="no-drag grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg p-0 text-[var(--text-dim)] transition-colors hover:bg-slate-900 hover:text-white"
              aria-label={isExpanded ? 'Restaurar tamaño del panel' : 'Expandir panel del asistente'}
              title={isExpanded ? 'Restaurar tamaño' : 'Expandir panel'}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="no-drag grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg p-0 text-[var(--text-dim)] transition-colors hover:bg-slate-900 hover:text-rose-400"
              aria-label="Borrar historial del chat"
              title="Borrar chat"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              data-testid="chat-close"
              aria-label="Cerrar Maple Assistant"
              className="no-drag grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg p-0 text-[var(--text-dim)] transition-colors hover:bg-slate-900 hover:text-white"
              title="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Confirmación de Borrado */}
        {showClearConfirm && (
          <div className="absolute top-14 inset-x-2 z-50 bg-slate-900 border border-rose-500/50 rounded-xl p-4 shadow-xl animate-fadeIn">
            <p className="text-white text-xs font-bold mb-3 text-center">¿Seguro que deseas borrar el historial del chat?</p>
            <div className="flex space-x-2">
              <button onClick={handleClearHistory} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold py-1.5 rounded-lg transition-colors">
                Sí, borrar
              </button>
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold py-1.5 rounded-lg transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Zona de Mensajes y Caja de Texto provista por assistant-ui */}
        <div className="assistant-ui-theme flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {historyLoaded ? (
            <Suspense
              fallback={(
                <div className="flex flex-1 items-center justify-center px-4">
                  <AssistantLoadingIndicator label="Preparando la conversación..." />
                </div>
              )}
            >
              <ChatRuntime
                key={historyVersion}
                history={historyMessages}
                featuredPrompts={featuredPrompts}
              />
            </Suspense>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4">
              <AssistantLoadingIndicator label="Cargando el historial..." />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
