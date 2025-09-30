import { useGenerationOrchestratorStore } from './useGenerationOrchestratorStore';

export type { GenerationJobInput } from './useGenerationOrchestratorStore';

export type GenerationQueueStore = ReturnType<typeof useGenerationQueueStore>;

export const useGenerationQueueStore = (): GenerationQueueStore => useGenerationOrchestratorStore();
