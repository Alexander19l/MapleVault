import React from 'react';
import { Star, Heart, ExternalLink, Bookmark, CheckCircle2 } from 'lucide-react';
import type { Anime } from '../../types';
import { Button } from '../ui/button';

interface AnimeDetailHeroProps {
  anime: Anime;
  inList: boolean;
  watchStatus: 'watching' | 'plan_to_watch' | 'completed' | 'dropped' | 'on_hold';
  setWatchStatus: (status: any) => void;
  favorite: boolean;
  setFavorite: (fav: boolean) => void;
  userScore: number;
  setUserScore: (score: number) => void;
  episodesWatched: number;
  setEpisodesWatched: (eps: number) => void;
  notes: string;
  setNotes: (notes: string) => void;
  savingProgress: boolean;
  handleSaveProgress: (e: React.FormEvent) => void;
  handleRemoveFromList: () => void;
  handleOpenExternal: (url?: string) => void;
}

export const AnimeDetailHero: React.FC<AnimeDetailHeroProps> = ({
  anime,
  inList,
  watchStatus,
  setWatchStatus,
  favorite,
  setFavorite,
  userScore,
  setUserScore,
  episodesWatched,
  setEpisodesWatched,
  notes,
  setNotes,
  savingProgress,
  handleSaveProgress,
  handleRemoveFromList,
  handleOpenExternal
}) => {
  const displayGenres = Array.isArray(anime.genres_es) && anime.genres_es.length > 0
    ? anime.genres_es
    : anime.genres || [];

  return (
    <div className="space-y-6">
      {/* Banner / Backdrop Header */}
      <div className="h-56 relative rounded-2xl overflow-hidden shrink-0 select-none shadow-lg">
        <img
          src={anime.banner_image || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1000&auto=format&fit=crop'}
          alt={anime.title}
          className="w-full h-full object-cover brightness-[0.3]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-transparent to-black/30" />

        {/* Floating title details */}
        <div className="absolute bottom-5 left-6 right-6">
          <span className="px-2 py-0.5 bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] text-[9px] font-bold border border-[var(--accent-primary)]/10 rounded uppercase tracking-wider mb-2 inline-block">
            {anime.studio || 'Estudio Desconocido'}
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-md">
            {anime.title}
          </h2>
          <p className="text-[11px] text-slate-300 mt-1 drop-shadow-sm truncate font-medium">
            {anime.title_japanese && `${anime.title_japanese} • `}
            {anime.title_romaji && `${anime.title_romaji}`}
          </p>
        </div>
      </div>

      {/* Main Details Body */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Poster & External Database Links */}
        <div className="space-y-5">
          <div className="aspect-[3/4] rounded-xl overflow-hidden bg-slate-900 border border-[var(--border-light)] shadow-md select-none">
            <img
              src={anime.cover_image || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300&auto=format&fit=crop'}
              alt={anime.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Links panel */}
          <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-light)] space-y-3">
            <h4 className="text-[10px] font-extrabold text-[var(--text-dim)] uppercase tracking-wider">
              Enlaces Externos
            </h4>
            <div className="flex flex-col gap-2">
              {anime.official_url && (
                <button
                  onClick={() => handleOpenExternal(anime.official_url)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 hover:bg-slate-900 text-[var(--text-main)] hover:text-[var(--accent-primary)] text-xs rounded-lg transition-colors border border-[var(--border-light)]/50 cursor-pointer"
                >
                  <span>Sitio Oficial</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => handleOpenExternal(`https://anilist.co/search/anime?search=${encodeURIComponent(anime.title)}`)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 hover:bg-slate-900 text-[var(--text-main)] hover:text-sky-400 text-xs rounded-lg transition-colors border border-[var(--border-light)]/50 cursor-pointer"
              >
                <span>Ficha en AniList</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleOpenExternal(`https://myanimelist.net/anime.php?q=${encodeURIComponent(anime.title)}`)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 hover:bg-slate-900 text-[var(--text-main)] hover:text-blue-400 text-xs rounded-lg transition-colors border border-[var(--border-light)]/50 cursor-pointer"
              >
                <span>Ficha en MyAnimeList</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Technical details & User Progress */}
        <div className="md:col-span-2 space-y-6">
          {/* Synopsis */}
          <div>
            <h4 className="text-[10px] font-extrabold text-[var(--text-dim)] uppercase tracking-wider mb-2">
              Sinopsis
            </h4>
            <p className="text-[var(--text-muted)] text-xs leading-relaxed whitespace-pre-wrap">
              {anime.synopsis || 'No hay sinopsis disponible para esta serie.'}
            </p>
          </div>

          {/* Technical Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-950/20 border border-[var(--border-light)] rounded-xl">
            <div>
              <span className="text-[9px] text-[var(--text-dim)] uppercase font-bold tracking-wider block">Estudio</span>
              <span className="text-xs font-bold text-[var(--text-main)]">{anime.studio || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[9px] text-[var(--text-dim)] uppercase font-bold tracking-wider block">Temporada</span>
              <span className="text-xs font-bold text-[var(--text-main)] capitalize">
                {anime.season || 'N/A'} {anime.year || ''}
              </span>
            </div>
            <div>
              <span className="text-[9px] text-[var(--text-dim)] uppercase font-bold tracking-wider block">Formato</span>
              <span className="text-xs font-bold text-[var(--text-main)] uppercase">{anime.type_label_es || anime.type || 'TV'}</span>
            </div>
            <div>
              <span className="text-[9px] text-[var(--text-dim)] uppercase font-bold tracking-wider block">Capítulos</span>
              <span className="text-xs font-bold text-[var(--text-main)]">{anime.episodes || '?'} caps</span>
            </div>
            <div>
              <span className="text-[9px] text-[var(--text-dim)] uppercase font-bold tracking-wider block">Duración</span>
              <span className="text-xs font-bold text-[var(--text-main)]">{anime.duration ? `${anime.duration} min` : '?'}</span>
            </div>
            <div>
              <span className="text-[9px] text-[var(--text-dim)] uppercase font-bold tracking-wider block">Puntaje</span>
              <span className="text-xs font-bold text-amber-400 flex items-center">
                <Star className="h-3.5 w-3.5 fill-amber-400 mr-1" />
                {anime.score ? anime.score.toFixed(2) : 'S/P'}
              </span>
            </div>
          </div>

          {/* Genres */}
          {displayGenres.length > 0 && (
            <div>
              <h4 className="text-[10px] font-extrabold text-[var(--text-dim)] uppercase tracking-wider mb-2">
                Géneros
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {displayGenres.map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-1 bg-[var(--bg-card)] text-[var(--text-muted)] text-[10px] font-bold rounded-lg border border-[var(--border-light)]/40"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Personal Progress Manager */}
          <div className="p-4 border border-[var(--accent-primary)]/10 bg-[var(--accent-primary)]/5 rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-light)]/50 pb-2">
              <h3 className="text-xs font-bold text-[var(--accent-primary)] flex items-center">
                <Bookmark className="h-4 w-4 mr-1.5" />
                Mi Registro Personal
              </h3>
              {inList && (
                <button
                  type="button"
                  onClick={handleRemoveFromList}
                  className="text-[10px] text-[var(--status-dropped)] font-bold hover:underline cursor-pointer"
                >
                  Quitar de mi lista
                </button>
              )}
            </div>

            <form onSubmit={handleSaveProgress} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Watch Status */}
                <div>
                  <label className="block text-[9px] text-[var(--text-dim)] font-bold uppercase tracking-wider mb-1">
                    Estado
                  </label>
                  <select
                    value={watchStatus}
                    onChange={(e: any) => setWatchStatus(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-medium)] text-[var(--text-main)] text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[var(--accent-primary)]"
                  >
                    <option value="plan_to_watch">Pendiente</option>
                    <option value="watching">Viendo</option>
                    <option value="completed">Completado</option>
                    <option value="on_hold">Pausado</option>
                    <option value="dropped">Abandonado</option>
                  </select>
                </div>

                {/* Favorite Button */}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setFavorite(!favorite)}
                    className={`w-full py-1.5 px-3 border rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer ${
                      favorite 
                        ? 'bg-pink-500/10 text-pink-500 border-pink-500/30' 
                        : 'bg-[var(--bg-card)] text-[var(--text-dim)] border-[var(--border-medium)] hover:bg-slate-800'
                    }`}
                  >
                    <Heart className={`h-3.5 w-3.5 ${favorite ? 'fill-pink-500' : ''}`} />
                    <span>{favorite ? 'Favorito' : 'Marcar Favorito'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* User Score Selection */}
                <div>
                  <label className="block text-[9px] text-[var(--text-dim)] font-bold uppercase tracking-wider mb-1">
                    Mi Nota ({userScore || 'Sin nota'})
                  </label>
                  <select
                    value={userScore}
                    onChange={(e) => setUserScore(parseInt(e.target.value))}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-medium)] text-[var(--text-main)] text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[var(--accent-primary)]"
                  >
                    <option value="0">Sin calificar</option>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((val) => (
                      <option key={val} value={val}>{val} - {val === 10 ? 'Obra Maestra' : val >= 8 ? 'Excelente' : val >= 6 ? 'Bueno' : 'Malo'}</option>
                    ))}
                  </select>
                </div>

                {/* Episodes Watched Progress Counter */}
                <div>
                  <label className="block text-[9px] text-[var(--text-dim)] font-bold uppercase tracking-wider mb-1">
                    Episodios Vistos ({episodesWatched} / {anime.episodes || '?'})
                  </label>
                  <div className="flex space-x-1.5">
                    <input
                      type="number"
                      min="0"
                      max={anime.episodes || 9999}
                      value={episodesWatched}
                      onChange={(e) => setEpisodesWatched(Math.min(anime.episodes || 9999, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-full bg-[var(--bg-card)] border border-[var(--border-medium)] text-[var(--text-main)] text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                    {anime.episodes && (
                      <button
                        type="button"
                        onClick={() => setEpisodesWatched(anime.episodes || 0)}
                        className="px-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-medium)] text-[var(--text-muted)] hover:text-white rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Máx
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Notes Comment Area */}
              <div>
                <label className="block text-[9px] text-[var(--text-dim)] font-bold uppercase tracking-wider mb-1">
                  Notas / Comentarios Personales
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anota tus impresiones o comentarios..."
                  className="w-full bg-[var(--bg-card)] border border-[var(--border-medium)] text-[var(--text-main)] text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[var(--accent-primary)] placeholder-slate-600"
                />
              </div>

              <Button
                type="submit"
                loading={savingProgress}
                className="w-full font-bold shadow-md flex items-center justify-center space-x-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{inList ? 'Guardar Cambios' : 'Añadir a mi Lista'}</span>
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
