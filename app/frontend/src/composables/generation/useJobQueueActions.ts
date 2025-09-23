import { ref, unref, type MaybeRefOrGetter } from 'vue';
import { storeToRefs } from 'pinia';

import { cancelGenerationJob, cancelLegacyJob } from '@/services/generationService';
import { useGenerationQueueStore } from '@/stores/generation';
import { useNotifications } from '@/composables/useNotifications';
import { useBackendBase } from '@/utils/backend';

export interface UseJobQueueActionsOptions {
  backendBase?: MaybeRefOrGetter<string>;
}

export const useJobQueueActions = (options: UseJobQueueActionsOptions = {}) => {
  const queueStore = useGenerationQueueStore();
  const notifications = useNotifications();
  const backendBase = options.backendBase ?? useBackendBase();
  const { activeJobs } = storeToRefs(queueStore);

  const isCancelling = ref(false);

  const resolveBackendBase = (): string => {
    try {
      const resolved = typeof backendBase === 'function' ? backendBase() : unref(backendBase);
      return typeof resolved === 'string' ? resolved : '';
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[JobQueue] Failed to resolve backend base for actions', error);
      }
      return '';
    }
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
      const backendBaseUrl = resolveBackendBase();
      let cancelled = false;

      try {
        const response = await cancelGenerationJob(backendJobId, backendBaseUrl);
        cancelled = response?.success !== false;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.info('[JobQueue] Generation cancellation failed, retrying legacy endpoint', error);
        }
      }

      if (!cancelled) {
        try {
          cancelled = await cancelLegacyJob(backendJobId, backendBaseUrl);
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

      queueStore.removeJob(jobId);
      notifications.showInfo('Job cancelled');
      return true;
    } finally {
      isCancelling.value = false;
    }
  };

  const clearCompletedJobs = (): void => {
    queueStore.clearCompletedJobs();
  };

  return {
    isCancelling,
    cancelJob,
    clearCompletedJobs,
  } as const;
};

export type UseJobQueueActionsReturn = ReturnType<typeof useJobQueueActions>;
