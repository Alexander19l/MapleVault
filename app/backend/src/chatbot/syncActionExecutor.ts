import { query } from '../database/db';
import { searchAniList, saveNormalizedAnimeToLocal as persistNormalizedAnimeToLocal } from '../scraping/scraper';
import { sanitizeExternalAnime } from '../security/sanitize';
import { logBotAction } from './actionAudit';
import type { ActionComplete } from './actionExecutionTypes';

export async function executeSyncAllAction(actionData: Record<string, unknown>, complete: ActionComplete): Promise<string> {
  const rows = await query.all('SELECT id, title FROM anime ORDER BY updated_at ASC LIMIT 100');
  setTimeout(async () => {
    let updated = 0;
    for (const row of rows) {
      try {
        const results = await searchAniList(row.title);
        if (results?.[0]) {
          await persistNormalizedAnimeToLocal(sanitizeExternalAnime(results[0]) as any);
          updated++;
        }
      } catch (err: any) {
        await logBotAction('sync_all:item', { title: row.title }, `ERROR: ${err.message}`);
      }
    }
    await logBotAction('sync_all:background', { requested: rows.length, updated }, 'SUCCESS');
  }, 0);

  await logBotAction('sync_all', {}, 'SUCCESS');
  return complete('SUCCESS', 'La sincronización de metadatos comenzó en segundo plano. Revisaré hasta 100 animes locales usando AniList.', actionData);
}
