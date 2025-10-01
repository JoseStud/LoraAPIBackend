import { computed } from 'vue';

import { useGenerationOrchestratorFacade } from '@/features/generation/orchestrator';

export const useJobQueue = () => {
  const facade = useGenerationOrchestratorFacade();

  return {
    jobs: facade.sortedActiveJobs,
    isReady: computed(() => true),
    queueManagerActive: facade.queueManagerActive,
  } as const;
};

export type UseJobQueueReturn = ReturnType<typeof useJobQueue>;
