import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

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

  it('initializes transport with provided history limit and handles backend changes', async () => {
    const store = useGenerationOrchestratorStore();
    const notificationAdapter = { notify: vi.fn(), debug: vi.fn() };
    const backendUrl = 'http://localhost';

    await store.initialize({
      historyLimit: DEFAULT_HISTORY_LIMIT,
      getBackendUrl: () => backendUrl,
      notificationAdapter,
    });

    expect(transport.initialize).toHaveBeenCalledWith(DEFAULT_HISTORY_LIMIT);
    expect(store.queueManagerActive).toBeDefined();
    expect(store.queueManagerActive).toBe(true);

    await store.handleBackendUrlChange();

    expect(transport.reconnect).toHaveBeenCalled();
    expect(transport.refreshAll).toHaveBeenCalledWith(DEFAULT_HISTORY_LIMIT);
  });

  it('enqueues and removes jobs through start and cancel actions', async () => {
    const store = useGenerationOrchestratorStore();
    const notificationAdapter = { notify: vi.fn(), debug: vi.fn() };
    const backendUrl = 'http://localhost';
    transport.startGeneration.mockResolvedValue({ job_id: 'job-1', status: 'queued', progress: 0 } as any);

    await store.initialize({
      historyLimit: DEFAULT_HISTORY_LIMIT,
      getBackendUrl: () => backendUrl,
      notificationAdapter,
    });

    await store.startGeneration({ prompt: 'test', steps: 20 } as any);
    expect(store.activeJobs).toHaveLength(1);

    await store.cancelJob('job-1');
    expect(transport.cancelJob).toHaveBeenCalledWith('job-1');
    expect(store.activeJobs).toHaveLength(0);
  });

  it('translates UI identifiers to backend identifiers when cancelling jobs', async () => {
    const store = useGenerationOrchestratorStore();
    const notificationAdapter = { notify: vi.fn(), debug: vi.fn() };
    const backendUrl = 'http://localhost';

    await store.initialize({
      historyLimit: DEFAULT_HISTORY_LIMIT,
      getBackendUrl: () => backendUrl,
      notificationAdapter,
    });

    store.enqueueJob({
      id: 'job-ui-1',
      uiId: 'job-ui-1',
      jobId: 'backend-1',
      backendId: 'backend-1',
      status: 'processing',
    } as any);

    await store.cancelJob('job-ui-1');

    expect(transport.cancelJob).toHaveBeenCalledWith('backend-1');
  });

  it('clears queue by cancelling cancellable jobs', async () => {
    const store = useGenerationOrchestratorStore();
    const notificationAdapter = { notify: vi.fn(), debug: vi.fn() };
    const backendUrl = 'http://localhost';

    await store.initialize({
      historyLimit: DEFAULT_HISTORY_LIMIT,
      getBackendUrl: () => backendUrl,
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
    const backendUrl = 'http://localhost';

    await store.initialize({
      historyLimit: DEFAULT_HISTORY_LIMIT,
      getBackendUrl: () => backendUrl,
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

  it('exposes immutable state snapshots to consumers', () => {
    const store = useGenerationOrchestratorStore();

    store.enqueueJob({ id: 'job-immutable', status: 'processing', progress: 0 } as any);
    store.setResults([{ id: 'result-immutable', created_at: new Date().toISOString() } as any]);
    store.updateSystemStatus({ status: 'healthy' } as any);

    const jobsSnapshot = store.activeJobs;
    const resultsSnapshot = store.recentResults;
    const statusSnapshot = store.systemStatus;

    expect(Object.isFrozen(jobsSnapshot)).toBe(true);
    expect(Object.isFrozen(jobsSnapshot[0]!)).toBe(true);
    expect(() => {
      (jobsSnapshot as unknown as any[]).push({ id: 'mutate' });
    }).toThrow(TypeError);

    expect(Object.isFrozen(resultsSnapshot)).toBe(true);
    expect(Object.isFrozen(resultsSnapshot[0]!)).toBe(true);
    expect(() => {
      (resultsSnapshot[0] as unknown as { id: string }).id = 'mutated';
    }).toThrow(TypeError);

    expect(Object.isFrozen(statusSnapshot)).toBe(true);
    expect(() => {
      (statusSnapshot as unknown as { status: string }).status = 'changed';
    }).toThrow(TypeError);
  });

  it('returns snapshots that are safe to mutate in production builds', () => {
    vi.stubEnv('DEV', 'false');
    vi.stubEnv('PROD', 'true');

    try {
      setActivePinia(createPinia());
      const store = useGenerationOrchestratorStore();

      store.enqueueJob({
        id: 'job-prod',
        status: 'processing',
        progress: 0,
        backendId: 'backend-1',
        jobId: 'backend-1',
      } as any);
      store.setResults([{ id: 'result-prod', created_at: new Date().toISOString() } as any]);
      store.updateSystemStatus({ status: 'healthy' } as any);

      const jobsSnapshot = store.activeJobs;
      const resultsSnapshot = store.recentResults;
      const statusSnapshot = store.systemStatus;

      expect(() => {
        (jobsSnapshot as unknown as any[]).push({ id: 'mutated-job' });
      }).not.toThrow();
      expect(store.getJobByIdentifier('job-prod')?.status).toBe('processing');

      (jobsSnapshot[0] as unknown as { status: string }).status = 'mutated';
      expect(store.getJobByIdentifier('job-prod')?.status).toBe('processing');

      (resultsSnapshot[0] as unknown as { id: string }).id = 'mutated-result';
      store.removeResult('result-prod');
      expect(store.recentResults).toHaveLength(0);

      (statusSnapshot as unknown as { status: string }).status = 'broken';
      store.updateSystemStatus({ queue_length: 99 } as any);
      expect(store.systemStatus.status).toBe('healthy');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not create transport adapters when reading reactive state', () => {
    const store = useGenerationOrchestratorStore();

    expect(createTransportAdapterMock).not.toHaveBeenCalled();

    void store.activeJobs.length;
    void store.recentResults.length;
    void store.systemStatus.status;

    expect(createTransportAdapterMock).not.toHaveBeenCalled();
  });
});
