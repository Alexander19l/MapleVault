import React, {
  Component,
  type ErrorInfo,
  type ReactNode,
  useMemo,
  useRef,
  useState
} from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Eye, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAssistantRuntime } from '@assistant-ui/react';
import { api } from '../../services/api';
import type { ChatActionType } from '../../types';
import { notifications } from '../../utils/notify';

type ImportState = 'idle' | 'loading' | 'success' | 'error';

const parseArgs = (args: any, argsText?: string) => {
  if (args && typeof args === 'object') return args;
  if (!argsText) return {};

  try {
    return JSON.parse(argsText);
  } catch {
    return {};
  }
};

const getAnimeKey = (anime: any, fallback: number | string = 'anime') => (
  [
    anime?.result_origin || (anime?.id ? 'local' : 'online'),
    anime?.source || 'source',
    anime?.external_id ?? anime?.id ?? anime?.title ?? 'anime',
    fallback
  ].map(value => String(value)).join(':')
);

const getGenres = (anime: any) => (
  Array.isArray(anime?.genres_es)
    ? anime.genres_es.filter(Boolean).slice(0, 3)
    : Array.isArray(anime?.genres)
      ? anime.genres.filter(Boolean).slice(0, 3)
      : []
);

const formatSource = (anime: any) => {
  if (anime?.result_origin === 'local') return 'Biblioteca';
  if (anime?.result_origin === 'online') return anime?.source ? String(anime.source) : 'Online';
  if (anime?.source) return String(anime.source);
  return anime?.id ? 'Biblioteca' : 'Online';
};

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

const openAnimeDetail = (anime: any) => {
  window.dispatchEvent(new CustomEvent('openAnimeDetail', {
    detail: {
      id: anime.id || anime.external_id,
      isExternal: !anime.id,
      data: anime
    }
  }));
};

const importFromVisualCard = async (anime: any) => {
  const imported = await api.importAnime(anime);
  await api.addToUserList({
    anime_id: imported.id,
    watch_status: 'plan_to_watch',
    favorite: 0,
    user_score: 0,
    episodes_watched: 0,
    notes: ''
  });
  return imported;
};

const actionLabels: Record<string, string> = {
  add_anime: 'Agregar serie',
  delete_anime: 'Eliminar serie',
  update_status: 'Actualizar estado',
  update_score: 'Actualizar calificación',
  remove_from_list: 'Quitar de la lista',
  clear_user_list: 'Limpiar lista personal',
  mark_watched: 'Marcar episodio',
  mark_all_watched: 'Marcar todo visto',
  sync_all: 'Sincronizar catálogo'
};

const getActionResponseText = (result: unknown): string => {
  const normalize = (value: string) => value.replace(/\*\*/g, '').trim();

  if (typeof result === 'string' && result.trim()) return normalize(result);
  if (!result || typeof result !== 'object') return 'Acción confirmada.';

  const response = result as Record<string, unknown>;
  if (typeof response.text === 'string' && response.text.trim()) return normalize(response.text);
  if (typeof response.message === 'string' && response.message.trim()) return normalize(response.message);
  return 'Acción confirmada.';
};

const MapleActionCard: React.FC<{ args: any }> = ({ args }) => {
  const [status, setStatus] = useState<ImportState>('idle');
  const [message, setMessage] = useState('');
  const inFlightRef = useRef(false);

  const handleConfirm = async () => {
    if (inFlightRef.current || status === 'loading' || status === 'success') return;

    try {
      inFlightRef.current = true;
      setStatus('loading');
      const result = await api.executeChatAction(
        args.type as ChatActionType,
        args.data || {},
        args.confirmToken
      );
      const responseText = getActionResponseText(result);
      setMessage(responseText);
      setStatus('success');
      notifications.success('La acción se completó correctamente.');
      window.dispatchEvent(new CustomEvent('maplevault:data-changed', {
        detail: {
          source: 'chatbot',
          actionType: args.type
        }
      }));
    } catch (err) {
      console.error(err);
      setMessage('No se pudo ejecutar la acción. Inténtalo nuevamente.');
      setStatus('error');
    } finally {
      inFlightRef.current = false;
    }
  };

  const title = args?.data?.title || args?.data?.animeTitle || args?.data?.refIndexOrTitle || 'Elemento seleccionado';
  const label = actionLabels[args?.type] || 'Acción protegida';

  return (
    <div className="mt-2 w-full min-w-0 max-w-full space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/70 p-3 shadow-lg animate-fadeIn">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
            {label}
          </p>
          <p className="mt-1 text-[10.5px] text-slate-400">
            {args.confirmMessage || 'Confirmación requerida para modificar tu biblioteca.'}
          </p>
        </div>
        <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] font-bold uppercase text-amber-300">
          Token
        </span>
      </div>

      {args?.data && (
        <div className="flex space-x-2.5 rounded-lg border border-slate-900/60 bg-slate-950/40 p-2">
          {args.data.cover_image && (
            <img
              src={args.data.cover_image}
              alt={title}
              className="h-14 w-10 rounded object-cover shadow-md shrink-0 select-none"
              loading="lazy"
            />
          )}
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-[11px] font-bold text-white">
              {title}
            </h4>
            <p className="mt-0.5 truncate text-[9px] text-[var(--text-dim)]">
              {args.data.studio || args.data.status || 'Dato no disponible'}
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={status === 'loading' || status === 'success'}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-[10.5px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-default disabled:bg-slate-700 disabled:text-slate-300"
      >
        {status === 'loading' && <RefreshCw className="h-3 w-3 animate-spin" />}
        {status === 'success' && <Check className="h-3 w-3" />}
        <span>{status === 'loading' ? 'Confirmando...' : status === 'success' ? 'Confirmado' : 'Confirmar acción'}</span>
      </button>

      {message && (
        <p className={`text-[10px] ${status === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>
          {message}
        </p>
      )}
    </div>
  );
};

interface VisualAnimeCardProps {
  anime: any;
  index?: number;
  mode: 'single' | 'list';
  importState?: ImportState;
  onImport: (anime: any, key: string) => void;
}

const VisualAnimeCard: React.FC<VisualAnimeCardProps> = ({ anime, index = 0, mode, importState = 'idle', onImport }) => {
  const animeKey = getAnimeKey(anime, index);
  const genres = getGenres(anime);
  const isLocal = Boolean(anime?.id);
  const isWide = mode === 'single';
  const importing = importState === 'loading';
  const imported = importState === 'success' || isLocal;

  return (
    <div className={`${isWide ? 'w-full max-w-xl @lg:grid @lg:grid-cols-[11rem_minmax(0,1fr)]' : 'grid w-full min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] @sm:block'} overflow-hidden rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] shadow-lg maple-list-enter`}>
      {anime.cover_image ? (
        <div className={`relative w-full overflow-hidden bg-slate-950 ${isWide ? 'aspect-[3/4] @lg:h-full @lg:min-h-64 @lg:aspect-auto' : 'h-full min-h-40 @sm:h-auto @sm:min-h-0 @sm:aspect-[3/4]'}`}>
          <img src={anime.cover_image} alt={anime.title} className="h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
          <span className="absolute left-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white backdrop-blur">
            {formatSource(anime)}
          </span>
        </div>
      ) : (
        <div className={`flex w-full items-center justify-center bg-slate-950 text-[10px] font-bold uppercase tracking-wider text-slate-600 ${isWide ? 'aspect-[3/4] @lg:h-full @lg:min-h-64 @lg:aspect-auto' : 'h-full min-h-40 @sm:h-auto @sm:min-h-0 @sm:aspect-[3/4]'}`}>
          Sin portada
        </div>
      )}

      <div className="space-y-2 p-2.5">
        <div>
          <h4 className="line-clamp-2 text-[11px] font-bold leading-tight text-white" title={anime.title}>
            {anime.title || 'Título no disponible'}
          </h4>
          <p className="mt-0.5 truncate text-[9px] font-semibold text-[var(--text-dim)]">
            {anime.studio || 'Estudio no disponible'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <span className="rounded-md bg-slate-950/70 px-1.5 py-1 text-[9px] font-semibold text-slate-400">
            {anime.year || 'Año N/D'}
          </span>
          <span className="rounded-md bg-slate-950/70 px-1.5 py-1 text-[9px] font-semibold text-slate-400">
            {anime.type ? String(anime.type).toUpperCase() : 'Tipo N/D'}
          </span>
          <span className="rounded-md bg-slate-950/70 px-1.5 py-1 text-[9px] font-semibold text-slate-400">
            {formatEpisodes(anime.episodes)}
          </span>
          <span className="rounded-md bg-emerald-500/10 px-1.5 py-1 text-[9px] font-bold text-emerald-300">
            {formatScore(anime.score)}
          </span>
        </div>

        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {genres.map((genre: string, genreIndex: number) => (
              <span key={`${animeKey}:genre:${genreIndex}:${genre}`} className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[8.5px] font-semibold text-slate-400">
                {genre}
              </span>
            ))}
          </div>
        )}

        {isWide && (
          <p className="line-clamp-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {anime.synopsis || 'Sinopsis no disponible.'}
          </p>
        )}

        <div className="flex gap-1.5">
          {!isLocal && (
            <button
              onClick={() => onImport(anime, animeKey)}
              disabled={importing || imported}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-emerald-600/20 py-1.5 text-[9px] font-bold text-emerald-300 transition-colors hover:bg-emerald-600/40 disabled:cursor-default disabled:bg-slate-800 disabled:text-slate-500"
              title="Añadir a biblioteca"
            >
              {importing ? <RefreshCw className="h-3 w-3 animate-spin" /> : imported ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              <span>{importing ? 'Añadiendo' : imported ? 'Añadido' : 'Añadir'}</span>
            </button>
          )}
          <button
            onClick={() => openAnimeDetail(anime)}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-slate-700/50 py-1.5 text-[9px] font-bold text-white transition-colors hover:bg-slate-600"
            title="Ver información"
          >
            <Eye className="h-3 w-3" />
            <span>Info</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const MapleVisualCard: React.FC<{ args: any }> = ({ args }) => {
  const [imports, setImports] = useState<Record<string, ImportState>>({});
  const [selectedHelpCategory, setSelectedHelpCategory] = useState<string | null>(null);
  const runtime = useAssistantRuntime();

  const submitPrompt = (prompt?: string) => {
    const value = String(prompt || '').trim();
    if (!value || runtime.thread.getState().isRunning) return;
    runtime.thread.append(value);
  };

  const handleImport = async (anime: any, key: string) => {
    if (imports[key] === 'loading' || imports[key] === 'success') return;

    try {
      setImports(prev => ({ ...prev, [key]: 'loading' }));
      await importFromVisualCard(anime);
      setImports(prev => ({ ...prev, [key]: 'success' }));
      notifications.success(`"${anime.title}" se añadió a tu biblioteca.`);
    } catch (err) {
      console.error(err);
      setImports(prev => ({ ...prev, [key]: 'error' }));
      notifications.error('No se pudo añadir la serie desde Maple Assistant.');
    }
  };

  if (args?.type === 'anime_card' && args?.data) {
    const key = getAnimeKey(args.data);
    return (
      <div className="mt-2 w-full min-w-0">
        <VisualAnimeCard
          anime={args.data}
          mode="single"
          importState={imports[key] || 'idle'}
          onImport={handleImport}
        />
      </div>
    );
  }

  if (args?.type === 'anime_list' && Array.isArray(args.data)) {
    return (
      <div
        data-testid="chat-anime-grid"
        className="mt-3 grid w-full min-w-0 grid-cols-1 gap-2.5 @sm:grid-cols-2 @2xl:grid-cols-3"
      >
        {args.data.map((anime: any, index: number) => {
          const key = getAnimeKey(anime, index);
          return (
            <VisualAnimeCard
              key={key}
              anime={anime}
              index={index}
              mode="list"
              importState={imports[key] || 'idle'}
              onImport={handleImport}
            />
          );
        })}
      </div>
    );
  }

  if (args?.type === 'anime_page' && Array.isArray(args.data?.items)) {
    const pageData = args.data;
    return (
      <div className="mt-3 min-w-0 space-y-2.5">
        <div
          data-testid="chat-anime-grid"
          className="grid w-full min-w-0 grid-cols-1 gap-2.5 @sm:grid-cols-2 @2xl:grid-cols-3"
        >
          {pageData.items.map((anime: any, index: number) => {
            const key = getAnimeKey(anime, index);
            return (
              <VisualAnimeCard
                key={key}
                anime={anime}
                index={index}
                mode="list"
                importState={imports[key] || 'idle'}
                onImport={handleImport}
              />
            );
          })}
        </div>
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-light)] bg-slate-950/35 px-2.5 py-2">
          <span className="min-w-0 text-[9px] font-semibold text-[var(--text-dim)]">
            Página {pageData.page || 1} de {pageData.totalPages || 1} · {pageData.total || 0} series
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => submitPrompt(pageData.previousPrompt || 'página anterior')}
              disabled={!pageData.hasPrevious}
              className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border-light)] bg-slate-900/70 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)]/50 hover:text-white disabled:cursor-default disabled:opacity-35"
              title="Página anterior"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <select
              value={pageData.page || 1}
              onChange={(event) => submitPrompt(`${pageData.pagePromptPrefix || 'ir a la página'} ${event.target.value}`)}
              disabled={(pageData.totalPages || 1) <= 1}
              className="h-7 min-w-14 rounded-md border border-[var(--border-light)] bg-slate-900 px-2 text-[9px] font-bold text-white outline-none transition-colors focus:border-[var(--accent-primary)] disabled:opacity-50"
              title="Ir a una página"
              aria-label="Ir a una página"
            >
              {Array.from({ length: Math.max(1, Number(pageData.totalPages) || 1) }, (_, index) => index + 1).map(page => (
                <option key={page} value={page}>Pág. {page}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => submitPrompt(pageData.nextPrompt || 'ver más series')}
              disabled={!pageData.hasMore}
              className="grid h-7 w-7 place-items-center rounded-md border border-[var(--accent-primary)]/25 bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-primary)]/25 disabled:cursor-default disabled:border-[var(--border-light)] disabled:bg-slate-900/70 disabled:text-[var(--text-dim)] disabled:opacity-35"
              title="Página siguiente"
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (args?.type === 'assistant_help' && args.data) {
    const categories = Array.isArray(args.data.categories) ? args.data.categories : [];
    const intents = Array.isArray(args.data.intents) ? args.data.intents : [];
    const prompts = Array.isArray(args.data.featuredPrompts) ? args.data.featuredPrompts : [];
    const activeCategory = categories.find((category: any) => category.id === selectedHelpCategory);
    const activeIntents = activeCategory
      ? intents.filter((intent: any) => intent.category === activeCategory.id)
      : [];

    return (
      <div className="mt-3 w-full min-w-0 max-w-full space-y-3 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] p-3 shadow-lg">
        <div>
          <p className="text-[10px] font-bold text-white">Comandos de Maple Assistant</p>
          <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--text-dim)]">
            Selecciona una categoría para ver todos sus comandos y ejemplos.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
          {categories.map((category: any) => {
            const count = intents.filter((intent: any) => intent.category === category.id).length;
            const isActive = category.id === selectedHelpCategory;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedHelpCategory(current => current === category.id ? null : category.id)}
                aria-expanded={isActive}
                aria-controls={`maple-help-category-${category.id}`}
                className={`min-w-0 rounded-lg border p-2.5 text-left transition-colors ${
                  isActive
                    ? 'border-[var(--accent-primary)]/55 bg-[var(--accent-primary)]/10'
                    : 'border-[var(--border-light)] bg-slate-950/35 hover:border-[var(--accent-primary)]/35 hover:bg-slate-950/55'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-white">{category.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="rounded bg-[var(--accent-primary)]/10 px-1.5 py-0.5 text-[8px] font-bold text-[var(--accent-primary)]">
                      {count}
                    </span>
                    <ChevronRight className={`h-3 w-3 text-[var(--accent-primary)] transition-transform ${isActive ? 'rotate-90' : ''}`} />
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-[var(--text-dim)]">
                  {category.description}
                </p>
              </button>
            );
          })}
        </div>

        {activeCategory && (
          <div
            id={`maple-help-category-${activeCategory.id}`}
            className="space-y-2 rounded-xl border border-[var(--accent-primary)]/25 bg-slate-950/35 p-2.5 animate-fadeIn"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-white">{activeCategory.label}</p>
                <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--text-dim)]">
                  {activeCategory.description}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-[var(--accent-primary)]/10 px-2 py-1 text-[8px] font-bold text-[var(--accent-primary)]">
                {activeIntents.length} comandos
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1.5 @lg:grid-cols-2">
              {activeIntents.map((intent: any) => (
                <button
                  key={intent.id || intent.internalIntent}
                  type="button"
                  onClick={() => submitPrompt(intent.example)}
                  className="group min-w-0 rounded-lg border border-[var(--border-light)] bg-slate-900/55 p-2.5 text-left transition-colors hover:border-[var(--accent-primary)]/45 hover:bg-slate-900"
                  title={`Ejecutar: ${intent.example}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[9.5px] font-bold leading-snug text-white">
                      {intent.description}
                    </span>
                    <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-[var(--accent-primary)] transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1.5 rounded-md bg-black/20 px-2 py-1.5 text-[8.5px] font-semibold leading-snug text-slate-300">
                    “{intent.example}”
                  </p>
                  {intent.requiresConfirmation && (
                    <span className="mt-1.5 inline-flex rounded bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-bold text-amber-300">
                      Requiere confirmación
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
            <BookOpen className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            Consultas rápidas
          </div>
          <div className="grid grid-cols-1 gap-1.5 @md:grid-cols-2">
            {prompts.map((item: any) => (
              <button
                key={item.id || item.prompt}
                type="button"
                onClick={() => submitPrompt(item.prompt)}
                className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-[var(--border-light)] bg-slate-950/25 px-2.5 py-2 text-left text-[9px] font-semibold leading-snug text-slate-300 transition-colors hover:border-[var(--accent-primary)]/35 hover:text-white"
              >
                <span>{item.prompt}</span>
                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--accent-primary)]" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/8 px-2.5 py-2 text-[9px] font-semibold text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {args.data.protectedActionNotice}
        </div>
      </div>
    );
  }

  if (args?.type === 'stats' && Array.isArray(args.data)) {
    return (
      <div className="mt-3 grid w-full min-w-0 grid-cols-1 gap-2 @xs:grid-cols-2">
        {args.data.map((stat: any, index: number) => (
          <div key={index} className="flex flex-col justify-center rounded-xl border border-slate-700/50 bg-slate-800/80 p-2.5 text-center shadow-inner">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
            <p className="mt-0.5 text-xl font-black text-white">{stat.value}</p>
            {stat.percent !== undefined && (
              <p className="text-[9px] font-bold text-[var(--accent-primary)]">{stat.percent}% del total</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  return null;
};

interface MapleToolErrorBoundaryProps {
  children: ReactNode;
}

interface MapleToolErrorBoundaryState {
  hasError: boolean;
}

class MapleToolErrorBoundary extends Component<MapleToolErrorBoundaryProps, MapleToolErrorBoundaryState> {
  state: MapleToolErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapleToolErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Maple Assistant] Error al renderizar una tarjeta:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-200"
        >
          No se pudo mostrar esta tarjeta. El resto de MapleVault continúa disponible.
        </div>
      );
    }

    return this.props.children;
  }
}

export interface MapleToolCallProps {
  toolName?: string;
  args?: any;
  argsText?: string;
}

export const MapleToolCall: React.FC<MapleToolCallProps> = ({ toolName, args, argsText }) => {
  const parsedArgs = useMemo(() => parseArgs(args, argsText), [args, argsText]);

  if (toolName === 'maple_action') {
    return (
      <MapleToolErrorBoundary>
        <MapleActionCard args={parsedArgs} />
      </MapleToolErrorBoundary>
    );
  }

  if (toolName === 'maple_visual') {
    return (
      <MapleToolErrorBoundary>
        <MapleVisualCard args={parsedArgs} />
      </MapleToolErrorBoundary>
    );
  }

  return null;
};
