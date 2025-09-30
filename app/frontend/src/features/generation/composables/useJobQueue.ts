import { computed } from 'vue';

import { useGenerationOrchestratorManager } from './useGenerationOrchestratorManager';

export const useJobQueue = () => {
  const manager = useGenerationOrchestratorManager();

  return {
    jobs: manager.sortedActiveJobs,
    isReady: computed(() => true),
    queueManagerActive: manager.queueManagerActive,
  } as const;
};

export type UseJobQueueReturn = ReturnType<typeof useJobQueue>;
