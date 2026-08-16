import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Database,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck
} from 'lucide-react';
import { MangaReader } from '../components/manga/MangaReader';
import { Modal } from '../components/ui/Modal';
import { api } from '../services/api';
import type {
  MangaItem,
  MangaOnlineChapter,
  MangaOnlinePages,
  MangaOnlineProvider,
  MangaOnlineSearchItem,
  MangaOnlineTag,
  MangaSourceOverview
} from '../types';

const PAGE_SIZE = 30;
const DEFAULT_MANGA_PROVIDER: MangaOnlineProvider = {
  id: 'mangadex',
  label: 'MangaDex',
  baseUrl: 'https://api.mangadex.org',
  languages: ['es', 'en'],
  status: 'active',
  enabled: true,
  notes: 'Proveedor principal mediante API pública.'
};

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
  const [mode, setMode] = useState<'local' | 'online'>('local');
  const [onlineResults, setOnlineResults] = useState<MangaOnlineSearchItem[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [selectedOnline, setSelectedOnline] = useState<MangaOnlineSearchItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [chapterError, setChapterError] = useState('');
  const [recentResults, setRecentResults] = useState<MangaOnlineSearchItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [tags, setTags] = useState<MangaOnlineTag[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [chapters, setChapters] = useState<MangaOnlineChapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [reader, setReader] = useState<MangaOnlinePages | null>(null);
  const [readerChapter, setReaderChapter] = useState<MangaOnlineChapter | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState('mangadex');

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

  const onlineProviders = useMemo(
    () => sources?.providers?.length ? sources.providers : [DEFAULT_MANGA_PROVIDER],
    [sources]
  );

  const selectedProvider = useMemo(
    () => onlineProviders.find(provider => provider.id === selectedProviderId) || DEFAULT_MANGA_PROVIDER,
    [onlineProviders, selectedProviderId]
  );

  const loadOnlineContext = useCallback(async () => {
    if (!selectedProvider.enabled) return;
    setRecentLoading(true);
    const [recentResult, tagResult] = await Promise.allSettled([
      api.getMangaOnlineRecent(8, selectedProvider.id),
      api.getMangaOnlineTags(selectedProvider.id)
    ]);
    setRecentResults(recentResult.status === 'fulfilled' ? recentResult.value.results || [] : []);
    setTags(tagResult.status === 'fulfilled' ? tagResult.value.tags || [] : []);
    setRecentLoading(false);
  }, [selectedProvider]);

  const genreTags = useMemo(() => tags.filter(tag => tag.group === 'genre'), [tags]);
  const topicTags = useMemo(() => tags.filter(tag => tag.group !== 'genre'), [tags]);

  const activeOnlineProviderCount = useMemo(
    () => onlineProviders.filter(provider => provider.enabled).length,
    [onlineProviders]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (mode === 'local') {
      setSubmittedQuery(value);
      return;
    }

    if (value.length < 2 || !selectedProvider.enabled) return;
    setOnlineLoading(true);
    setSelectedOnline(null);
    setChapters([]);
    api.searchMangaOnline(value, 20, selectedProvider.id, {
      genres: selectedGenres,
      tags: selectedTags,
      status: statusFilter || undefined
    })
      .then(data => setOnlineResults(data.results || []))
      .catch(error => {
        console.error('Error al buscar manga en línea:', error);
        setOnlineResults([]);
      })
      .finally(() => setOnlineLoading(false));
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    setOnlineResults([]);
    setSelectedOnline(null);
    setChapters([]);
    setReader(null);
    setReaderChapter(null);
    setDetailOpen(false);
    setSelectedGenres([]);
    setSelectedTags([]);
    setStatusFilter('');
  };

  useEffect(() => {
    if (mode === 'online') void loadOnlineContext();
  }, [mode, loadOnlineContext]);

  const handleSelectOnline = async (item: MangaOnlineSearchItem) => {
    setSelectedOnline(item);
    setDetailOpen(true);
    setDetailLoading(true);
    setReader(null);
    setChaptersLoading(true);
    const providerId = selectedProvider.id;
    const detailsRequest = item.synopsis
      ? Promise.resolve({ manga: item })
      : api.getMangaOnlineDetails(item.id, providerId);
    const [detailsResult, chaptersResult] = await Promise.allSettled([
      detailsRequest,
      api.getMangaOnlineChapters(item.id, ['es', 'en'], providerId)
    ]);

    if (detailsResult.status === 'fulfilled') {
      setSelectedOnline(current => current?.id === item.id
        ? { ...item, ...detailsResult.value.manga }
        : current);
    } else {
      console.error('Error al cargar la ficha de manga:', detailsResult.reason);
    }
    if (chaptersResult.status === 'fulfilled') {
      setChapters(chaptersResult.value.chapters || []);
    } else {
      console.error('Error al cargar capítulos de manga:', chaptersResult.reason);
      setChapters([]);
    }
    setChaptersLoading(false);
    setDetailLoading(false);
  };

  const handleOpenChapter = async (chapter: MangaOnlineChapter) => {
    setReaderLoading(true);
    setChapterError('');
    setReaderChapter(chapter);
    setDetailOpen(false);
    try {
      setReader(await api.getMangaOnlinePages(chapter.id, 'data-saver', selectedProvider.id));
    } catch (error) {
      console.error('Error al abrir capítulo de manga:', error);
      setReader(null);
      setReaderChapter(null);
      setChapterError('No se pudo abrir este capítulo. La fuente puede estar temporalmente ocupada. Intenta nuevamente.');
    } finally {
      setReaderLoading(false);
    }
  };

  const clearDetail = () => {
    setDetailOpen(false);
    setSelectedOnline(null);
    setChapters([]);
    setReader(null);
    setReaderChapter(null);
    setChapterError('');
  };

  const handleDownloadChapter = async (chapter: MangaOnlineChapter) => {
    if (!selectedOnline) return;
    setDownloadLoading(true);
    try {
      const blob = await api.downloadMangaOnlineChapter(
        chapter.id,
        selectedOnline.title,
        String(chapter.number ?? chapter.id.slice(0, 8)),
        'data-saver',
        selectedProvider.id
      );
      const fileName = `${selectedOnline.title} - Capitulo ${chapter.number ?? chapter.id.slice(0, 8)}.zip`;
      const desktopMangaApi = (window as any).electronAPI?.manga;
      if (desktopMangaApi?.saveArchive) {
        const result = await desktopMangaApi.saveArchive({
          series: selectedOnline.title,
          fileName,
          data: new Uint8Array(await blob.arrayBuffer())
        });
        if (result?.saved) return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error al descargar capítulo de manga:', error);
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fadeIn">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3 text-[var(--text-main)]">
            <BookOpen className="h-7 w-7 text-[var(--accent-primary)]" />
            <h1 className="text-3xl font-black tracking-tight">Manga</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Biblioteca local y búsqueda remota por proveedor. Los capítulos se cargan bajo demanda y solo se aceptan traducciones en español o inglés.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end lg:w-[44rem]">
          <label className="flex min-w-44 flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">Servidor</span>
            <select
              value={selectedProviderId}
              onChange={event => handleProviderChange(event.target.value)}
              className="h-10 rounded-lg border border-[var(--border-medium)] bg-slate-950/70 px-3 text-sm font-bold text-[var(--text-main)] outline-none transition-colors focus:border-[var(--accent-primary)]"
              aria-label="Servidor de manga"
            >
              {onlineProviders.map(provider => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}{provider.enabled ? '' : ' · pendiente'}
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={mode === 'local' ? 'Filtrar manga local...' : `Buscar manga en ${selectedProvider.label}...`}
              className="w-full rounded-lg border border-[var(--border-medium)] bg-slate-950/70 py-2.5 pl-9 pr-3 text-sm text-[var(--text-main)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </div>
          <button
            type="submit"
            disabled={mode === 'online' && !selectedProvider.enabled}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {onlineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </button>
          </form>
        </div>
      </section>

      <div className="inline-flex rounded-lg border border-[var(--border-medium)] bg-slate-950/60 p-1" role="tablist" aria-label="Origen de manga">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'local'}
          onClick={() => setMode('local')}
          className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${mode === 'local' ? 'bg-[var(--accent-primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
        >
          Biblioteca local
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'online'}
          onClick={() => setMode('online')}
          className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${mode === 'online' ? 'bg-[var(--accent-primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
        >
          Buscar en {selectedProvider.label}
        </button>
      </div>

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
          <p className="mt-3 text-2xl font-black">{activeOnlineProviderCount}</p>
          <p className="text-xs text-[var(--text-muted)]">Proveedores remotos operativos.</p>
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

      {mode === 'online' ? (
        <section className="space-y-4">
          <section className="rounded-lg border border-[var(--border-medium)] bg-slate-900/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-main)]"><Filter className="h-4 w-4 text-[var(--accent-primary)]" /> Filtros de catálogo</div>
              <button type="button" onClick={() => { setSelectedGenres([]); setSelectedTags([]); setStatusFilter(''); }} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]">Limpiar filtros</button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs text-[var(--text-muted)]">Géneros
                <select multiple value={selectedGenres} onChange={event => setSelectedGenres(Array.from(event.target.selectedOptions).slice(0, 4).map(option => option.value))} className="mt-1 h-20 w-full rounded-md border border-[var(--border-soft)] bg-slate-950/70 p-1 text-xs text-[var(--text-main)]" aria-label="Filtrar por géneros">
                  {genreTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-[var(--text-muted)]">Temas y etiquetas
                <select multiple value={selectedTags} onChange={event => setSelectedTags(Array.from(event.target.selectedOptions).slice(0, 4).map(option => option.value))} className="mt-1 h-20 w-full rounded-md border border-[var(--border-soft)] bg-slate-950/70 p-1 text-xs text-[var(--text-main)]" aria-label="Filtrar por etiquetas">
                  {topicTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-[var(--text-muted)]">Estado
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--border-soft)] bg-slate-950/70 px-2 text-xs text-[var(--text-main)]">
                  <option value="">Cualquier estado</option><option value="ongoing">En publicación</option><option value="completed">Finalizado</option><option value="hiatus">En pausa</option>
                </select>
              </label>
            </div>
            {!tags.length && selectedProvider.id !== 'mangadex' && <p className="mt-2 text-[11px] text-[var(--text-dim)]">Esta fuente no expone filtros de etiquetas; la búsqueda por título sigue disponible.</p>}
          </section>

          {!onlineResults.length && !query.trim() && (
            <section className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-[var(--text-main)]">Obras recientes en {selectedProvider.label}</h2>{recentLoading && <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-primary)]" />}</div>
              {recentResults.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{recentResults.map(item => <button key={`recent-${item.id}`} type="button" onClick={() => handleSelectOnline(item)} className="group overflow-hidden rounded-lg border border-[var(--border-medium)] bg-slate-900/55 text-left transition-transform hover:-translate-y-0.5 hover:border-[var(--accent-primary)]"><div className="aspect-[3/4] bg-slate-950">{item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center"><BookOpen className="h-8 w-8 text-[var(--text-dim)]" /></div>}</div><div className="p-3"><h3 className="line-clamp-2 text-xs font-bold text-[var(--text-main)]">{item.title}</h3></div></button>)}</div> : <p className="rounded-lg border border-dashed border-[var(--border-medium)] p-5 text-center text-xs text-[var(--text-muted)]">No hay una muestra reciente disponible para esta fuente.</p>}
            </section>
          )}

          {onlineLoading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-primary)]" />
              Buscando en {selectedProvider.label}...
            </div>
          ) : onlineResults.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-medium)] bg-slate-950/40 p-8 text-center text-sm text-[var(--text-muted)]">
              {selectedProvider.enabled
                ? `Escribe un título para consultar ${selectedProvider.label}.`
                : `${selectedProvider.label} está pendiente de autorización y no puede consultarse todavía.`}
            </div>
          ) : (
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {onlineResults.map(item => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => handleSelectOnline(item)}
                  className="group overflow-hidden rounded-lg border border-[var(--border-medium)] bg-slate-900/55 text-left transition-transform hover:-translate-y-0.5 hover:border-[var(--accent-primary)]"
                >
                  <div className="aspect-[3/4] bg-slate-950">
                    {item.coverUrl ? (
                      <img src={item.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                    ) : <div className="flex h-full items-center justify-center"><BookOpen className="h-10 w-10 text-[var(--text-dim)]" /></div>}
                  </div>
                  <div className="p-4">
                    <h2 className="line-clamp-2 text-sm font-bold text-[var(--text-main)]">{item.title}</h2>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{[item.year, item.status].filter(Boolean).join(' · ') || 'Dato no disponible'}</p>
                  </div>
                </button>
              ))}
            </section>
          )}

          {selectedOnline && (
            <Modal isOpen={detailOpen} onClose={clearDetail} title={`Ficha de ${selectedOnline.title}`} size="xl">
              <div className="flex flex-col gap-4 md:flex-row">
                {selectedOnline.coverUrl && <img src={selectedOnline.coverUrl} alt="" referrerPolicy="no-referrer" className="h-40 w-28 rounded-md object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black text-[var(--text-main)]">{selectedOnline.title}</h2>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{selectedProvider.label} · {selectedOnline.year || 'Año no disponible'}</p>
                    </div>
                  </div>
                  {detailLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando ficha y capítulos...</div> : <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{selectedOnline.synopsis || 'Sinopsis no disponible en la fuente.'}</p>}
                  {selectedOnline.translation?.translated && <p className="mt-2 text-[11px] font-bold text-emerald-300">Sinopsis traducida al español por LibreTranslate.</p>}
                  {!detailLoading && selectedOnline.tags?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{selectedOnline.tags.map(tag => <span key={tag} className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-[var(--text-muted)]">{tag}</span>)}</div> : null}
                  <a href={selectedOnline.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[var(--accent-primary)] hover:underline">
                    Abrir ficha de {selectedProvider.label} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
                <h3 className="text-sm font-bold text-[var(--text-main)]">Capítulos disponibles</h3>
                {chaptersLoading ? (
                  <div className="flex items-center gap-2 py-5 text-sm text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando capítulos...</div>
                ) : chapters.length === 0 ? (
                  <p className="py-5 text-sm text-[var(--text-muted)]">No hay capítulos en español o inglés para esta obra.</p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {chapters.map(chapter => (
                      <div key={`${chapter.id}-${chapter.language}`} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-slate-950/45 px-3 py-2">
                        <button type="button" onClick={() => handleOpenChapter(chapter)} className="min-w-0 text-left text-sm font-bold text-[var(--text-main)] hover:text-[var(--accent-primary)]">
                          Cap. {chapter.number ?? 'S/N'} <span className="ml-1 text-[10px] uppercase text-[var(--text-dim)]">{chapter.language}</span>
                        </button>
                        <button type="button" onClick={() => handleDownloadChapter(chapter)} disabled={downloadLoading} className="shrink-0 rounded-md p-2 text-[var(--text-muted)] hover:bg-slate-800 hover:text-white disabled:opacity-50" aria-label="Descargar capítulo" title="Descargar capítulo">
                          {downloadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Modal>
          )}

          {chapterError && <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-400/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200"><span>{chapterError}</span><button type="button" onClick={() => readerChapter && handleOpenChapter(readerChapter)} className="inline-flex items-center gap-2 rounded-md bg-rose-900/50 px-3 py-2 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5" /> Reintentar</button></div>}

          {readerLoading && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-medium)] bg-slate-950/40 py-8 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-primary)]" />
              Preparando el capítulo...
            </div>
          )}

          {reader && readerChapter && selectedOnline && (
            <MangaReader
              title={selectedOnline.title}
              chapterLabel={`Cap. ${readerChapter.number ?? 'S/N'}`}
              pages={reader.pages}
              downloadLoading={downloadLoading}
              onClose={() => { setReader(null); setReaderChapter(null); }}
              onDownload={() => handleDownloadChapter(readerChapter)}
            />
          )}
        </section>
      ) : loading ? (
        <div className="flex min-h-72 items-center justify-center text-sm text-[var(--text-muted)]">
          Cargando biblioteca de manga...
        </div>
      ) : manga.length === 0 ? (
        <section className="rounded-lg border border-dashed border-[var(--border-medium)] bg-slate-950/40 p-8 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-[var(--text-dim)]" />
          <h2 className="mt-4 text-lg font-bold text-[var(--text-main)]">La sección de manga está lista, pero vacía</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Busca una obra en MangaDex, ZonaTMO o ShadeManga para consultar su ficha y capítulos sin llenar automáticamente tu biblioteca local.
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
