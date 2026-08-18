import React, { useMemo, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
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
 * Panel de búsqueda por género de la sección Manga: compone dos
 * GenreTagPicker (géneros y temas) con un buscador que filtra ambos a la
 * vez, y una franja de "seleccionados" para ver los filtros activos sin
 * tener que escanear la lista completa.
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
  hasNoSourceTags = false
}) => {
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

  const hasActiveFilters = selectedChips.length > 0 || Boolean(statusFilter);

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
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-main)]">
          <Filter className="h-4 w-4 text-[var(--accent-primary)]" /> Filtros de catálogo
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            Limpiar filtros
          </button>
        )}
      </div>

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
    </section>
  );
};
