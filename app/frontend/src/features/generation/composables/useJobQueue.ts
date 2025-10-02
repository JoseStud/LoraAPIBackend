import { computed, onBeforeUnmount, onMounted } from 'vue';

import { useGenerationOrchestratorFacade } from '@/features/generation/orchestrator';

export const useJobQueue = () => {
  const facade = useGenerationOrchestratorFacade();

  onMounted(() => {
    void facade
      .ensureInitialized({ readOnly: true })
      .catch((error) => {
        console.error('[useJobQueue] Failed to initialize job queue facade', error);
      });
  });

  onBeforeUnmount(() => {
    facade.releaseIfLastConsumer();
  });

  const jobs = computed(() => facade.sortedActiveJobs.value ?? [])

  return {
    jobs,
    isReady: computed(() => facade.queueManagerActive.value),
    queueManagerActive: facade.queueManagerActive,
  } as const;
};

export type UseJobQueueReturn = ReturnType<typeof useJobQueue>;
