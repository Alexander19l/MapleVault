import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Database, Search, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import type { MangaItem, MangaSourceOverview } from '../types';

const PAGE_SIZE = 30;

interface MangaProps {
  refreshTrigger?: number;
}

export const Manga: React.FC<MangaProps> = ({ refreshTrigger = 0 }) => {
  const [manga, setManga] = useState<MangaItem[]>([]);
  const [sources, setSources] = useState<MangaSourceOverview | null>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const loadManga = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getMangaListPage({
        q: submittedQuery || undefined,
        limit: PAGE_SIZE,
        offset: 0
      });
      setManga(data.rows || []);
      setTotal(Number(data.total) || 0);
    } catch (error) {
      console.error('Error al cargar manga:', error);
      setManga([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [submittedQuery]);

  useEffect(() => {
    loadManga();
  }, [loadManga, refreshTrigger]);

  useEffect(() => {
    let mounted = true;
    api.getMangaSources()
      .then(data => {
        if (mounted) setSources(data);
      })
      .catch(error => {
        console.error('Error al cargar fuentes de manga:', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const enabledSources = useMemo(
    () => sources?.configured.filter(source => source.enabled === 1) || [],
    [sources]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3 text-[var(--text-main)]">
            <BookOpen className="h-7 w-7 text-[var(--accent-primary)]" />
            <h1 className="text-3xl font-black tracking-tight">Manga</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Biblioteca preparada para manga, manhwa, manhua y webtoons. Las fuentes de scraping quedan desactivadas hasta definir proveedores seguros.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative w-full lg:w-96">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filtrar manga local..."
            className="w-full rounded-lg border border-[var(--border-medium)] bg-slate-950/70 py-2.5 pl-9 pr-3 text-sm text-[var(--text-main)] outline-none transition-colors focus:border-[var(--accent-primary)]"
          />
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--border-medium)] bg-slate-900/45 p-4">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-sky-300" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">Biblioteca</span>
          </div>
          <p className="mt-3 text-2xl font-black">{total}</p>
          <p className="text-xs text-[var(--text-muted)]">Registros locales de manga.</p>
        </div>
        <div className="rounded-lg border border-[var(--border-medium)] bg-slate-900/45 p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">Fuentes activas</span>
          </div>
          <p className="mt-3 text-2xl font-black">{enabledSources.length}</p>
          <p className="text-xs text-[var(--text-muted)]">Ninguna fuente externa se activa por defecto.</p>
        </div>
        <div className="rounded-lg border border-[var(--border-medium)] bg-slate-900/45 p-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-violet-300" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">Candidatas</span>
          </div>
          <p className="mt-3 text-2xl font-black">{sources?.candidates.length || 0}</p>
          <p className="text-xs text-[var(--text-muted)]">Pendientes de auditoría antes de integrarse.</p>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center text-sm text-[var(--text-muted)]">
          Cargando biblioteca de manga...
        </div>
      ) : manga.length === 0 ? (
        <section className="rounded-lg border border-dashed border-[var(--border-medium)] bg-slate-950/40 p-8 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-[var(--text-dim)]" />
          <h2 className="mt-4 text-lg font-bold text-[var(--text-main)]">La sección de manga está lista, pero vacía</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            El esquema, endpoints y vista ya están separados de anime. El siguiente paso será definir proveedores de manga y reglas de scraping antes de sincronizar contenido.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {manga.map(item => (
            <article key={item.id} className="rounded-lg border border-[var(--border-medium)] bg-slate-900/55 p-4">
              <h2 className="line-clamp-2 text-sm font-bold text-[var(--text-main)]">{item.title}</h2>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {[item.format, item.year, item.chapters ? `${item.chapters} capítulos` : null].filter(Boolean).join(' · ') || 'Dato no disponible'}
              </p>
            </article>
          ))}
        </section>
      )}

      {sources && (
        <section className="rounded-lg border border-[var(--border-medium)] bg-slate-900/35 p-5">
          <h2 className="text-sm font-bold text-[var(--text-main)]">Fuentes candidatas para manga</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{sources.policy}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {sources.candidates.map(source => (
              <div key={source.id} className="rounded-lg border border-[var(--border-soft)] bg-slate-950/45 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-[var(--text-main)]">{source.name}</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase text-[var(--text-muted)]">
                    riesgo {source.risk}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">{source.notes}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Manga;
