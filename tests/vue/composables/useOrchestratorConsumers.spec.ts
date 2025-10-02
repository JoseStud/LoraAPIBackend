import { describe, it, expect, vi } from 'vitest';
import { ref, shallowRef } from 'vue';

import {
  useOrchestratorConsumers,
  HISTORY_LIMIT_WHEN_SHOWING,
} from '@/features/generation/composables/useOrchestratorConsumers';
import { DEFAULT_HISTORY_LIMIT } from '@/features/generation/stores/useGenerationOrchestratorStore';
import type { GenerationOrchestratorManagerStore } from '@/features/generation/stores/orchestratorManagerStore';

const createManagerStore = () => {
  const consumers = shallowRef(new Map());

  const managerStore = {
    consumers,
    registerConsumer: vi.fn((consumer) => {
      consumers.value.set(consumer.id, consumer);
    }),
    unregisterConsumer: vi.fn((id: symbol) => {
      consumers.value.delete(id);
    }),
  } as unknown as Pick<
    GenerationOrchestratorManagerStore,
    'consumers' | 'registerConsumer' | 'unregisterConsumer'
  >;

  return managerStore;
};

describe('useOrchestratorConsumers', () => {
  it('registers and unregisters consumers while tracking history visibility', () => {
    const managerStore = createManagerStore();
    const historyVisibility = ref(false);

    const consumers = useOrchestratorConsumers({ managerStore });

    expect(consumers.historyLimit.value).toBe(DEFAULT_HISTORY_LIMIT);

    const { release, id } = consumers.acquireConsumer({
      notify: vi.fn(),
      debug: vi.fn(),
      historyVisibility,
      autoSync: { backendUrl: true, historyLimit: true },
    });

    expect(managerStore.registerConsumer).toHaveBeenCalled();
    expect(managerStore.consumers.value.has(id)).toBe(true);

    historyVisibility.value = true;
    expect(consumers.historyLimit.value).toBe(HISTORY_LIMIT_WHEN_SHOWING);

    release();

    expect(managerStore.unregisterConsumer).toHaveBeenCalledWith(id);
    expect(consumers.historyLimit.value).toBe(DEFAULT_HISTORY_LIMIT);
  });

  it('reports auto-sync capabilities from registered consumers', () => {
    const managerStore = createManagerStore();
    const consumers = useOrchestratorConsumers({ managerStore });

    expect(consumers.hasHistoryAutoSync()).toBe(false);
    expect(consumers.hasBackendAutoSync()).toBe(false);

    const first = consumers.acquireConsumer({
      notify: vi.fn(),
      autoSync: { historyLimit: true, backendUrl: false },
    });

    expect(consumers.hasHistoryAutoSync()).toBe(true);
    expect(consumers.hasBackendAutoSync()).toBe(false);

    const second = consumers.acquireConsumer({
      notify: vi.fn(),
      autoSync: { historyLimit: false, backendUrl: true },
    });

    expect(consumers.hasHistoryAutoSync()).toBe(true);
    expect(consumers.hasBackendAutoSync()).toBe(true);

    first.release();
    expect(consumers.hasHistoryAutoSync()).toBe(false);
    expect(consumers.hasBackendAutoSync()).toBe(true);

    second.release();
    expect(consumers.hasBackendAutoSync()).toBe(false);
  });
});

