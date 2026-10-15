import type { GenerationOrchestratorFacade } from '@/features/generation/orchestrator';

declare const facade: GenerationOrchestratorFacade;

// @ts-expect-error Generation queue is read-only.
facade.queue.value[0] = undefined;
// @ts-expect-error Generation results are read-only.
facade.results.value[0] = undefined;

// The façade is a view: lifecycle and commands live on bindings from `acquire()`.
// @ts-expect-error No lifecycle on the façade.
void facade.ensureInitialized;
// @ts-expect-error No commands on the façade.
void facade.cancelJob;

export {};
