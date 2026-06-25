import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import type { Anime } from '../types';
import { AnimeCard } from '../components/anime/AnimeCard';
import { 
  Search, 
  SlidersHorizontal, 
  LayoutGrid, 
  List, 
  AlignJustify, 
  Plus, 
  X,
  FolderPlus,
  Lock
} from 'lucide-react';
import { showConfirm } from '../utils/dialog';

interface CatalogProps {
  onViewDetails: (id: number) => void;
  refreshTrigger: number;
  isAdultsOnly?: boolean;
}

const CATALOG_PAGE_SIZE = 36;

export const Catalog: React.FC<CatalogProps> = ({ onViewDetails, refreshTrigger, isAdultsOnly = false }) => {
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  
  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedScore, setSelectedScore] = useState('');
  const [selectedSort, setSelectedSort] = useState('recent');

  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list' | 'compact'>('card');
  const observerTarget = useRef<HTMLDivElement>(null);

  // Modal para agregar anime manual
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAnime, setNewAnime] = useState({
    title: '',
    title_romaji: '',
    title_japanese: '',
    studio: '',
    year: new Date().getFullYear(),
    season: 'spring',
    type: 'tv',
    episodes: 12,
    duration: 24,
    score: 7.5,
    cover_image: '',
    genres: '',
    synopsis: ''
  });

  const buildCatalogFilters = useCallback(() => ({
    q: submittedSearchQuery || undefined,
    year: selectedYear || undefined,
    season: selectedSeason || undefined,
    genre: selectedGenre || undefined,
    status: selectedStatus || undefined,
    type: selectedType || undefined,
    score: selectedScore || undefined,
    sort: selectedSort,
    adult: isAdultsOnly ? 'only' : undefined
  }), [submittedSearchQuery, selectedYear, selectedSeason, selectedGenre, selectedStatus, selectedType, selectedScore, selectedSort, isAdultsOnly]);

  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAnimeListPage({
        ...buildCatalogFilters(),
        limit: CATALOG_PAGE_SIZE,
        offset: 0,
        includeSynopsis: viewMode === 'list'
      });
      setAnimes(data.items || []);
      setTotalCount(Number(data.total) || 0);
    } catch (err) {
      console.error('Error al cargar catálogo:', err);
    } finally {
      setLoading(false);
    }
  }, [buildCatalogFilters, viewMode]);

  const loadMoreCatalog = useCallback(async () => {
    if (loading || loadingMore || animes.length >= totalCount) return;

    try {
      setLoadingMore(true);
      const data = await api.getAnimeListPage({
        ...buildCatalogFilters(),
        limit: CATALOG_PAGE_SIZE,
        offset: animes.length,
        includeSynopsis: viewMode === 'list'
      });
      setAnimes(prev => {
        const known = new Set(prev.map(item => item.id));
        const nextItems = (data.items || []).filter((item: Anime) => !known.has(item.id));
        return [...prev, ...nextItems];
      });
      setTotalCount(Number(data.total) || totalCount);
    } catch (err) {
      console.error('Error al cargar más catálogo:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, animes.length, totalCount, buildCatalogFilters, viewMode]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreCatalog();
        }
      },
      { rootMargin: '240px' }
    );
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    return () => observer.disconnect();
  }, [loadMoreCatalog]);

  const loadGenres = useCallback(async () => {
    try {
      const list = await api.getGenres();
      setGenres(list);
    } catch (err) {
      console.error('Error al cargar géneros:', err);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog, refreshTrigger]);

  useEffect(() => {
    loadGenres();
  }, [loadGenres]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittedSearchQuery === searchQuery) {
      loadCatalog();
    } else {
      setSubmittedSearchQuery(searchQuery);
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
      loadCatalog();
    } catch (err) {
      console.error('Error al cambiar favorito:', err);
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
      loadCatalog();
    } catch (err) {
      console.error('Error al actualizar estado:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (await showConfirm('¿Deseas eliminar permanentemente esta serie del catálogo local?')) {
      try {
        await api.deleteAnime(id);
        loadCatalog();
      } catch (err) {
        console.error('Error al borrar anime:', err);
      }
    }
  };

  const handleAddAnimeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnime.title) return;

    try {
      const formatted = {
        ...newAnime,
        genres: newAnime.genres.split(',').map(g => g.trim()).filter(Boolean)
      };
      await api.createAnime(formatted);
      setShowAddModal(false);
      // Reset form
      setNewAnime({
        title: '',
        title_romaji: '',
        title_japanese: '',
        studio: '',
        year: new Date().getFullYear(),
        season: 'spring',
        type: 'tv',
        episodes: 12,
        duration: 24,
        score: 7.5,
        cover_image: '',
        genres: '',
        synopsis: ''
      });
      loadCatalog();
    } catch (err) {
      console.error('Error al crear anime:', err);
      alert('Error al añadir anime');
    }
  };

  return (
    <div className={`p-8 space-y-6 max-w-6xl mx-auto transition-all duration-300 ${isAdultsOnly ? 'bg-black/90 border-4 border-rose-600 rounded-none shadow-[8px_8px_0px_0px_rgba(225,29,72,1)] my-4' : ''}`}>
      {isAdultsOnly && (
        <div 
          className="w-full py-3 border-4 border-black font-mono font-black text-center uppercase relative overflow-hidden tracking-widest select-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4"
          style={{
            background: 'repeating-linear-gradient(-45deg, #facc15, #facc15 15px, #000000 15px, #000000 30px)',
            color: '#facc15',
            textShadow: '2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000',
          }}
        >
          /// ADVERTENCIA DE CONTENIDO: SECCIÓN RESTRINGIDA DE ADULTOS (+18) ///
        </div>
      )}
      {/* Cabecera Catálogo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white flex items-center">
            {isAdultsOnly ? (
              <Lock className="h-6 w-6 text-rose-500 mr-2" />
            ) : (
              <FolderPlus className="h-6 w-6 text-primary-400 mr-2" />
            )}
            {isAdultsOnly ? 'Sección Adultos (+18)' : 'Catálogo de Series'}
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            {isAdultsOnly 
              ? 'Contenido restringido catalogado como Hentai o +18.' 
              : 'Explora las series almacenadas en tu biblioteca local.'}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className={`px-4 py-2 border-2 ${
            isAdultsOnly 
              ? 'bg-rose-600 hover:bg-rose-500 border-black' 
              : 'bg-primary-500 hover:bg-primary-600 border-black'
          } rounded-none text-white text-xs font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center space-x-1.5 hover:-translate-y-0.5 hover:-translate-x-0.5 active:translate-y-0 active:translate-x-0 active:shadow-none transition-all cursor-pointer shrink-0`}
        >
          <Plus className="h-4 w-4" />
          <span>Añadir Anime Manual</span>
        </button>
      </div>

      {/* Controles de Búsqueda y Vistas */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Buscar por título..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full bg-dark-card border border-dark-border/60 text-white text-xs pl-9 pr-4 py-2.5 rounded-xl focus:outline-none placeholder-slate-500 transition-colors ${
              isAdultsOnly ? 'focus:border-rose-500' : 'focus:border-primary-500'
            }`}
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
        </form>

        <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
          {/* Botón Filtros Avanzados */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 border rounded-xl text-xs flex items-center space-x-1.5 transition-all ${
              showFilters 
                ? isAdultsOnly 
                  ? 'bg-rose-500/15 border-rose-500 text-rose-400 font-semibold'
                  : 'bg-primary-500/15 border-primary-500 text-primary-400 font-semibold' 
                : 'bg-dark-card border-dark-border text-slate-350 hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filtros</span>
          </button>

          {/* Ordenación */}
          <select
            value={selectedSort}
            onChange={(e) => setSelectedSort(e.target.value)}
            className={`bg-dark-card border border-dark-border text-slate-350 text-xs px-3 py-2 rounded-xl focus:outline-none ${
              isAdultsOnly ? 'focus:border-rose-500' : 'focus:border-primary-500'
            }`}
          >
            <option value="recent">Añadidos Recientes</option>
            <option value="title">Título (A-Z)</option>
            <option value="score">Mejor Calificación</option>
            <option value="popularity">Más Populares</option>
            <option value="year_desc">Estreno más nuevo</option>
            <option value="year_asc">Estreno más antiguo</option>
          </select>

          {/* Switcher de Vistas */}
          <div className="flex border border-dark-border bg-dark-card rounded-xl p-0.5 shrink-0">
            {[
              { id: 'card', icon: LayoutGrid, title: 'Cuadrícula' },
              { id: 'list', icon: List, title: 'Lista' },
              { id: 'compact', icon: AlignJustify, title: 'Compacta' },
            ].map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id as any)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    viewMode === v.id ? 'bg-slate-800 text-primary-400' : 'text-slate-500 hover:text-slate-350'
                  }`}
                  title={v.title}
                >
                  <Icon className="h-4.5 w-4.5" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Panel de Filtros Avanzados (Plegable) */}
      {showFilters && (
        <div className="p-5 border border-dark-border/60 bg-dark-card/50 rounded-2xl grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 maple-panel-enter">
          {/* Año */}
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Año</label>
            <input
              type="number"
              placeholder="Ej. 2024"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className={`w-full bg-slate-800 border border-dark-border/60 text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none ${
                isAdultsOnly ? 'focus:border-rose-500' : 'focus:border-primary-500'
              }`}
            />
          </div>

          {/* Temporada */}
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Temporada</label>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className={`w-full bg-slate-800 border border-dark-border/60 text-slate-300 text-xs px-3 py-1.5 rounded-lg focus:outline-none ${
                isAdultsOnly ? 'focus:border-rose-500' : 'focus:border-primary-500'
              }`}
            >
              <option value="">Todas</option>
              <option value="winter">Invierno</option>
              <option value="spring">Primavera</option>
              <option value="summer">Verano</option>
              <option value="fall">Otoño</option>
            </select>
          </div>

          {/* Género */}
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Género</label>
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className={`w-full bg-slate-800 border border-dark-border/60 text-slate-300 text-xs px-3 py-1.5 rounded-lg focus:outline-none ${
                isAdultsOnly ? 'focus:border-rose-500' : 'focus:border-primary-500'
              }`}
            >
              <option value="">Todos</option>
              {genres.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Estado Emisión */}
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Estado</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={`w-full bg-slate-800 border border-dark-border/60 text-slate-300 text-xs px-3 py-1.5 rounded-lg focus:outline-none ${
                isAdultsOnly ? 'focus:border-rose-500' : 'focus:border-primary-500'
              }`}
            >
              <option value="">Todos</option>
              <option value="airing">En Emisión</option>
              <option value="finished">Finalizado</option>
              <option value="upcoming">Próximamente</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>

          {/* Formato */}
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Formato</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className={`w-full bg-slate-800 border border-dark-border/60 text-slate-300 text-xs px-3 py-1.5 rounded-lg focus:outline-none ${
                isAdultsOnly ? 'focus:border-rose-500' : 'focus:border-primary-500'
              }`}
            >
              <option value="">Todos</option>
              <option value="tv">Serie TV</option>
              <option value="movie">Película</option>
              <option value="ova">OVA</option>
              <option value="ona">ONA</option>
              <option value="special">Especial</option>
            </select>
          </div>

          {/* Nota Mínima */}
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Nota Mínima</label>
            <select
              value={selectedScore}
              onChange={(e) => setSelectedScore(e.target.value)}
              className={`w-full bg-slate-800 border border-dark-border/60 text-slate-300 text-xs px-3 py-1.5 rounded-lg focus:outline-none ${
                isAdultsOnly ? 'focus:border-rose-500' : 'focus:border-primary-500'
              }`}
            >
              <option value="">Cualquiera</option>
              <option value="9">9+ (Sobresaliente)</option>
              <option value="8">8+ (Muy bueno)</option>
              <option value="7">7+ (Bueno)</option>
              <option value="6">6+ (Aceptable)</option>
            </select>
          </div>
        </div>
      )}

      {/* Grid del Catálogo */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[40vh]">
          <div className="flex flex-col items-center space-y-2">
            <div className={`h-8 w-8 border-3 ${isAdultsOnly ? 'border-rose-500' : 'border-primary-500'} border-t-transparent rounded-full animate-spin`}></div>
            <span className="text-xs text-slate-400">Filtrando catálogo...</span>
          </div>
        </div>
      ) : animes.length === 0 ? (
        <div className="py-20 border border-dashed border-dark-border/60 rounded-3xl text-center flex flex-col items-center space-y-3">
          <SlidersHorizontal className="h-10 w-10 text-slate-600" />
          <h4 className="font-bold text-slate-300">No se encontraron series</h4>
          <p className="text-slate-500 text-xs max-w-sm">
            {isAdultsOnly
              ? 'Prueba a limpiar tus filtros o realiza búsquedas/sincronizaciones para agregar animes a esta sección.'
              : 'Prueba a limpiar tus filtros o realiza una búsqueda en la sección de Temporadas para agregar animes a la biblioteca.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>
              Mostrando {animes.length} de {totalCount} series
            </span>
            {loadingMore && <span className="text-[var(--accent-primary)]">Cargando más...</span>}
          </div>

          <div className={
            viewMode === 'card' 
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6' 
              : viewMode === 'list' 
                ? 'space-y-4' 
                : 'grid grid-cols-1 md:grid-cols-2 gap-3'
          }>
            {animes.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                viewMode={viewMode}
                onViewDetails={onViewDetails}
                onToggleFavorite={handleToggleFavorite}
                onQuickStatusChange={handleQuickStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
          {animes.length < totalCount && (
            <div ref={observerTarget} className="h-10 w-full flex items-center justify-center mt-6">
              <div className="h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </>
      )}

      {/* Modal Manual de Creación */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-dark-card border border-dark-border rounded-3xl overflow-hidden shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-dark-border/60 pb-3 mb-4">
              <h3 className="text-lg font-bold text-white flex items-center">
                <Plus className="h-5 w-5 mr-2 text-primary-500" />
                Registrar Anime Manualmente
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-450 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddAnimeSubmit} className="space-y-4 text-xs text-slate-300">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-400 uppercase mb-1">Título principal *</label>
                  <input
                    type="text"
                    required
                    value={newAnime.title}
                    onChange={(e) => setNewAnime({ ...newAnime, title: e.target.value })}
                    placeholder="Ej. Frieren: Beyond Journey's End"
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Año de estreno</label>
                  <input
                    type="number"
                    value={newAnime.year}
                    onChange={(e) => setNewAnime({ ...newAnime, year: parseInt(e.target.value) || new Date().getFullYear() })}
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Título Romaji</label>
                  <input
                    type="text"
                    value={newAnime.title_romaji}
                    onChange={(e) => setNewAnime({ ...newAnime, title_romaji: e.target.value })}
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Título Japonés</label>
                  <input
                    type="text"
                    value={newAnime.title_japanese}
                    onChange={(e) => setNewAnime({ ...newAnime, title_japanese: e.target.value })}
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Estudio Animación</label>
                  <input
                    type="text"
                    value={newAnime.studio}
                    onChange={(e) => setNewAnime({ ...newAnime, studio: e.target.value })}
                    placeholder="Ej. Madhouse"
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Temporada</label>
                  <select
                    value={newAnime.season}
                    onChange={(e) => setNewAnime({ ...newAnime, season: e.target.value })}
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  >
                    <option value="winter">Invierno</option>
                    <option value="spring">Primavera</option>
                    <option value="summer">Verano</option>
                    <option value="fall">Otoño</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Formato</label>
                  <select
                    value={newAnime.type}
                    onChange={(e) => setNewAnime({ ...newAnime, type: e.target.value })}
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  >
                    <option value="tv">Serie TV</option>
                    <option value="movie">Película</option>
                    <option value="ova">OVA</option>
                    <option value="ona">ONA</option>
                    <option value="special">Especial</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Episodios</label>
                  <input
                    type="number"
                    value={newAnime.episodes}
                    onChange={(e) => setNewAnime({ ...newAnime, episodes: parseInt(e.target.value) || 12 })}
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Nota inicial (0-10)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={newAnime.score}
                    onChange={(e) => setNewAnime({ ...newAnime, score: parseFloat(e.target.value) || 7.5 })}
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">URL de Portada (Imagen)</label>
                  <input
                    type="url"
                    value={newAnime.cover_image}
                    onChange={(e) => setNewAnime({ ...newAnime, cover_image: e.target.value })}
                    placeholder="https://link-de-imagen.jpg"
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Géneros (Separados por coma)</label>
                  <input
                    type="text"
                    value={newAnime.genres}
                    onChange={(e) => setNewAnime({ ...newAnime, genres: e.target.value })}
                    placeholder="Action, Fantasy, Comedy"
                    className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-400 uppercase mb-1">Sinopsis</label>
                <textarea
                  rows={3}
                  value={newAnime.synopsis}
                  onChange={(e) => setNewAnime({ ...newAnime, synopsis: e.target.value })}
                  placeholder="De qué trata esta serie..."
                  className="w-full bg-slate-800 border border-dark-border text-white px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex space-x-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 border-2 border-black text-white rounded-none font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:-translate-x-0.5 active:translate-y-0 active:translate-x-0 active:shadow-none transition-all cursor-pointer"
                >
                  Registrar Anime
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
