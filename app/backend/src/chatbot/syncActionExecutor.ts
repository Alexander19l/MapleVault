import { query } from '../database/db';
import { searchAniList, saveNormalizedAnimeToLocal as persistNormalizedAnimeToLocal } from '../scraping/scraper';
import { sanitizeExternalAnime } from '../security/sanitize';
import { logBotAction } from './actionAudit';
import type { ActionComplete } from './actionExecutionTypes';
import { syncJobManager } from './syncJobManager';

export async function executeSyncAllAction(actionData: Record<string, unknown>, complete: ActionComplete): Promise<string> {
  const rows = await query.all('SELECT id, title FROM anime ORDER BY updated_at ASC LIMIT 100');
  const launch = syncJobManager.start(rows.length, async control => {
    for (const row of rows) {
      if (control.isCancellationRequested()) break;
      control.beginItem(row.title);
      try {
        const results = await searchAniList(row.title);
        if (results?.[0]) {
          await persistNormalizedAnimeToLocal(sanitizeExternalAnime(results[0]) as any);
          control.recordItem(row.title, 'updated');
        } else {
          control.recordItem(row.title, 'skipped');
        }
      } catch (err: any) {
        control.recordItem(row.title, 'error');
        await logBotAction('sync_all:item', { title: row.title }, `ERROR: ${err.message}`);
      }
    }

    const snapshot = syncJobManager.getSnapshot();
    await logBotAction(
      'sync_all:background',
      {
        requested: rows.length,
        processed: snapshot.processed,
        updated: snapshot.updated,
        errors: snapshot.errors
      },
      control.isCancellationRequested() ? 'CANCELLED' : 'SUCCESS'
    );
  });

  if (!launch.started) {
    return complete(
      'REJECTED',
      `Ya hay una sincronización activa (${launch.snapshot.processed}/${launch.snapshot.total} procesados).`,
      actionData
    );
  }

  await logBotAction('sync_all', { jobId: launch.snapshot.id, requested: rows.length }, 'STARTED');
  return complete('SUCCESS', 'La sincronización de metadatos comenzó en segundo plano. Revisaré hasta 100 animes locales usando AniList.', actionData);
}
