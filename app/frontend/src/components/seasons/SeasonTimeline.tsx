import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Database,
  X
} from 'lucide-react';
import type { AnimeSeasonId } from '../../utils/animeSeason';

interface SeasonTimelineProps {
  currentYear: number;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  selectedSeason: AnimeSeasonId;
  setSelectedSeason: (season: AnimeSeasonId) => void;
  totalAnimesCount?: number;
  availableYears?: number[];
  seasonCounts?: Record<string, number>;
}

const FIRST_YEAR = 2000;
const LAST_YEAR = 2033;

const SEASONS = [
  { id: 'winter', name: 'Invierno', shortName: 'Inv' },
  { id: 'spring', name: 'Primavera', shortName: 'Pri' },
  { id: 'summer', name: 'Verano', shortName: 'Ver' },
  { id: 'fall', name: 'Otoño', shortName: 'Oto' }
] as const;

const DECADES = [
  { label: '2000-2009', start: 2000, end: 2009 },
  { label: '2010-2019', start: 2010, end: 2019 },
  { label: '2020-2029', start: 2020, end: 2029 },
  { label: '2030-2033', start: 2030, end: 2033 }
] as const;

export const SeasonTimeline: React.FC<SeasonTimelineProps> = ({
  currentYear,
  selectedYear,
  setSelectedYear,
  selectedSeason,
  setSelectedSeason,
  totalAnimesCount = 0,
  availableYears = [],
  seasonCounts = {}
}) => {
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [activeDecadeStart, setActiveDecadeStart] = useState(
    DECADES.find(decade => selectedYear >= decade.start && selectedYear <= decade.end)?.start || 2020
  );

  const availableYearSet = useMemo(() => new Set(availableYears), [availableYears]);
  const activeDecade = DECADES.find(decade => decade.start === activeDecadeStart) || DECADES[2];
  const archiveYears = useMemo(
    () => Array.from(
      { length: activeDecade.end - activeDecade.start + 1 },
      (_, index) => activeDecade.end - index
    ),
    [activeDecade]
  );

  useEffect(() => {
    if (!isArchiveOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsArchiveOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isArchiveOpen]);

  const handleSelect = (year: number, seasonId: AnimeSeasonId) => {
    setSelectedYear(year);
    setSelectedSeason(seasonId);
    setIsArchiveOpen(false);
  };

  const moveYear = (offset: number) => {
    setSelectedYear(Math.min(LAST_YEAR, Math.max(FIRST_YEAR, selectedYear + offset)));
  };

  const openArchive = () => {
    const decade = DECADES.find(item => selectedYear >= item.start && selectedYear <= item.end);
    if (decade) setActiveDecadeStart(decade.start);
    setIsArchiveOpen(true);
  };

  return (
    <>
      <section className="border border-[var(--border-light)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-3 lg:w-52">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-widest text-[var(--text-dim)]">
                Año seleccionado
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveYear(-1)}
                  disabled={selectedYear <= FIRST_YEAR}
                  className="flex h-7 w-7 items-center justify-center text-[var(--text-muted)] hover:text-white disabled:opacity-25"
                  aria-label="Año anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="min-w-14 text-center">
                  <strong className="block text-xl font-black text-white">{selectedYear}</strong>
                  {selectedYear === currentYear && (
                    <span className="block text-[8px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">Actual</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => moveYear(1)}
                  disabled={selectedYear >= LAST_YEAR}
                  className="flex h-7 w-7 items-center justify-center text-[var(--text-muted)] hover:text-white disabled:opacity-25"
                  aria-label="Año siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
            {SEASONS.map(season => {
              const count = seasonCounts[`${selectedYear}:${season.id}`] || 0;
              const isActive = selectedSeason === season.id;
              return (
                <button
                  key={season.id}
                  type="button"
                  onClick={() => handleSelect(selectedYear, season.id)}
                  className={`min-h-14 border px-3 py-2 text-left maple-interactive ${
                    isActive
                      ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 text-white'
                      : 'border-[var(--border-medium)] bg-slate-950/25 text-[var(--text-muted)] hover:border-slate-600 hover:text-white'
                  }`}
                >
                  <span className="block text-[9px] font-black uppercase tracking-widest text-current/60">
                    {season.shortName}
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2 text-xs font-bold">
                    {season.name}
                    {count > 0 && <span className="text-[10px] text-[var(--accent-secondary)]">{count}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 flex-col gap-2 lg:w-48">
            <button
              type="button"
              onClick={openArchive}
              className="flex items-center justify-center gap-2 border border-[var(--border-medium)] bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-[var(--accent-primary)]/40 hover:text-white"
            >
              <CalendarRange className="h-4 w-4 text-[var(--accent-primary)]" />
              Explorar 2000-2033
            </button>
            <span className="text-center text-[9px] font-semibold text-[var(--text-dim)]">
              {totalAnimesCount} series en esta selección
            </span>
          </div>
        </div>
      </section>

      {isArchiveOpen && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 maple-backdrop-enter"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setIsArchiveOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="season-archive-title"
            className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden border border-[var(--border-medium)] bg-[var(--bg-panel)] shadow-2xl maple-panel-enter"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--border-medium)] p-5">
              <div>
                <h3 id="season-archive-title" className="text-lg font-black text-white">
                  Archivo de temporadas
                </h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Selecciona cualquier temporada entre 2000 y 2033. Los indicadores muestran datos guardados localmente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsArchiveOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Cerrar archivo de temporadas"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="grid grid-cols-2 border-b border-[var(--border-medium)] sm:grid-cols-4">
              {DECADES.map(decade => (
                <button
                  key={decade.start}
                  type="button"
                  onClick={() => setActiveDecadeStart(decade.start)}
                  className={`border-r border-[var(--border-medium)] px-3 py-3 text-xs font-bold last:border-r-0 ${
                    activeDecadeStart === decade.start
                      ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                      : 'text-slate-400 hover:bg-slate-900/50 hover:text-white'
                  }`}
                >
                  {decade.label}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto p-4 sm:p-5">
              <div className="space-y-2">
                {archiveYears.map(year => {
                  const hasLocalData = availableYearSet.has(year);
                  const isSelectedYear = year === selectedYear;
                  return (
                    <div
                      key={year}
                      className={`grid gap-2 border p-3 sm:grid-cols-[92px_1fr] sm:items-center ${
                        isSelectedYear
                          ? 'border-[var(--accent-primary)]/35 bg-[var(--accent-primary)]/5'
                          : 'border-[var(--border-light)] bg-slate-950/20'
                      }`}
                    >
                      <div className="flex items-center justify-between sm:block">
                        <strong className="text-sm font-black text-white">{year}</strong>
                        <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${
                          hasLocalData ? 'text-emerald-400' : 'text-slate-600'
                        }`}>
                          <Database className="h-3 w-3" />
                          {hasLocalData ? 'Local' : 'Sin datos'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {SEASONS.map(season => {
                          const count = seasonCounts[`${year}:${season.id}`] || 0;
                          const isActive = selectedYear === year && selectedSeason === season.id;
                          return (
                            <button
                              key={season.id}
                              type="button"
                              onClick={() => handleSelect(year, season.id)}
                              className={`flex min-h-9 items-center justify-between border px-2.5 text-[10px] font-bold ${
                                isActive
                                  ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/15 text-white'
                                  : 'border-[var(--border-medium)] text-slate-400 hover:border-slate-600 hover:text-white'
                              }`}
                            >
                              <span>{season.shortName}</span>
                              {count > 0 && <span className="text-[9px] text-cyan-400">{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  );
};
