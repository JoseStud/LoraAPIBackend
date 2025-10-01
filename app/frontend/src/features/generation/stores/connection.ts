/** @internal */
import { useGenerationOrchestratorStore } from './useGenerationOrchestratorStore';

export { DEFAULT_SYSTEM_STATUS, createDefaultSystemStatus } from './useGenerationOrchestratorStore';


export type GenerationConnectionStore = ReturnType<typeof useGenerationOrchestratorStore>;

export const useGenerationConnectionStore = (): GenerationConnectionStore =>
  useGenerationOrchestratorStore();
