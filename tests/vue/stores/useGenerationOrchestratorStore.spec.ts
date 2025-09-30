import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ref } from 'vue';

vi.mock('@/features/generation/composables/createGenerationTransportAdapter', () => ({
  createGenerationTransportAdapter: vi.fn(),
}));

import { createGenerationTransportAdapter } from '@/features/generation/composables/createGenerationTransportAdapter';
import {
  useGenerationOrchestratorStore,
  DEFAULT_HISTORY_LIMIT,
} from '@/features/generation/stores/useGenerationOrchestratorStore';

vi.mock('@/features/generation/stores/systemStatusController', () => ({
  acquireSystemStatusController: vi.fn(() => ({
    controller: {
      ensureHydrated: vi.fn(),
    },
    release: vi.fn(),
  })),
}));

const createTransportMock = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  refreshSystemStatus: vi.fn().mockResolvedValue(undefined),
  refreshActiveJobs: vi.fn().mockResolvedValue(undefined),
  refreshRecentResults: vi.fn().mockResolvedValue(undefined),
  refreshAll: vi.fn().mockResolvedValue(undefined),
  startGeneration: vi
    .fn()
    .mockResolvedValue({ job_id: 'job-1', status: 'queued', progress: 0, steps: 20 } as any),
  cancelJob: vi.fn().mockResolvedValue(undefined),
  deleteResult: vi.fn().mockResolvedValue(undefined),
  reconnect: vi.fn(),
  setPollInterval: vi.fn(),
  clear: vi.fn(),
});

describe('useGenerationOrchestratorStore', () => {
  const createTransportAdapterMock = vi.mocked(createGenerationTransportAdapter);
  let transport: ReturnType<typeof createTransportMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    transport = createTransportMock();
    createTransportAdapterMock.mockReturnValue(transport);
  });

  it('initializes transport and toggles history limits', async () => {
    const store = useGenerationOrchestratorStore();
    const notificationAdapter = { notify: vi.fn(), debug: vi.fn() };
    const showHistory = ref(false);
    const backendUrl = ref<string | null>('http://localhost');

    await store.initialize({
      showHistory,
      configuredBackendUrl: backendUrl,
      notificationAdapter,
    });

    expect(transport.initialize).toHaveBeenCalledWith(DEFAULT_HISTORY_LIMIT);
    expect(store.queueManagerActive).toBeDefined();
    expect(store.queueManagerActive).toBe(true);

    showHistory.value = true;
    await Promise.resolve();

    expect(store.historyLimit).toBeGreaterThan(DEFAULT_HISTORY_LIMIT);
    expect(transport.refreshRecentResults).toHaveBeenCalled();
  });

  it('enqueues and removes jobs through start and cancel actions', async () => {
    const store = useGenerationOrchestratorStore();
    const notificationAdapter = { notify: vi.fn(), debug: vi.fn() };
    const showHistory = ref(false);
    const backendUrl = ref<string | null>('http://localhost');
    transport.startGeneration.mockResolvedValue({ job_id: 'job-1', status: 'queued', progress: 0 } as any);

    await store.initialize({
      showHistory,
      configuredBackendUrl: backendUrl,
      notificationAdapter,
    });

    await store.startGeneration({ prompt: 'test', steps: 20 } as any);
    expect(store.activeJobs).toHaveLength(1);

    await store.cancelJob('job-1');
    expect(transport.cancelJob).toHaveBeenCalledWith('job-1');
    expect(store.activeJobs).toHaveLength(0);
  });

  it('clears queue by cancelling cancellable jobs', async () => {
    const store = useGenerationOrchestratorStore();
    const notificationAdapter = { notify: vi.fn(), debug: vi.fn() };
    const showHistory = ref(false);
    const backendUrl = ref<string | null>('http://localhost');

    await store.initialize({
      showHistory,
      configuredBackendUrl: backendUrl,
      notificationAdapter,
    });

    store.enqueueJob({ id: 'job-1', status: 'processing' } as any);
    store.enqueueJob({ id: 'job-2', status: 'queued' } as any);

    await store.clearQueue();

    expect(transport.cancelJob).toHaveBeenCalledTimes(2);
    expect(store.activeJobs).toHaveLength(0);
  });

  it('deletes results and clears transport on cleanup', async () => {
    const store = useGenerationOrchestratorStore();
    const notificationAdapter = { notify: vi.fn(), debug: vi.fn() };
    const showHistory = ref(false);
    const backendUrl = ref<string | null>('http://localhost');

    await store.initialize({
      showHistory,
      configuredBackendUrl: backendUrl,
      notificationAdapter,
    });

    store.setResults([{ id: 'result-1', created_at: new Date().toISOString() } as any]);
    await store.deleteResult('result-1');

    expect(transport.deleteResult).toHaveBeenCalledWith('result-1');
    expect(store.recentResults).toHaveLength(0);

    store.cleanup();
    expect(transport.clear).toHaveBeenCalled();
    expect(store.queueManagerActive).toBe(false);
  });
});
