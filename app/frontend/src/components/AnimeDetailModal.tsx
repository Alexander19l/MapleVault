import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  RefreshCw, 
  Trash2, 
  Search,
  Eye,
  EyeOff,
  Clock,
  ArrowUpDown,
  CheckCircle2,
  Video,
  MonitorPlay
} from 'lucide-react';
import { showConfirm } from '../utils/dialog';
import { api } from '../services/api';
import type { Anime } from '../types';
import { Modal } from './ui/Modal';
import { AnimeDetailHero } from './anime/AnimeDetailHero';
import { Button } from './ui/button';
import { notifications } from '../utils/notify';
import {
  EpisodeLanguageFlag,
  EpisodeProviderSelect,
  getEpisodeProvider,
  type EpisodeProviderId
} from './anime/EpisodeProviderSelect';

interface AnimeDetailModalProps {
  animeId: number | null;
  externalAnime?: any;
  onClose: () => void;
  onRefresh: () => void;
}

interface EpisodePlaybackServer {
  server: string;
  url: string;
  referer?: string;
  providerId?: string;
  language?: 'es' | 'en';
  playbackMode?: 'inline' | 'window' | 'direct-window';
}

const filterAnimeTimelineRelations = (items: any[] = []) => (
  items.filter(rel => {
    const relationType = String(rel?.relation_type || '').toUpperCase();
    const mediaType = String(rel?.type || '').toUpperCase();
    return (relationType === 'PREQUEL' || relationType === 'SEQUEL') && mediaType === 'ANIME';
  })
);

const formatRelationType = (relationType?: string) => (
  String(relationType || '').toUpperCase() === 'PREQUEL' ? 'Precuela' : 'Secuela'
);

export const AnimeDetailModal: React.FC<AnimeDetailModalProps> = ({ animeId, externalAnime, onClose, onRefresh }) => {
  const [currentAnimeId, setCurrentAnimeId] = useState(animeId || 0);
  const [isExternalView, setIsExternalView] = useState(animeId === null);
  const [anime, setAnime] = useState<Anime | any | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // User list states
  const [inList, setInList] = useState(false);
  const [watchStatus, setWatchStatus] = useState<'watching' | 'plan_to_watch' | 'completed' | 'dropped' | 'on_hold'>('plan_to_watch');
  const [favorite, setFavorite] = useState(false);
  const [userScore, setUserScore] = useState(0);
  const [episodesWatched, setEpisodesWatched] = useState(0);
  const [notes, setNotes] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);

  // Relations state
  const [relations, setRelations] = useState<any[]>([]);
  const [loadingRelations, setLoadingRelations] = useState(false);

  // Episodes states
  const [activeTab, setActiveTab] = useState<'details' | 'episodes'>('details');
  const [episodes, setEpisodes] = useState<{ id: number; number: number }[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const episodesRequestId = useRef(0);
  
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [embeds, setEmbeds] = useState<any>(null);
  const [loadingEmbeds, setLoadingEmbeds] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string>('SUB');
  const [selectedServer, setSelectedServer] = useState<EpisodePlaybackServer | null>(null);

  // Reproductor embebido dentro de la app (WebContentsView anclado a la ventana principal).
  const playerPanelRef = useRef<HTMLDivElement | null>(null);
  const [playerAttachState, setPlayerAttachState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [playerErrorMessage, setPlayerErrorMessage] = useState('');
  const hasPlayerViewApi = typeof window !== 'undefined' && Boolean((window as any).electronAPI?.player?.attach);
  // El backend marca así los servidores que se comprobó que no se reproducen embebidos.
  const isStandaloneServer = selectedServer?.playbackMode === 'window'
    || selectedServer?.playbackMode === 'direct-window';

  // Rich Episode detail states
  const [watchedEpisodes, setWatchedEpisodes] = useState<number[]>([]);
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [episodeSort, setEpisodeSort] = useState<'asc' | 'desc'>('asc');
  const [episodeFilter, setEpisodeFilter] = useState<'all' | 'watched' | 'pending'>('all');
  
  // Scraper source provider toggle
  const [provider, setProvider] = useState<EpisodeProviderId>('animeav1');

  const loadAnimeDetails = useCallback(async (targetId: number) => {
    try {
      setLoading(true);
      const data = await api.getAnimeDetail(targetId);
      setAnime(data);
      
      if (data.watch_status) {
        setInList(true);
        setWatchStatus(data.watch_status);
        setFavorite(data.favorite === 1);
        setUserScore(data.user_score || 0);
        setEpisodesWatched(data.episodes_watched || 0);
        setNotes(data.notes || '');
      } else {
        setInList(false);
        setWatchStatus('plan_to_watch');
        setFavorite(false);
        setUserScore(0);
        setEpisodesWatched(0);
        setNotes('');
      }
    } catch (err) {
      console.error('Error al cargar detalles de anime:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRelations = useCallback(async (targetId: number) => {
    try {
      setLoadingRelations(true);
      const data = await api.getAnimeRelations(targetId);
      setRelations(filterAnimeTimelineRelations(data || []));
    } catch (err) {
      console.error('Error al cargar relaciones:', err);
    } finally {
      setLoadingRelations(false);
    }
  }, []);

  const handleOpenRelation = async (rel: any) => {
    try {
      setLoading(true);
      setActiveTab('details');

      if (rel.local_anime_id) {
        const localId = Number(rel.local_anime_id);
        setIsExternalView(false);
        setCurrentAnimeId(localId);
        setRelations([]);
        setEpisodes([]);
        setWatchedEpisodes([]);
        await Promise.all([
          loadAnimeDetails(localId),
          loadRelations(localId)
        ]);
        return;
      }

      const linkedAnime = await api.getAniListAnimeById(Number(rel.related_external_id));
      if (!linkedAnime) {
        notifications.warning('No se encontró información para esa serie vinculada.');
        return;
      }

      setAnime(linkedAnime);
      setRelations(filterAnimeTimelineRelations(linkedAnime.relations || []));
      setIsExternalView(true);
      setCurrentAnimeId(0);
      setEpisodes([]);
      setWatchedEpisodes([]);
      setInList(false);
      setWatchStatus('plan_to_watch');
      setFavorite(false);
      setUserScore(0);
      setEpisodesWatched(0);
      setNotes('');
    } catch (err) {
      console.error('Error al abrir relación:', err);
      notifications.error('No se pudo abrir la información de la serie vinculada.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportExternalAnime = async () => {
    if (!anime) return;

    let imported = false;
    try {
      setSyncing(true);
      const importRes = await api.importAnime(anime);
      await api.addToUserList({
        anime_id: importRes.id,
        watch_status: 'plan_to_watch',
        favorite: 0,
        user_score: 0,
        episodes_watched: 0
      });
      imported = true;
      notifications.success(`"${anime.title}" se importó a tu biblioteca local.`);
      onRefresh();
    } catch (err) {
      console.error('Error al importar anime externo:', err);
      notifications.error('No se pudo importar el anime. Revisa la conexión o los datos recibidos.');
    } finally {
      setSyncing(false);
    }

    if (imported) {
      onClose();
    }
  };

  const loadEpisodes = useCallback(async () => {
    const requestId = ++episodesRequestId.current;

    try {
      setLoadingEpisodes(true);
      setEpisodesError(null);
      setEpisodes([]); // Clear list first
      setSelectedEpisode(null);
      setEmbeds(null);
      setSelectedServer(null);

      let res;
      if (provider === 'animeav1') {
        res = await api.getAnimeEpisodes(currentAnimeId);
      } else if (provider === 'tioanime') {
        res = await api.getTioAnimeEpisodes(currentAnimeId);
      } else if (provider === 'jkanime') {
        res = await api.getJKAnimeEpisodes(currentAnimeId);
      } else if (provider === 'animeflv') {
        res = await api.getAnimeFLVEpisodes(currentAnimeId);
      } else {
        res = await api.getExternalSourceEpisodes(provider, currentAnimeId);
      }
      if (requestId === episodesRequestId.current) {
        const extractedEpisodes = res.episodes || [];
        setEpisodes(extractedEpisodes);
        if (extractedEpisodes.length === 0 && provider === 'animeav1') {
          setEpisodesError(
            res.availability === 'not_published'
              ? 'AnimeAV1 encontró la serie, pero todavía no publicó capítulos para reproducir.'
              : 'AnimeAV1 encontró la serie, pero no devolvió una lista de capítulos válida.'
          );
        }
      }
    } catch (err: any) {
      console.error('Error al cargar episodios:', err);
      if (requestId === episodesRequestId.current) {
        setEpisodesError(err.response?.data?.error || `No se pudieron extraer los episodios de ${provider.toUpperCase()}.`);
      }
    } finally {
      if (requestId === episodesRequestId.current) {
        setLoadingEpisodes(false);
      }
    }
  }, [currentAnimeId, provider]);

  const loadWatchedEpisodes = useCallback(async () => {
    try {
      const watched = await api.getWatchedEpisodes(currentAnimeId);
      setWatchedEpisodes(watched);
    } catch (err) {
      console.error('Error al cargar episodios vistos:', err);
    }
  }, [currentAnimeId]);

  useEffect(() => {
    episodesRequestId.current += 1;
    setEpisodes([]);
    setEpisodesError(null);
    setLoadingEpisodes(false);
    setSelectedEpisode(null);
    setEmbeds(null);
    setSelectedServer(null);

    if (animeId !== null) {
      setIsExternalView(false);
      setCurrentAnimeId(animeId);
      loadAnimeDetails(animeId);
      loadRelations(animeId);
    } else if (externalAnime) {
      setIsExternalView(true);
      setCurrentAnimeId(0);
      setAnime(externalAnime);
      setLoading(false);
      setInList(false);
      setRelations(filterAnimeTimelineRelations(externalAnime.relations || []));
      setEpisodes([]);
      setWatchedEpisodes([]);
    }
  }, [animeId, externalAnime, loadAnimeDetails, loadRelations]);

  // Load rich episodes data when active tab is episodes or provider changes
  useEffect(() => {
    if (activeTab === 'episodes' && currentAnimeId > 0) {
      loadEpisodes();
      loadWatchedEpisodes();
    }
  }, [activeTab, currentAnimeId, loadEpisodes, loadWatchedEpisodes]);

  const handleSelectEpisode = async (num: number) => {
    try {
      setSelectedEpisode(num);
      setEmbeds(null);
      setSelectedServer(null);
      setLoadingEmbeds(true);
      
      let res;
      if (provider === 'animeav1') {
        res = await api.getEpisodeEmbeds(currentAnimeId, num);
      } else if (provider === 'tioanime') {
        res = await api.getTioAnimeServers(currentAnimeId, num);
        if (Array.isArray(res)) res = { SUB: res };
      } else if (provider === 'jkanime') {
        res = await api.getJKAnimeServers(currentAnimeId, num);
        if (Array.isArray(res)) res = { SUB: res };
      } else if (provider === 'animeflv') {
        res = await api.getAnimeFLVServers(currentAnimeId, num);
        if (Array.isArray(res)) res = { SUB: res };
      } else {
        res = await api.getExternalSourceServers(provider, currentAnimeId, num);
      }
      
      setEmbeds(res);
      
      const variants = Object.keys(res || {});
      if (variants.length > 0) {
        const variant = variants[0];
        setSelectedVariant(variant);
        if (res[variant] && res[variant].length > 0) {
          setSelectedServer(res[variant][0]);
        }
      }
    } catch (err) {
      console.error('Error al cargar enlaces del episodio:', err);
    } finally {
      setLoadingEmbeds(false);
    }
  };

  // Adjunta el reproductor (WebContentsView) dentro del panel de la propia app en vez de
  // abrir una ventana aparte, y mantiene su posición sincronizada con el panel de React.
  useEffect(() => {
    const playerApi = (window as any).electronAPI?.player;
    const panel = playerPanelRef.current;
    const isPanelActive = activeTab === 'episodes' && selectedEpisode !== null && Boolean(selectedServer?.url) && Boolean(panel);

    // Los servidores marcados para ventana independiente no se adjuntan al panel: se
    // comprobó que no se reproducen embebidos, así que usan la ventana propia.
    if (!playerApi?.attach || !isPanelActive || isStandaloneServer) {
      setPlayerAttachState('idle');
      return;
    }

    let cancelled = false;
    setPlayerAttachState('loading');
    setPlayerErrorMessage('');

    const readBounds = () => {
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };

    const initialBounds = readBounds();
    if (!initialBounds) {
      setPlayerAttachState('error');
      setPlayerErrorMessage('No se pudo calcular el área del reproductor.');
      return;
    }

    playerApi.attach({
      url: selectedServer!.url,
      title: `${anime?.title || 'Anime'} - Capitulo ${selectedEpisode ?? ''}`.trim(),
      server: selectedServer!.server,
      referer: selectedServer!.referer,
      mode: selectedServer!.playbackMode === 'direct-window' ? 'direct' : 'embedded',
      bounds: initialBounds
    }).then((result: { attached: boolean; error?: string }) => {
      if (cancelled) return;
      if (result?.attached) {
        setPlayerAttachState('ready');
      } else {
        setPlayerAttachState('error');
        setPlayerErrorMessage(result?.error || 'No se pudo cargar el reproductor.');
      }
    }).catch(() => {
      if (!cancelled) {
        setPlayerAttachState('error');
        setPlayerErrorMessage('No se pudo cargar el reproductor.');
      }
    });

    const reposition = () => {
      const bounds = readBounds();
      if (bounds) void playerApi.reposition?.(bounds);
    };
    const resizeObserver = new ResizeObserver(reposition);
    resizeObserver.observe(panel!);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      void playerApi.detach?.();
    };
  }, [activeTab, selectedEpisode, selectedServer, anime?.title, isStandaloneServer]);

  // Servidores que solo funcionan en ventana propia: se abre en cuanto se seleccionan,
  // sin exigir un clic extra. Reabrir el mismo capítulo reutiliza la ventana ya cargada.
  useEffect(() => {
    if (!isStandaloneServer || activeTab !== 'episodes' || selectedEpisode === null) return;
    if (!selectedServer?.url) return;
    void handleOpenPlayerWindow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStandaloneServer, activeTab, selectedEpisode, selectedServer?.url]);

  const handleToggleWatch = async (episodeNumber: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExternalView || currentAnimeId <= 0) return;
    const isCurrentlyWatched = watchedEpisodes.includes(episodeNumber);
    try {
      await api.toggleEpisodeWatch(currentAnimeId, episodeNumber, !isCurrentlyWatched);
      
      setWatchedEpisodes(prev => 
        isCurrentlyWatched 
          ? prev.filter(n => n !== episodeNumber) 
          : [...prev, episodeNumber]
      );
      
      setEpisodesWatched(prev => isCurrentlyWatched ? Math.max(0, prev - 1) : prev + 1);
      onRefresh();
    } catch (err) {
      console.error('Error al cambiar estado visto:', err);
    }
  };

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anime) return;
    try {
      setSavingProgress(true);
      await api.addToUserList({
        anime_id: anime.id,
        watch_status: watchStatus,
        favorite: favorite ? 1 : 0,
        user_score: userScore,
        episodes_watched: episodesWatched,
        notes: notes
      });
      setInList(true);
      onRefresh();
      const updated = await api.getAnimeDetail(anime.id);
      setAnime(updated);
    } catch (err) {
      console.error('Error al guardar progreso:', err);
      notifications.error('Error al guardar el progreso');
    } finally {
      setSavingProgress(false);
    }
  };

  const handleRemoveFromList = async () => {
    if (!anime || !anime.watch_status) return;
    if (await showConfirm('¿Deseas quitar este anime de tu lista personal? (No se borrará del catálogo local)')) {
      try {
        setSavingProgress(true);
        const listItems = await api.getUserList();
        const item = listItems.find((u: any) => u.anime_id === anime.id);
        if (item) {
          await api.removeFromUserList(item.id);
          setInList(false);
          onRefresh();
          loadAnimeDetails(currentAnimeId);
        }
      } catch (err) {
        console.error('Error al remover de la lista:', err);
      } finally {
        setSavingProgress(false);
      }
    }
  };

  const handleDeleteAnime = async () => {
    if (!anime) return;
    if (await showConfirm('¿Estás seguro de que deseas eliminar permanentemente este anime de la biblioteca local? Esta acción no se puede deshacer.')) {
      try {
        await api.deleteAnime(anime.id);
        onRefresh();
        onClose();
      } catch (err) {
        console.error('Error al eliminar anime:', err);
      }
    }
  };

  const handleSyncAnime = async () => {
    if (!anime || !anime.title) return;
    try {
      setSyncing(true);
      const results = await api.searchExternal(anime.title);
      if (results.length > 0) {
        await api.importAnime(results[0]);
        loadAnimeDetails(currentAnimeId);
        onRefresh();
        notifications.success('Metadatos actualizados desde internet.');
      } else {
        notifications.warning('No se encontraron coincidencias en las APIs para actualizar.');
      }
    } catch (err) {
      console.error('Error al sincronizar:', err);
      notifications.error('No se pudieron sincronizar los datos.');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenExternal = (url?: string) => {
    if (!url) return;
    if ((window as any).electronAPI) {
      (window as any).electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const getEpisodeStatus = () => {
    return {
      label: `Disponible en ${getEpisodeProvider(provider).label}`,
      type: 'aired'
    };
  };

  /**
   * Abre el capítulo en una ventana independiente. Es la vía de rescate para servidores
   * que se niegan a reproducirse dentro del panel embebido: al ser una ventana real del
   * sistema, la pantalla completa también es nativa.
   */
  const handleOpenPlayerWindow = async () => {
    if (!selectedServer?.url) return;
    const playerApi = (window as any).electronAPI?.player;
    if (!playerApi?.open) {
      handleOpenExternal(selectedServer.url);
      return;
    }
    try {
      const result = await playerApi.open({
        url: selectedServer.url,
        title: `${anime?.title || 'Anime'} - Capitulo ${selectedEpisode ?? ''}`.trim(),
        server: selectedServer.server,
        referer: selectedServer.referer,
        mode: selectedServer.playbackMode === 'direct-window' ? 'direct' : 'embedded'
      });
      if (!result?.opened) {
        notifications.error(result?.error || 'No se pudo abrir el reproductor en ventana.');
      }
    } catch (error) {
      console.error('Error al abrir el reproductor en ventana:', error);
      notifications.error('No se pudo abrir el reproductor en ventana.');
    }
  };

  const filteredEpisodes = episodes
    .filter((ep) => {
      if (episodeSearch && !String(ep.number).includes(episodeSearch)) {
        return false;
      }
      
      const isWatched = watchedEpisodes.includes(ep.number);
      
      if (episodeFilter === 'watched') return isWatched;
      if (episodeFilter === 'pending') return !isWatched;
      
      return true;
    })
    .sort((a, b) => {
      if (episodeSort === 'desc') {
        return b.number - a.number;
      }
      return a.number - b.number;
    });

  return (
    <Modal
      isOpen={animeId !== null || Boolean(externalAnime)}
      onClose={onClose}
      title={anime ? anime.title : "Detalles del Anime"}
      size="xl"
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-9 w-9 border-3 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[var(--text-dim)] text-xs font-semibold">Cargando metadatos...</p>
        </div>
      ) : anime ? (
        <div className="flex flex-col space-y-6 maple-panel-enter">
          {/* Header Tabs Navigation */}
          <div className="flex items-center justify-between border-b border-[var(--border-medium)] pb-px shrink-0 select-none">
            <div className="flex space-x-6">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`pb-2 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
                  activeTab === 'details'
                    ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] font-black'
                    : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text-main)]'
                }`}
              >
                INFORMACIÓN GENERAL
              </button>
              {!isExternalView && (
                <button
                  type="button"
                  onClick={() => setActiveTab('episodes')}
                  className={`pb-2 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'episodes'
                      ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] font-black'
                      : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text-main)]'
                  }`}
                >
                  EPISODIOS ({episodes.length})
                </button>
              )}
            </div>

            {/* General Actions */}
            <div className="flex items-center space-x-2 pb-2">
              {isExternalView ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleImportExternalAnime}
                  loading={syncing}
                >
                  Importar a Biblioteca
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncAnime}
                    loading={syncing}
                    className="flex items-center space-x-1.5"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                    <span>Actualizar Datos</span>
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeleteAnime}
                    className="flex items-center space-x-1.5"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Eliminar</span>
                  </Button>
                </>
              )}
            </div>
          </div>
          {/* Render Tab Contents */}
          {activeTab === 'details' ? (
            <div key="details" className="space-y-8 flex flex-col maple-list-enter">
              <AnimeDetailHero
                anime={anime}
                inList={inList}
                watchStatus={watchStatus}
                setWatchStatus={setWatchStatus}
                favorite={favorite}
                setFavorite={setFavorite}
                userScore={userScore}
                setUserScore={setUserScore}
                episodesWatched={episodesWatched}
                setEpisodesWatched={setEpisodesWatched}
                notes={notes}
                setNotes={setNotes}
                savingProgress={savingProgress}
                handleSaveProgress={handleSaveProgress}
                handleRemoveFromList={handleRemoveFromList}
                handleOpenExternal={handleOpenExternal}
              />
              
              {/* Precuelas y secuelas de anime */}
              {loadingRelations ? (
                <div className="pt-6 border-t border-[var(--border-medium)] select-none">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] mb-4 flex items-center">
                    <span className="w-2.5 h-4 bg-yellow-400 mr-2 border border-black inline-block animate-pulse" />
                    Buscando series vinculadas...
                  </h3>
                  <div className="flex items-center justify-center py-6">
                    <div className="h-6 w-6 border-2 border-black border-t-transparent rounded-full animate-spin dark:border-white"></div>
                  </div>
                </div>
              ) : relations.length > 0 && (
                <div className="pt-6 border-t border-[var(--border-medium)] select-none">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] mb-4 flex items-center">
                    <span className="w-2.5 h-4 bg-yellow-400 mr-2 border border-black inline-block" />
                    Precuelas y secuelas
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {relations.map((rel) => {
                      const isLocal = Number(rel.local_anime_id) > 0;
                      return (
                        <button
                          type="button"
                          key={rel.related_external_id}
                          onClick={() => handleOpenRelation(rel)}
                          disabled={loading}
                          className="group relative w-full cursor-pointer border-2 border-black bg-zinc-50 p-3 text-left shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] disabled:cursor-wait disabled:opacity-60 dark:bg-zinc-900 dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.15)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)]"
                          aria-label={`Ver información de ${rel.title}`}
                        >
                          <div className="flex space-x-3">
                            {rel.cover_image ? (
                              <img
                                src={rel.cover_image}
                                alt={rel.title}
                                className="h-16 w-12 shrink-0 border border-black object-cover grayscale transition-all group-hover:grayscale-0"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-16 w-12 shrink-0 items-center justify-center border border-black bg-zinc-200 px-1 text-center text-[7px] font-black uppercase text-zinc-500 dark:bg-zinc-950">
                                Sin portada
                              </div>
                            )}
                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                              <div>
                                <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate font-mono" title={rel.title}>
                                  {rel.title}
                                </h4>
                                <p className="text-[9px] text-zinc-500 font-mono mt-0.5 uppercase tracking-tight">
                                  {formatRelationType(rel.relation_type)} · {rel.format || 'Formato no disponible'}
                                </p>
                              </div>
                              
                              <div className="mt-2 flex items-center justify-between">
                                <span className={`text-[8px] font-black tracking-wider px-1.5 py-0.5 border ${
                                  isLocal 
                                    ? 'border-emerald-600 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20' 
                                    : 'border-amber-600 bg-amber-50 text-amber-650 dark:bg-amber-950/20'
                                }`}>
                                  {isLocal ? 'CATÁLOGO' : 'ANILIST'}
                                </span>
                                <span className="text-[9px] font-black text-zinc-700 underline group-hover:text-black dark:text-zinc-300 dark:group-hover:text-white">
                                  VER INFORMACIÓN
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div key="episodes" className="space-y-5 flex-1 flex flex-col min-h-0 maple-list-enter">
              {loadingEpisodes ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="h-9 w-9 border-3 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs text-[var(--text-dim)] font-semibold flex items-center justify-center">
                    Buscando capítulos en {getEpisodeProvider(provider).label}...
                  </p>
                </div>
              ) : episodesError ? (
                <div className="p-5 border border-rose-500/25 bg-rose-500/5 rounded-2xl text-center space-y-3">
                  <p className="text-xs text-rose-450 font-bold">{episodesError}</p>
                  
                  {/* Source Toggle inside error callout to allow easy recovery */}
                  <div className="flex justify-center pt-2">
                    <EpisodeProviderSelect
                      value={provider}
                      onChange={setProvider}
                      actionLabel="Buscar en"
                      className="w-full max-w-sm"
                    />
                  </div>
                </div>
              ) : episodes.length === 0 ? (
                <div className="p-10 text-center text-[var(--text-dim)] text-xs border border-[var(--border-light)] border-dashed rounded-2xl bg-slate-900/10 space-y-3">
                  <p>No hay episodios disponibles para esta serie en este momento en la fuente seleccionada.</p>
                  <div className="flex justify-center pt-2">
                    <EpisodeProviderSelect
                      value={provider}
                      onChange={setProvider}
                      actionLabel="Cambiar a"
                      className="w-full max-w-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
                  {/* Left Column: Episode List Panel */}
                  <div className="lg:col-span-5 flex flex-col space-y-3 min-h-0">
                    {/* Search, Sort and Filter Toolbar */}
                    <div className="flex flex-col space-y-2 bg-[var(--bg-card)]/50 p-3 rounded-xl border border-[var(--border-soft)]">
                      <div className="flex items-center space-x-2">
                        {/* Search Input */}
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-dim)]" />
                          <input
                            type="text"
                            placeholder="Buscar capítulo..."
                            value={episodeSearch}
                            onChange={(e) => setEpisodeSearch(e.target.value)}
                            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-xs pl-8 pr-3 py-2 rounded-lg text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                        </div>
                      </div>
 
                      {/* Provider Toggle & Sort */}
                      <div className="flex items-center space-x-2">
                        {/* Provider Select */}
                        <div className="flex-1">
                          <EpisodeProviderSelect
                            value={provider}
                            onChange={setProvider}
                          />
                        </div>
                        {/* Sort Order Toggle */}
                        <button
                          type="button"
                          onClick={() => setEpisodeSort(prev => prev === 'asc' ? 'desc' : 'asc')}
                          className="p-2 bg-[var(--bg-elevated)] hover:bg-[var(--border-soft)] border border-[var(--border-medium)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer flex items-center space-x-1"
                          title={episodeSort === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'}
                        >
                          <ArrowUpDown className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase">{episodeSort === 'asc' ? 'Asc' : 'Desc'}</span>
                        </button>
                      </div>

                      {/* Filter Pills */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(['all', 'watched', 'pending'] as const).map((filter) => {
                          const labels = {
                            all: 'Todos',
                            watched: 'Vistos',
                            pending: 'Pendientes'
                          };
                          const active = episodeFilter === filter;
                          return (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => setEpisodeFilter(filter)}
                              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[var(--accent-primary)] text-white'
                                  : 'bg-[var(--bg-elevated)] hover:bg-[var(--border-soft)] text-[var(--text-dim)] hover:text-[var(--text-main)] border border-[var(--border-medium)]'
                              }`}
                            >
                              {labels[filter]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Cards List Container */}
                    <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[460px] border border-[var(--border-soft)] p-2 rounded-xl bg-slate-950/20">
                      {filteredEpisodes.length === 0 ? (
                        <div className="text-center py-10 text-[var(--text-dim)] text-xs">
                          Ningún capítulo coincide con los filtros aplicados.
                        </div>
                      ) : (
                        filteredEpisodes.map((ep) => {
                          const isWatched = watchedEpisodes.includes(ep.number);
                          const statusInfo = getEpisodeStatus();
                          const isSelected = selectedEpisode === ep.number;
                          
                          return (
                            <div
                              key={ep.id}
                              onClick={() => handleSelectEpisode(ep.number)}
                              className={`flex items-start p-2.5 rounded-xl border transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
                                  : 'border-[var(--border-soft)] bg-[var(--bg-card)]/40 hover:bg-[var(--bg-card)]/85'
                              }`}
                            >
                              {/* Left side: Thumbnail preview layout */}
                              <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-black shrink-0 border border-[var(--border-medium)] mr-3">
                                {anime.banner_image || anime.cover_image ? (
                                  <img
                                    src={anime.banner_image || anime.cover_image}
                                    alt={`Capítulo ${ep.number}`}
                                    className="w-full h-full object-cover opacity-80"
                                  />
                                ) : (
                                  <div
                                    className="flex h-full w-full items-center justify-center bg-[var(--bg-elevated)] text-[var(--text-dim)]"
                                    aria-hidden="true"
                                  >
                                    <MonitorPlay className="h-5 w-5" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-1">
                                  <span className="text-[9px] font-bold text-white bg-black/70 px-1 rounded">
                                    Cap. {ep.number}
                                  </span>
                                </div>
                                {isWatched && (
                                  <div className="absolute top-1 right-1 p-0.5 bg-emerald-500 rounded-full text-white">
                                    <CheckCircle2 className="h-3 w-3 fill-emerald-500 text-white" />
                                  </div>
                                )}
                              </div>

                              {/* Center/Right side: Info & Controls */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                                <div>
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-[var(--text-main)] truncate">
                                      Capítulo {ep.number}
                                    </h4>
                                    
                                    {/* Seen/unseen eye action button */}
                                    <button
                                      type="button"
                                      onClick={(e) => handleToggleWatch(ep.number, e)}
                                      className={`p-1 rounded hover:bg-[var(--border-soft)] transition-colors cursor-pointer shrink-0 ${
                                        isWatched ? 'text-[var(--accent-secondary)]' : 'text-[var(--text-dim)]'
                                      }`}
                                      title={isWatched ? "Marcar como no visto" : "Marcar como visto"}
                                    >
                                      {isWatched ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>

                                  {/* Subtitle Details */}
                                  <div className="flex items-center space-x-2 mt-0.5 text-[10px] text-[var(--text-dim)]">
                                    <span className="flex items-center">
                                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                                      {anime.duration ? `${anime.duration}m` : '24m'}
                                    </span>
                                    <span>•</span>
                                    <span className={`font-semibold ${
                                      statusInfo.type === 'upcoming' ? 'text-amber-400' : 'text-emerald-400'
                                    }`}>
                                      {statusInfo.type === 'upcoming' ? 'Próximamente' : 'Disponible'}
                                    </span>
                                  </div>

                                  <div className="text-[9px] text-[var(--text-dim)] mt-0.5 font-medium truncate">
                                    {statusInfo.label}
                                  </div>
                                </div>

                                {/* Source action bar */}
                                <div className="mt-2 flex items-center justify-between border-t border-[var(--border-soft)]/40 pt-1.5">
                                  <span className="text-[9px] text-[var(--text-dim)]">
                                    {isWatched ? 'Marcado como visto' : 'Pendiente de ver'}
                                  </span>

                                  {/* Source Metadata */}
                                  <span className="flex items-center gap-1.5 text-[9px] font-bold text-[var(--text-dim)] uppercase bg-slate-900/60 px-1.5 py-0.5 border border-[var(--border-soft)] rounded">
                                    <EpisodeLanguageFlag language={getEpisodeProvider(provider).language} />
                                    {getEpisodeProvider(provider).label}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }))
                      }
                    </div>
                  </div>

                  {/* Right Column: Dynamic Video Player Panel */}
                  <div className="lg:col-span-7 flex flex-col min-h-0 space-y-4">
                    {selectedEpisode !== null ? (
                      <div className="flex flex-col space-y-4 h-full">
                        {/* Selected Title and Status */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[var(--bg-card)]/40 p-3 rounded-xl border border-[var(--border-soft)]">
                          <div>
                            <h4 className="text-sm font-bold text-[var(--text-main)] flex items-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-secondary)] mr-2 animate-pulse" />
                              Capítulo {selectedEpisode}
                            </h4>
                            <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
                              Reproducción de video en línea ({getEpisodeProvider(provider).label})
                            </p>
                          </div>

                        </div>

                        {/* Embed Servers Controls */}
                        {embeds && (
                          <div className="flex flex-wrap gap-2 items-center justify-between bg-[var(--bg-card)]/20 p-2.5 rounded-xl border border-[var(--border-soft)]/50">
                            {/* Option groups SUB vs LAT */}
                            {Object.keys(embeds).length > 1 && (
                              <select
                                value={selectedVariant}
                                onChange={(e) => {
                                  const variant = e.target.value;
                                  setSelectedVariant(variant);
                                  if (embeds[variant] && embeds[variant].length > 0) {
                                    setSelectedServer(embeds[variant][0]);
                                  }
                                }}
                                className="bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-white text-xs px-2 py-1 rounded-lg focus:outline-none focus:border-[var(--accent-primary)] cursor-pointer"
                              >
                                {Object.keys(embeds).map(v => (
                                  <option key={v} value={v}>{v}</option>
                                ))}
                              </select>
                            )}

                            {/* Server option buttons */}
                            <div className="flex flex-wrap gap-1">
                              {embeds[selectedVariant]?.map((srv: any, idx: number) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setSelectedServer(srv)}
                                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-colors cursor-pointer ${
                                    selectedServer?.server === srv.server && selectedServer?.url === srv.url
                                      ? 'bg-[var(--accent-secondary)] text-slate-950 font-extrabold'
                                      : 'bg-[var(--bg-elevated)] hover:bg-[var(--border-soft)] text-[var(--text-dim)] border border-[var(--border-medium)]'
                                  }`}
                                >
                                  {srv.server}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Panel del reproductor embebido: el video lo pinta un WebContentsView de
                            Electron anclado sobre este div, no un iframe — por eso el div en sí
                            queda vacío salvo por los estados de carga/error. */}
                        <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-[var(--border-medium)] shadow-inner flex items-center justify-center">
                          {loadingEmbeds ? (
                            <div className="flex flex-col items-center space-y-2">
                              <div className="h-8 w-8 border-3 border-[var(--accent-secondary)] border-t-transparent rounded-full animate-spin"></div>
                              <p className="text-xs text-[var(--text-dim)] font-semibold">Cargando servidores...</p>
                            </div>
                          ) : selectedServer && isStandaloneServer ? (
                            <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
                              <MonitorPlay className="h-8 w-8 text-[var(--accent-secondary)]" />
                              <div>
                                <p className="text-sm font-bold text-[var(--text-main)]">Reproduciéndose en su propia ventana</p>
                                <p className="mt-1 text-xs text-[var(--text-dim)]">
                                  Este servidor no se reproduce dentro de la app, así que se abre aparte. Ahí también funciona la pantalla completa.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleOpenPlayerWindow()}
                                className="h-9 px-4 text-xs text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] flex items-center gap-2 cursor-pointer font-bold transition-colors rounded-md"
                              >
                                <MonitorPlay className="h-4 w-4 shrink-0" />
                                <span>Volver a abrir</span>
                              </button>
                            </div>
                          ) : selectedServer ? (
                            <>
                              <div ref={playerPanelRef} data-testid="anime-player-panel" className="absolute inset-0 h-full w-full" />
                              {!hasPlayerViewApi && (
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-xs text-[var(--text-dim)]">
                                  <MonitorPlay className="h-6 w-6 opacity-60" />
                                  <p>Este reproductor solo está disponible en la aplicación de escritorio. Usa "Ver en navegador".</p>
                                </div>
                              )}
                              {hasPlayerViewApi && playerAttachState === 'loading' && (
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center space-y-2 bg-black/70">
                                  <div className="h-8 w-8 border-3 border-[var(--accent-secondary)] border-t-transparent rounded-full animate-spin"></div>
                                  <p className="text-xs text-[var(--text-dim)] font-semibold">Preparando el reproductor...</p>
                                </div>
                              )}
                              {hasPlayerViewApi && playerAttachState === 'error' && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 px-6 text-center">
                                  <MonitorPlay className="h-8 w-8 text-rose-400" />
                                  <p className="text-sm font-bold text-[var(--text-main)]">No se pudo cargar el reproductor</p>
                                  <p className="text-xs text-[var(--text-dim)]">{playerErrorMessage || 'Prueba con otro servidor o ábrelo en el navegador.'}</p>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-[var(--text-dim)] text-xs text-center px-4">
                              Selecciona un servidor de arriba para iniciar la reproducción en línea.
                            </div>
                          )}
                        </div>

                        {/* Bottom action panel for the current online server */}
                        {selectedServer && (
                          <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-900/40 border border-[var(--border-light)]/60 p-2.5 rounded-lg">
                            <span className="text-[10px] text-[var(--text-dim)]">
                              Servidor actual: <span className="font-bold text-[var(--text-muted)]">{selectedServer.server}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenExternal(selectedServer.url)}
                                className="h-8 px-2 text-[10px] text-[var(--accent-primary)] hover:text-[var(--accent-primary-hover)] hover:underline flex items-center cursor-pointer font-bold transition-colors"
                              >
                                <span>Ver en navegador</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 border border-[var(--border-light)] border-dashed rounded-xl bg-slate-900/5 text-center text-[var(--text-dim)] text-xs">
                        <Video className="h-8 w-8 mb-2 text-[var(--text-dim)] opacity-40" />
                        <p>Selecciona un capítulo de la lista de la izquierda para reproducirlo en línea.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
};
