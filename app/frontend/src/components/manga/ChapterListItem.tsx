import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { MangaOnlineChapter } from '../../types';

interface ChapterListItemProps {
  chapter: MangaOnlineChapter;
  /** El capítulo ya existe descargado en el almacenamiento offline. */
  offline?: boolean;
  /**
   * En modo biblioteca local, "no descargado" bloquea la apertura y debe
   * decirlo explícitamente. En modo online, "no descargado" es el estado
   * normal (se lee desde la fuente) y no hace falta remarcarlo.
   */
  requiresDownloadToOpen?: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onDownload?: () => void;
  downloadLoading?: boolean;
}

export const ChapterListItem: React.FC<ChapterListItemProps> = ({
  chapter,
  offline = false,
  requiresDownloadToOpen = false,
  disabled = false,
  onOpen,
  onDownload,
  downloadLoading = false
}) => {
  const label = chapter.title
    ? `Cap. ${chapter.number ?? 'S/N'} · ${chapter.title}`
    : `Cap. ${chapter.number ?? 'S/N'}`;

  return (
    <div
      data-testid="manga-chapter-row"
      className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-slate-950/45 px-3 py-2"
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          data-testid="manga-chapter-label"
          className="block truncate text-sm font-bold text-[var(--text-main)] hover:text-[var(--accent-primary)]"
        >
          {label}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="status-badge bg-slate-800 text-[var(--text-dim)]">{chapter.language}</span>
          {chapter.group && (
            <span className="status-badge bg-slate-800 text-[var(--text-dim)]" title="Grupo de traducción">
              {chapter.group}
            </span>
          )}
          {offline && (
            <span className="status-badge bg-emerald-500/15 text-emerald-300" data-testid="manga-chapter-offline-badge">
              Descargado
            </span>
          )}
          {!offline && requiresDownloadToOpen && (
            <span className="status-badge bg-slate-800 text-[var(--text-dim)]">Descarga requerida</span>
          )}
        </span>
      </button>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          disabled={downloadLoading}
          className="shrink-0 rounded-md p-2 text-[var(--text-muted)] hover:bg-slate-800 hover:text-white disabled:opacity-50"
          aria-label="Descargar capítulo"
          title="Descargar capítulo"
        >
          {downloadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
};
