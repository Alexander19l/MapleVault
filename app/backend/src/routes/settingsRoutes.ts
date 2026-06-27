import axios from 'axios';
import { Router } from 'express';
import { getAISettings, resetAISettings, setAISettings } from '../chatbot/aiSettings';
import { buildUserSoulProfile, seedInitialMemory } from '../chatbot/memory';
import { validateLocalServiceUrl } from '../security/validators';
import {
  loadSettings,
  normalizeTranslationSettingsForStorage,
  saveSettings
} from '../settings/appSettings';
import {
  getLibreTranslateInstallationStatus,
  startLibreTranslateInstallation
} from '../translation/translationInstaller';
import { getLibreTranslateRuntimeStatus } from '../translation/translationRuntime';
import {
  getErrorMessage as getSharedErrorMessage,
  validateBodySize
} from './routeUtils';
import {
  buildSavedAppSettings,
  getAIConnectivityEndpoint,
  hasOllamaModel,
  normalizeCloseBehavior
} from './settingsRouteService';

interface AISettingsService {
  getAISettings: typeof getAISettings;
  setAISettings: typeof setAISettings;
  resetAISettings: typeof resetAISettings;
}

interface AssistantMemoryService {
  seedInitialMemory: typeof seedInitialMemory;
  buildUserSoulProfile: typeof buildUserSoulProfile;
}

interface AppSettingsStore {
  loadSettings: typeof loadSettings;
  saveSettings: typeof saveSettings;
  normalizeTranslationSettingsForStorage: typeof normalizeTranslationSettingsForStorage;
}

interface TranslationRuntimeService {
  getLibreTranslateRuntimeStatus: typeof getLibreTranslateRuntimeStatus;
  getLibreTranslateInstallationStatus: typeof getLibreTranslateInstallationStatus;
  startLibreTranslateInstallation: typeof startLibreTranslateInstallation;
}

interface SettingsRouterDependencies {
  aiSettingsService?: AISettingsService;
  assistantMemoryService?: AssistantMemoryService;
  appSettingsStore?: AppSettingsStore;
  translationRuntimeService?: TranslationRuntimeService;
  httpClient?: Pick<typeof axios, 'get'>;
}

const defaultAISettingsService: AISettingsService = {
  getAISettings,
  setAISettings,
  resetAISettings
};

const defaultAssistantMemoryService: AssistantMemoryService = {
  seedInitialMemory,
  buildUserSoulProfile
};

const defaultAppSettingsStore: AppSettingsStore = {
  loadSettings,
  saveSettings,
  normalizeTranslationSettingsForStorage
};

const defaultTranslationRuntimeService: TranslationRuntimeService = {
  getLibreTranslateRuntimeStatus,
  getLibreTranslateInstallationStatus,
  startLibreTranslateInstallation
};

function getErrorMessage(error: unknown): string {
  return getSharedErrorMessage(error, 'Error interno al guardar ajustes.');
}

export function createSettingsRouter({
  aiSettingsService = defaultAISettingsService,
  assistantMemoryService = defaultAssistantMemoryService,
  appSettingsStore = defaultAppSettingsStore,
  translationRuntimeService = defaultTranslationRuntimeService,
  httpClient = axios
}: SettingsRouterDependencies = {}) {
  const router = Router();

  router.get('/settings/ai', async (_req, res) => {
    try {
      const settings = await aiSettingsService.getAISettings();
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/settings/ai', async (req, res) => {
    try {
      const validatedUrl = validateLocalServiceUrl(req.body?.url);
      if (!validatedUrl.valid) {
        return res.status(400).json({ error: validatedUrl.reason });
      }
      await aiSettingsService.setAISettings(req.body);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  router.delete('/settings/ai', async (_req, res) => {
    try {
      await aiSettingsService.resetAISettings();
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/settings/ai/seed', async (_req, res) => {
    try {
      await assistantMemoryService.seedInitialMemory();
      const profile = await assistantMemoryService.buildUserSoulProfile();
      res.json({ message: 'Memoria inicial y perfil de gustos generados con éxito.', profile });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/settings/ai/test', async (req, res) => {
    try {
      const { url, provider, model } = req.body;
      const validatedUrl = validateLocalServiceUrl(url);
      if (!validatedUrl.valid) {
        return res.status(400).json({ success: false, message: validatedUrl.reason });
      }

      const endpoint = getAIConnectivityEndpoint(validatedUrl.url, provider);

      const result = await httpClient.get(endpoint, { timeout: 3000, maxRedirects: 0 });

      if (provider === 'ollama' && model) {
        const modelExists = hasOllamaModel(result.data, model);
        if (!modelExists) {
          return res.status(400).json({
            success: false,
            message: `Ollama está conectado, pero no se encontró el modelo "${model}".\nAbre tu terminal e instala el modelo ejecutando:\nollama run ${model}`
          });
        }
      }

      res.json({ success: true, message: 'Conexión establecida correctamente.' });
    } catch (error: unknown) {
      res.status(400).json({ success: false, message: `Error de conexión: ${getErrorMessage(error)}` });
    }
  });

  router.get('/settings', (_req, res) => {
    const settings = appSettingsStore.loadSettings();
    res.json(settings);
  });

  router.post('/settings', (req, res) => {
    try {
      if (!validateBodySize(res, req.body)) return;
      if (req.body?.translation?.url !== undefined) {
        const validatedUrl = validateLocalServiceUrl(req.body.translation.url);
        if (!validatedUrl.valid) {
          return res.status(400).json({ error: validatedUrl.reason });
        }
      }

      const current = appSettingsStore.loadSettings();
      const newSettings = buildSavedAppSettings(
        current,
        req.body,
        appSettingsStore.normalizeTranslationSettingsForStorage
      );

      appSettingsStore.saveSettings(newSettings);
      res.json({ message: 'Ajustes guardados con éxito' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.patch('/settings/window', (req, res) => {
    try {
      if (!validateBodySize(res, req.body)) return;
      const current = appSettingsStore.loadSettings();
      const closeBehavior = normalizeCloseBehavior(
        req.body?.closeBehavior,
        current.closeBehavior
      );

      if (closeBehavior !== req.body?.closeBehavior) {
        return res.status(400).json({ error: 'Comportamiento de cierre no válido.' });
      }

      appSettingsStore.saveSettings({
        ...current,
        closeBehavior
      });
      res.json({ closeBehavior });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/translation/status', async (_req, res) => {
    try {
      res.json(await translationRuntimeService.getLibreTranslateRuntimeStatus());
    } catch (error: unknown) {
      res.status(500).json({ state: 'error', error: getErrorMessage(error) });
    }
  });

  router.get('/translation/install/status', (_req, res) => {
    res.json(translationRuntimeService.getLibreTranslateInstallationStatus());
  });

  router.post('/translation/install', async (_req, res) => {
    try {
      const status = await translationRuntimeService.startLibreTranslateInstallation();
      const statusCode = status.state === 'installing' || status.state === 'verifying' ? 202 : 200;
      res.status(statusCode).json(status);
    } catch (error: unknown) {
      res.status(500).json({
        state: 'error',
        message: getErrorMessage(error)
      });
    }
  });

  return router;
}
