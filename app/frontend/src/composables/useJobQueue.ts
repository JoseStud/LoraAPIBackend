import { computed, onBeforeUnmount, onMounted, ref, unref, watch, type MaybeRefOrGetter } from 'vue';
import { storeToRefs } from 'pinia';

import { ApiError } from '@/composables/useApi';
import {
  cancelGenerationJob,
  cancelLegacyJob,
  fetchActiveGenerationJobs,
  fetchLegacyJobStatuses,
} from '@/services/generationService';
import { useAppStore } from '@/stores/app';
import { useNotifications } from '@/composables/useNotifications';
import { useBackendBase } from '@/utils/backend';
import type { GenerationJob, GenerationResult } from '@/types';
import { normalizeJobStatus } from '@/utils/status';

const DEFAULT_POLL_INTERVAL = 2000;
const PRIMARY_FAILURE_LOG_COOLDOWN = 5000;

export interface UseJobQueueOptions {
  pollInterval?: MaybeRefOrGetter<number>;
  disabled?: MaybeRefOrGetter<boolean>;
}

type JobRecord = Record<string, unknown>;

const resolveBoolean = (value?: MaybeRefOrGetter<boolean>): boolean => {
  if (value === undefined) {
    return false;
  }

  try {
    const resolved = typeof value === 'function' ? (value as () => unknown)() : unref(value);
    return Boolean(resolved);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[useJobQueue] Failed to resolve boolean option', error);
    }
    return Boolean(value);
  }
};

const resolveNumber = (value?: MaybeRefOrGetter<number>, fallback = DEFAULT_POLL_INTERVAL): number => {
  if (value === undefined) {
    return fallback;
  }

  try {
    const resolved = typeof value === 'function' ? (value as () => unknown)() : unref(value);
    const numeric = Number(resolved);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
    return fallback;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[useJobQueue] Failed to resolve numeric option', error);
    }
    return fallback;
  }
};

const normaliseProgress = (value: unknown, fallback = 0): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(numeric)));
};

const pickJobId = (record: JobRecord): string | null => {
  const rawId = record.id ?? record.jobId;
  if (rawId == null) {
    return null;
  }
  const id = typeof rawId === 'number' || typeof rawId === 'string' ? String(rawId) : '';
  return id.trim().length > 0 ? id : null;
};

const extractErrorMessage = (record: JobRecord, fallback = 'Unknown error'): string => {
  const error = record.error;
  const message = record.message;

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return fallback;
};

export const useJobQueue = (options: UseJobQueueOptions = {}) => {
  const pollIntervalMs = computed(() => resolveNumber(options.pollInterval));
  const isDisabled = computed(() => resolveBoolean(options.disabled));

  const appStore = useAppStore();
  const { activeJobs } = storeToRefs(appStore);
  const notifications = useNotifications();
  const backendBase = useBackendBase();

  const isReady = ref(false);
  const isPolling = ref(false);
  const isCancelling = ref(false);
  const apiAvailable = ref(true);
  const pollTimer = ref<ReturnType<typeof setInterval> | null>(null);
  const lastPrimaryFailureLogAt = ref<number | null>(null);
  const legacyEndpointMissing = ref(false);
  const legacyMissingLogged = ref(false);

  const logPrimaryFailure = (error: unknown) => {
    if (!import.meta.env.DEV) {
      return;
    }

    const now = Date.now();
    if (!lastPrimaryFailureLogAt.value || now - lastPrimaryFailureLogAt.value >= PRIMARY_FAILURE_LOG_COOLDOWN) {
      console.info('[JobQueue] Generation endpoint unavailable, falling back', error);
      lastPrimaryFailureLogAt.value = now;
    }
  };

  const applyJobRecord = (record: JobRecord) => {
    const jobId = pickJobId(record);
    if (!jobId) {
      return;
    }

    const existing = activeJobs.value.find((job) => job.id === jobId || job.jobId === jobId);
    const wasTracked = Boolean(existing);
    const rawStatus = typeof record.status === 'string' ? record.status : null;
    const status = normalizeJobStatus(rawStatus ?? (existing?.status ?? undefined));

    if (status === 'completed') {
      if (record.result) {
        appStore.addResult(record.result as GenerationResult);
      }
      if (wasTracked) {
        appStore.removeJob(existing!.id);
        notifications.showSuccess('Generation completed!');
      }
      return;
    }

    if (status === 'failed') {
      if (wasTracked) {
        appStore.removeJob(existing!.id);
        const errorMessage = extractErrorMessage(record);
        if (rawStatus?.toLowerCase() === 'cancelled') {
          notifications.showInfo('Generation cancelled');
        } else {
          notifications.showError(`Generation failed: ${errorMessage}`);
        }
      }
      return;
    }

    const progress = normaliseProgress(record.progress ?? existing?.progress ?? 0, 0);
    const message = typeof record.message === 'string' ? record.message : existing?.message;
    const params =
      record.params && typeof record.params === 'object'
        ? (record.params as GenerationJob['params'])
        : existing?.params;

    const updates: Partial<GenerationJob> = {
      status,
      progress,
      message,
      params,
    };

    if (typeof record.name === 'string') {
      updates.name = record.name;
    }

    if (typeof record.prompt === 'string') {
      updates.prompt = record.prompt;
    }

    if (!wasTracked) {
      appStore.addJob({
        id: jobId,
        jobId: typeof record.jobId === 'string' ? record.jobId : undefined,
        startTime:
          typeof record.startTime === 'string' && record.startTime.trim()
            ? record.startTime
            : new Date().toISOString(),
        ...updates,
      });
      return;
    }

    appStore.updateJob(existing!.id, updates);
  };

  const refresh = async () => {
    if (isPolling.value || isDisabled.value || !apiAvailable.value) {
      if (!isReady.value) {
        isReady.value = true;
      }
      return;
    }

    isPolling.value = true;

    try {
      let records: JobRecord[] | null = null;

      try {
        records = await fetchActiveGenerationJobs(backendBase.value);
        apiAvailable.value = true;
        lastPrimaryFailureLogAt.value = null;
      } catch (error) {
        logPrimaryFailure(error);

        if (legacyEndpointMissing.value) {
          return;
        }

        try {
          records = await fetchLegacyJobStatuses(backendBase.value);
          apiAvailable.value = true;
          legacyEndpointMissing.value = false;
          legacyMissingLogged.value = false;
        } catch (fallbackError) {
          if (fallbackError instanceof ApiError && fallbackError.status === 404) {
            legacyEndpointMissing.value = true;
            if (import.meta.env.DEV && !legacyMissingLogged.value) {
              console.info('[JobQueue] Legacy job endpoint missing, continuing without fallback');
              legacyMissingLogged.value = true;
            }
          } else if (import.meta.env.DEV) {
            console.info('[JobQueue] Legacy job endpoint failed', fallbackError);
          }
          return;
        }
      }

      if (!records?.length) {
        return;
      }

      records.forEach(applyJobRecord);
    } finally {
      isPolling.value = false;
      if (!isReady.value) {
        isReady.value = true;
      }
    }
  };

  const startPolling = () => {
    if (pollTimer.value || isDisabled.value) {
      if (!isReady.value) {
        isReady.value = true;
      }
      return;
    }

    isReady.value = true;
    void refresh();

    pollTimer.value = setInterval(() => {
      if (!isPolling.value && !isDisabled.value && apiAvailable.value) {
        void refresh();
      }
    }, pollIntervalMs.value);
  };

  const stopPolling = () => {
    if (pollTimer.value) {
      clearInterval(pollTimer.value);
      pollTimer.value = null;
    }
    isPolling.value = false;
  };

  const cancelJob = async (jobId: string): Promise<boolean> => {
    if (!jobId || isCancelling.value) {
      return false;
    }

    const job = activeJobs.value.find((item) => item.id === jobId);
    if (!job) {
      notifications.showError('Job not found');
      return false;
    }

    const backendJobId = job.jobId ?? job.id;
    if (!backendJobId) {
      notifications.showError('Job not found');
      return false;
    }

    isCancelling.value = true;

    try {
      let cancelled = false;

      try {
        const response = await cancelGenerationJob(backendJobId, backendBase.value);
        cancelled = response?.success !== false;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.info('[JobQueue] Generation cancellation failed, retrying legacy endpoint', error);
        }
      }

      if (!cancelled) {
        try {
          cancelled = await cancelLegacyJob(backendJobId, backendBase.value);
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('[JobQueue] Legacy cancellation failed', error);
          }
          cancelled = false;
        }
      }

      if (!cancelled) {
        notifications.showError('Failed to cancel job');
        return false;
      }

      appStore.removeJob(jobId);
      notifications.showInfo('Job cancelled');
      return true;
    } finally {
      isCancelling.value = false;
    }
  };

  const clearCompletedJobs = () => {
    appStore.clearCompletedJobs();
  };

  watch(isDisabled, (nextDisabled) => {
    if (nextDisabled) {
      stopPolling();
    } else if (!pollTimer.value && apiAvailable.value) {
      startPolling();
    }
  });

  watch(pollIntervalMs, () => {
    if (pollTimer.value) {
      stopPolling();
      startPolling();
    }
  });

  onMounted(() => {
    startPolling();
  });

  onBeforeUnmount(() => {
    stopPolling();
  });

  return {
    jobs: activeJobs,
    isReady,
    isPolling,
    isCancelling,
    apiAvailable,
    refresh,
    startPolling,
    stopPolling,
    cancelJob,
    clearCompletedJobs,
  } as const;
};

export type UseJobQueueReturn = ReturnType<typeof useJobQueue>;
