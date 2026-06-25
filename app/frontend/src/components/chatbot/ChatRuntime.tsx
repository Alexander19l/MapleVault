import { useMemo, type FC } from 'react';
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react';
import { Thread } from '@/components/thread';
import { createMapleAssistantAdapter } from './AssistantAdapter';
import type { ChatMessage } from '../../types';

type ThreadContentPart = Extract<ThreadMessageLike['content'], readonly unknown[]>[number];

const toInitialMessages = (history: ChatMessage[]): ThreadMessageLike[] => {
  return history
    .filter(message => Boolean(message.content?.trim()) || Boolean(message.visualData))
    .map((message, index) => {
      const contentParts: ThreadContentPart[] = [];

      if (message.content?.trim()) {
        contentParts.push({ type: 'text', text: message.content });
      }

      if (message.role === 'assistant' && message.visualData) {
        contentParts.push({
          type: 'tool-call',
          toolName: 'maple_visual',
          toolCallId: `history_visual_${message.id ?? index}`,
          args: message.visualData
        });
      }

      const createdAt = message.created_at ? new Date(message.created_at) : undefined;
      const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined;

      return {
        id: `history_${message.id ?? index}`,
        role: message.role,
        content: contentParts,
        createdAt: validCreatedAt,
        ...(message.role === 'assistant'
          ? { status: { type: 'complete' as const, reason: 'stop' as const } }
          : {}),
        metadata: {
          custom: {
            restoredFromHistory: true
          }
        }
      };
    });
};

interface ChatRuntimeProps {
  history: ChatMessage[];
  featuredPrompts: string[];
}

export const ChatRuntime: FC<ChatRuntimeProps> = ({ history, featuredPrompts }) => {
  const initialMessages = useMemo(() => toInitialMessages(history), [history]);
  const adapter = useMemo(() => createMapleAssistantAdapter(), []);
  const suggestionAdapter = useMemo(() => ({
    generate: async () => featuredPrompts.map(prompt => ({ prompt }))
  }), [featuredPrompts]);
  const runtime = useLocalRuntime(adapter, {
    initialMessages,
    adapters: {
      suggestion: suggestionAdapter
    }
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
};
