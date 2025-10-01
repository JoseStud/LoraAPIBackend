import { getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue';

import {
  useGenerationOrchestratorManager,
  type GenerationOrchestratorBinding,
} from './useGenerationOrchestratorManager';
import { useGenerationOrchestratorFacade } from '@/features/generation/orchestrator';
import { useNotifications } from '@/composables/shared';
import type { NotificationType } from '@/types';

export interface UseJobQueueActionsOptions {}

export const useJobQueueActions = (_options: UseJobQueueActionsOptions = {}) => {
  const generationFacade = useGenerationOrchestratorFacade();
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

    ensureBinding();

    const activeJobs = generationFacade.activeJobs.value;
    const job = activeJobs.find((item) => {
      const backendJobId = (item as { jobId?: string | number }).jobId;
      return item.id === jobId || String(backendJobId ?? '') === jobId;
    });

    if (!job) {
      dispatchToast('Job not found', 'error');
      return false;
    }

    const backendJobId = (job as { jobId?: string | number }).jobId;
    const candidateId = backendJobId ?? job.id ?? jobId;
    const resolvedJobId = typeof candidateId === 'string' ? candidateId : String(candidateId);

    isCancelling.value = true;

    try {
      await generationFacade.cancelJob(resolvedJobId);
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
    ensureBinding();
    generationFacade.clearCompletedJobs();
  };

  const removeJob = (jobId: string | number): void => {
    ensureBinding();
    generationFacade.removeJob(jobId);
  };

  return {
    isCancelling,
    cancelJob,
    clearCompletedJobs,
    removeJob,
  } as const;
};

export type UseJobQueueActionsReturn = ReturnType<typeof useJobQueueActions>;
