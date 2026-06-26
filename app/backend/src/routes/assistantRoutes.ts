import { Router } from 'express';
import type { RequestHandler } from 'express';
import {
  executeChatbotAction,
  handleChatMessage,
  isAllowedChatbotAction
} from '../chatbot/chatbot';
import { getMapleAssistantCapabilities } from '../chatbot/capabilities';
import {
  buildUserSoulProfile,
  clearAllMemory,
  getUserSoulData
} from '../chatbot/memory';
import { query } from '../database/db';
import { createRateLimitMiddleware } from '../security/rateLimiter';
import { sanitizeChatInput } from '../security/sanitize';
import {
  clearChatHistory,
  getAssistantActionHistory,
  getChatHistory
} from './assistantRepository';
import { getErrorMessage as getSharedErrorMessage } from './routeUtils';

type QueryClient = Pick<typeof query, 'all' | 'run'>;

interface AssistantService {
  handleChatMessage: typeof handleChatMessage;
  executeChatbotAction: typeof executeChatbotAction;
  isAllowedChatbotAction: typeof isAllowedChatbotAction;
}

interface AssistantMemoryService {
  clearAllMemory: typeof clearAllMemory;
  getUserSoulData: typeof getUserSoulData;
  buildUserSoulProfile: typeof buildUserSoulProfile;
}

interface AssistantRouterDependencies {
  queryClient?: QueryClient;
  assistantService?: AssistantService;
  memoryService?: AssistantMemoryService;
  capabilitiesProvider?: typeof getMapleAssistantCapabilities;
  sanitizeInput?: typeof sanitizeChatInput;
  chatRateLimitMiddleware?: RequestHandler;
}

const defaultAssistantService: AssistantService = {
  handleChatMessage,
  executeChatbotAction,
  isAllowedChatbotAction
};

const defaultMemoryService: AssistantMemoryService = {
  clearAllMemory,
  getUserSoulData,
  buildUserSoulProfile
};

function getErrorMessage(error: unknown): string {
  return getSharedErrorMessage(error, 'Error interno en Maple Assistant.');
}

export function createAssistantRouter({
  queryClient = query,
  assistantService = defaultAssistantService,
  memoryService = defaultMemoryService,
  capabilitiesProvider = getMapleAssistantCapabilities,
  sanitizeInput = sanitizeChatInput,
  chatRateLimitMiddleware = createRateLimitMiddleware('chat')
}: AssistantRouterDependencies = {}) {
  const router = Router();

  router.get('/chat/capabilities', (_req, res) => {
    res.json(capabilitiesProvider());
  });

  router.post('/chat/message', chatRateLimitMiddleware, async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'El mensaje es requerido y debe ser texto.' });
      }

      const safeMessage = sanitizeInput(message);
      if (safeMessage.length > 2000) {
        return res.status(400).json({ error: 'El mensaje no puede superar los 2000 caracteres.' });
      }

      const chatbotResponse = await assistantService.handleChatMessage(safeMessage);
      res.json(chatbotResponse);
    } catch (_) {
      res.status(500).json({ error: 'Error al procesar el mensaje.' });
    }
  });

  router.post('/chat/execute-action', chatRateLimitMiddleware, async (req, res) => {
    try {
      const { type, data, confirmToken } = req.body;
      if (!type || typeof type !== 'string') {
        return res.status(400).json({ error: '"type" es requerido.' });
      }
      if (!assistantService.isAllowedChatbotAction(type)) {
        return res.status(400).json({ error: 'Tipo de accion no permitido.' });
      }

      const message = await assistantService.executeChatbotAction(type, data || {}, confirmToken);
      res.json({ text: message });
    } catch (_) {
      res.status(500).json({ error: 'Error al ejecutar la accion.' });
    }
  });

  router.get('/chat/history', async (_req, res) => {
    try {
      res.json(await getChatHistory(queryClient));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.delete('/chat/history', async (_req, res) => {
    try {
      await clearChatHistory(queryClient);
      res.json({ message: 'Historial del chatbot borrado con exito' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.delete('/chat/memory', async (_req, res) => {
    try {
      await memoryService.clearAllMemory();
      res.json({ message: 'Memoria local del chatbot borrada con exito' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/chat/memory/profile', async (_req, res) => {
    try {
      const profile = await memoryService.getUserSoulData();
      res.json(profile || { message: 'Perfil de usuario no generado todavia.' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/chat/memory/profile', async (_req, res) => {
    try {
      const profile = await memoryService.buildUserSoulProfile();
      res.json({ message: 'Perfil de memoria, gustos y alma generado con exito.', profile });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/chat/actions/history', async (_req, res) => {
    try {
      res.json(await getAssistantActionHistory(queryClient));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
