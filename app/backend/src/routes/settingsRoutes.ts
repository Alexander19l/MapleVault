import axios from 'axios';
import { Router } from 'express';
import type { Response } from 'express';
import { getAISettings, resetAISettings, setAISettings } from '../chatbot/aiSettings';
import { buildUserSoulProfile, seedInitialMemory } from '../chatbot/memory';
import { validateLocalServiceUrl, validatePayloadSize } from '../security/validators';
import {
  loadSettings,
  normalizeTranslationSettingsForStorage,
  saveSettings
} from '../settings/appSettings';
import { enforceSupportedAppearance } from '../settings/settingsPolicy';
import { getLibreTranslateRuntimeStatus } from '../translation/translationRuntime';

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
  getLibreTranslateRuntimeStatus
};

const allowedCloseBehaviors = new Set(['ask', 'minimize', 'quit']);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error interno al guardar ajustes.';
}

function validateBodySize(res: Response, body: unknown): boolean {
  if (!validatePayloadSize(body)) {
    res.status(413).json({ error: 'Payload demasiado grande.' });
    return false;
  }
  return true;
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

      let endpoint = `${validatedUrl.url}/api/tags`;
      if (provider !== 'ollama') {
        endpoint = `${validatedUrl.url}/v1/models`;
      }

      const result = await httpClient.get(endpoint, { timeout: 3000, maxRedirects: 0 });

      if (provider === 'ollama' && model) {
        const models = Array.isArray(result.data?.models) ? result.data.models : [];
        const modelExists = models.some((item: { name?: string }) =>
          item.name === model || item.name?.startsWith(`${model}:`)
        );
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
      const newSettings = enforceSupportedAppearance({
        ...current,
        closeBehavior: allowedCloseBehaviors.has(req.body?.closeBehavior)
          ? req.body.closeBehavior
          : current.closeBehavior || 'ask',
        translation: appSettingsStore.normalizeTranslationSettingsForStorage(
          req.body?.translation,
          current.translation
        )
      });

      appSettingsStore.saveSettings(newSettings);
      res.json({ message: 'Ajustes guardados con éxito' });
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

  return router;
}
