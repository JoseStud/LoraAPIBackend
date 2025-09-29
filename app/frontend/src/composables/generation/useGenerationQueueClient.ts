import { ref, shallowRef } from 'vue';

import {
  createGenerationQueueClient,
  DEFAULT_POLL_INTERVAL,
  type GenerationQueueClient,
} from '@/services/generation/updates';
import type {
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  NotificationType,
  SystemStatusPayload,
  SystemStatusState,
} from '@/types';
import type { GenerationJobInput } from '@/stores/generation';
import { useSystemStatusController } from '@/stores/generation/systemStatusController';

const ensureArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

interface QueueClientOptions {
  getBackendUrl: () => string | null | undefined;
  queueClient?: GenerationQueueClient;
  pollIntervalMs?: number;
}

interface QueueClientCallbacks {
  onSystemStatus?: (payload: SystemStatusPayload | Partial<SystemStatusState>) => void;
  onQueueUpdate?: (jobs: GenerationJobInput[]) => void;
  onRecentResults?: (results: GenerationResult[]) => void;
  shouldPollQueue?: () => boolean;
  onNotify?: (message: string, type?: NotificationType) => void;
  logger?: (...args: unknown[]) => void;
}

export const useGenerationQueueClient = (
  options: QueueClientOptions,
  callbacks: QueueClientCallbacks,
) => {
  const queueClientRef = shallowRef<GenerationQueueClient | null>(options.queueClient ?? null);
  const pollInterval = ref(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL);
  const pollTimer = ref<number | null>(null);
  const statusController = useSystemStatusController();

  const logDebug = (...args: unknown[]): void => {
    if (typeof callbacks.logger === 'function') {
      callbacks.logger(...args);
    }
  };

  const notify = (message: string, type: NotificationType = 'info'): void => {
    callbacks.onNotify?.(message, type);
  };

  const getQueueClient = (): GenerationQueueClient => {
    if (!queueClientRef.value) {
      queueClientRef.value = createGenerationQueueClient({
        getBackendUrl: options.getBackendUrl,
      });
    }
    return queueClientRef.value;
  };

  const refreshSystemStatus = async (): Promise<void> => {
    try {
      const status = await getQueueClient().fetchSystemStatus();
      if (status) {
        callbacks.onSystemStatus?.(status);
      }
    } catch (error) {
      console.error('Failed to refresh system status:', error);
      throw error;
    }
  };

  const refreshActiveJobs = async (): Promise<void> => {
    try {
      const active = await getQueueClient().fetchActiveJobs();
      callbacks.onQueueUpdate?.(ensureArray<GenerationJobInput>(active));
    } catch (error) {
      console.error('Failed to refresh active jobs:', error);
      throw error;
    }
  };

  const refreshRecentResults = async (limit: number, notifySuccess = false): Promise<void> => {
    try {
      const recent = await getQueueClient().fetchRecentResults(limit);
      callbacks.onRecentResults?.(ensureArray(recent));
      if (notifySuccess) {
        notify('Results refreshed', 'success');
      }
    } catch (error) {
      console.error('Failed to refresh recent results:', error);
      if (notifySuccess) {
        notify('Failed to refresh results', 'error');
      }
      throw error;
    }
  };

  const refreshAllData = async (historyLimit: number): Promise<void> => {
    await Promise.all([
      refreshSystemStatus(),
      refreshActiveJobs(),
      refreshRecentResults(historyLimit),
    ]);
  };

  const startPolling = (): void => {
    if (typeof window === 'undefined' || pollTimer.value != null) {
      return;
    }

    pollTimer.value = window.setInterval(async () => {
      try {
        if (callbacks.shouldPollQueue?.()) {
          await refreshActiveJobs();
        }
      } catch (error) {
        console.error('Failed to refresh generation data during polling:', error);
        logDebug('Queue polling cycle failed', error);
      }
    }, pollInterval.value);
  };

  const stopPolling = (): void => {
    if (typeof window === 'undefined' || pollTimer.value == null) {
      return;
    }

    window.clearInterval(pollTimer.value);
    pollTimer.value = null;
  };

  const setPollInterval = (nextInterval: number): void => {
    const numeric = Math.floor(Number(nextInterval));
    pollInterval.value = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_POLL_INTERVAL;

    if (pollTimer.value != null) {
      stopPolling();
      startPolling();
    }
  };

  const initialize = async (historyLimit: number): Promise<void> => {
    await refreshAllData(historyLimit);
    startPolling();
    void statusController.ensureHydrated();
  };

  const startGeneration = async (
    payload: GenerationRequestPayload,
  ): Promise<GenerationStartResponse> => getQueueClient().startGeneration(payload);

  const cancelJob = async (jobId: string): Promise<void> => {
    await getQueueClient().cancelJob(jobId);
    notify('Generation cancelled', 'success');
  };

  const deleteResult = async (resultId: string | number): Promise<void> => {
    await getQueueClient().deleteResult(resultId);
    notify('Result deleted', 'success');
  };

  const clear = (): void => {
    stopPolling();
    queueClientRef.value = null;
  };

  return {
    pollInterval,
    setPollInterval,
    initialize,
    stopPolling,
    refreshSystemStatus,
    refreshActiveJobs,
    refreshRecentResults,
    refreshAllData,
    startGeneration,
    cancelJob,
    deleteResult,
    clear,
  };
};

export type UseGenerationQueueClientReturn = ReturnType<typeof useGenerationQueueClient>;
