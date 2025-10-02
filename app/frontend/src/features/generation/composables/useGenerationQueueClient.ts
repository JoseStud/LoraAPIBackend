import { ref, shallowRef } from 'vue';

import { createGenerationQueueClient, type GenerationQueueClient } from '../services/queueClient';
import { generationPollingConfig } from '../config/polling';
import {
  logValidationIssues,
  parseGenerationJobStatuses,
  parseGenerationResults,
} from '../services/validation';
import type { GenerationJobInput } from '../stores/useGenerationOrchestratorStore';
import type {
  GenerationJobStatus,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  NotificationType,
  SystemStatusPayload,
  SystemStatusState,
} from '@/types';
import { SystemStatusPayloadSchema } from '@/schemas';
import { normalizeJobStatus } from '@/utils/status';
import { ApiError } from '@/types/api';
import type { GenerationTransportError } from '../types/transport';

const toQueueJobInput = (status: GenerationJobStatus): GenerationJobInput => {
  const backendId = status.jobId ?? status.id;
  const uiId = status.id ?? backendId;

  return {
    id: uiId,
    jobId: backendId ?? undefined,
    uiId: uiId ?? undefined,
    backendId: backendId ?? undefined,
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
  };
};

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
  onTransportError?: (error: GenerationTransportError) => void;
}

export const useGenerationQueueClient = (
  options: QueueClientOptions,
  callbacks: QueueClientCallbacks,
) => {
  const queueClientRef = shallowRef<GenerationQueueClient | null>(options.queueClient ?? null);
  const pollInterval = ref(options.pollIntervalMs ?? generationPollingConfig.queueMs);
  const pollTimer = ref<number | null>(null);
  const logDebug = (...args: unknown[]): void => {
    if (typeof callbacks.logger === 'function') {
      callbacks.logger(...args);
    }
  };

  const notify = (message: string, type: NotificationType = 'info'): void => {
    callbacks.onNotify?.(message, type);
  };

  const reportError = (
    context: string,
    error: unknown,
    extras: Partial<GenerationTransportError> = {},
  ): void => {
    const timestamp = Date.now();
    let message = 'Unknown error';
    let statusCode: number | undefined;

    if (error instanceof ApiError) {
      message = error.message || `Request failed with status ${error.status}`;
      statusCode = error.status;
    } else if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }

    const payload: GenerationTransportError = {
      source: 'http',
      context,
      message,
      timestamp,
      statusCode,
      details: error,
      ...extras,
    };

    callbacks.onTransportError?.(payload);
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
      reportError('refreshSystemStatus', error);
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
      reportError('refreshActiveJobs', error);
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
      reportError('refreshRecentResults', error);
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
        reportError('pollActiveJobs', error);
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
    pollInterval.value = Number.isFinite(numeric) && numeric > 0
      ? numeric
      : generationPollingConfig.queueMs;

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
    try {
      await getQueueClient().cancelJob(jobId);
      notify('Generation cancelled', 'success');
    } catch (error) {
      reportError('cancelJob', error, { jobId });
      notify('Failed to cancel generation', 'error');
      throw error;
    }
  };

  const deleteResult = async (resultId: string | number): Promise<void> => {
    try {
      await getQueueClient().deleteResult(resultId);
      notify('Result deleted', 'success');
    } catch (error) {
      reportError('deleteResult', error, { resultId });
      notify('Failed to delete result', 'error');
      throw error;
    }
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
