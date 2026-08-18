import React from 'react';
import type { MangaOnlineTag } from '../../types';

interface GenreTagPickerProps {
  label: string;
  tags: MangaOnlineTag[];
  selected: string[];
  onChange: (next: string[]) => void;
  limit?: number;
  emptyHint?: string;
}

/**
 * Selector de etiquetas por chips en vez de un <select multiple> nativo.
 * Reemplaza el multiselect de géneros/temas de la sección Manga: mismo
 * límite y misma forma de filtro (lista de IDs), solo cambia la interacción
 * — botones accesibles con aria-pressed en vez de ctrl/cmd+clic.
 */
export const GenreTagPicker: React.FC<GenreTagPickerProps> = ({
  label,
  tags,
  selected,
  onChange,
  limit = 4,
  emptyHint
}) => {
  const toggle = (tagId: string) => {
    const isSelected = selected.includes(tagId);
    if (isSelected) {
      onChange(selected.filter(id => id !== tagId));
      return;
    }
    if (selected.length >= limit) return;
    onChange([...selected, tagId]);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-dim)]">
          {selected.length}/{limit}
        </span>
      </div>
      {tags.length === 0 ? (
        <p className="mt-1 text-[11px] text-[var(--text-dim)]">{emptyHint || 'Sin opciones disponibles.'}</p>
      ) : (
        <div
          role="group"
          aria-label={label}
          className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-[var(--border-soft)] bg-slate-950/70 p-2"
        >
          {tags.map(tag => {
            const isSelected = selected.includes(tag.id);
            const atLimit = !isSelected && selected.length >= limit;
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={isSelected}
                disabled={atLimit}
                onClick={() => toggle(tag.id)}
                title={atLimit ? `Máximo ${limit} seleccionados` : tag.name}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  isSelected
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                    : 'border-[var(--border-soft)] bg-slate-900/60 text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border-soft)]'
                }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
