import { getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue';

import { useGenerationOrchestratorManager, type GenerationOrchestratorBinding } from './useGenerationOrchestratorManager';
import { useGenerationQueueStore } from '../stores/queue';
import { useNotifications } from '@/composables/shared';
import type { NotificationType } from '@/types';

export interface UseJobQueueActionsOptions {}

export const useJobQueueActions = (_options: UseJobQueueActionsOptions = {}) => {
  const queueStore = useGenerationQueueStore();
  const orchestratorManager = useGenerationOrchestratorManager();
  const notifications = useNotifications();

  const orchestratorBinding = shallowRef<GenerationOrchestratorBinding | null>(null);
  const isCancelling = ref(false);

  const dispatchToast = (message: string, type: NotificationType = 'info'): void => {
    notifications.showToast(message, type);
  };

  const debug = (...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console.debug('[JobQueueActions]', ...args);
    }
  };

  const ensureBinding = (): GenerationOrchestratorBinding => {
    if (!orchestratorBinding.value) {
      orchestratorBinding.value = orchestratorManager.acquire({
        notify: dispatchToast,
        debug,
      });
    }

    return orchestratorBinding.value;
  };

  const releaseBinding = (): void => {
    if (!orchestratorBinding.value) {
      return;
    }

    orchestratorBinding.value.release();
    orchestratorBinding.value = null;
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      releaseBinding();
    });
  }

  const cancelJob = async (jobId: string): Promise<boolean> => {
    if (!jobId || isCancelling.value) {
      return false;
    }

    const job = orchestratorManager.activeJobs.value.find(
      (item) => item.id === jobId || String(item.jobId ?? '') === jobId,
    );

    if (!job) {
      dispatchToast('Job not found', 'error');
      return false;
    }

    const queueJobId = typeof job.id === 'string' ? job.id : String(job.id ?? jobId);

    isCancelling.value = true;

    try {
      await ensureBinding().cancelJob(queueJobId);
      return true;
    } catch (error) {
      debug('Failed to cancel job', error);
      dispatchToast('Failed to cancel job', 'error');
      return false;
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
