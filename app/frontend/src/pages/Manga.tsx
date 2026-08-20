import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  BookOpen,
  Database,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck
} from 'lucide-react';
import { MangaReader } from '../components/manga/MangaReader';
import { MangaGenrePanel } from '../components/manga/MangaGenrePanel';
import { ChapterListItem } from '../components/manga/ChapterListItem';
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

type OfflineChapter = { key: string; label: string; pages: number };

const findOfflineChapter = (chapter: MangaOnlineChapter, chapters: OfflineChapter[]) => {
  const number = chapter.number === undefined || chapter.number === null ? '' : String(chapter.number).trim();
  if (number) {
    const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`capitulo\\s+${escaped}(?:$|\\s|[-(])`, 'i');
    const match = chapters.find(item => pattern.test(item.label));
    if (match) return match;
  }
  const idPrefix = chapter.id.slice(0, 8).toLowerCase();
  return chapters.find(item => item.label.toLowerCase().includes(idPrefix));
};

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
  const [selectedLocal, setSelectedLocal] = useState<MangaItem | null>(null);
  const [localChapters, setLocalChapters] = useState<MangaOnlineChapter[]>([]);
  const [offlineChapters, setOfflineChapters] = useState<OfflineChapter[]>([]);
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
  const [chapterSort, setChapterSort] = useState<'asc' | 'desc'>('asc');
  const [reader, setReader] = useState<MangaOnlinePages | null>(null);
  const [readerChapter, setReaderChapter] = useState<MangaOnlineChapter | null>(null);
  const [offlineReaderKey, setOfflineReaderKey] = useState('');
  const [readerLoading, setReaderLoading] = useState(false);
  const [downloadingChapters, setDownloadingChapters] = useState<Set<string>>(new Set());
  const [selectedProviderId, setSelectedProviderId] = useState('mangadex');
  const [onlinePage, setOnlinePage] = useState(0);
  const [onlineHasMore, setOnlineHasMore] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'reading' | 'plan_to_read' | 'dropped' | 'favorite'>('all');
  const [libraryFolderMessage, setLibraryFolderMessage] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);

  const loadManga = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getMangaListPage({
        q: submittedQuery || undefined,
        limit: PAGE_SIZE,
        offset: 0,
        readStatus: ['reading', 'plan_to_read', 'dropped'].includes(libraryFilter) ? libraryFilter : undefined,
        favorite: libraryFilter === 'favorite' ? true : undefined
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
  }, [submittedQuery, libraryFilter]);

  useEffect(() => {
    loadManga();
  }, [loadManga, refreshTrigger]);

  const handleOpenMangaLibraryFolder = async () => {
    const result = await (window as any).electronAPI?.manga?.openFolder?.();
    setLibraryFolderMessage(result?.error ? `No se pudo abrir la carpeta: ${result.error}` : 'Carpeta de mangas descargados abierta.');
    window.setTimeout(() => setLibraryFolderMessage(''), 5000);
  };

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

  const sortChapters = useCallback((list: MangaOnlineChapter[]) => {
    const sorted = [...list].sort((a, b) => {
      const aNumber = a.number ?? Number.POSITIVE_INFINITY;
      const bNumber = b.number ?? Number.POSITIVE_INFINITY;
      return aNumber - bNumber;
    });
    return chapterSort === 'desc' ? sorted.reverse() : sorted;
  }, [chapterSort]);

  const sortedChapters = useMemo(() => sortChapters(chapters), [chapters, sortChapters]);
  const sortedLocalChapters = useMemo(() => sortChapters(localChapters), [localChapters, sortChapters]);

  const activeOnlineProviderCount = useMemo(
    () => onlineProviders.filter(provider => provider.enabled).length,
    [onlineProviders]
  );

  const runOnlineSearch = async (page: number) => {
    const value = query.trim();
    if ((!value && !selectedGenres.length && !selectedTags.length && !statusFilter) || !selectedProvider.enabled) return;
    setOnlineLoading(true);
    setOnlinePage(page);
    setSelectedOnline(null);
    setSelectedLocal(null);
    setChapters([]);
    try {
      const data = await api.searchMangaOnline(value, 20, selectedProvider.id, {
        genres: selectedGenres,
        tags: selectedTags,
        status: statusFilter || undefined,
        page
      });
      setOnlineResults(data.results || []);
      setOnlineHasMore(Boolean(data.hasMore));
    } catch (error) {
      console.error('Error al buscar manga en línea:', error);
      setOnlineResults([]);
      setOnlineHasMore(false);
    } finally {
      setOnlineLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (mode === 'local') {
      setSubmittedQuery(value);
      return;
    }

    if (!value && !selectedGenres.length && !selectedTags.length && !statusFilter) return;
    void runOnlineSearch(0);
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
    setOnlinePage(0);
    setOnlineHasMore(false);
  };

  useEffect(() => {
    if (mode === 'online') void loadOnlineContext();
  }, [mode, loadOnlineContext]);

  const handleSelectOnline = async (item: MangaOnlineSearchItem) => {
    setSelectedOnline(item);
    setSelectedLocal(null);
    setDetailOpen(true);
    setDetailLoading(true);
    setReader(null);
    setChaptersLoading(true);
    const providerId = selectedProvider.id;
    const offlineApi = (window as any).electronAPI?.manga;
    const [detailsResult, chaptersResult, offlineResult] = await Promise.allSettled([
      api.getMangaOnlineDetails(item.id, providerId),
      api.getMangaOnlineChapters(item.id, ['es', 'en'], providerId),
      offlineApi?.listOfflineChapters ? offlineApi.listOfflineChapters({ series: item.title }) : Promise.resolve(null)
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
    // Mismo dato que ya se calculaba para la ficha local: si el usuario ya
    // descargó capítulos de esta obra antes, la ficha online también debe
    // marcarlos como descargados en vez de ofrecerlos como "solo online".
    setOfflineChapters(offlineResult.status === 'fulfilled' ? offlineResult.value?.chapters || [] : []);
    setChaptersLoading(false);
    setDetailLoading(false);
  };

  const handleSelectLocal = async (item: MangaItem) => {
    setSelectedLocal(item);
    setSelectedOnline(null);
    setDetailOpen(true);
    setDetailLoading(true);
    const offlineApi = (window as any).electronAPI?.manga;
    const [detailResult, chaptersResult, offlineResult] = await Promise.allSettled([
      api.getMangaDetail(item.id),
      api.getMangaChapters(item.id),
      offlineApi?.listOfflineChapters ? offlineApi.listOfflineChapters({ series: item.title }) : Promise.resolve(null)
    ]);
    if (detailResult.status === 'fulfilled') setSelectedLocal(detailResult.value);
    if (chaptersResult.status === 'fulfilled') setLocalChapters(chaptersResult.value.chapters || []);
    setOfflineChapters(offlineResult.status === 'fulfilled' ? offlineResult.value?.chapters || [] : []);
    setDetailLoading(false);
  };

  const handleUpdateMangaStatus = async (payload: { read_status?: 'reading' | 'plan_to_read' | 'dropped'; favorite?: boolean }) => {
    if (!selectedLocal) return;
    setStatusUpdating(true);
    try {
      await api.updateMangaUserList(selectedLocal.id, payload);
      setSelectedLocal(current => current ? {
        ...current,
        ...(payload.read_status !== undefined ? { read_status: payload.read_status } : {}),
        ...(payload.favorite !== undefined ? { favorite: payload.favorite ? 1 : 0 } : {})
      } : current);
      void loadManga();
    } catch (error) {
      console.error('Error al actualizar el estado de la serie:', error);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddToLibrary = async () => {
    if (!selectedOnline) return;
    setSaveLoading(true);
    setSaveMessage('');
    try {
      await api.saveMangaToLibrary({
        source: selectedProvider.id,
        externalId: selectedOnline.id,
        title: selectedOnline.title,
        titleRomaji: selectedOnline.titleRomaji,
        titleEnglish: selectedOnline.titleEnglish,
        synopsis: selectedOnline.synopsis,
        year: selectedOnline.year,
        status: selectedOnline.status,
        coverUrl: selectedOnline.coverUrl,
        sourceUrl: selectedOnline.sourceUrl,
        genres: selectedOnline.tags,
        chapters
      });
      setSaveMessage('Agregado a la biblioteca local.');
      void loadManga();
    } catch (error) {
      console.error('Error al guardar manga local:', error);
      setSaveMessage('No se pudo guardar la obra localmente.');
    } finally {
      setSaveLoading(false);
    }
  };

  /**
   * Apertura unificada: un capítulo se abre igual desde la ficha online o la
   * local. Si ya está descargado, se lee offline sin importar desde dónde se
   * entró; si no, cae a streaming online usando el proveedor de origen de la
   * propia serie (no el que esté activo en la pestaña de búsqueda).
   */
  const handleOpenAnyChapter = async (chapter: MangaOnlineChapter, seriesTitle: string, providerId: string) => {
    const offlineApi = (window as any).electronAPI?.manga;
    const offlineChapter = findOfflineChapter(chapter, offlineChapters);

    setReaderLoading(true);
    setChapterError('');
    setReaderChapter(chapter);
    setDetailOpen(false);

    if (offlineChapter && offlineApi?.readChapter) {
      setOfflineReaderKey(offlineChapter.key);
      try {
        const result = await offlineApi.readChapter({
          series: seriesTitle,
          chapter: offlineChapter.key,
          offset: 0,
          limit: 1
        });
        if (!result?.pages?.length) throw new Error('Capítulo offline vacío.');
        setReader({ chapterId: chapter.id, quality: 'data', pages: result.pages, totalPages: result.total });
      } catch (error) {
        console.error('Error al abrir capítulo offline:', error);
        setReader(null);
        setReaderChapter(null);
        setOfflineReaderKey('');
        setChapterError('No se pudo leer el capítulo descargado.');
      } finally {
        setReaderLoading(false);
      }
      return;
    }

    setOfflineReaderKey('');
    try {
      setReader(await api.getMangaOnlinePages(chapter.id, 'data-saver', providerId));
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
    setOfflineReaderKey('');
    setChapterError('');
    setSelectedLocal(null);
    setLocalChapters([]);
    setOfflineChapters([]);
  };

  const handleDownloadChapter = async (chapter: MangaOnlineChapter, seriesTitle: string, providerId: string) => {
    if (!seriesTitle || downloadingChapters.has(chapter.id)) return;
    setDownloadingChapters(prev => new Set(prev).add(chapter.id));
    try {
      const blob = await api.downloadMangaOnlineChapter(
        chapter.id,
        seriesTitle,
        String(chapter.number ?? chapter.id.slice(0, 8)),
        'data-saver',
        providerId
      );
      const fileName = `${seriesTitle} - Capitulo ${chapter.number ?? chapter.id.slice(0, 8)}.zip`;
      const desktopMangaApi = (window as any).electronAPI?.manga;
      if (desktopMangaApi?.saveArchive) {
        const result = await desktopMangaApi.saveArchive({
          series: seriesTitle,
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
      setDownloadingChapters(prev => {
        const next = new Set(prev);
        next.delete(chapter.id);
        return next;
      });
    }
  };

  const loadOfflinePage = useCallback(async (index: number) => {
    const apiOffline = (window as any).electronAPI?.manga;
    if (!apiOffline?.readChapter || !selectedLocal || !offlineReaderKey) return null;
    const result = await apiOffline.readChapter({
      series: selectedLocal.title,
      chapter: offlineReaderKey,
      offset: index,
      limit: 1
    });
    return result?.pages?.[0] || null;
  }, [offlineReaderKey, selectedLocal]);

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

      <section className="grid gap-4 md:grid-cols-2">
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
      </section>

      {mode === 'online' ? (
        <section className="space-y-4">
          <MangaGenrePanel
            genreTags={genreTags}
            topicTags={topicTags}
            selectedGenres={selectedGenres}
            selectedTags={selectedTags}
            onGenresChange={setSelectedGenres}
            onTagsChange={setSelectedTags}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            onSearch={() => void runOnlineSearch(0)}
            hasNoSourceTags={!tags.length && selectedProvider.id !== 'mangadex'}
          />

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

          {!onlineLoading && onlineResults.length > 0 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button type="button" disabled={onlinePage === 0} onClick={() => void runOnlineSearch(onlinePage - 1)} className="rounded-md border border-[var(--border-medium)] px-3 py-2 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
              <span className="text-xs font-bold text-[var(--text-dim)]">Página {onlinePage + 1}</span>
              <button type="button" disabled={!onlineHasMore} onClick={() => void runOnlineSearch(onlinePage + 1)} className="rounded-md border border-[var(--border-medium)] px-3 py-2 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40">Siguiente</button>
            </div>
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
                  <button type="button" onClick={handleAddToLibrary} disabled={saveLoading} className="mt-3 ml-3 inline-flex items-center gap-2 rounded-md bg-[var(--accent-primary)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> {saveLoading ? 'Guardando...' : 'Agregar a biblioteca'}</button>
                  {saveMessage && <p className="mt-2 text-xs font-bold text-emerald-300">{saveMessage}</p>}
                </div>
              </div>

              <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--text-main)]">Capítulos disponibles</h3>
                  {chapters.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setChapterSort(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="flex items-center gap-1 rounded-md border border-[var(--border-medium)] bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                      title={chapterSort === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold uppercase">{chapterSort === 'asc' ? 'Asc' : 'Desc'}</span>
                    </button>
                  )}
                </div>
                {chaptersLoading ? (
                  <div className="flex items-center gap-2 py-5 text-sm text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando capítulos...</div>
                ) : chapters.length === 0 ? (
                  <p className="py-5 text-sm text-[var(--text-muted)]">No hay capítulos en español o inglés para esta obra.</p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {sortedChapters.map(chapter => (
                      <ChapterListItem
                        key={`${chapter.id}-${chapter.language}`}
                        chapter={chapter}
                        offline={Boolean(findOfflineChapter(chapter, offlineChapters))}
                        onOpen={() => selectedOnline && handleOpenAnyChapter(chapter, selectedOnline.title, selectedProvider.id)}
                        onDownload={() => selectedOnline && handleDownloadChapter(chapter, selectedOnline.title, selectedProvider.id)}
                        downloadLoading={downloadingChapters.has(chapter.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Modal>
          )}

          {chapterError && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-400/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">
              <span>{chapterError}</span>
              <button
                type="button"
                onClick={() => {
                  if (!readerChapter) return;
                  const seriesTitle = selectedOnline?.title || selectedLocal?.title || '';
                  const providerId = selectedOnline ? selectedProvider.id : (selectedLocal?.source || selectedProvider.id);
                  void handleOpenAnyChapter(readerChapter, seriesTitle, providerId);
                }}
                className="inline-flex items-center gap-2 rounded-md bg-rose-900/50 px-3 py-2 text-xs font-bold"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reintentar
              </button>
            </div>
          )}

          {readerLoading && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-medium)] bg-slate-950/40 py-8 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-primary)]" />
              Preparando el capítulo...
            </div>
          )}

          {reader && readerChapter && (selectedOnline || selectedLocal) && (
            <MangaReader
              title={selectedOnline?.title || selectedLocal?.title || 'Manga'}
              chapterLabel={`Cap. ${readerChapter.number ?? 'S/N'}`}
              pages={reader.pages}
              totalPages={reader.totalPages}
              onPageRequest={selectedLocal && offlineReaderKey ? loadOfflinePage : undefined}
              downloadLoading={readerChapter ? downloadingChapters.has(readerChapter.id) : false}
              onClose={() => { setReader(null); setReaderChapter(null); setOfflineReaderKey(''); }}
              onDownload={() => {
                if (!readerChapter) return;
                const seriesTitle = selectedOnline?.title || selectedLocal?.title || '';
                const providerId = selectedOnline ? selectedProvider.id : (selectedLocal?.source || selectedProvider.id);
                if (seriesTitle) void handleDownloadChapter(readerChapter, seriesTitle, providerId);
              }}
            />
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Filtrar biblioteca local" className="flex flex-wrap gap-1.5">
              {([
                { id: 'all', label: 'Todos' },
                { id: 'reading', label: 'Viendo' },
                { id: 'plan_to_read', label: 'Pendiente' },
                { id: 'dropped', label: 'Abandonado' },
                { id: 'favorite', label: 'Favorito' }
              ] as const).map(tab => {
                const isActive = libraryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setLibraryFilter(tab.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                        : 'border-[var(--border-soft)] bg-slate-900/60 text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleOpenMangaLibraryFolder()}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border-medium)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                <Database className="h-3.5 w-3.5" /> Ver carpeta de descargas
              </button>
              {libraryFolderMessage && <span className="text-[11px] text-emerald-300">{libraryFolderMessage}</span>}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-72 items-center justify-center text-sm text-[var(--text-muted)]">
              Cargando biblioteca de manga...
            </div>
          ) : manga.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-medium)] bg-slate-950/40 p-8 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-[var(--text-dim)]" />
              <h2 className="mt-4 text-lg font-bold text-[var(--text-main)]">
                {libraryFilter === 'all' ? 'La sección de manga está lista, pero vacía' : 'Nada con este filtro todavía'}
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
                {libraryFilter === 'all'
                  ? 'Busca una obra en MangaDex, ZonaTMO o ShadeManga para consultar su ficha y capítulos sin llenar automáticamente tu biblioteca local.'
                  : 'Cambia el estado de alguna serie guardada o prueba con otra pestaña.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {manga.map(item => (
                <button key={item.id} type="button" onClick={() => void handleSelectLocal(item)} className="group overflow-hidden rounded-lg border border-[var(--border-medium)] bg-slate-900/55 text-left transition-transform hover:-translate-y-0.5 hover:border-[var(--accent-primary)]">
                  <div className="aspect-[3/4] bg-slate-950">{item.cover_image ? <img src={item.cover_image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center"><BookOpen className="h-10 w-10 text-[var(--text-dim)]" /></div>}</div>
                  <div className="p-4">
                    <h2 className="line-clamp-2 text-sm font-bold text-[var(--text-main)]">{item.title}</h2>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{[item.format, item.year, item.chapters ? `${item.chapters} capítulos` : null].filter(Boolean).join(' · ') || 'Dato no disponible'}</p>
                    {Boolean(item.favorite) && <span className="mt-2 inline-block status-badge bg-amber-500/15 text-amber-300">Favorito</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {selectedLocal && (
        <Modal isOpen={detailOpen && mode === 'local'} onClose={clearDetail} title={`Ficha de ${selectedLocal.title}`} size="xl">
          <div className="flex flex-col gap-4 md:flex-row">
            {selectedLocal.cover_image && <img src={selectedLocal.cover_image} alt="" referrerPolicy="no-referrer" className="h-40 w-28 rounded-md object-cover" />}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-black text-[var(--text-main)]">{selectedLocal.title}</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Biblioteca local · {selectedLocal.year || 'Año no disponible'}</p>
              {detailLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando información...</div>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{selectedLocal.synopsis || 'Sinopsis no disponible.'}</p>
                  {selectedLocal.translation?.translated && <p className="mt-2 text-[11px] font-bold text-emerald-300">Sinopsis traducida al español por LibreTranslate.</p>}

                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {([
                      { id: 'reading', label: 'Viendo' },
                      { id: 'plan_to_read', label: 'Pendiente' },
                      { id: 'dropped', label: 'Abandonado' }
                    ] as const).map(status => {
                      const isActive = selectedLocal.read_status === status.id;
                      return (
                        <button
                          key={status.id}
                          type="button"
                          disabled={statusUpdating}
                          onClick={() => void handleUpdateMangaStatus({ read_status: status.id })}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                            isActive
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                              : 'border-[var(--border-soft)] bg-slate-900/60 text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]'
                          }`}
                        >
                          {status.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={statusUpdating}
                      onClick={() => void handleUpdateMangaStatus({ favorite: !selectedLocal.favorite })}
                      aria-pressed={Boolean(selectedLocal.favorite)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                        selectedLocal.favorite
                          ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                          : 'border-[var(--border-soft)] bg-slate-900/60 text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      {selectedLocal.favorite ? '★ Favorito' : '☆ Favorito'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenMangaLibraryFolder()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-slate-900/60 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]"
                      title="Abre la carpeta donde se guardan los capítulos descargados"
                    >
                      <Database className="h-3 w-3" /> Ver carpeta
                    </button>
                  </div>
                  {libraryFolderMessage && <p className="mt-1.5 text-[11px] text-emerald-300">{libraryFolderMessage}</p>}
                </>
              )}
            </div>
          </div>
          <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-main)]">Capítulos de la biblioteca</h3>
              {localChapters.length > 1 && (
                <button
                  type="button"
                  onClick={() => setChapterSort(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1 rounded-md border border-[var(--border-medium)] bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  title={chapterSort === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase">{chapterSort === 'asc' ? 'Asc' : 'Desc'}</span>
                </button>
              )}
            </div>
            {localChapters.length === 0 ? (
              <p className="py-5 text-sm text-[var(--text-muted)]">Esta obra todavía no tiene capítulos sincronizados.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sortedLocalChapters.map(chapter => {
                  const offline = Boolean(findOfflineChapter(chapter, offlineChapters));
                  return (
                    <ChapterListItem
                      key={`${chapter.id}-${chapter.language}`}
                      chapter={chapter}
                      offline={offline}
                      showOnlineFallbackHint
                      onOpen={() => selectedLocal && handleOpenAnyChapter(chapter, selectedLocal.title, selectedLocal.source || selectedProvider.id)}
                      onDownload={() => selectedLocal && handleDownloadChapter(chapter, selectedLocal.title, selectedLocal.source || selectedProvider.id)}
                      downloadLoading={downloadingChapters.has(chapter.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {mode === 'local' && reader && readerChapter && selectedLocal && (
        <MangaReader
          title={selectedLocal.title}
          chapterLabel={`Cap. ${readerChapter.number ?? 'S/N'}`}
          pages={reader.pages}
          totalPages={reader.totalPages}
          onPageRequest={offlineReaderKey ? loadOfflinePage : undefined}
          downloadLoading={downloadingChapters.has(readerChapter.id)}
          onClose={() => { setReader(null); setReaderChapter(null); setOfflineReaderKey(''); }}
          onDownload={() => readerChapter && selectedLocal && handleDownloadChapter(readerChapter, selectedLocal.title, selectedLocal.source || selectedProvider.id)}
        />
      )}

    </div>
  );
};

export default Manga;
