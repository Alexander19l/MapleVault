import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Anime } from '../types';
import { AnimeCard } from '../components/anime/AnimeCard';
import mapleMascot from '../assets/maple-mascot.png';
import { useCurrentAnimeSeason } from '../hooks/useCurrentAnimeSeason';
import { 
  Bookmark, 
  CalendarDays,
  CheckCircle2, 
  ChevronRight,
  Flame, 
  Heart, 
  Library, 
  Sparkles, 
  TrendingUp 
} from 'lucide-react';

interface HomeProps {
  onViewDetails: (id: number) => void;
  onNavigate: (page: string) => void;
  refreshTrigger: number;
}

export const Home: React.FC<HomeProps> = ({ onViewDetails, onNavigate, refreshTrigger }) => {
  const currentAnimeSeason = useCurrentAnimeSeason();
  const [stats, setStats] = useState({
    total: 0,
    watching: 0,
    pending: 0,
    completed: 0,
    favorites: 0
  });

  const [recentAdded, setRecentAdded] = useState<Anime[]>([]);
  const [airingList, setAiringList] = useState<Anime[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHomeData();
  }, [refreshTrigger]);

  const loadHomeData = async () => {
    try {
      setLoading(true);
      const [summary, recs] = await Promise.all([
        api.getDashboardSummary(),
        api.getRecommendations()
      ]);

      setStats(summary.stats);
      setRecentAdded(summary.recentAdded || []);
      setAiringList(summary.airingList || []);
      setRecommendations(recs);
    } catch (err) {
      console.error('Error al cargar datos del Dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-slate-400">Analizando biblioteca...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      {/* Saludo */}
      <div className="border border-[var(--border-light)] bg-[var(--bg-card)] p-5 maple-page-enter">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src={mapleMascot}
              alt="Mascota de MapleVault"
              className="h-16 w-16 shrink-0 object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.4)] sm:h-20 sm:w-20"
              draggable={false}
            />
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-primary)]">
                Biblioteca local
              </span>
              <h2 className="mt-1 text-2xl font-extrabold text-white">
                Bienvenido a MapleVault
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
                Tu biblioteca local, el seguimiento de tus series y Maple Assistant en un solo lugar.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('seasons')}
            className="flex min-w-56 items-center justify-between gap-4 border border-[var(--border-medium)] bg-slate-950/30 px-4 py-3 text-left hover:border-violet-500/40 maple-interactive"
          >
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-[var(--accent-primary)]" />
              <div>
                <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Temporada actual
                </span>
                <strong className="text-sm text-white">
                  {currentAnimeSeason.label} {currentAnimeSeason.year}
                </strong>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Grid de Estadísticas */}
      <section className="grid grid-cols-2 border border-[var(--border-light)] bg-slate-950/20 sm:grid-cols-5">
        {[
          { label: 'Colección', val: stats.total, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/10', icon: Library },
          { label: 'Viendo', val: stats.watching, color: 'text-primary-400', bg: 'bg-primary-500/10', border: 'border-primary-500/10', icon: Flame },
          { label: 'Pendientes', val: stats.pending, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/10', icon: Bookmark },
          { label: 'Vistos', val: stats.completed, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/10', icon: CheckCircle2 },
          { label: 'Favoritos', val: stats.favorites, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/10', icon: Heart },
        ].map((s, idx) => {
          const Icon = s.icon;
          return (
            <div key={idx} className={`flex min-h-20 items-center space-x-3 border-b border-r border-[var(--border-light)] p-3 last:border-r-0 sm:border-b-0 ${s.bg}`}>
              <div className={`flex h-9 w-9 items-center justify-center bg-slate-900 ${s.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <span className="block text-xl font-extrabold text-white">{s.val}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{s.label}</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* Recomendaciones de Maple Assistant */}
      {recommendations.length > 0 && (
        <section className="space-y-4 border border-[var(--border-light)] bg-[var(--bg-card)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center">
              <Sparkles className="h-5 w-5 text-primary-400 mr-2 animate-pulse-soft" />
              Sugerencias de Maple Assistant
            </h3>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
              Basado en tus gustos
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendations.slice(0, 2).map((rec) => (
              <div
                key={rec.id}
                onClick={() => onViewDetails(rec.id)}
                className="flex cursor-pointer space-x-3 border border-dark-border/40 bg-slate-900/40 p-3 transition-colors hover:border-primary-500/40 hover:bg-slate-900/70"
              >
                <img
                  src={rec.cover_image}
                  alt={rec.title}
                  className="h-24 w-18 shrink-0 object-cover"
                />
                <div className="flex flex-col justify-between py-1 min-w-0">
                  <div>
                    <h4 className="text-sm font-bold text-white truncate">{rec.title}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">{rec.studio || 'Estudio Desconocido'}</p>
                    <p className="text-xs text-primary-400 mt-2 line-clamp-2 italic font-medium">
                      "{rec.reason}"
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-semibold mt-1">
                    {(rec.genres || []).slice(0, 2).map((g: string) => (
                      <span key={g} className="bg-slate-800 px-2 py-0.5">{g}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contenido en Dos Columnas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Últimos Añadidos */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center">
            <TrendingUp className="h-5 w-5 text-secondary-400 mr-2" />
            Añadidos Recientemente
          </h3>
          {recentAdded.length === 0 ? (
            <div className="p-8 border border-dashed border-dark-border/60 rounded-2xl text-center">
              <p className="text-slate-500 text-xs">Aún no has añadido animes a tu colección local.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {recentAdded.map((anime) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  onViewDetails={onViewDetails}
                />
              ))}
            </div>
          )}
        </section>

        {/* Animes en Emisión */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center">
            <Flame className="h-5 w-5 text-accent-400 mr-2" />
            Animes En Emisión
          </h3>
          {airingList.length === 0 ? (
            <div className="p-8 border border-dashed border-dark-border/60 rounded-2xl text-center">
              <p className="text-slate-500 text-xs">No hay series en emisión en tu catálogo local.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {airingList.map((anime) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  onViewDetails={onViewDetails}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
