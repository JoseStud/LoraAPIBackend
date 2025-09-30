import type { ComputedRef, Ref } from 'vue';

import type { GenerationNotificationAdapter } from './useGenerationTransport';
import {
  useGenerationOrchestratorManager,
  type GenerationOrchestratorBinding,
} from './useGenerationOrchestratorManager';
import type { GenerationQueueClient } from '@/services/generation/queueClient';
import type { GenerationWebSocketManager } from '@/services/generation/websocketManager';
import type {
  GenerationJob,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
} from '@/types';

interface UseGenerationUpdatesOptions {
  notificationAdapter: GenerationNotificationAdapter;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
}

export interface UseGenerationUpdatesReturn {
  activeJobs: Ref<GenerationJob[]>;
  recentResults: Ref<GenerationResult[]>;
  sortedActiveJobs: ComputedRef<GenerationJob[]>;
  isConnected: Ref<boolean>;
  initialize: () => Promise<void>;
  cleanup: () => void;
  loadSystemStatusData: () => Promise<void>;
  loadActiveJobsData: () => Promise<void>;
  loadRecentResultsData: (notifySuccess?: boolean) => Promise<void>;
  startGeneration: (payload: GenerationRequestPayload) => Promise<GenerationStartResponse>;
  cancelJob: (jobId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  deleteResult: (resultId: string | number) => Promise<void>;
}

export const useGenerationUpdates = ({
  notificationAdapter,
  queueClient: injectedQueueClient,
  websocketManager: injectedWebsocketManager,
}: UseGenerationUpdatesOptions): UseGenerationUpdatesReturn => {
  const manager = useGenerationOrchestratorManager();
  const binding: GenerationOrchestratorBinding = manager.acquire({
    notify: notificationAdapter.notify,
    debug: notificationAdapter.debug,
    queueClient: injectedQueueClient,
    websocketManager: injectedWebsocketManager,
  });

  return {
    activeJobs: manager.activeJobs,
    recentResults: manager.recentResults,
    sortedActiveJobs: manager.sortedActiveJobs as ComputedRef<GenerationJob[]>,
    isConnected: manager.isConnected,
    initialize: binding.initialize,
    cleanup: binding.cleanup,
    loadSystemStatusData: binding.loadSystemStatusData,
    loadActiveJobsData: binding.loadActiveJobsData,
    loadRecentResultsData: binding.loadRecentResultsData,
    startGeneration: binding.startGeneration,
    cancelJob: binding.cancelJob,
    clearQueue: binding.clearQueue,
    deleteResult: binding.deleteResult,
  };
};

export type UseGenerationUpdates = ReturnType<typeof useGenerationUpdates>;
