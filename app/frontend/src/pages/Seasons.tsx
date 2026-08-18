import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import type { Anime } from '../types';
import { AnimeCard } from '../components/anime/AnimeCard';
import { SeasonTimeline } from '../components/seasons/SeasonTimeline';
import { useCurrentAnimeSeason } from '../hooks/useCurrentAnimeSeason';
import { notifications } from '../utils/notify';
import { 
  Calendar, 
  RefreshCw, 
  BarChart3, 
  Award, 
  Layers, 
  Clapperboard, 
  Compass, 
  AlertCircle 
} from 'lucide-react';

interface SeasonsProps {
  onViewDetails: (id: number) => void;
}

const SEASON_PAGE_SIZE = 36;

export const Seasons: React.FC<SeasonsProps> = ({ onViewDetails }) => {
  const currentAnimeSeason = useCurrentAnimeSeason();
  const previousCurrentSeason = useRef(currentAnimeSeason);
  const [selectedYear, setSelectedYear] = useState(currentAnimeSeason.year);
  const [selectedSeason, setSelectedSeason] = useState(currentAnimeSeason.season);
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [seasonCounts, setSeasonCounts] = useState<Record<string, number>>({});
  const observerTarget = useRef<HTMLDivElement>(null);

  // Estadísticas comparativas
  const [comparisons, setComparisons] = useState({
    bestCountSeason: '',
    bestScoreSeason: '',
    topGenres: [] as string[],
    topStudio: '',
    studioCount: 0
  });



  const loadSeasonData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAnimeListPage({
        year: selectedYear,
        season: selectedSeason,
        sort: 'popularity',
        limit: SEASON_PAGE_SIZE,
        offset: 0
      });
      setAnimes(data.items || []);
      setTotalCount(Number(data.total) || 0);
    } catch (err) {
      console.error('Error al cargar datos de temporada:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedSeason]);

  const loadMoreSeasonData = useCallback(async () => {
    if (loading || loadingMore || animes.length >= totalCount) return;

    try {
      setLoadingMore(true);
      const data = await api.getAnimeListPage({
        year: selectedYear,
        season: selectedSeason,
        sort: 'popularity',
        limit: SEASON_PAGE_SIZE,
        offset: animes.length
      });
      setAnimes(prev => {
        const known = new Set(prev.map(item => item.id));
        const nextItems = (data.items || []).filter((item: Anime) => !known.has(item.id));
        return [...prev, ...nextItems];
      });
      setTotalCount(Number(data.total) || totalCount);
    } catch (err) {
      console.error('Error al cargar más series de temporada:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, animes.length, totalCount, selectedYear, selectedSeason]);

  const loadComparisons = useCallback(async () => {
    try {
      const summary = await api.getSeasonSummary();
      setAvailableYears(summary.years || []);
      setSeasonCounts(summary.countsBySeason || {});
      setComparisons({
        bestCountSeason: summary.comparisons?.bestCountSeason || 'S/D',
        bestScoreSeason: summary.comparisons?.bestScoreSeason || 'S/D',
        topGenres: summary.comparisons?.topGenres || [],
        topStudio: summary.comparisons?.topStudio || 'S/D',
        studioCount: summary.comparisons?.studioCount || 0
      });

    } catch (err) {
      console.error('Error al cargar comparaciones:', err);
    }
  }, []);

  useEffect(() => {
    loadSeasonData();
  }, [loadSeasonData]);

  useEffect(() => {
    loadComparisons();
  }, [loadComparisons]);

  useEffect(() => {
    const previous = previousCurrentSeason.current;
    if (selectedYear === previous.year && selectedSeason === previous.season) {
      setSelectedYear(currentAnimeSeason.year);
      setSelectedSeason(currentAnimeSeason.season);
    }
    previousCurrentSeason.current = currentAnimeSeason;
  }, [
    currentAnimeSeason,
    selectedSeason,
    selectedYear
  ]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreSeasonData();
        }
      },
      { rootMargin: '240px' }
    );
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    return () => observer.disconnect();
  }, [loadMoreSeasonData]);

  const handleSyncSeason = async () => {
    try {
      setSyncing(true);
      await api.syncSeason(selectedYear, selectedSeason);
      await Promise.all([loadSeasonData(), loadComparisons()]);
    } catch (err) {
      console.error('Error al sincronizar temporada:', err);
      notifications.error('Error en la sincronización. Revisa los logs de Scraping.');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleFavorite = async (id: number, isFavorite: boolean) => {
    try {
      const detail = await api.getAnimeDetail(id);
      await api.addToUserList({
        anime_id: id,
        watch_status: detail.watch_status || 'plan_to_watch',
        favorite: isFavorite ? 1 : 0,
        user_score: detail.user_score || 0,
        episodes_watched: detail.episodes_watched || 0,
        notes: detail.notes || ''
      });
      loadSeasonData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickStatusChange = async (id: number, status: 'watching' | 'completed' | 'plan_to_watch') => {
    try {
      const detail = await api.getAnimeDetail(id);
      await api.addToUserList({
        anime_id: id,
        watch_status: status,
        favorite: detail.favorite || 0,
        user_score: detail.user_score || 0,
        episodes_watched: status === 'completed' ? (detail.episodes || 12) : (detail.episodes_watched || 0),
        notes: detail.notes || ''
      });
      loadSeasonData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      {/* Cabecera */}
      <div>
        <h2 className="text-2xl font-extrabold text-white flex items-center">
          <Calendar className="h-6 w-6 text-primary-400 mr-2" />
          Temporadas de Anime
        </h2>
        <p className="text-slate-400 text-xs mt-1">
          Navega por el catálogo histórico agrupado por año y temporada de emisión.
        </p>
      </div>

      {/* Línea de Tiempo de Temporadas */}
      <div className="space-y-4">
        <SeasonTimeline
          currentYear={currentAnimeSeason.year}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedSeason={selectedSeason}
          setSelectedSeason={setSelectedSeason}
          totalAnimesCount={totalCount}
          availableYears={availableYears}
          seasonCounts={seasonCounts}
        />
        
        <div className="flex justify-end">
          <button
            onClick={handleSyncSeason}
            disabled={syncing}
            className="w-full sm:w-auto px-5 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-black rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] border-2 border-black flex items-center justify-center space-x-1.5 transition-all hover:-translate-y-0.5 hover:-translate-x-0.5 active:translate-y-0 active:translate-x-0 active:shadow-none cursor-pointer"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Sincronizando...' : 'Sincronizar Temporada Online'}</span>
          </button>
        </div>
      </div>

      {/* Resultados de Temporada Local */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[30vh]">
          <div className="flex flex-col items-center space-y-2">
            <div className="h-8 w-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-slate-400">Cargando temporada...</span>
          </div>
        </div>
      ) : animes.length === 0 ? (
        <div className="p-12 border border-dashed border-dark-border/60 rounded-3xl text-center flex flex-col items-center space-y-4">
          <AlertCircle className="h-10 w-10 text-slate-600" />
          <div className="space-y-1">
            <h4 className="font-bold text-slate-350">No hay datos locales para esta temporada</h4>
            <p className="text-slate-500 text-xs max-w-md">
              Para ver la lista completa de series de {selectedSeason} {selectedYear}, usa Sincronizar Temporada Online para importar automáticamente desde AniList.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              Mostrando {animes.length} de {totalCount} series registradas en esta temporada
            </span>
            {loadingMore && (
              <span className="text-xs font-bold text-[var(--accent-primary)]">Cargando más...</span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {animes.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                onViewDetails={onViewDetails}
                onToggleFavorite={handleToggleFavorite}
                onQuickStatusChange={handleQuickStatusChange}
              />
            ))}
          </div>
          {animes.length < totalCount && (
            <div ref={observerTarget} className="h-10 w-full flex items-center justify-center mt-6">
              <div className="h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}

      {/* Sección Comparativa / Analíticas */}
      <section className="space-y-4 pt-4 border-t border-dark-border/60">
        <h3 className="text-lg font-bold text-white flex items-center">
          <BarChart3 className="h-5 w-5 text-secondary-400 mr-2" />
          Estadísticas de Temporadas Guardadas
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Temporada más populosa */}
          <div className="p-4 bg-slate-900/60 border border-dark-border/40 rounded-2xl flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs text-slate-500 font-bold block uppercase tracking-wider">Mayor Cantidad</span>
              <span className="text-sm font-extrabold text-slate-100">{comparisons.bestCountSeason}</span>
            </div>
          </div>

          {/* Temporada mejor puntuada */}
          <div className="p-4 bg-slate-900/60 border border-dark-border/40 rounded-2xl flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs text-slate-500 font-bold block uppercase tracking-wider">Mejor Puntuada</span>
              <span className="text-sm font-extrabold text-slate-100">{comparisons.bestScoreSeason}</span>
            </div>
          </div>

          {/* Géneros más comunes */}
          <div className="p-4 bg-slate-900/60 border border-dark-border/40 rounded-2xl flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">
              <Compass className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-xs text-slate-500 font-bold block uppercase tracking-wider">Géneros Comunes</span>
              <span className="text-xs font-extrabold text-slate-200 truncate block">
                {comparisons.topGenres.length > 0 ? comparisons.topGenres.join(', ') : 'S/D'}
              </span>
            </div>
          </div>

          {/* Estudio más recurrente */}
          <div className="p-4 bg-slate-900/60 border border-dark-border/40 rounded-2xl flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
              <Clapperboard className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs text-slate-500 font-bold block uppercase tracking-wider">Estudio Activo</span>
              <span className="text-sm font-extrabold text-slate-100">
                {comparisons.topStudio !== 'S/D' ? `${comparisons.topStudio} (${comparisons.studioCount})` : 'S/D'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
