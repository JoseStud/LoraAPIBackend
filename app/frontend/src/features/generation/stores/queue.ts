import { useGenerationOrchestratorStore } from './useGenerationOrchestratorStore';

export type { GenerationJobInput } from './useGenerationOrchestratorStore';

export type GenerationQueueStore = ReturnType<typeof useGenerationOrchestratorStore>;

export const useGenerationQueueStore = (): GenerationQueueStore => useGenerationOrchestratorStore();
