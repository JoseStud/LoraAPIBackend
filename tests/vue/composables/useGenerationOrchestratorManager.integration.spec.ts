import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia, defineStore } from 'pinia';
import { computed, nextTick, ref } from 'vue';

vi.mock('@/features/generation/composables/createGenerationTransportAdapter', () => ({
  createGenerationTransportAdapter: vi.fn(),
}));

import { createGenerationTransportAdapter } from '@/features/generation/composables/createGenerationTransportAdapter';
import { createUseGenerationOrchestratorManager } from '@/features/generation/composables/useGenerationOrchestratorManager';
import { HISTORY_LIMIT_WHEN_SHOWING } from '@/features/generation/composables/useOrchestratorConsumers';
import { useGenerationOrchestratorStore, DEFAULT_HISTORY_LIMIT } from '@/features/generation/stores/useGenerationOrchestratorStore';
import { useGenerationOrchestratorManagerStore } from '@/features/generation/stores/orchestratorManagerStore';
import { useBackendUrl } from '@/utils/backend';

const useStubSettingsStore = defineStore('stub-settings', () => {
  const backendUrl = ref('http://localhost');
  return { backendUrl };
});

const createTransportMock = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  refreshSystemStatus: vi.fn().mockResolvedValue(undefined),
  refreshActiveJobs: vi.fn().mockResolvedValue(undefined),
  refreshRecentResults: vi.fn().mockResolvedValue(undefined),
  refreshAll: vi.fn().mockResolvedValue(undefined),
  startGeneration: vi.fn().mockResolvedValue({ job_id: 'job-1' } as any),
  cancelJob: vi.fn().mockResolvedValue(undefined),
  deleteResult: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  resume: vi.fn().mockResolvedValue(undefined),
  reconnect: vi.fn(),
  setPollInterval: vi.fn(),
  clear: vi.fn(),
});

describe('useGenerationOrchestratorManager integration', () => {
  const createTransportAdapterMock = vi.mocked(createGenerationTransportAdapter);
  let transport: ReturnType<typeof createTransportMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    transport = createTransportMock();
    createTransportAdapterMock.mockReturnValue(transport);
  });

  it('reacts to UI and backend changes through orchestrator watchers', async () => {
    const managerStore = useGenerationOrchestratorManagerStore();
    const orchestratorStore = useGenerationOrchestratorStore();
    const settingsStore = useStubSettingsStore();
    const historyVisibility = ref(false);

    const backendUrlRef = computed(() => settingsStore.backendUrl as string);

    const useManager = createUseGenerationOrchestratorManager({
      useGenerationOrchestratorManagerStore: () => managerStore,
      useGenerationOrchestratorStore: () => orchestratorStore,
      useBackendUrl: (() => backendUrlRef) as unknown as typeof useBackendUrl,
    });

    const manager = useManager();

    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility });
    await binding.initialize();

    const resolveHistoryLimit = (): number | undefined => {
      const limit = orchestratorStore.historyLimit as unknown;
      if (typeof limit === 'number') {
        return limit;
      }
      if (limit && typeof (limit as { value?: number }).value === 'number') {
        return (limit as { value: number }).value;
      }
      return undefined;
    };

    expect(resolveHistoryLimit()).toBe(DEFAULT_HISTORY_LIMIT);

    historyVisibility.value = true;
    await nextTick();
    await Promise.resolve();

    expect(resolveHistoryLimit()).toBe(HISTORY_LIMIT_WHEN_SHOWING);
    expect(transport.refreshRecentResults).toHaveBeenCalledWith(HISTORY_LIMIT_WHEN_SHOWING, false);

    const initialReconnectCalls = transport.reconnect.mock.calls.length;
    const initialRefreshAllCalls = transport.refreshAll.mock.calls.length;

    settingsStore.backendUrl = 'http://example.com';
    await nextTick();
    await Promise.resolve();

    expect(transport.reconnect.mock.calls.length).toBe(initialReconnectCalls + 1);
    expect(transport.refreshAll.mock.calls.length).toBe(initialRefreshAllCalls + 1);
    expect(transport.refreshAll).toHaveBeenLastCalledWith(resolveHistoryLimit());

    const refreshCallCount = transport.refreshRecentResults.mock.calls.length;
    const reconnectCallCount = transport.reconnect.mock.calls.length;
    const refreshAllCallCount = transport.refreshAll.mock.calls.length;
    binding.release();

    historyVisibility.value = false;
    await nextTick();
    await Promise.resolve();

    expect(transport.refreshRecentResults.mock.calls.length).toBe(refreshCallCount);

    settingsStore.backendUrl = 'http://release.example.com';
    await nextTick();
    await Promise.resolve();

    expect(transport.reconnect.mock.calls.length).toBe(reconnectCallCount);
    expect(transport.refreshAll.mock.calls.length).toBe(refreshAllCallCount);
  });

  it('deduplicates auto-sync watchers across consumers and honors opt-out flags', async () => {
    const managerStore = useGenerationOrchestratorManagerStore();
    const orchestratorStore = useGenerationOrchestratorStore();
    const settingsStore = useStubSettingsStore();
    const firstHistoryVisibility = ref(false);
    const secondHistoryVisibility = ref(false);
    const thirdHistoryVisibility = ref(false);

    const backendUrlRef = computed(() => settingsStore.backendUrl as string);

    const useManager = createUseGenerationOrchestratorManager({
      useGenerationOrchestratorManagerStore: () => managerStore,
      useGenerationOrchestratorStore: () => orchestratorStore,
      useBackendUrl: (() => backendUrlRef) as unknown as typeof useBackendUrl,
    });

    const manager = useManager();

    const first = manager.acquire({
      notify: vi.fn(),
      debug: vi.fn(),
      historyVisibility: firstHistoryVisibility,
    });
    const second = manager.acquire({
      notify: vi.fn(),
      debug: vi.fn(),
      historyVisibility: secondHistoryVisibility,
    });

    await first.initialize();
    await second.initialize();

    firstHistoryVisibility.value = true;
    await nextTick();
    await Promise.resolve();

    const initialHistoryCalls = transport.refreshRecentResults.mock.calls.length;

    firstHistoryVisibility.value = false;
    await nextTick();
    await Promise.resolve();

    expect(transport.refreshRecentResults.mock.calls.length).toBe(initialHistoryCalls + 1);

    const initialRefreshAllCalls = transport.refreshAll.mock.calls.length;
    settingsStore.backendUrl = 'http://multi.example.com';
    await nextTick();
    await Promise.resolve();

    expect(transport.refreshAll.mock.calls.length).toBe(initialRefreshAllCalls + 1);

    const third = manager.acquire({
      notify: vi.fn(),
      debug: vi.fn(),
      autoSync: false,
      historyVisibility: thirdHistoryVisibility,
    });
    await third.initialize();

    first.release();
    second.release();

    const historyCallsBefore = transport.refreshRecentResults.mock.calls.length;
    thirdHistoryVisibility.value = true;
    await nextTick();
    await Promise.resolve();
    expect(transport.refreshRecentResults.mock.calls.length).toBe(historyCallsBefore);

    const refreshAllCallsBefore = transport.refreshAll.mock.calls.length;
    settingsStore.backendUrl = 'http://optout.example.com';
    await nextTick();
    await Promise.resolve();
    expect(transport.refreshAll.mock.calls.length).toBe(refreshAllCallsBefore);

    third.release();
  });

  it('translates UI job ids to backend ids when cancelling through the binding', async () => {
    const managerStore = useGenerationOrchestratorManagerStore();
    const orchestratorStore = useGenerationOrchestratorStore();
    const settingsStore = useStubSettingsStore();
    const historyVisibility = ref(false);

    const backendUrlRef = computed(() => settingsStore.backendUrl as string);

    const useManager = createUseGenerationOrchestratorManager({
      useGenerationOrchestratorManagerStore: () => managerStore,
      useGenerationOrchestratorStore: () => orchestratorStore,
      useBackendUrl: (() => backendUrlRef) as unknown as typeof useBackendUrl,
    });

    const manager = useManager();
    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility });
    await binding.initialize();

    orchestratorStore.enqueueJob({
      id: 'job-99',
      uiId: 'job-99',
      jobId: 'backend-99',
      backendId: 'backend-99',
      status: 'queued',
      progress: 0,
    });

    transport.cancelJob.mockClear();

    await binding.cancelJob('job-99');

    expect(transport.cancelJob).toHaveBeenCalledWith('backend-99');

    binding.release();
  });
});
