import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { UserListItem, Anime } from '../types';
import { AnimeCard } from '../components/anime/AnimeCard';
import { showConfirm } from '../utils/dialog';
import { 
  UserRound, 
  Clock, 
  Percent, 
  Tv,
  Star
} from 'lucide-react';

interface MylistProps {
  onViewDetails: (id: number) => void;
  refreshTrigger: number;
  initialTab?: 'all' | 'watching' | 'plan_to_watch' | 'completed' | 'dropped' | 'favorite';
}

export const Mylist: React.FC<MylistProps> = ({ onViewDetails, refreshTrigger, initialTab }) => {
  const [listItems, setListItems] = useState<UserListItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'watching' | 'plan_to_watch' | 'completed' | 'dropped' | 'favorite'>(initialTab || 'all');
  const [loading, setLoading] = useState(true);

  // Estadísticas personales
  const [listStats, setListStats] = useState({
    avgScore: 0,
    totalEpisodes: 0,
    watchTimeDays: 0,
    watchTimeHours: 0,
    watchTimeMinutes: 0
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const loadUserList = useCallback(async () => {
    try {
      setLoading(true);
      
      let data: UserListItem[] = [];
      if (activeTab === 'favorite') {
        data = await api.getUserList({ favorite: 1 });
      } else if (activeTab === 'all') {
        data = await api.getUserList();
      } else {
        data = await api.getUserList({ status: activeTab });
      }

      setListItems(data);

      // Calcular estadísticas acumuladas (usando toda la lista del usuario)
      const allItems = await api.getUserList();
      
      // 1. Promedio de puntaje (excluyendo 0 que es 'sin nota')
      const scoredItems = allItems.filter((item: UserListItem) => item.user_score > 0);
      const scoreSum = scoredItems.reduce((sum: number, item: UserListItem) => sum + item.user_score, 0);
      const avg = scoredItems.length > 0 ? scoreSum / scoredItems.length : 0;

      // 2. Episodios totales vistos
      const totalEps = allItems.reduce((sum: number, item: UserListItem) => sum + (item.episodes_watched || 0), 0);

      // 3. Tiempo de visualización (promedio de 24 minutos por episodio)
      const totalMinutes = totalEps * 24;
      const days = Math.floor(totalMinutes / (24 * 60));
      const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
      const minutes = totalMinutes % 60;

      setListStats({
        avgScore: avg,
        totalEpisodes: totalEps,
        watchTimeDays: days,
        watchTimeHours: hours,
        watchTimeMinutes: minutes
      });

    } catch (err) {
      console.error('Error al cargar lista personal:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadUserList();
  }, [loadUserList, refreshTrigger]);

  const handleToggleFavorite = async (animeId: number, isFavorite: boolean) => {
    try {
      const detail = await api.getAnimeDetail(animeId);
      await api.addToUserList({
        anime_id: animeId,
        watch_status: detail.watch_status || 'plan_to_watch',
        favorite: isFavorite ? 1 : 0,
        user_score: detail.user_score || 0,
        episodes_watched: detail.episodes_watched || 0,
        notes: detail.notes || ''
      });
      loadUserList();
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickDelete = async (animeId: number) => {
    const anime = listItems.find(i => i.anime_id === animeId);
    const title = anime?.title || 'este anime';
    if (!(await showConfirm(`¿Eliminar "${title}" de tu lista? Esta acción no se puede deshacer.`))) return;
    try {
      if (!anime) return;
      await api.removeFromUserList(anime.id);
      loadUserList();
    } catch (err) {
      console.error('Error eliminando de lista:', err);
      alert('No se pudo eliminar el anime de la lista.');
    }
  };

  const handleQuickStatusChange = async (animeId: number, status: 'watching' | 'completed' | 'plan_to_watch') => {
    try {
      const detail = await api.getAnimeDetail(animeId);
      await api.addToUserList({
        anime_id: animeId,
        watch_status: status,
        favorite: detail.favorite || 0,
        user_score: detail.user_score || 0,
        episodes_watched: status === 'completed' ? (detail.episodes || 12) : (detail.episodes_watched || 0),
        notes: detail.notes || ''
      });
      loadUserList();
    } catch (err) {
      console.error(err);
    }
  };

  const tabItems = [
    { id: 'all', name: 'Todos', count: null },
    { id: 'watching', name: 'Viendo', count: null },
    { id: 'plan_to_watch', name: 'Pendientes', count: null },
    { id: 'completed', name: 'Completados', count: null },
    { id: 'dropped', name: 'Abandonados', count: null },
    { id: 'favorite', name: 'Favoritos ❤️', count: null },
  ];

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      {/* Cabecera */}
      <div>
        <h2 className="text-2xl font-extrabold text-white flex items-center">
          <UserRound className="h-6 w-6 text-primary-400 mr-2" />
          Mi Lista Personal
        </h2>
        <p className="text-slate-400 text-xs mt-1">
          Lleva el control de tus series en emisión, pendientes y puntuaciones personales.
        </p>
      </div>

      {/* Widget de Estadísticas de Visualización */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tiempo Total de Visualización */}
        <div className="p-5 bg-primary-950/20 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-none flex items-center space-x-4">
          <div className="p-3.5 bg-primary-500/10 text-primary-400 rounded-xl">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Tiempo de Visualización</span>
            <div className="text-base font-extrabold text-slate-100 mt-0.5">
              {listStats.watchTimeDays > 0 && `${listStats.watchTimeDays}d `}
              {listStats.watchTimeHours > 0 && `${listStats.watchTimeHours}h `}
              {`${listStats.watchTimeMinutes}m`}
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">Basado en capítulos vistos</span>
          </div>
        </div>

        {/* Capítulos Totales */}
        <div className="p-5 bg-dark-card border border-dark-border/40 rounded-2xl flex items-center space-x-4">
          <div className="p-3.5 bg-secondary-500/10 text-secondary-400 rounded-xl">
            <Tv className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Episodios Vistos</span>
            <div className="text-lg font-extrabold text-slate-150 mt-0.5">
              {listStats.totalEpisodes} capítulos
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">Consumidos en tu historial</span>
          </div>
        </div>

        {/* Nota Promedio */}
        <div className="p-5 bg-dark-card border border-dark-border/40 rounded-2xl flex items-center space-x-4">
          <div className="p-3.5 bg-amber-500/10 text-amber-400 rounded-xl">
            <Percent className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Mi Nota Media</span>
            <div className="text-lg font-extrabold text-slate-150 mt-0.5 flex items-center">
              <Star className="h-4.5 w-4.5 text-amber-400 fill-amber-400 mr-1" />
              {listStats.avgScore > 0 ? `${listStats.avgScore.toFixed(2)} / 10` : 'S/C'}
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">Excluyendo animes sin nota</span>
          </div>
        </div>
      </section>

      {/* Selector de pestañas */}
      <div className="border-b border-dark-border flex space-x-2 overflow-x-auto pb-1 scrollbar-none select-none">
        {tabItems.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl maple-interactive shrink-0 ${
                isActive
                  ? 'bg-slate-800 text-primary-400 border-b-2 border-primary-500'
                  : 'text-slate-450 hover:text-slate-300'
              }`}
            >
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* Resultados de la Lista */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[30vh]">
          <div className="flex flex-col items-center space-y-2">
            <div className="h-8 w-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-slate-400">Cargando tu lista...</span>
          </div>
        </div>
      ) : listItems.length === 0 ? (
        <div className="p-16 border border-dashed border-dark-border/60 rounded-3xl text-center flex flex-col items-center space-y-4">
          <UserRound className="h-10 w-10 text-slate-650" />
          <div>
            <h4 className="font-bold text-slate-350">Esta lista está vacía</h4>
            <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
              Aún no tienes series agregadas con esta categoría en tu lista personal. Abre detalles de cualquier anime en el catálogo para administrar su progreso.
            </p>
          </div>
        </div>
      ) : (
        <div key={activeTab} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 maple-list-enter">
          {listItems.map((item) => {
            // Adaptar UserListItem a la interfaz Anime básica para el renderizado
            const adaptedAnime: Anime = {
              id: item.anime_id,
              title: item.title,
              title_romaji: item.title_romaji,
              title_english: item.title_english,
              title_japanese: item.title_japanese,
              synopsis: item.synopsis,
              synopsis_original: item.synopsis_original,
              synopsis_es: item.synopsis_es,
              genres: item.genres,
              genres_es: item.genres_es,
              status: item.status as Anime['status'],
              type: item.type as Anime['type'],
              duration: item.duration,
              cover_image: item.cover_image,
              banner_image: item.banner_image,
              studio: item.studio,
              year: item.year,
              season: item.season,
              episodes: item.episodes,
              score: item.mal_score,
              status_label_es: item.status_label_es,
              type_label_es: item.type_label_es,
              watch_status: item.watch_status,
              favorite: item.favorite,
              user_score: item.user_score,
              episodes_watched: item.episodes_watched,
              notes: item.notes
            };

            return (
              <AnimeCard
                key={item.id}
                anime={adaptedAnime}
                onViewDetails={onViewDetails}
                onToggleFavorite={handleToggleFavorite}
                onQuickStatusChange={handleQuickStatusChange}
                onDelete={handleQuickDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
