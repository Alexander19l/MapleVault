import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, AlertCircle, RefreshCw, Sparkles, FolderPlus, Globe, Eye } from 'lucide-react';
import { api } from '../../services/api';
import type { Anime } from '../../types';
import { AnimeCard } from '../anime/AnimeCard';
import { Button } from '../ui/button';
import { notifications } from '../../utils/notify';

interface AdvancedSearchProps {
  onViewDetails: (idOrAnime: number | any) => void;
}

const formatScore = (score?: number | string | null) => {
  if (score === undefined || score === null || score === '') return 'Score no disponible';
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore <= 0) return 'Score no disponible';
  return `${numericScore.toFixed(numericScore % 1 === 0 ? 0 : 1)}/10`;
};

const formatEpisodes = (episodes?: number | string | null) => {
  if (!episodes) return 'Episodios al abrir ficha';
  return `${episodes} eps`;
};

const getGenreList = (anime: any) => {
  const genres = Array.isArray(anime?.genres_es) ? anime.genres_es : anime?.genres;
  return Array.isArray(genres) ? genres.filter(Boolean).slice(0, 3) : [];
};

const getOnlineAnimeKey = (anime: any, index: number | string = 'item') => (
  [
    anime?.result_origin || 'online',
    anime?.source || 'source',
    anime?.external_id ?? anime?.id ?? anime?.title ?? 'anime',
    index
  ].map(value => String(value)).join(':')
);

export const AdvancedSearch: React.FC<AdvancedSearchProps> = ({ onViewDetails }) => {
  const [query, setQuery] = useState('');
  const [localResults, setLocalResults] = useState<Anime[]>([]);
  const [onlineResults, setOnlineResults] = useState<any[]>([]);
  
  // Filters states
  const [genres, setGenres] = useState<string[]>([]);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  
  const [showFilters, setShowFilters] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingOnline, setLoadingOnline] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => currentYear - i + 1);
  const seasons = [
    { id: 'winter', name: 'Invierno' },
    { id: 'spring', name: 'Primavera' },
    { id: 'summer', name: 'Verano' },
    { id: 'fall', name: 'Otoño' }
  ];
  
  useEffect(() => {
    loadGenres();
  }, []);

  const loadGenres = async () => {
    try {
      const data = await api.getGenres();
      setGenres(data);
    } catch (err) {
      console.error('Error al cargar géneros:', err);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setHasSearched(true);

    // Local y online son independientes: se lanzan en paralelo en vez de en
    // serie para que el tiempo total sea max(local, online) y no la suma.
    setLoadingLocal(true);
    setLoadingOnline(true);

    const localSearch = api.getAnimeList({
      q: query,
      genre: selectedGenre || undefined,
      year: selectedYear || undefined,
      season: selectedSeason || undefined,
      type: selectedType || undefined,
      status: selectedStatus || undefined
    })
      .then(setLocalResults)
      .catch((err) => console.error('Error en búsqueda local:', err))
      .finally(() => setLoadingLocal(false));

    const onlineSearch = api.searchExternal(query)
      .then(setOnlineResults)
      .catch((err) => console.error('Error en búsqueda online:', err))
      .finally(() => setLoadingOnline(false));

    await Promise.all([localSearch, onlineSearch]);
  };

  const handleImport = async (anime: any, importKey = getOnlineAnimeKey(anime)) => {
    setImportingId(importKey);
    try {
      // Registrar e importar anime usando endpoint createAnime (que guarda metadatos)
      // Pero adaptado con saveNormalizedAnimeToLocal en backend
      const response = await api.importAnime({
        title: anime.title,
        title_romaji: anime.title_romaji,
        title_english: anime.title_english,
        title_japanese: anime.title_japanese,
        synopsis: anime.synopsis_original || anime.synopsis,
        year: anime.year,
        season: anime.season,
        status: anime.status,
        type: anime.type,
        episodes: anime.episodes,
        duration: anime.duration,
        score: anime.score,
        popularity: anime.popularity,
        cover_image: anime.cover_image,
        banner_image: anime.banner_image,
        studio: anime.studio,
        source_material: anime.source_material,
        genres: anime.genres,
        external_id: anime.external_id,
        source: anime.source
      });

      // Actualizar listados
      // Agregar el anime importado a la lista local actual
      const localId = response.id;
      
      // Auto-agregar a la lista de usuario como Pendiente
      await api.addToUserList({
        anime_id: localId,
        watch_status: 'plan_to_watch',
        favorite: 0,
        user_score: 0,
        episodes_watched: 0
      });

      // Cambiar de online results a local results si coincide
      setLocalResults(prev => [
        {
          id: localId,
          ...anime,
          watch_status: 'plan_to_watch'
        },
        ...prev
      ]);
      
      // Eliminar de online results para evitar doble importación
      setOnlineResults(prev => prev.filter(a => a.external_id !== anime.external_id));

      notifications.success(`"${anime.title}" se importó a tu biblioteca local.`);
    } catch (err) {
      console.error('Error al importar anime:', err);
      notifications.error('No se pudo importar la serie. Revisa la conexión o los datos recibidos.');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-2">
      {/* Search Header Form */}
      <form onSubmit={handleSearch} className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Escribe el nombre del anime para buscar de forma local y online..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-slate-900/60 border border-[var(--border-medium)] hover:border-slate-700 focus:border-[var(--accent-primary)] focus:outline-none rounded-xl py-3 px-4 pl-11 text-sm text-[var(--text-main)] placeholder-[var(--text-dim)] transition-colors"
            />
            <Search className="absolute left-4 top-3.5 h-4.5 w-4.5 text-[var(--text-dim)]" />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 shrink-0 py-3 ${showFilters ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-violet-500/5' : ''}`}
            >
              <SlidersHorizontal className="h-4.5 w-4.5" />
              <span className="text-xs">Filtros</span>
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loadingLocal || loadingOnline || !query.trim()}
              className="px-6 py-3 flex items-center space-x-2 shrink-0"
            >
              {(loadingLocal || loadingOnline) ? (
                <RefreshCw className="h-4.5 w-4.5 animate-spin" />
              ) : (
                <Search className="h-4.5 w-4.5" />
              )}
              <span className="text-xs font-bold">Buscar</span>
            </Button>
          </div>
        </div>

        {/* Collapsible filters block */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 pt-3 border-t border-[var(--border-light)]/60 animate-fadeIn">
            {/* Year */}
            <div>
              <label className="block text-[10px] text-[var(--text-dim)] font-bold uppercase tracking-wider mb-1">Año</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-slate-900/80 border border-[var(--border-medium)] text-[var(--text-muted)] text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="">Cualquiera</option>
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Season */}
            <div>
              <label className="block text-[10px] text-[var(--text-dim)] font-bold uppercase tracking-wider mb-1">Temporada</label>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="w-full bg-slate-900/80 border border-[var(--border-medium)] text-[var(--text-muted)] text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="">Cualquiera</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Genre */}
            <div>
              <label className="block text-[10px] text-[var(--text-dim)] font-bold uppercase tracking-wider mb-1">Género</label>
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="w-full bg-slate-900/80 border border-[var(--border-medium)] text-[var(--text-muted)] text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="">Cualquiera</option>
                {genres.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Format */}
            <div>
              <label className="block text-[10px] text-[var(--text-dim)] font-bold uppercase tracking-wider mb-1">Formato</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-slate-900/80 border border-[var(--border-medium)] text-[var(--text-muted)] text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="">Cualquiera</option>
                <option value="tv">TV</option>
                <option value="movie">Película</option>
                <option value="ova">OVA</option>
                <option value="ona">ONA</option>
                <option value="special">Especial</option>
              </select>
            </div>

            {/* Emission Status */}
            <div>
              <label className="block text-[10px] text-[var(--text-dim)] font-bold uppercase tracking-wider mb-1">Estado Emisión</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-slate-900/80 border border-[var(--border-medium)] text-[var(--text-muted)] text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="">Cualquiera</option>
                <option value="airing">En Emisión</option>
                <option value="finished">Finalizado</option>
                <option value="upcoming">Próximamente</option>
              </select>
            </div>
          </div>
        )}
      </form>

      {/* Dual Panel Results */}
      {!hasSearched ? (
        <div className="p-16 border border-dashed border-[var(--border-medium)]/40 rounded-2xl text-center space-y-3">
          <Sparkles className="h-10 w-10 text-[var(--text-dim)] mx-auto animate-pulse" />
          <h4 className="font-bold text-[var(--text-main)] text-sm">Comienza tu búsqueda</h4>
          <p className="text-[var(--text-muted)] text-xs max-w-sm mx-auto">
            Ingresa palabras clave arriba para contrastar al mismo tiempo las series guardadas en tu biblioteca local contra el catálogo global de internet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* PANEL 1: LOCAL RESULTS */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 border-b border-[var(--border-medium)] pb-3">
              <FolderPlus className="h-4.5 w-4.5 text-[var(--accent-primary)]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Resultados en Biblioteca ({localResults.length})
              </h3>
            </div>

            {loadingLocal ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-2.5">
                <RefreshCw className="h-7 w-7 text-[var(--accent-primary)] animate-spin" />
                <span className="text-xs text-[var(--text-dim)]">Buscando localmente...</span>
              </div>
            ) : localResults.length === 0 ? (
              <div className="p-12 border border-slate-900 bg-slate-950/20 rounded-2xl text-center">
                <AlertCircle className="h-8 w-8 text-[var(--text-dim)] mx-auto mb-2" />
                <p className="text-xs text-[var(--text-muted)]">No se encontraron series locales.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 gap-5">
                {localResults.map(anime => (
                  <AnimeCard
                    key={anime.id}
                    anime={anime}
                    viewMode="card"
                    onViewDetails={onViewDetails}
                  />
                ))}
              </div>
            )}
          </div>

          {/* PANEL 2: ONLINE RESULTS */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 border-b border-[var(--border-medium)] pb-3">
              <Globe className="h-4.5 w-4.5 text-[var(--accent-secondary)]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Resultados en Internet ({onlineResults.length})
              </h3>
            </div>

            {loadingOnline ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-2.5">
                <RefreshCw className="h-7 w-7 text-[var(--accent-secondary)] animate-spin" />
                <span className="text-xs text-[var(--text-dim)]">Buscando en AniList...</span>
              </div>
            ) : onlineResults.length === 0 ? (
              <div className="p-12 border border-slate-900 bg-slate-950/20 rounded-2xl text-center">
                <AlertCircle className="h-8 w-8 text-[var(--text-dim)] mx-auto mb-2" />
                <p className="text-xs text-[var(--text-muted)]">No se encontraron series en internet.</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {onlineResults.map((anime, index) => {
                  const resultKey = getOnlineAnimeKey(anime, index);
                  return (
                  <div 
                    key={resultKey}
                    className="group flex bg-[var(--bg-card)] border border-[var(--border-light)] hover:border-slate-700 rounded-xl p-3.5 space-x-4 maple-list-enter maple-interactive"
                  >
                    {anime.cover_image ? (
                      <img
                        src={anime.cover_image}
                        alt={anime.title}
                        className="h-24 w-16 rounded-lg object-cover shrink-0 select-none shadow-md transition-transform duration-200 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60">
                        <Sparkles className="h-5 w-5 text-[var(--text-dim)]" />
                      </div>
                    )}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-bold leading-snug text-white line-clamp-2" title={anime.title}>
                            {anime.title}
                          </h4>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[var(--accent-secondary)] shrink-0 uppercase">
                            {anime.source || 'AniList'}
                          </span>
                        </div>
                        {anime.title_english && anime.title_english !== anime.title && (
                          <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500" title={anime.title_english}>
                            {anime.title_english}
                          </p>
                        )}
                        <p className="text-[10px] text-[var(--text-dim)] font-semibold mt-1">
                          {anime.studio || 'Estudio desconocido'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-md border border-slate-800 bg-slate-950/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                            {anime.year || 'Año no disponible'}
                          </span>
                          <span className="rounded-md border border-slate-800 bg-slate-950/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                            {anime.type ? String(anime.type).toUpperCase() : 'Formato no disponible'}
                          </span>
                          <span className="rounded-md border border-slate-800 bg-slate-950/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                            {formatEpisodes(anime.episodes)}
                          </span>
                          <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                            {formatScore(anime.score)}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-[var(--text-muted)] line-clamp-3 mt-2 leading-relaxed">
                          {anime.synopsis || 'Sinopsis no disponible.'}
                        </p>
                        {getGenreList(anime).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {getGenreList(anime).map((genre, genreIndex) => (
                              <span key={`${resultKey}:genre:${genreIndex}:${genre}`} className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-semibold text-slate-400">
                                {genre}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-light)]/50">
                        <span className="text-[9.5px] text-[var(--text-dim)] font-semibold">
                          Resultado externo normalizado para importar al catálogo local
                        </span>
                        
                        <div className="flex space-x-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onViewDetails(anime)}
                            className="py-1 px-2"
                            title="Ver Detalles"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={importingId === resultKey}
                            onClick={() => handleImport(anime, resultKey)}
                            className="py-1 px-3"
                          >
                            {importingId === resultKey ? (
                              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                            ) : null}
                            <span className="text-[10px]">Añadir a mi biblioteca</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
