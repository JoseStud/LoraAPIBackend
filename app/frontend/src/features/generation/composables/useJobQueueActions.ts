import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue';

import {
  useGenerationOrchestratorManager,
  type GenerationOrchestratorBinding,
} from './useGenerationOrchestratorManager';
import { useGenerationWidgetBinding } from './useGenerationWidgetBinding';
import { useGenerationOrchestratorFacade } from '@/features/generation/orchestrator';
import type { ReadonlyQueue } from '@/features/generation/orchestrator';
import { useNotifications } from '@/composables/shared';
import type { NotificationType } from '@/types';

/**
 * Read-only view of the shared queue for the JobQueue widget. Holds an orchestrator binding while
 * mounted; the job list mirrors the manager's sorted active jobs.
 */
export const useJobQueue = () => {
  const facade = useGenerationOrchestratorFacade();
  useGenerationWidgetBinding('JobQueue');

  const jobs = computed<ReadonlyQueue>(() => facade.sortedActiveJobs.value);

  return {
    jobs,
    isReady: computed(() => true),
    queueManagerActive: facade.queueManagerActive,
  } as const;
};

export type UseJobQueueReturn = ReturnType<typeof useJobQueue>;

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
      // eslint-disable-next-line no-console -- dev-only debug sink for the orchestrator binding
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
    const normalizedJobId = jobId.trim();

    if (!normalizedJobId || isCancelling.value) {
      return false;
    }

    const binding = ensureBinding();

    const job = generationFacade.activeJobs.value.find(
      (item) =>
        item.id === normalizedJobId ||
        item.uiId === normalizedJobId ||
        item.backendId === normalizedJobId,
    );

    if (!job) {
      dispatchToast('Job not found', 'error');
      return false;
    }

    isCancelling.value = true;

    try {
      await binding.cancelJob(job.backendId);
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
    ensureBinding().clearCompletedJobs();
  };

  const removeJob = (jobId: string | number): void => {
    ensureBinding().removeJob(String(jobId).trim());
  };

  return {
    isCancelling,
    cancelJob,
    clearCompletedJobs,
    removeJob,
  } as const;
};

export type UseJobQueueActionsReturn = ReturnType<typeof useJobQueueActions>;
