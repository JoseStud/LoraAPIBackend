import { ref, shallowRef } from 'vue';

import {
  createGenerationQueueClient,
  DEFAULT_POLL_INTERVAL,
  ensureArray,
  type GenerationQueueClient,
} from '@/services';
import type {
  GenerationJobStatus,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  NotificationType,
  SystemStatusPayload,
  SystemStatusState,
} from '@/types';
import type { GenerationJobInput } from '@/stores/generation';
import { SystemStatusPayloadSchema } from '@/schemas';
import { normalizeJobStatus } from '@/utils/status';

const logValidationIssues = (
  context: string,
  error: unknown,
  payload: unknown,
) => {
  if (error && typeof error === 'object' && 'issues' in error) {
    console.warn(`[generation] ${context} validation failed`, {
      issues: (error as { issues: unknown }).issues,
      payload,
    });
  } else {
    console.warn(`[generation] ${context} validation failed`, { payload, error });
  }
};


const toQueueJobInput = (status: GenerationJobStatus): GenerationJobInput => ({
  id: status.id,
  jobId: status.jobId ?? undefined,
  prompt: status.prompt ?? undefined,
  name: status.name ?? undefined,
  status: normalizeJobStatus(status.status),
  progress: status.progress,
  message: status.message ?? undefined,
  params: status.params ?? null,
  result: status.result ?? null,
  error: status.error ?? undefined,
  created_at: status.created_at,
  startTime: status.startTime ?? undefined,
});

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
  onHydrateSystemStatus?: () => Promise<void> | void;
  onReleaseSystemStatus?: () => void;
}

export const useGenerationQueueClient = (
  options: QueueClientOptions,
  callbacks: QueueClientCallbacks,
) => {
  const queueClientRef = shallowRef<GenerationQueueClient | null>(options.queueClient ?? null);
  const pollInterval = ref(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL);
  const pollTimer = ref<number | null>(null);
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
        const parsed = SystemStatusPayloadSchema.safeParse(status);
        if (parsed.success) {
          callbacks.onSystemStatus?.(parsed.data);
        } else {
          logValidationIssues('system status', parsed.error, status);
        }
      }
    } catch (error) {
      console.error('Failed to refresh system status:', error);
      throw error;
    }
  };

  const refreshActiveJobs = async (): Promise<void> => {
    try {
      const active = await getQueueClient().fetchActiveJobs();
      const parsed = parseGenerationJobStatuses(active, 'active job');
      const normalized = parsed.map(toQueueJobInput);
      callbacks.onQueueUpdate?.(normalized);
    } catch (error) {
      console.error('Failed to refresh active jobs:', error);
      throw error;
    }
  };

  const refreshRecentResults = async (limit: number, notifySuccess = false): Promise<void> => {
    try {
      const recent = await getQueueClient().fetchRecentResults(limit);
      const normalized = parseGenerationResults(recent, 'recent result');
      callbacks.onRecentResults?.(normalized);
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
    if (callbacks.onHydrateSystemStatus) {
      await callbacks.onHydrateSystemStatus();
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
    stopPolling();
    queueClientRef.value = null;
    callbacks.onReleaseSystemStatus?.();
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
