import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '@/features/generation/services';

import type { GenerationNotificationAdapter } from './useGenerationTransport';
import {
  useGenerationOrchestratorManager,
  type GenerationOrchestratorBinding,
} from './useGenerationOrchestratorManager';

export interface UseGenerationOrchestratorOptions {
  notify: GenerationNotificationAdapter['notify'];
  debug?: GenerationNotificationAdapter['debug'];
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
}

export const useGenerationOrchestrator = (
  options: UseGenerationOrchestratorOptions,
): GenerationOrchestratorBinding => {
  const manager = useGenerationOrchestratorManager();
  return manager.acquire(options);
};

export type UseGenerationOrchestratorReturn = ReturnType<typeof useGenerationOrchestrator>;
