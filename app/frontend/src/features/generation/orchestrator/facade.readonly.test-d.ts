import type { GenerationOrchestratorFacade } from '@/features/generation/orchestrator';

declare const facade: GenerationOrchestratorFacade;

// @ts-expect-error Generation queue is read-only.
facade.queue.value[0] = undefined;
// @ts-expect-error Generation results are read-only.
facade.results.value[0] = undefined;

export {};
