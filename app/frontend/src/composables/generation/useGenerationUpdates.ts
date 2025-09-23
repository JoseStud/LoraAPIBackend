import { type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import type { GenerationNotificationAdapter } from '@/composables/generation';
import {
  useGenerationConnectionStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
} from '@/stores/generation';
import { createGenerationOrchestrator } from '@/services';
import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '@/services';
import type {
  GenerationJob,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
} from '@/types';

interface UseGenerationUpdatesOptions {
  showHistory: Ref<boolean>;
  configuredBackendUrl: Ref<string | null | undefined>;
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
  showHistory,
  configuredBackendUrl,
  notificationAdapter,
  queueClient: injectedQueueClient,
  websocketManager: injectedWebsocketManager,
}: UseGenerationUpdatesOptions): UseGenerationUpdatesReturn => {
  const queueStore = useGenerationQueueStore();
  const resultsStore = useGenerationResultsStore();
  const connectionStore = useGenerationConnectionStore();

  const { activeJobs, sortedActiveJobs } = storeToRefs(queueStore);
  const { recentResults, historyLimit } = storeToRefs(resultsStore);
  const { isConnected, pollIntervalMs } = storeToRefs(connectionStore);

  const orchestrator = createGenerationOrchestrator({
    showHistory,
    configuredBackendUrl,
    notificationAdapter,
    queueStore,
    resultsStore,
    connectionStore,
    historyLimit,
    pollIntervalMs,
    queueClient: injectedQueueClient,
    websocketManager: injectedWebsocketManager,
  });

  return {
    activeJobs,
    recentResults,
    sortedActiveJobs,
    isConnected,
    initialize: orchestrator.initialize,
    cleanup: orchestrator.cleanup,
    loadSystemStatusData: orchestrator.loadSystemStatusData,
    loadActiveJobsData: orchestrator.loadActiveJobsData,
    loadRecentResultsData: orchestrator.loadRecentResultsData,
    startGeneration: orchestrator.startGeneration,
    cancelJob: orchestrator.cancelJob,
    clearQueue: orchestrator.clearQueue,
    deleteResult: orchestrator.deleteResult,
  };
};

export type UseGenerationUpdates = ReturnType<typeof useGenerationUpdates>;
