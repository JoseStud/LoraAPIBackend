import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/generation/stores/orchestrator/transportAdapter', () => ({
  createGenerationTransportAdapter: vi.fn(),
}));

import { createGenerationTransportAdapter } from '@/features/generation/stores/orchestrator/transportAdapter';
import { useGenerationOrchestratorFacade } from '@/features/generation/orchestrator';
import { useGenerationOrchestratorManagerStore } from '@/features/generation/stores/orchestratorManagerStore';
import { useGenerationOrchestratorStore } from '@/features/generation/stores/useGenerationOrchestratorStore';

describe('useGenerationOrchestratorFacade', () => {
  it('mirrors the orchestrator store from every call site', () => {
    const store = useGenerationOrchestratorStore();
    const first = useGenerationOrchestratorFacade();
    const second = useGenerationOrchestratorFacade();

    store.enqueueJob({ id: 'job-1', status: 'processing', progress: 0.1 } as any);
    store.setResults([{ id: 'result-1', created_at: new Date().toISOString() } as any]);

    for (const facade of [first, second]) {
      expect(facade.queue.value.map((job) => job.id)).toEqual(['job-1']);
      expect(facade.activeJobs.value.map((job) => job.id)).toEqual(['job-1']);
      expect(facade.hasActiveJobs.value).toBe(true);
      expect(facade.results.value.map((result) => result.id)).toEqual(['result-1']);
    }
  });

  it('has no lifecycle: reading it registers no consumer and starts no transport', () => {
    const managerStore = useGenerationOrchestratorManagerStore();
    const facade = useGenerationOrchestratorFacade();

    void facade.queue.value;
    void facade.systemStatus.value;
    void facade.transportPauseReasons.value;

    expect(managerStore.consumers.size).toBe(0);
    expect(managerStore.orchestrator).toBeNull();
    expect(createGenerationTransportAdapter).not.toHaveBeenCalled();
    expect('ensureInitialized' in facade).toBe(false);
    expect('cancelJob' in facade).toBe(false);
  });
});
