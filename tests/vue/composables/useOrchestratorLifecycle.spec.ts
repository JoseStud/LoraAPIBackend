import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computed, ref, shallowRef } from 'vue';

import { useOrchestratorLifecycle } from '@/features/generation/composables/useOrchestratorLifecycle';
import type { GenerationOrchestratorManagerStore } from '@/features/generation/stores/orchestratorManagerStore';
import type { GenerationOrchestratorStore } from '@/features/generation/stores/useGenerationOrchestratorStore';

const createManagerStore = (orchestrator: GenerationOrchestratorStore) => {
  const store = {
    orchestrator: shallowRef(orchestrator),
    initializationPromise: ref<Promise<void> | null>(null),
    isInitialized: ref(false),
    destroyOrchestrator: vi.fn(() => {
      store.orchestrator.value = null;
    }),
  } as unknown as Pick<
    GenerationOrchestratorManagerStore,
    'orchestrator' | 'initializationPromise' | 'isInitialized' | 'destroyOrchestrator'
  >;

  return store;
};

describe('useOrchestratorLifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes the orchestrator and synchronizes environment state', async () => {
    const orchestrator = {
      initialize: vi.fn().mockResolvedValue(undefined),
      pauseTransport: vi.fn(),
      resumeTransport: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pick<
      GenerationOrchestratorStore,
      'initialize' | 'pauseTransport' | 'resumeTransport'
    >;

    const managerStore = createManagerStore(orchestrator as GenerationOrchestratorStore);

    const lifecycle = useOrchestratorLifecycle({
      managerStore: managerStore as GenerationOrchestratorManagerStore,
      historyLimit: computed(() => 10),
      getBackendUrl: () => 'http://localhost',
      ensureOrchestrator: () => orchestrator as GenerationOrchestratorStore,
      notifyAll: vi.fn(),
      debugAll: vi.fn(),
    });

    await lifecycle.ensureInitialized({});

    expect(orchestrator.initialize).toHaveBeenCalledTimes(1);
    const args = vi.mocked(orchestrator.initialize).mock.calls[0][0];
    expect(args.historyLimit).toBe(10);
    expect(args.getBackendUrl()).toBe('http://localhost');
    expect(managerStore.isInitialized.value).toBe(true);
    expect(orchestrator.resumeTransport).toHaveBeenCalled();
    expect(managerStore.initializationPromise.value).toBeNull();
  });

  it('stops environment listeners on destroy', () => {
    const orchestrator = {
      initialize: vi.fn(),
      pauseTransport: vi.fn(),
      resumeTransport: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pick<
      GenerationOrchestratorStore,
      'initialize' | 'pauseTransport' | 'resumeTransport'
    >;

    const managerStore = createManagerStore(orchestrator as GenerationOrchestratorStore);

    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const windowAddSpy = vi.spyOn(window, 'addEventListener');
    const windowRemoveSpy = vi.spyOn(window, 'removeEventListener');

    const lifecycle = useOrchestratorLifecycle({
      managerStore: managerStore as GenerationOrchestratorManagerStore,
      historyLimit: computed(() => 10),
      getBackendUrl: () => 'http://localhost',
      ensureOrchestrator: () => orchestrator as GenerationOrchestratorStore,
      notifyAll: vi.fn(),
      debugAll: vi.fn(),
    });

    lifecycle.startEnvironmentListeners();
    lifecycle.destroy();

    expect(addSpy).toHaveBeenCalled();
    expect(windowAddSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(windowRemoveSpy).toHaveBeenCalled();
    expect(managerStore.destroyOrchestrator).toHaveBeenCalled();
  });

  it('resets initialization state when initialization fails', async () => {
    const error = new Error('fail');
    const orchestrator = {
      initialize: vi.fn().mockRejectedValue(error),
      pauseTransport: vi.fn(),
      resumeTransport: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pick<
      GenerationOrchestratorStore,
      'initialize' | 'pauseTransport' | 'resumeTransport'
    >;

    const managerStore = createManagerStore(orchestrator as GenerationOrchestratorStore);

    const lifecycle = useOrchestratorLifecycle({
      managerStore: managerStore as GenerationOrchestratorManagerStore,
      historyLimit: computed(() => 10),
      getBackendUrl: () => 'http://localhost',
      ensureOrchestrator: () => orchestrator as GenerationOrchestratorStore,
      notifyAll: vi.fn(),
      debugAll: vi.fn(),
    });

    await expect(lifecycle.ensureInitialized({})).rejects.toThrow(error);
    expect(managerStore.isInitialized.value).toBe(false);
    expect(managerStore.initializationPromise.value).toBeNull();
  });
});

