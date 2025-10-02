import { describe, it, expect, vi } from 'vitest';
import { computed, ref, nextTick } from 'vue';

import { useOrchestratorEffects } from '@/features/generation/composables/useOrchestratorEffects';
import type { GenerationOrchestratorStore } from '@/features/generation/stores/useGenerationOrchestratorStore';

const createOrchestrator = () => ({
  setHistoryLimit: vi.fn(),
  loadRecentResults: vi.fn().mockResolvedValue(undefined),
  handleBackendUrlChange: vi.fn().mockResolvedValue(undefined),
} as unknown as Pick<
  GenerationOrchestratorStore,
  'setHistoryLimit' | 'loadRecentResults' | 'handleBackendUrlChange'
>);

describe('useOrchestratorEffects', () => {
  it('reacts to history limit changes when auto-sync is enabled', async () => {
    const historyLimit = ref(10);
    const backendUrl = ref('http://localhost');
    const isInitialized = ref(false);
    const orchestrator = createOrchestrator();
    const ensureOrchestrator = vi.fn(() => orchestrator as GenerationOrchestratorStore);

    const effects = useOrchestratorEffects({
      historyLimit: computed(() => historyLimit.value),
      backendUrl: computed(() => backendUrl.value),
      isInitialized,
      ensureOrchestrator,
    });

    effects.updateAutoSyncWatchers({ history: true, backend: false });

    historyLimit.value = 20;
    await nextTick();

    expect(orchestrator.setHistoryLimit).not.toHaveBeenCalled();

    isInitialized.value = true;
    historyLimit.value = 30;
    await nextTick();

    expect(orchestrator.setHistoryLimit).toHaveBeenCalledWith(30);
    expect(orchestrator.loadRecentResults).toHaveBeenCalledWith(false);

    effects.stopAllWatchers();
    historyLimit.value = 40;
    await nextTick();
    expect(orchestrator.setHistoryLimit).toHaveBeenCalledTimes(1);
  });

  it('reacts to backend URL changes when auto-sync is enabled', async () => {
    const historyLimit = ref(10);
    const backendUrl = ref('http://one');
    const isInitialized = ref(true);
    const orchestrator = createOrchestrator();
    const ensureOrchestrator = vi.fn(() => orchestrator as GenerationOrchestratorStore);

    const effects = useOrchestratorEffects({
      historyLimit: computed(() => historyLimit.value),
      backendUrl: computed(() => backendUrl.value),
      isInitialized,
      ensureOrchestrator,
    });

    effects.updateAutoSyncWatchers({ history: false, backend: true });

    backendUrl.value = 'http://two';
    await nextTick();

    expect(orchestrator.handleBackendUrlChange).toHaveBeenCalledTimes(1);

    effects.updateAutoSyncWatchers({ history: false, backend: false });
    backendUrl.value = 'http://three';
    await nextTick();
    expect(orchestrator.handleBackendUrlChange).toHaveBeenCalledTimes(1);
  });
});

