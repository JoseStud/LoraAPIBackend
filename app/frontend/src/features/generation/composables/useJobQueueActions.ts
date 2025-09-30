import { ref, unref, type MaybeRefOrGetter } from 'vue';
import { storeToRefs } from 'pinia';

import { cancelGenerationJob } from '../services/generationService';
import { useGenerationQueueStore } from '../stores/queue';
import { useNotifications } from '@/composables/shared';
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
      notifications.showToastError('Job not found');
      return false;
    }

    const backendJobIdRaw = job.jobId ?? job.id;
    if (!backendJobIdRaw) {
      notifications.showToastError('Job not found');
      return false;
    }

    const backendJobId = String(backendJobIdRaw);

    isCancelling.value = true;

    try {
      const backendBaseUrl = resolveBackendBase();
      try {
        const response = await cancelGenerationJob(backendJobId, backendBaseUrl);
        const cancelled = response?.success !== false;
        if (!cancelled) {
          notifications.showToastError('Failed to cancel job');
          return false;
        }

        queueStore.removeJob(jobId);
        notifications.showToastInfo('Job cancelled');
        return true;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[JobQueue] Failed to cancel generation job', error);
        }
        notifications.showToastError('Failed to cancel job');
        return false;
      }
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
