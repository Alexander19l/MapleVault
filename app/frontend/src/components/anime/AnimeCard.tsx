import React from 'react';
import { Star, Heart, Check, Eye, Trash2 } from 'lucide-react';
import type { Anime } from '../../types';
import { Badge } from '../ui/Badge';

interface AnimeCardProps {
  anime: Anime;
  viewMode?: 'card' | 'list' | 'compact';
  onViewDetails: (id: number) => void;
  onToggleFavorite?: (id: number, isFavorite: boolean) => void;
  onQuickStatusChange?: (id: number, status: 'watching' | 'completed' | 'plan_to_watch') => void;
  onDelete?: (id: number) => void;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({
  anime,
  viewMode = 'card',
  onViewDetails,
  onToggleFavorite,
  onQuickStatusChange,
  onDelete,
}) => {
  const isFav = anime.favorite === 1;

  // Emission status mapper
  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'airing': return 'En Emisión';
      case 'finished': return 'Finalizado';
      case 'upcoming': return 'Próximamente';
      case 'cancelled': return 'Cancelado';
      default: return 'Desconocido';
    }
  };

  // User list status mapper
  const getUserStatusVariant = (status?: string): 'watching' | 'completed' | 'pending' | 'dropped' | 'default' => {
    switch (status) {
      case 'watching': return 'watching';
      case 'completed': return 'completed';
      case 'plan_to_watch': return 'pending';
      case 'dropped': return 'dropped';
      case 'on_hold': return 'pending';
      default: return 'default';
    }
  };

  const getUserStatusLabel = (status?: string) => {
    switch (status) {
      case 'watching': return 'Viendo';
      case 'completed': return 'Completado';
      case 'plan_to_watch': return 'Pendiente';
      case 'dropped': return 'Abandonado';
      case 'on_hold': return 'Pausado';
      default: return '';
    }
  };

  const progressPercent = anime.episodes && anime.episodes > 0 && anime.episodes_watched
    ? Math.min(100, (anime.episodes_watched / anime.episodes) * 100)
    : 0;

  // --- GRID CARD VIEW ---
  if (viewMode === 'card') {
    return (
      <div className="flex flex-col bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl overflow-hidden card-scale-hover group relative h-full maple-list-enter maple-interactive">
        {/* Cover Image */}
        <div className="aspect-[3/4] w-full bg-slate-900 overflow-hidden relative select-none">
          <img
            src={anime.cover_image || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300&auto=format&fit=crop'}
            alt={anime.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] filter brightness-[0.9] group-hover:brightness-100"
            loading="lazy"
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-secondary)]/90 via-transparent to-black/20 opacity-80" />

          {/* Badges on top */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
            {anime.status && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded border border-white/5 text-[var(--text-muted)]">
                {anime.status_label_es || getStatusLabel(anime.status)}
              </span>
            )}
            {anime.watch_status && (
              <Badge variant={getUserStatusVariant(anime.watch_status)}>
                {getUserStatusLabel(anime.watch_status)}
              </Badge>
            )}
          </div>

          {/* Score Badge */}
          {anime.score && (
            <div className="absolute top-2.5 right-2.5 flex items-center space-x-0.5 px-1.5 py-0.5 bg-slate-950/70 backdrop-blur-md rounded text-[10px] font-extrabold text-amber-400 border border-amber-500/10 z-10">
              <Star className="h-3 w-3 fill-amber-400 mr-0.5" />
              <span>{anime.score.toFixed(1)}</span>
            </div>
          )}

          {/* Play/Detail hover overlays (Plex/Netflix style) */}
          <div className="absolute inset-0 flex items-center justify-center space-x-2 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-[2px] z-20">
            <button
              onClick={() => onViewDetails(anime.id)}
              className="p-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] rounded-full text-white shadow-md transition-transform duration-200 hover:scale-105 cursor-pointer"
              title="Detalles"
            >
              <Eye className="h-4.5 w-4.5" />
            </button>
            {onQuickStatusChange && anime.watch_status !== 'completed' && (
              <button
                onClick={() => onQuickStatusChange(anime.id, 'completed')}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-full text-white shadow-md transition-transform duration-200 hover:scale-105 cursor-pointer"
                title="Marcar completado"
              >
                <Check className="h-4.5 w-4.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(anime.id)}
                className="p-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-full text-white shadow-md transition-transform duration-200 hover:scale-105 cursor-pointer"
                title="Eliminar de biblioteca"
              >
                <Trash2 className="h-4.5 w-4.5" />
              </button>
            )}
          </div>

          {/* Plex-style Thin Progress Bar */}
          {anime.watch_status === 'watching' && progressPercent > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/80 z-20">
              <div 
                className="h-full bg-[var(--accent-primary)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* Text Details */}
        <div className="p-3 flex flex-col flex-1">
          <span className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-0.5 truncate">
            {anime.studio || 'Estudio Desconocido'}
          </span>
          <h3 
            onClick={() => onViewDetails(anime.id)}
            className="text-xs font-bold text-[var(--text-main)] hover:text-[var(--accent-primary)] cursor-pointer mb-2 flex-1 line-clamp-1 transition-colors leading-tight"
            title={anime.title}
          >
            {anime.title}
          </h3>

          <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-[var(--border-light)]">
            <span className="text-[10px] text-[var(--text-dim)] font-semibold">
              {anime.year ? `${anime.year} • ` : ''}
              {anime.type_label_es || (anime.type ? String(anime.type).toUpperCase() : 'TV')}
            </span>

            {onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(anime.id, !isFav)}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isFav ? 'text-pink-500 hover:bg-pink-500/10' : 'text-[var(--text-dim)] hover:text-pink-400 hover:bg-slate-800/60'
                }`}
                title={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
              >
                <Heart className={`h-3.5 w-3.5 ${isFav ? 'fill-pink-500' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- LIST ROW VIEW ---
  if (viewMode === 'list') {
    return (
      <div className="flex bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl overflow-hidden p-3.5 space-x-4 hover:border-slate-700/60 maple-list-enter maple-interactive">
        {/* Poster image */}
        <div className="w-20 h-28 rounded-lg bg-slate-900 overflow-hidden shrink-0 relative select-none shadow-md">
          <img
            src={anime.cover_image || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300&auto=format&fit=crop'}
            alt={anime.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {anime.watch_status === 'watching' && progressPercent > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-850">
              <div 
                className="h-full bg-[var(--accent-primary)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* Text descriptions */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-start justify-between space-x-2">
              <div>
                <h3 
                  onClick={() => onViewDetails(anime.id)}
                  className="text-sm font-bold text-[var(--text-main)] hover:text-[var(--accent-primary)] cursor-pointer transition-colors truncate"
                >
                  {anime.title}
                </h3>
                <p className="text-[10px] text-[var(--text-dim)] font-semibold mt-0.5">
                  {anime.studio || 'Estudio Desconocido'}
                  {anime.title_japanese && ` • ${anime.title_japanese}`}
                </p>
              </div>
              <div className="flex items-center space-x-1.5 shrink-0">
                {anime.status && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-800 rounded text-[var(--text-muted)] border border-slate-700/40">
                    {anime.status_label_es || getStatusLabel(anime.status)}
                  </span>
                )}
                {anime.watch_status && (
                  <Badge variant={getUserStatusVariant(anime.watch_status)}>
                    {getUserStatusLabel(anime.watch_status)}
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-xs text-[var(--text-muted)] line-clamp-2 mt-2 leading-relaxed">
              {anime.synopsis || 'Sin sinopsis disponible.'}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border-light)] text-[10px] text-[var(--text-dim)] font-semibold">
            <div className="flex space-x-3.5">
              <span>{anime.year ? `Estreno: ${anime.year}` : ''} {anime.season ? `(${String(anime.season).toUpperCase()})` : ''}</span>
              <span>Caps: {anime.episodes || '?'}</span>
              {anime.score && (
                <span className="flex items-center text-amber-400 font-bold">
                  <Star className="h-3 w-3 fill-amber-400 mr-0.5" />
                  {anime.score.toFixed(1)}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onViewDetails(anime.id)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700/80 rounded-lg text-[var(--text-main)] flex items-center space-x-1 cursor-pointer"
              >
                <Eye className="h-3 w-3" />
                <span>Detalles</span>
              </button>
              {onToggleFavorite && (
                <button
                  onClick={() => onToggleFavorite(anime.id, !isFav)}
                  className={`p-1.5 rounded-lg border border-[var(--border-medium)] cursor-pointer ${
                    isFav ? 'bg-pink-500/10 text-pink-500 border-pink-500/20' : 'text-[var(--text-dim)] hover:text-pink-400 hover:bg-slate-800/80'
                  }`}
                >
                  <Heart className={`h-3.5 w-3.5 ${isFav ? 'fill-pink-500' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- COMPACT TABLE VIEW ---
  return (
    <div className="flex items-center justify-between p-2.5 bg-slate-900/30 hover:bg-[var(--bg-card)] border border-[var(--border-light)]/40 hover:border-[var(--border-medium)] rounded-lg space-x-3 text-xs maple-list-enter maple-interactive">
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        {anime.score && (
          <span className="flex items-center text-amber-400 font-bold w-10 shrink-0">
            <Star className="h-3 w-3 fill-amber-400 mr-0.5" />
            {anime.score.toFixed(1)}
          </span>
        )}
        <span 
          onClick={() => onViewDetails(anime.id)}
          className="font-bold text-[var(--text-main)] truncate hover:text-[var(--accent-primary)] cursor-pointer flex-1"
        >
          {anime.title}
        </span>
      </div>

      <div className="flex items-center space-x-3 shrink-0">
        <span className="text-[10px] text-[var(--text-dim)] font-semibold">
          {anime.year || 'S/A'} {anime.season ? `(${String(anime.season).slice(0, 3).toUpperCase()})` : ''}
        </span>
        {anime.watch_status && (
          <Badge variant={getUserStatusVariant(anime.watch_status)}>
            {getUserStatusLabel(anime.watch_status)}
          </Badge>
        )}
        <button
          onClick={() => onViewDetails(anime.id)}
          className="p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-slate-800 rounded cursor-pointer"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
