import { ref, shallowRef } from 'vue';

import {
  createGenerationQueueClient,
  createGenerationWebSocketManager,
  DEFAULT_POLL_INTERVAL,
  extractGenerationErrorMessage,
  type GenerationQueueClient,
  type GenerationWebSocketManager,
} from '@/services/generationUpdates';
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationProgressMessage,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  ProgressUpdate,
  SystemStatusPayload,
  SystemStatusState,
  NotificationType,
} from '@/types';
import type { GenerationJobInput } from '@/stores/generation';

export interface GenerationNotificationAdapter {
  notify(message: string, type?: NotificationType): void;
  debug?: (...args: unknown[]) => void;
}

export interface GenerationTransportOptions {
  getBackendUrl: () => string | null | undefined;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
  pollIntervalMs?: number;
  logger?: (...args: unknown[]) => void;
}

export interface GenerationTransportCallbacks {
  onSystemStatus?: (payload: SystemStatusPayload | Partial<SystemStatusState>) => void;
  onQueueUpdate?: (jobs: GenerationJobInput[]) => void;
  onProgress?: (message: GenerationProgressMessage | ProgressUpdate) => void;
  onComplete?: (message: GenerationCompleteMessage) => GenerationResult | void;
  onError?: (message: GenerationErrorMessage) => void;
  onRecentResults?: (results: GenerationResult[]) => void;
  onConnectionChange?: (connected: boolean) => void;
  shouldPollQueue?: () => boolean;
  onNotify?: (message: string, type?: NotificationType) => void;
  logger?: (...args: unknown[]) => void;
}

const ensureArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

export const useGenerationTransport = (
  options: GenerationTransportOptions,
  callbacks: GenerationTransportCallbacks,
) => {
  const queueClientRef = shallowRef<GenerationQueueClient | null>(options.queueClient ?? null);
  const websocketManagerRef = shallowRef<GenerationWebSocketManager | null>(
    options.websocketManager ?? null,
  );
  const pollInterval = ref(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL);
  const pollTimer = ref<number | null>(null);

  const logDebug = (...args: unknown[]): void => {
    if (typeof options.logger === 'function') {
      options.logger(...args);
    } else if (typeof callbacks.logger === 'function') {
      callbacks.logger(...args);
    }
  };

  const notify = (message: string, type: NotificationType = 'info'): void => {
    callbacks.onNotify?.(message, type);
    callbacks.logger?.('[GenerationTransport]', message, type);
  };

  const getQueueClient = (): GenerationQueueClient => {
    if (!queueClientRef.value) {
      queueClientRef.value = createGenerationQueueClient({
        getBackendUrl: options.getBackendUrl,
      });
    }
    return queueClientRef.value;
  };

  const ensureWebSocketManager = (): GenerationWebSocketManager => {
    if (websocketManagerRef.value) {
      return websocketManagerRef.value;
    }

    websocketManagerRef.value = createGenerationWebSocketManager({
      getBackendUrl: options.getBackendUrl,
      logger: (...args: unknown[]) => {
        logDebug(...args);
      },
      onConnectionChange: (connected) => {
        callbacks.onConnectionChange?.(connected);
      },
      onProgress: (message) => {
        callbacks.onProgress?.(message);
      },
      onComplete: (message) => {
        const result = callbacks.onComplete?.(message);
        notify('Generation completed successfully', 'success');
        return result;
      },
      onError: (message) => {
        callbacks.onError?.(message);
        const errorMessage = extractGenerationErrorMessage(message);
        notify(`Generation failed: ${errorMessage}`, 'error');
      },
      onQueueUpdate: (jobs) => {
        const list = ensureArray<GenerationJobInput>(jobs);
        callbacks.onQueueUpdate?.(list);
      },
      onSystemStatus: (payload) => {
        callbacks.onSystemStatus?.(payload);
      },
    });

    return websocketManagerRef.value;
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
        await refreshSystemStatus();
      } catch (error) {
        console.error('Failed to refresh generation data during polling:', error);
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

  const initializeUpdates = async (historyLimit: number): Promise<void> => {
    await refreshAllData(historyLimit);
    ensureWebSocketManager().start();
    startPolling();
  };

  const stopUpdates = (): void => {
    stopPolling();
    websocketManagerRef.value?.stop();
  };

  const reconnectUpdates = (): void => {
    ensureWebSocketManager().reconnect();
  };

  const setPollInterval = (nextInterval: number): void => {
    const numeric = Math.floor(Number(nextInterval));
    pollInterval.value = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_POLL_INTERVAL;

    if (pollTimer.value != null) {
      stopPolling();
      startPolling();
    }
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
    stopUpdates();
    websocketManagerRef.value = null;
    queueClientRef.value = null;
  };

  return {
    startGeneration,
    cancelJob,
    deleteResult,
    refreshSystemStatus,
    refreshActiveJobs,
    refreshRecentResults,
    refreshAllData,
    initializeUpdates,
    stopUpdates,
    reconnectUpdates,
    setPollInterval,
    startPolling,
    stopPolling,
    clear,
  };
};

export type UseGenerationTransportReturn = ReturnType<typeof useGenerationTransport>;
