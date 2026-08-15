import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  Scan,
  Settings2,
  Square
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TooltipIconButton } from '../tooltip-icon-button';

type ReaderMode = 'page' | 'continuous';
type ReadingDirection = 'ltr' | 'rtl';
type FitMode = 'page' | 'width' | 'custom';
type ReaderBackground = 'black' | 'charcoal' | 'soft';

interface ReaderPreferences {
  mode: ReaderMode;
  direction: ReadingDirection;
  fit: FitMode;
  zoom: number;
  gap: number;
  brightness: number;
  background: ReaderBackground;
}

interface MangaReaderProps {
  title: string;
  chapterLabel: string;
  pages: string[];
  downloadLoading?: boolean;
  onClose: () => void;
  onDownload: () => void;
}

const STORAGE_KEY = 'maplevault:manga-reader-preferences:v1';
const MIN_ZOOM = 50;
const MAX_ZOOM = 250;
const ZOOM_STEP = 10;

const DEFAULT_PREFERENCES: ReaderPreferences = {
  mode: 'page',
  direction: 'ltr',
  fit: 'page',
  zoom: 100,
  gap: 12,
  brightness: 100,
  background: 'black'
};

const BACKGROUNDS: Record<ReaderBackground, string> = {
  black: '#050505',
  charcoal: '#151820',
  soft: '#262a34'
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const isReaderMode = (value: unknown): value is ReaderMode => value === 'page' || value === 'continuous';
const isDirection = (value: unknown): value is ReadingDirection => value === 'ltr' || value === 'rtl';
const isFitMode = (value: unknown): value is FitMode => value === 'page' || value === 'width' || value === 'custom';
const isBackground = (value: unknown): value is ReaderBackground => value === 'black' || value === 'charcoal' || value === 'soft';

const loadPreferences = (): ReaderPreferences => {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;

  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Partial<ReaderPreferences>;
    return {
      mode: isReaderMode(stored.mode) ? stored.mode : DEFAULT_PREFERENCES.mode,
      direction: isDirection(stored.direction) ? stored.direction : DEFAULT_PREFERENCES.direction,
      fit: isFitMode(stored.fit) ? stored.fit : DEFAULT_PREFERENCES.fit,
      zoom: clamp(Number(stored.zoom) || DEFAULT_PREFERENCES.zoom, MIN_ZOOM, MAX_ZOOM),
      gap: clamp(Number(stored.gap) || DEFAULT_PREFERENCES.gap, 0, 32),
      brightness: clamp(Number(stored.brightness) || DEFAULT_PREFERENCES.brightness, 60, 120),
      background: isBackground(stored.background) ? stored.background : DEFAULT_PREFERENCES.background
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

export const MangaReader: React.FC<MangaReaderProps> = ({
  title,
  chapterLabel,
  pages,
  downloadLoading = false,
  onClose,
  onDownload
}) => {
  const readerRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = useState<ReaderPreferences>(loadPreferences);
  const [pageIndex, setPageIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const updatePreferences = useCallback((patch: Partial<ReaderPreferences>) => {
    setPreferences(current => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    setPageIndex(0);
    readerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [chapterLabel, pages]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === readerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const movePage = useCallback((delta: number) => {
    setPageIndex(current => clamp(current + delta, 0, Math.max(0, pages.length - 1)));
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [pages.length]);

  const moveFromPhysicalSide = useCallback((side: 'left' | 'right') => {
    const previous = preferences.direction === 'ltr' ? side === 'left' : side === 'right';
    movePage(previous ? -1 : 1);
  }, [movePage, preferences.direction]);

  useEffect(() => {
    if (preferences.mode !== 'page') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, button')) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveFromPhysicalSide('left');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveFromPhysicalSide('right');
      } else if (event.key === ' ' || event.key === 'PageDown') {
        event.preventDefault();
        movePage(1);
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        movePage(-1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setPageIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setPageIndex(Math.max(0, pages.length - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveFromPhysicalSide, movePage, pages.length, preferences.mode]);

  useEffect(() => {
    if (preferences.mode !== 'page') return;
    [pages[pageIndex - 1], pages[pageIndex + 1]].filter(Boolean).forEach(url => {
      const image = new Image();
      image.referrerPolicy = 'no-referrer';
      image.src = url;
    });
  }, [pageIndex, pages, preferences.mode]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await readerRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.error('No se pudo cambiar el modo de pantalla completa:', error);
    }
  };

  const closeReader = async () => {
    if (document.fullscreenElement === readerRef.current) {
      await document.exitFullscreen().catch(() => undefined);
    }
    onClose();
  };

  const changeZoom = (delta: number) => {
    updatePreferences({
      fit: 'custom',
      zoom: clamp(preferences.zoom + delta, MIN_ZOOM, MAX_ZOOM)
    });
  };

  const resetVisualSettings = () => {
    updatePreferences({
      fit: DEFAULT_PREFERENCES.fit,
      zoom: DEFAULT_PREFERENCES.zoom,
      gap: DEFAULT_PREFERENCES.gap,
      brightness: DEFAULT_PREFERENCES.brightness,
      background: DEFAULT_PREFERENCES.background
    });
  };

  const currentPage = pages[pageIndex];
  const leftSideDisabled = preferences.direction === 'ltr'
    ? pageIndex === 0
    : pageIndex >= pages.length - 1;
  const rightSideDisabled = preferences.direction === 'ltr'
    ? pageIndex >= pages.length - 1
    : pageIndex === 0;

  const pageImageStyle = useMemo<React.CSSProperties>(() => {
    const baseStyle: React.CSSProperties = {
      filter: `brightness(${preferences.brightness}%)`
    };
    if (preferences.fit === 'page') {
      return {
        ...baseStyle,
        width: 'auto',
        maxWidth: '100%',
        maxHeight: 'calc(100dvh - 11.5rem)'
      };
    }
    if (preferences.fit === 'width') {
      return { ...baseStyle, width: '100%', maxWidth: 'none' };
    }
    return { ...baseStyle, width: `${preferences.zoom}%`, maxWidth: 'none' };
  }, [preferences.brightness, preferences.fit, preferences.zoom]);

  const stripWidth = preferences.fit === 'custom' ? `${preferences.zoom}%` : '100%';

  return (
    <section
      ref={readerRef}
      data-testid="manga-reader"
      className={`relative flex h-[76dvh] max-h-[56rem] min-h-0 flex-col overflow-hidden border border-white/10 ${isFullscreen ? 'h-screen max-h-none w-screen border-0' : 'rounded-lg'}`}
      style={{ backgroundColor: BACKGROUNDS[preferences.background] }}
      aria-label={`Lector de ${title}, ${chapterLabel}`}
    >
      <header className="relative z-30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0d0f14]/96 px-2 py-2 backdrop-blur sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TooltipIconButton tooltip="Volver a capítulos" onClick={closeReader} className="size-9 shrink-0 text-slate-300 hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </TooltipIconButton>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{title}</p>
            <p className="truncate text-[11px] text-slate-400">{chapterLabel}</p>
          </div>
        </div>

        <div className="order-3 flex w-full items-center justify-between gap-2 sm:order-2 sm:w-auto sm:justify-center">
          <div className="inline-flex h-9 shrink-0 items-center rounded-md border border-white/10 bg-black/30 p-1" role="group" aria-label="Modo de lectura">
            <button
              type="button"
              onClick={() => updatePreferences({ mode: 'page' })}
              className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-bold transition-colors ${preferences.mode === 'page' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
              aria-pressed={preferences.mode === 'page'}
            >
              <Square className="h-3.5 w-3.5" /> Página
            </button>
            <button
              type="button"
              onClick={() => updatePreferences({ mode: 'continuous' })}
              className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-bold transition-colors ${preferences.mode === 'continuous' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
              aria-pressed={preferences.mode === 'continuous'}
            >
              <List className="h-3.5 w-3.5" /> Continuo
            </button>
          </div>

          {preferences.mode === 'page' && (
            <label className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-slate-300">
              <span className="sr-only">Página actual</span>
              <select
                value={pageIndex}
                onChange={event => setPageIndex(Number(event.target.value))}
                className="max-w-16 bg-transparent font-bold text-white outline-none"
                aria-label="Ir a página"
              >
                {pages.map((_, index) => <option key={index} value={index} className="bg-slate-950">{index + 1}</option>)}
              </select>
              <span className="whitespace-nowrap text-slate-500">/ {pages.length}</span>
            </label>
          )}
        </div>

        <div className="order-2 flex shrink-0 items-center gap-1 sm:order-3">
          <TooltipIconButton tooltip="Alejar" onClick={() => changeZoom(-ZOOM_STEP)} disabled={preferences.zoom <= MIN_ZOOM} className="size-9 text-slate-300 hover:bg-white/10 hover:text-white">
            <Minus className="h-4 w-4" />
          </TooltipIconButton>
          <button
            type="button"
            onClick={() => updatePreferences({ fit: 'custom', zoom: 100 })}
            className="h-9 min-w-14 rounded-md px-2 text-xs font-bold tabular-nums text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            title="Restablecer zoom al 100 %"
          >
            {preferences.zoom}%
          </button>
          <TooltipIconButton tooltip="Acercar" onClick={() => changeZoom(ZOOM_STEP)} disabled={preferences.zoom >= MAX_ZOOM} className="size-9 text-slate-300 hover:bg-white/10 hover:text-white">
            <Plus className="h-4 w-4" />
          </TooltipIconButton>
          <TooltipIconButton tooltip="Personalizar lector" onClick={() => setSettingsOpen(open => !open)} aria-expanded={settingsOpen} className="size-9 text-slate-300 hover:bg-white/10 hover:text-white">
            <Settings2 className="h-4 w-4" />
          </TooltipIconButton>
          <TooltipIconButton tooltip={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={toggleFullscreen} className="size-9 text-slate-300 hover:bg-white/10 hover:text-white">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </TooltipIconButton>
          <TooltipIconButton tooltip="Descargar capítulo" onClick={onDownload} disabled={downloadLoading} className="size-9 bg-violet-600 text-white hover:bg-violet-500">
            <Download className={`h-4 w-4 ${downloadLoading ? 'animate-pulse' : ''}`} />
          </TooltipIconButton>
        </div>
      </header>

      {settingsOpen && (
        <aside className="absolute right-2 top-28 z-40 max-h-[calc(100dvh-8rem)] w-[min(20rem,calc(100%-1rem))] overflow-y-auto rounded-lg border border-white/15 bg-[#151820]/98 p-4 text-slate-200 shadow-2xl backdrop-blur sm:top-14" aria-label="Preferencias del lector">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-white">Preferencias</h3>
            <TooltipIconButton tooltip="Restablecer apariencia" onClick={resetVisualSettings} className="size-8 text-slate-400 hover:bg-white/10 hover:text-white">
              <RotateCcw className="h-4 w-4" />
            </TooltipIconButton>
          </div>

          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-[10px] font-bold uppercase text-slate-500">Dirección</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => updatePreferences({ direction: 'ltr' })} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border text-xs font-bold ${preferences.direction === 'ltr' ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-white/10 text-slate-400 hover:border-white/20'}`} aria-pressed={preferences.direction === 'ltr'}>
                  <ArrowRight className="h-4 w-4" /> Izq. a der.
                </button>
                <button type="button" onClick={() => updatePreferences({ direction: 'rtl' })} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border text-xs font-bold ${preferences.direction === 'rtl' ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-white/10 text-slate-400 hover:border-white/20'}`} aria-pressed={preferences.direction === 'rtl'}>
                  <ArrowLeft className="h-4 w-4" /> Der. a izq.
                </button>
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[10px] font-bold uppercase text-slate-500">Ajuste de página</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => updatePreferences({ fit: 'page', zoom: 100 })} disabled={preferences.mode === 'continuous'} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${preferences.fit === 'page' ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-white/10 text-slate-400 hover:border-white/20'}`} aria-pressed={preferences.fit === 'page'}>
                  <Scan className="h-4 w-4" /> Página
                </button>
                <button type="button" onClick={() => updatePreferences({ fit: 'width', zoom: 100 })} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border text-xs font-bold ${preferences.fit === 'width' ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-white/10 text-slate-400 hover:border-white/20'}`} aria-pressed={preferences.fit === 'width'}>
                  <ArrowRight className="h-4 w-4" /> Ancho
                </button>
              </div>
            </fieldset>

            <label className="block">
              <span className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                Brillo <span className="text-slate-300">{preferences.brightness}%</span>
              </span>
              <input type="range" min="60" max="120" step="5" value={preferences.brightness} onChange={event => updatePreferences({ brightness: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
            </label>

            {preferences.mode === 'continuous' && (
              <label className="block">
                <span className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                  Separación <span className="text-slate-300">{preferences.gap}px</span>
                </span>
                <input type="range" min="0" max="32" step="4" value={preferences.gap} onChange={event => updatePreferences({ gap: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
              </label>
            )}

            <fieldset>
              <legend className="text-[10px] font-bold uppercase text-slate-500">Fondo</legend>
              <div className="mt-2 flex gap-2">
                {(Object.keys(BACKGROUNDS) as ReaderBackground[]).map(background => (
                  <button
                    key={background}
                    type="button"
                    onClick={() => updatePreferences({ background })}
                    className={`size-9 rounded-md border-2 ${preferences.background === background ? 'border-violet-400' : 'border-white/10'}`}
                    style={{ backgroundColor: BACKGROUNDS[background] }}
                    aria-label={`Fondo ${background === 'black' ? 'negro' : background === 'charcoal' ? 'carbón' : 'suave'}`}
                    aria-pressed={preferences.background === background}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        </aside>
      )}

      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-auto overscroll-contain" data-testid="manga-reader-viewport">
        {preferences.mode === 'page' ? (
          <div className="relative flex min-h-full min-w-full items-start justify-center overflow-visible p-3 sm:p-5">
            {currentPage && (
              <img
                key={currentPage}
                src={currentPage}
                alt={`Página ${pageIndex + 1} de ${pages.length}`}
                referrerPolicy="no-referrer"
                draggable={false}
                className="block shrink-0 animate-fadeIn select-none object-contain shadow-2xl"
                style={pageImageStyle}
                data-testid="manga-reader-current-page"
              />
            )}
            <button type="button" onClick={() => moveFromPhysicalSide('left')} disabled={leftSideDisabled} className="group absolute inset-y-0 left-0 z-10 w-1/2 cursor-w-resize disabled:cursor-default" aria-label={preferences.direction === 'ltr' ? 'Página anterior' : 'Página siguiente'}>
              <span className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:hidden"><ChevronLeft className="h-6 w-6" /></span>
            </button>
            <button type="button" onClick={() => moveFromPhysicalSide('right')} disabled={rightSideDisabled} className="group absolute inset-y-0 right-0 z-10 w-1/2 cursor-e-resize disabled:cursor-default" aria-label={preferences.direction === 'ltr' ? 'Página siguiente' : 'Página anterior'}>
              <span className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:hidden"><ChevronRight className="h-6 w-6" /></span>
            </button>
          </div>
        ) : (
          <div className="mx-auto min-h-full max-w-5xl px-2 py-3 sm:px-4" style={{ width: stripWidth }} data-testid="manga-reader-continuous">
            <div className="flex flex-col items-center" style={{ gap: `${preferences.gap}px` }}>
              {pages.map((page, index) => (
                <img
                  key={`${page}-${index}`}
                  src={page}
                  alt={`Página ${index + 1} de ${pages.length}`}
                  loading={index < 2 ? 'eager' : 'lazy'}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  className="block w-full select-none bg-slate-950 object-contain"
                  style={{ filter: `brightness(${preferences.brightness}%)` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default MangaReader;
