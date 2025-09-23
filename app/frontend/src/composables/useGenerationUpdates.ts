import { onUnmounted, watch, type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useGenerationTransport, type GenerationNotificationAdapter } from '@/composables/useGenerationTransport';
import {
  DEFAULT_HISTORY_LIMIT,
  useGenerationConnectionStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
} from '@/stores/generation';
import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '@/services/generationUpdates';
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

  const { activeJobs, sortedActiveJobs, hasActiveJobs } = storeToRefs(queueStore);
  const { recentResults, historyLimit } = storeToRefs(resultsStore);
  const { isConnected, pollIntervalMs } = storeToRefs(connectionStore);

  const transport = useGenerationTransport(
    {
      getBackendUrl: () => configuredBackendUrl.value,
      queueClient: injectedQueueClient,
      websocketManager: injectedWebsocketManager,
      pollIntervalMs: pollIntervalMs.value,
      logger: (...args: unknown[]) => {
        notificationAdapter.debug?.(...args);
      },
    },
    {
      onSystemStatus: (payload) => {
        connectionStore.applySystemStatusPayload(payload);
      },
      onQueueUpdate: (jobs) => {
        queueStore.ingestQueue(jobs);
      },
      onProgress: (message) => {
        queueStore.handleProgressMessage(message);
      },
      onComplete: (message) => {
        const result = queueStore.handleCompletionMessage(message);
        resultsStore.addResult(result);
        return result;
      },
      onError: (message) => {
        queueStore.handleErrorMessage(message);
      },
      onRecentResults: (results) => {
        resultsStore.setResults(results);
      },
      onConnectionChange: (connected) => {
        connectionStore.setConnectionState(connected);
      },
      shouldPollQueue: () => hasActiveJobs.value,
      onNotify: (message, type = 'info') => {
        notificationAdapter.notify(message, type);
      },
      logger: (...args: unknown[]) => {
        notificationAdapter.debug?.(...args);
      },
    },
  );

  const loadSystemStatusData = (): Promise<void> => transport.refreshSystemStatus();
  const loadActiveJobsData = (): Promise<void> => transport.refreshActiveJobs();
  const loadRecentResultsData = (notifySuccess = false): Promise<void> =>
    transport.refreshRecentResults(historyLimit.value, notifySuccess);

  const initialize = async (): Promise<void> => {
    const nextLimit = showHistory.value ? 50 : DEFAULT_HISTORY_LIMIT;
    resultsStore.setHistoryLimit(nextLimit);
    await transport.initializeUpdates(historyLimit.value);
  };

  const cleanup = (): void => {
    transport.stopUpdates();
  };

  const startGeneration = async (
    payload: GenerationRequestPayload,
  ): Promise<GenerationStartResponse> => {
    try {
      const response = await transport.startGeneration(payload);

      if (response.job_id) {
        const createdAt = new Date().toISOString();
        queueStore.enqueueJob({
          id: response.job_id,
          prompt: payload.prompt,
          status: response.status,
          progress: response.progress ?? 0,
          startTime: createdAt,
          created_at: createdAt,
          width: payload.width,
          height: payload.height,
          steps: payload.steps,
          total_steps: payload.steps,
          cfg_scale: payload.cfg_scale,
          seed: payload.seed,
        });
        notificationAdapter.notify('Generation started successfully', 'success');
      }

      return response;
    } catch (error) {
      notificationAdapter.notify('Error starting generation', 'error');
      throw error;
    }
  };

  const cancelJob = async (jobId: string): Promise<void> => {
    try {
      await transport.cancelJob(jobId);
      queueStore.removeJob(jobId);
    } catch (error) {
      notificationAdapter.notify('Error cancelling generation', 'error');
      throw error;
    }
  };

  const clearQueue = async (): Promise<void> => {
    const cancellableJobs = queueStore.getCancellableJobs();
    if (cancellableJobs.length === 0) {
      return;
    }

    await Promise.allSettled(cancellableJobs.map((job) => cancelJob(job.id)));
  };

  const deleteResult = async (resultId: string | number): Promise<void> => {
    try {
      await transport.deleteResult(resultId);
      resultsStore.removeResult(resultId);
    } catch (error) {
      notificationAdapter.notify('Error deleting result', 'error');
      throw error;
    }
  };

  watch(showHistory, () => {
    const nextLimit = showHistory.value ? 50 : DEFAULT_HISTORY_LIMIT;
    resultsStore.setHistoryLimit(nextLimit);
    void loadRecentResultsData();
  });

  watch(configuredBackendUrl, (next, previous) => {
    if (next === previous) {
      return;
    }

    transport.reconnectUpdates();
    void transport.refreshAllData(historyLimit.value);
  });

  watch(pollIntervalMs, (next) => {
    transport.setPollInterval(next);
  });

  onUnmounted(() => {
    cleanup();
  });

  return {
    activeJobs,
    recentResults,
    sortedActiveJobs,
    isConnected,
    initialize,
    cleanup,
    loadSystemStatusData,
    loadActiveJobsData,
    loadRecentResultsData,
    startGeneration,
    cancelJob,
    clearQueue,
    deleteResult,
  };
};

export type UseGenerationUpdates = ReturnType<typeof useGenerationUpdates>;
