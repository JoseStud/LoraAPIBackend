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
  MAX_RESULTS,
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

  it('applies history limits to results immediately', () => {
    const store = useGenerationOrchestratorStore();

    const initialResults = Array.from({ length: 8 }, (_, index) => ({
      id: `result-${index}`,
      created_at: new Date().toISOString(),
    }));

    store.setResults(initialResults as any);
    expect(store.recentResults).toHaveLength(initialResults.length);

    store.setHistoryLimit(3);
    expect(store.historyLimit).toBe(3);
    expect(store.recentResults).toHaveLength(3);

    store.addResult({ id: 'new-result', created_at: new Date().toISOString() } as any);
    expect(store.recentResults).toHaveLength(3);
    expect(store.recentResults[0]?.id).toBe('new-result');

    store.setHistoryLimit(50);
    const expandedResults = Array.from({ length: 60 }, (_, index) => ({
      id: `bulk-${index}`,
      created_at: new Date(Date.now() + index * 1000).toISOString(),
    }));

    store.setResults(expandedResults as any);
    expect(store.historyLimit).toBe(50);
    expect(store.recentResults).toHaveLength(50);

    store.setHistoryLimit(MAX_RESULTS + 10);
    store.setResults(expandedResults as any);
    expect(store.recentResults).toHaveLength(Math.min(MAX_RESULTS, expandedResults.length));
  });
});
