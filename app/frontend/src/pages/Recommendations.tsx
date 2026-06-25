import React, { useEffect, useState } from 'react';
import { AnimeCard } from '../components/anime/AnimeCard';
import { api } from '../services/api';

interface RecommendationsProps {
  refreshTrigger: number;
  onViewDetails: (idOrAnime: number | any) => void;
}

export const Recommendations: React.FC<RecommendationsProps> = ({ refreshTrigger, onViewDetails }) => {
  const [recs, setRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getRecommendations()
      .then(data => {
        setRecs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <div className="h-8 w-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs text-slate-400">Analizando tu biblioteca...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h3 className="text-base font-bold text-white uppercase tracking-wider">Recomendado Para Ti</h3>
        <p className="text-xs text-[var(--text-dim)]">Series sugeridas por el motor local según tus favoritos y notas guardadas.</p>
      </div>
      {recs.length === 0 ? (
        <div className="p-16 border border-dashed border-[var(--border-medium)] rounded-2xl text-center text-xs text-[var(--text-muted)]">
          Aún no hay suficientes calificaciones en tu biblioteca para generar sugerencias automáticas. Prueba puntuar algunas series completadas.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {recs.map(anime => (
            <AnimeCard key={anime.id} anime={anime} onViewDetails={onViewDetails} />
          ))}
        </div>
      )}
    </div>
  );
};
