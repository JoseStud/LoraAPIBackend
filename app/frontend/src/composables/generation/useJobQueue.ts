import { computed, unref, type MaybeRefOrGetter } from 'vue';
import { storeToRefs } from 'pinia';

import { useGenerationQueueStore, useGenerationResultsStore } from '@/stores/generation';
import { useBackendBase } from '@/utils/backend';
import type { GenerationJob, GenerationJobStatus, GenerationResult } from '@/types';
import { normalizeJobStatus } from '@/utils/status';
import { useNotifications } from '@/composables/shared';
import type { UseNotificationsReturn } from '@/composables/shared';

import { useJobQueueTransport } from '@/composables/generation';
import { useJobQueuePolling } from '@/composables/generation';

const DEFAULT_POLL_INTERVAL = 2000;

export interface UseJobQueueOptions {
  pollInterval?: MaybeRefOrGetter<number>;
  disabled?: MaybeRefOrGetter<boolean>;
}

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

const resolveNumber = (
  value?: MaybeRefOrGetter<number>,
  fallback = DEFAULT_POLL_INTERVAL,
): number => {
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

const pickJobId = (record: GenerationJobStatus): string | null => {
  const rawId = record.id ?? record.jobId;
  if (rawId == null) {
    return null;
  }
  const id = typeof rawId === 'number' || typeof rawId === 'string' ? String(rawId) : '';
  return id.trim().length > 0 ? id : null;
};

const extractErrorMessage = (record: GenerationJobStatus, fallback = 'Unknown error'): string => {
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

const isGenerationResult = (value: unknown): value is GenerationResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const { id } = value as { id?: unknown };
  return typeof id === 'string' || typeof id === 'number';
};

const applyJobRecord = (
  record: GenerationJobStatus,
  getActiveJobs: () => ReadonlyArray<GenerationJob>,
  queueStore: ReturnType<typeof useGenerationQueueStore>,
  resultsStore: ReturnType<typeof useGenerationResultsStore>,
  notifications: Pick<
    UseNotificationsReturn,
    'showToastSuccess' | 'showToastError' | 'showToastInfo'
  >,
): void => {
  const jobId = pickJobId(record);
  if (!jobId) {
    return;
  }

  const currentJobs = getActiveJobs();
  const existing = currentJobs.find((job) => job.id === jobId || job.jobId === jobId);
  const wasTracked = Boolean(existing);
  const rawStatus = typeof record.status === 'string' ? record.status : null;
  const status = normalizeJobStatus(rawStatus ?? (existing?.status ?? undefined));

  if (status === 'completed') {
    if (isGenerationResult(record.result)) {
      resultsStore.addResult(record.result);
    }
    if (wasTracked && existing) {
      queueStore.removeJob(existing.id);
      notifications.showToastSuccess('Generation completed!');
    }
    return;
  }

  if (status === 'failed') {
    if (wasTracked && existing) {
      queueStore.removeJob(existing.id);
      const errorMessage = extractErrorMessage(record);
      if (rawStatus?.toLowerCase() === 'cancelled') {
        notifications.showToastInfo('Generation cancelled');
      } else {
        notifications.showToastError(`Generation failed: ${errorMessage}`);
      }
    }
    return;
  }

  const progress = normaliseProgress(
    typeof record.progress === 'number' ? record.progress : existing?.progress ?? 0,
    0,
  );
  const message = typeof record.message === 'string' ? record.message : existing?.message;
  const params = record.params ?? existing?.params ?? null;

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
    queueStore.enqueueJob({
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

  queueStore.updateJob(existing!.id, updates);
};

export const useJobQueue = (options: UseJobQueueOptions = {}) => {
  const pollInterval = computed(() => resolveNumber(options.pollInterval));
  const isDisabled = computed(() => resolveBoolean(options.disabled));

  const queueStore = useGenerationQueueStore();
  const resultsStore = useGenerationResultsStore();
  const { activeJobs } = storeToRefs(queueStore);
  const backendBase = useBackendBase();
  const notifications = useNotifications();

  const transport = useJobQueueTransport({ backendBase });

  const polling = useJobQueuePolling({
    disabled: isDisabled,
    pollInterval,
    fetchJobs: transport.fetchJobs,
    onRecord: (record) =>
      applyJobRecord(
        record,
        () => activeJobs.value,
        queueStore,
        resultsStore,
        notifications,
      ),
  });

  return {
    jobs: activeJobs,
    isReady: polling.isReady,
    isPolling: polling.isPolling,
    refresh: polling.refresh,
    startPolling: polling.startPolling,
    stopPolling: polling.stopPolling,
  } as const;
};

export type UseJobQueueReturn = ReturnType<typeof useJobQueue>;
