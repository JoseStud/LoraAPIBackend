import { onScopeDispose, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import {
  useGenerationTransport,
  type GenerationNotificationAdapter,
} from '@/composables/useGenerationTransport';
import { DEFAULT_HISTORY_LIMIT } from '@/stores/generation/results';
import type {
  GenerationConnectionStore,
  GenerationQueueStore,
  GenerationResultsStore,
} from '@/stores/generation';
import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '@/services/generationUpdates';
import type {
  GenerationJob,
  GenerationRequestPayload,
  GenerationStartResponse,
} from '@/types';

export interface GenerationOrchestratorOptions {
  showHistory: Ref<boolean>;
  configuredBackendUrl: Ref<string | null | undefined>;
  notificationAdapter: GenerationNotificationAdapter;
  queueStore: GenerationQueueStore;
  resultsStore: GenerationResultsStore;
  connectionStore: GenerationConnectionStore;
  historyLimit: Ref<number>;
  pollIntervalMs: Ref<number>;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
}

export interface GenerationOrchestrator {
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

export const createGenerationOrchestrator = ({
  showHistory,
  configuredBackendUrl,
  notificationAdapter,
  queueStore,
  resultsStore,
  connectionStore,
  historyLimit,
  pollIntervalMs,
  queueClient,
  websocketManager,
}: GenerationOrchestratorOptions): GenerationOrchestrator => {
  const { hasActiveJobs } = storeToRefs(queueStore);

  const transport = useGenerationTransport(
    {
      getBackendUrl: () => configuredBackendUrl.value,
      queueClient,
      websocketManager,
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
  const refreshAllData = (): Promise<void> => transport.refreshAllData(historyLimit.value);

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

    await Promise.allSettled(cancellableJobs.map((job: GenerationJob) => cancelJob(job.id)));
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

  watch(showHistory, (next) => {
    const nextLimit = next ? 50 : DEFAULT_HISTORY_LIMIT;
    resultsStore.setHistoryLimit(nextLimit);
    void loadRecentResultsData();
  });

  watch(configuredBackendUrl, (next, previous) => {
    if (next === previous) {
      return;
    }

    transport.reconnectUpdates();
    void refreshAllData();
  });

  watch(pollIntervalMs, (next) => {
    transport.setPollInterval(next);
  });

  onScopeDispose(() => {
    transport.clear();
  });

  return {
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
