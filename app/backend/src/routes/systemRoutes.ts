import { Router } from 'express';
import { getMapleVaultAgentSystem } from '../agents/agentRegistry';
import { listBackups } from '../database/backup';
import { DB_PATH, query } from '../database/db';
import { getAISettings } from '../chatbot/aiSettings';
import {
  getMapleVaultPlayerCapabilities,
  getMediaSourceCandidates,
  getRecommendedAnimeSourceIntegrations
} from '../sources/mediaSourceCandidates';
import { getErrorMessage as getSharedErrorMessage } from './routeUtils';

type QueryClient = Pick<typeof query, 'get' | 'all'>;

interface BackupSummary {
  createdAt: string;
}

interface SystemRouterDependencies {
  queryClient?: QueryClient;
  listDatabaseBackups?: typeof listBackups;
  getAssistantSettings?: typeof getAISettings;
  getAgentSystem?: typeof getMapleVaultAgentSystem;
  getSourceCandidates?: typeof getMediaSourceCandidates;
  getRecommendedAnimeSources?: typeof getRecommendedAnimeSourceIntegrations;
  getPlayerCapabilities?: typeof getMapleVaultPlayerCapabilities;
  databasePath?: string;
  getUptime?: () => number;
}

const getErrorMessage = (error: unknown): string =>
  getSharedErrorMessage(error, 'Error interno al consultar el sistema.');

const getLatestBackupDate = (backups: BackupSummary[]) => backups[0]?.createdAt || null;

export function createSystemRouter({
  queryClient = query,
  listDatabaseBackups = listBackups,
  getAssistantSettings = getAISettings,
  getAgentSystem = getMapleVaultAgentSystem,
  getSourceCandidates = getMediaSourceCandidates,
  getRecommendedAnimeSources = getRecommendedAnimeSourceIntegrations,
  getPlayerCapabilities = getMapleVaultPlayerCapabilities,
  databasePath = DB_PATH,
  getUptime = () => process.uptime()
}: SystemRouterDependencies = {}) {
  const router = Router();

  router.get('/system/health', async (_req, res) => {
    try {
      const animeCount = await queryClient.get('SELECT COUNT(*) as c FROM anime');
      const listCount = await queryClient.get('SELECT COUNT(*) as c FROM user_list');
      const backups = listDatabaseBackups();

      res.json({
        status: 'ok',
        database: {
          connected: true,
          animeCount: animeCount?.c || 0,
          userListCount: listCount?.c || 0,
          dbPath: databasePath
        },
        backup: {
          count: backups.length,
          latest: getLatestBackupDate(backups)
        },
        uptime: getUptime()
      });
    } catch (error: unknown) {
      res.status(500).json({ status: 'error', error: getErrorMessage(error) });
    }
  });

  router.get('/system/diagnostics', async (_req, res) => {
    try {
      const [animeCount, listCount] = await Promise.all([
        queryClient.get('SELECT COUNT(*) as c FROM anime'),
        queryClient.get('SELECT COUNT(*) as c FROM user_list')
      ]);
      const settings = await getAssistantSettings();
      const sources = await queryClient.all(
        'SELECT name, enabled, rate_limit, last_sync FROM sources ORDER BY name ASC'
      );
      const backups = listDatabaseBackups();

      res.json({
        app: 'MapleVault',
        status: 'ok',
        database: {
          connected: true,
          path: databasePath,
          animeCount: animeCount?.c || 0,
          userListCount: listCount?.c || 0
        },
        assistant: {
          provider: settings.provider,
          model: settings.model,
          enabled: settings.enabled,
          url: settings.url
        },
        scraping: {
          sources
        },
        backup: {
          count: backups.length,
          latest: getLatestBackupDate(backups)
        },
        uptime: getUptime()
      });
    } catch (error: unknown) {
      res.status(500).json({ status: 'error', error: getErrorMessage(error) });
    }
  });

  router.get('/system/agents', (_req, res) => {
    res.json(getAgentSystem());
  });

  router.get('/system/source-candidates', (_req, res) => {
    res.json({
      policy: 'Candidatos desactivados por defecto. Cada fuente debe auditarse antes de convertirse en proveedor activo.',
      playerCapabilities: getPlayerCapabilities(),
      selected: getRecommendedAnimeSources(),
      candidates: getSourceCandidates()
    });
  });
  return router;
}
