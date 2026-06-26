import type { NormalizedAnime } from '../scraping/scraper';
import { getErrorMessage } from './routeUtils';

export const SCRAPING_SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;

export interface ScrapingLogger {
  log(message: string): void;
  error(message: string, detail?: unknown): void;
}

export interface ScrapingSyncDependencies {
  syncSeason(year: number, season: string): Promise<NormalizedAnime[]>;
  saveAnimeToLocal(anime: NormalizedAnime): Promise<number>;
  writeScrapingLog(source: string, action: string, status: string, message: string): Promise<void>;
  invalidateLibraryReadCaches(): void;
  logger?: ScrapingLogger;
}

export async function syncSeasonAndPersist({
  year,
  season,
  syncSeason,
  saveAnimeToLocal
}: {
  year: number;
  season: string;
  syncSeason: ScrapingSyncDependencies['syncSeason'];
  saveAnimeToLocal: ScrapingSyncDependencies['saveAnimeToLocal'];
}): Promise<number> {
  const list = await syncSeason(year, season);
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
  logger = console
}: ScrapingSyncDependencies & {
  startYear: number;
  currentYear: number;
}): Promise<number> {
  await writeScrapingLog(
    'Massive Scraping',
    `Sincronización masiva desde ${startYear}`,
    'started',
    `Iniciando importación desde el año ${startYear} hasta ${currentYear}`
  );

  let totalImported = 0;

  for (let year = startYear; year <= currentYear; year++) {
    for (const season of SCRAPING_SEASONS) {
      try {
        logger.log(`[Massive Scraping] Sincronizando ${year} ${season}...`);
        const saved = await syncSeasonAndPersist({
          year,
          season,
          syncSeason,
          saveAnimeToLocal
        });
        if (saved > 0) invalidateLibraryReadCaches();
        totalImported += saved;
        await writeScrapingLog(
          'Massive Scraping',
          `Sincronización masiva: ${year} ${season}`,
          'success',
          `Sincronizados ${saved} animes.`
        );
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        logger.error(`Error en scraping masivo para ${year} ${season}:`, message);
        await writeScrapingLog(
          'Massive Scraping',
          `Sincronización masiva: ${year} ${season}`,
          'error',
          `Fallo: ${message}`
        );
      }
    }
  }

  invalidateLibraryReadCaches();
  await writeScrapingLog(
    'Massive Scraping',
    'Sincronización masiva terminada',
    'success',
    `Sincronización masiva completada. Total de animes importados/actualizados: ${totalImported}`
  );

  return totalImported;
}
