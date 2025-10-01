import { useGenerationOrchestratorStore } from './useGenerationOrchestratorStore';

export { MAX_RESULTS, DEFAULT_HISTORY_LIMIT } from './useGenerationOrchestratorStore';

export type GenerationResultsStore = ReturnType<typeof useGenerationOrchestratorStore>;

export const useGenerationResultsStore = (): GenerationResultsStore => useGenerationOrchestratorStore();
