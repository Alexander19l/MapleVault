import type { NormalizedAnime, SeasonSyncOptions } from '../scraping/scraper';
import { getErrorMessage } from './routeUtils';

export const SCRAPING_SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;
export const MASSIVE_SYNC_MIN_DELAY_MS = 1500;
export const MASSIVE_SYNC_MAX_SEASON_RETRIES = 2;

export type ScrapingProgressEvent =
  | { type: 'season_started'; year: number; season: string }
  | { type: 'retrying'; year: number; season: string; attempt: number; delayMs: number; message: string }
  | { type: 'season_completed'; year: number; season: string; imported: number }
  | { type: 'season_failed'; year: number; season: string; message: string };

export interface ScrapingLogger {
  log(message: string): void;
  error(message: string, detail?: unknown): void;
}

export interface ScrapingSyncDependencies {
  syncSeason(year: number, season: string, options?: SeasonSyncOptions): Promise<NormalizedAnime[]>;
  saveAnimeToLocal(anime: NormalizedAnime): Promise<number>;
  writeScrapingLog(source: string, action: string, status: string, message: string): Promise<void>;
  invalidateLibraryReadCaches(): void;
  logger?: ScrapingLogger;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableSyncError(error: any): boolean {
  const status = Number(error?.response?.status || error?.status);
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return status === 429
    || Boolean(status && status >= 500)
    || ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)
    || message.includes('too many request')
    || message.includes('rate limit')
    || message.includes('timeout');
}

export async function syncSeasonAndPersist({
  year,
  season,
  syncSeason,
  saveAnimeToLocal,
  syncOptions
}: {
  year: number;
  season: string;
  syncSeason: ScrapingSyncDependencies['syncSeason'];
  saveAnimeToLocal: ScrapingSyncDependencies['saveAnimeToLocal'];
  syncOptions?: SeasonSyncOptions;
}): Promise<number> {
  const list = syncOptions
    ? await syncSeason(year, season, syncOptions)
    : await syncSeason(year, season);
  let savedCount = 0;

  for (const anime of list) {
    await saveAnimeToLocal(anime);
    savedCount++;
  }

  return savedCount;
}

export async function runMassiveYearSync({
  startYear,
  currentYear,
  syncSeason,
  saveAnimeToLocal,
  writeScrapingLog,
  invalidateLibraryReadCaches,
  logger = console,
  requestDelayMs = MASSIVE_SYNC_MIN_DELAY_MS,
  maxSeasonRetries = MASSIVE_SYNC_MAX_SEASON_RETRIES,
  sleep = defaultSleep,
  onProgress
}: ScrapingSyncDependencies & {
  startYear: number;
  currentYear: number;
  requestDelayMs?: number;
  maxSeasonRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (event: ScrapingProgressEvent) => void | Promise<void>;
}): Promise<number> {
  const safeRequestDelayMs = Math.max(
    MASSIVE_SYNC_MIN_DELAY_MS,
    Math.min(60000, Math.floor(Number(requestDelayMs) || MASSIVE_SYNC_MIN_DELAY_MS))
  );
  const safeMaxSeasonRetries = Math.min(
    5,
    Math.max(0, Math.floor(Number(maxSeasonRetries) || 0))
  );
  await writeScrapingLog(
    'Massive Scraping',
    `Sincronización masiva desde ${startYear}`,
    'started',
    `Iniciando importación desde el año ${startYear} hasta ${currentYear}`
  );

  let totalImported = 0;
  const totalSeasons = (currentYear - startYear + 1) * SCRAPING_SEASONS.length;
  let processedSeasons = 0;
  let failedSeasons = 0;

  for (let year = startYear; year <= currentYear; year++) {
    for (const season of SCRAPING_SEASONS) {
      await onProgress?.({ type: 'season_started', year, season });
      let savedForSeason: number | null = null;
      let seasonFailed = false;

      for (let attempt = 0; attempt <= safeMaxSeasonRetries; attempt++) {
        try {
          logger.log(`[Massive Scraping] Sincronizando ${year} ${season}...`);
          savedForSeason = await syncSeasonAndPersist({
            year,
            season,
            syncSeason,
            saveAnimeToLocal,
            syncOptions: {
              requestDelayMs: safeRequestDelayMs,
              maxRetries: 3,
              sleep,
              onRetry: async retry => {
                await onProgress?.({
                  type: 'retrying',
                  year,
                  season,
                  attempt: retry.attempt,
                  delayMs: retry.delayMs,
                  message: retry.message
                });
              }
            }
          });
          break;
        } catch (error: unknown) {
          const message = getErrorMessage(error);
          const canRetry = isRetryableSyncError(error) && attempt < safeMaxSeasonRetries;
          if (canRetry) {
            const retryDelayMs = Math.min(
              60000,
              Math.max(6000, safeRequestDelayMs * 4) * (2 ** attempt)
            );
            logger.log(`[Massive Scraping] Reintentando ${year} ${season} en ${retryDelayMs} ms...`);
            await writeScrapingLog(
              'Massive Scraping',
              `Reintento: ${year} ${season}`,
              'started',
              `AniList limitó o interrumpió la solicitud. Reintento ${attempt + 1}/${safeMaxSeasonRetries} en ${Math.ceil(retryDelayMs / 1000)} segundos.`
            );
            await onProgress?.({
              type: 'retrying',
              year,
              season,
              attempt: attempt + 1,
              delayMs: retryDelayMs,
              message
            });
            await sleep(retryDelayMs);
            continue;
          }

          processedSeasons += 1;
          failedSeasons += 1;
          logger.error(`Error en scraping masivo para ${year} ${season}:`, message);
          await writeScrapingLog(
            'Massive Scraping',
            `Sincronización masiva: ${year} ${season}`,
            'error',
            `Fallo definitivo: ${message}. Progreso: ${processedSeasons}/${totalSeasons} temporadas.`
          );
          await onProgress?.({ type: 'season_failed', year, season, message });
          seasonFailed = true;
          break;
        }
      }

      if (!seasonFailed && savedForSeason !== null) {
        if (savedForSeason > 0) invalidateLibraryReadCaches();
        totalImported += savedForSeason;
        processedSeasons += 1;
        await writeScrapingLog(
          'Massive Scraping',
          `Sincronización masiva: ${year} ${season}`,
          'success',
          `Sincronizados ${savedForSeason} animes. Progreso: ${processedSeasons}/${totalSeasons} temporadas.`
        );
        await onProgress?.({
          type: 'season_completed',
          year,
          season,
          imported: savedForSeason
        });
      }

      if (processedSeasons < totalSeasons) {
        await sleep(safeRequestDelayMs);
      }
    }
  }

  invalidateLibraryReadCaches();
  await writeScrapingLog(
    'Massive Scraping',
    'Sincronización masiva terminada',
    failedSeasons > 0 ? 'error' : 'success',
    failedSeasons > 0
      ? `Sincronización terminada con ${failedSeasons} temporadas pendientes. Total de animes importados/actualizados: ${totalImported}`
      : `Sincronización masiva completada. Total de animes importados/actualizados: ${totalImported}`
  );

  return totalImported;
}
