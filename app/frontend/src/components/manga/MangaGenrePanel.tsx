import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Filter, Search, X } from 'lucide-react';
import { GenreTagPicker } from './GenreTagPicker';
import type { MangaOnlineTag } from '../../types';

interface MangaGenrePanelProps {
  genreTags: MangaOnlineTag[];
  topicTags: MangaOnlineTag[];
  selectedGenres: string[];
  selectedTags: string[];
  onGenresChange: (next: string[]) => void;
  onTagsChange: (next: string[]) => void;
  statusFilter: string;
  onStatusChange: (next: string) => void;
  /** Aplica los filtros seleccionados a la búsqueda online. */
  onSearch: () => void;
  hasNoSourceTags?: boolean;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Cualquier estado' },
  { value: 'ongoing', label: 'En publicación' },
  { value: 'completed', label: 'Finalizado' },
  { value: 'hiatus', label: 'En pausa' }
];

const matchesQuery = (tag: MangaOnlineTag, query: string) => tag.name.toLowerCase().includes(query);

/**
 * Panel de búsqueda por género de la sección Manga. Colapsado por defecto
 * para no ocupar pantalla: la cabecera es un botón que expande/contrae el
 * contenido (dos GenreTagPicker, buscador de chips y estado). Un botón
 * "Buscar con estos filtros" aplica la selección a la búsqueda online sin
 * depender del formulario de texto principal.
 */
export const MangaGenrePanel: React.FC<MangaGenrePanelProps> = ({
  genreTags,
  topicTags,
  selectedGenres,
  selectedTags,
  onGenresChange,
  onTagsChange,
  statusFilter,
  onStatusChange,
  onSearch,
  hasNoSourceTags = false
}) => {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGenreTags = useMemo(
    () => (normalizedQuery ? genreTags.filter(tag => matchesQuery(tag, normalizedQuery)) : genreTags),
    [genreTags, normalizedQuery]
  );
  const filteredTopicTags = useMemo(
    () => (normalizedQuery ? topicTags.filter(tag => matchesQuery(tag, normalizedQuery)) : topicTags),
    [topicTags, normalizedQuery]
  );

  const selectedChips = useMemo(() => {
    const byId = new Map<string, MangaOnlineTag>();
    for (const tag of genreTags) byId.set(tag.id, tag);
    for (const tag of topicTags) byId.set(tag.id, tag);
    return [...selectedGenres, ...selectedTags]
      .map(id => byId.get(id))
      .filter((tag): tag is MangaOnlineTag => Boolean(tag));
  }, [genreTags, topicTags, selectedGenres, selectedTags]);

  const activeFilterCount = selectedChips.length + (statusFilter ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = () => {
    onGenresChange([]);
    onTagsChange([]);
    onStatusChange('');
    setQuery('');
  };

  const removeChip = (tagId: string) => {
    if (selectedGenres.includes(tagId)) onGenresChange(selectedGenres.filter(id => id !== tagId));
    if (selectedTags.includes(tagId)) onTagsChange(selectedTags.filter(id => id !== tagId));
  };

  return (
    <section className="rounded-lg border border-[var(--border-medium)] bg-slate-900/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-bold text-[var(--text-main)]"
        >
          <Filter className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
          <span>Filtros de catálogo</span>
          {hasActiveFilters && (
            <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent-primary)]">
              {activeFilterCount} {activeFilterCount === 1 ? 'activo' : 'activos'}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-[var(--text-dim)]" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-dim)]" />
          )}
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="shrink-0 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {expanded && (
        <>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              type="text"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar género o tema..."
              aria-label="Buscar género o tema"
              className="w-full rounded-md border border-[var(--border-soft)] bg-slate-950/70 py-2 pl-9 pr-3 text-xs text-[var(--text-main)] placeholder-[var(--text-dim)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          {selectedChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-[var(--border-soft)] bg-slate-950/40 p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-dim)]">Seleccionados</span>
              {selectedChips.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => removeChip(tag.id)}
                  className="flex items-center gap-1 rounded-full border border-[var(--accent-primary)] bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-primary)] hover:bg-[var(--accent-soft-hover)]"
                  title={`Quitar ${tag.name}`}
                >
                  {tag.name}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <GenreTagPicker
              label="Géneros"
              tags={filteredGenreTags}
              selected={selectedGenres}
              onChange={onGenresChange}
              emptyHint={normalizedQuery ? 'Ningún género coincide con la búsqueda.' : 'Esta fuente no expone géneros.'}
            />
            <GenreTagPicker
              label="Temas y etiquetas"
              tags={filteredTopicTags}
              selected={selectedTags}
              onChange={onTagsChange}
              emptyHint={normalizedQuery ? 'Ningún tema coincide con la búsqueda.' : 'Esta fuente no expone temas.'}
            />
          </div>

          <label className="mt-4 block text-xs text-[var(--text-muted)] sm:max-w-xs">
            Estado
            <select
              value={statusFilter}
              onChange={event => onStatusChange(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[var(--border-soft)] bg-slate-950/70 px-2 text-xs text-[var(--text-main)]"
            >
              {STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {hasNoSourceTags && (
            <p className="mt-2 text-[11px] text-[var(--text-dim)]">
              Esta fuente no expone filtros de etiquetas; la búsqueda por título sigue disponible.
            </p>
          )}

          <button
            type="button"
            onClick={onSearch}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--accent-primary-hover)]"
          >
            <Search className="h-3.5 w-3.5" /> Buscar con estos filtros
          </button>
        </>
      )}
    </section>
  );
};
