import { describe, it, expect, vi } from 'vitest';

import {
  createAdapterHandlers,
  createTransportActions,
  createTransportModule,
} from '@/features/generation/stores/orchestrator/transportModule';
import type { GenerationTransportError, GenerationWebSocketStateSnapshot } from '@/features/generation/types/transport';

const baseSnapshot = (
  overrides: Partial<GenerationWebSocketStateSnapshot> = {},
): GenerationWebSocketStateSnapshot => ({
  event: 'disconnect',
  timestamp: 1,
  url: 'ws://example.test',
  connected: false,
  reconnectAttempt: 1,
  consecutiveFailures: 1,
  nextRetryDelayMs: 1_000,
  lastConnectedAt: 10,
  lastDisconnectedAt: 20,
  downtimeMs: 5,
  error: {
    message: 'boom',
    code: 1006,
    reason: 'closed',
    wasClean: false,
  },
  ...overrides,
});

describe('transportModule', () => {
  it('throws when ensuring transport before initialization', () => {
    const transportModule = createTransportModule();
    expect(() => transportModule.ensureTransport()).toThrowError();
  });

  it('manages lifecycle and delegates operations', () => {
    const adapter = {
      refreshSystemStatus: vi.fn(),
      refreshActiveJobs: vi.fn(),
      refreshRecentResults: vi.fn(),
      refreshAll: vi.fn(),
      cancelJob: vi.fn(),
      deleteResult: vi.fn(),
      startGeneration: vi.fn(),
      reconnect: vi.fn(),
      setPollInterval: vi.fn(),
      clear: vi.fn(),
    } as any;

    const transportModule = createTransportModule();
    transportModule.setTransport(adapter);

    expect(transportModule.ensureTransport()).toEqual(adapter);

    transportModule.setPollInterval(1500);
    expect(adapter.setPollInterval).toHaveBeenCalledWith(1500);

    transportModule.reconnect();
    expect(adapter.reconnect).toHaveBeenCalled();

    transportModule.clearTransport();
    expect(adapter.clear).toHaveBeenCalled();
    expect(() => transportModule.ensureTransport()).toThrowError();
  });

  it('withTransport helper invokes callback with adapter', async () => {
    const adapter = {
      refreshSystemStatus: vi.fn(),
      clear: vi.fn(),
    } as any;

    const transportModule = createTransportModule();
    transportModule.setTransport(adapter);

    await transportModule.withTransport((instance) => instance.refreshSystemStatus());
    expect(adapter.refreshSystemStatus).toHaveBeenCalled();
  });

  it('records connection telemetry and exposes metrics', () => {
    const transportModule = createTransportModule();
    const disconnect = baseSnapshot();
    transportModule.recordConnectionSnapshot(disconnect);

    expect(transportModule.phase.value).toBe('disconnected');
    expect(transportModule.metrics.value.totalDowntimeMs).toBe(0);
    expect(transportModule.lastError.value).toMatchObject<GenerationTransportError>({
      source: 'websocket',
      message: 'boom',
      statusCode: 1006,
    });

    const reconnectScheduled = baseSnapshot({
      event: 'reconnect:scheduled',
      connected: false,
      error: null,
    });
    transportModule.recordConnectionSnapshot(reconnectScheduled);
    expect(transportModule.phase.value).toBe('reconnecting');

    const success = baseSnapshot({
      event: 'connect:success',
      connected: true,
      downtimeMs: 5,
      error: null,
    });
    transportModule.recordConnectionSnapshot(success);

    expect(transportModule.phase.value).toBe('connected');
    expect(transportModule.metrics.value.totalDowntimeMs).toBe(5);
    expect(transportModule.lastError.value).toMatchObject({ message: 'boom' });
  });

  it('resets metrics when cleared', () => {
    const adapter = { clear: vi.fn() } as any;
    const transportModule = createTransportModule();
    transportModule.setTransport(adapter);
    transportModule.recordConnectionSnapshot(baseSnapshot());
    transportModule.recordTransportError({
      source: 'http',
      context: 'refresh',
      message: 'fail',
      timestamp: 1,
    });

    transportModule.clearTransport();

    expect(adapter.clear).toHaveBeenCalled();
    expect(transportModule.phase.value).toBe('idle');
    expect(transportModule.lastError.value).toBeNull();
    expect(transportModule.metrics.value.totalDowntimeMs).toBe(0);
  });
});

const createAdapter = () => ({
  refreshSystemStatus: vi.fn().mockResolvedValue(undefined),
  refreshActiveJobs: vi.fn().mockResolvedValue(undefined),
  refreshRecentResults: vi.fn().mockResolvedValue(undefined),
  refreshAll: vi.fn().mockResolvedValue(undefined),
  startGeneration: vi
    .fn()
    .mockResolvedValue({ job_id: 'job-1', status: 'queued', progress: 0, steps: 10 } as any),
  cancelJob: vi.fn().mockResolvedValue(undefined),
  deleteResult: vi.fn().mockResolvedValue(undefined),
  reconnect: vi.fn(),
});

describe('transportActions', () => {
  it('provides transport-bound orchestration helpers', async () => {
    const adapter = createAdapter();
    const queue = {
      enqueueJob: vi.fn(),
      removeJob: vi.fn(),
      getCancellableJobs: vi.fn(() => [{ id: 'job-1' }, { id: 'job-2' }]),
      getJobByIdentifier: vi.fn((identifier: string) =>
        identifier === 'job-1' ? { backendId: 'job-1' } : undefined,
      ),
    } as any;
    const results = {
      historyLimit: { value: 5 },
      removeResult: vi.fn(),
      enqueueJob: vi.fn(),
    } as any;

    const transport = {
      ensureTransport: () => adapter,
      withTransport: (callback: (instance: typeof adapter) => unknown) => Promise.resolve(callback(adapter)),
      reconnect: vi.fn(),
    } as any;

    const actions = createTransportActions({ queue, results, transport });

    await actions.loadSystemStatusData();
    expect(adapter.refreshSystemStatus).toHaveBeenCalled();

    await actions.loadActiveJobsData();
    expect(adapter.refreshActiveJobs).toHaveBeenCalled();

    await actions.loadRecentResults(true);
    expect(adapter.refreshRecentResults).toHaveBeenCalledWith(results.historyLimit.value, true);

    await actions.refreshAllData();
    expect(adapter.refreshAll).toHaveBeenCalledWith(results.historyLimit.value);

    await actions.handleBackendUrlChange();
    expect(transport.reconnect).toHaveBeenCalled();
    expect(adapter.refreshAll).toHaveBeenCalledTimes(2);

    await actions.startGeneration({ prompt: 'test', steps: 10 } as any);
    expect(adapter.startGeneration).toHaveBeenCalled();
    expect(queue.enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }));

    await actions.cancelJob('job-1');
    expect(adapter.cancelJob).toHaveBeenCalledWith('job-1');
    expect(queue.removeJob).toHaveBeenCalledWith('job-1');

    await actions.clearQueue();
    expect(adapter.cancelJob).toHaveBeenCalledTimes(3);

    await actions.deleteResult('result-1');
    expect(adapter.deleteResult).toHaveBeenCalledWith('result-1');
    expect(results.removeResult).toHaveBeenCalledWith('result-1');
  });
});

describe('adapterHandlers', () => {
  it('delegates events to queue, results, and system status modules', () => {
    const queue = {
      ingestQueue: vi.fn(),
      jobsByBackendId: { value: new Map() },
      handleProgressMessage: vi.fn(),
      handleCompletionMessage: vi.fn(),
      handleErrorMessage: vi.fn(),
    } as any;

    const results = { setResults: vi.fn() } as any;

    const systemStatus = {
      applySystemStatusPayload: vi.fn(),
      setConnectionState: vi.fn(),
    } as any;

    const onJobsFinished = vi.fn();
    const handlers = createAdapterHandlers({ queue, results, systemStatus, onJobsFinished });

    handlers.onQueueUpdate([{ id: 'job' }] as any);
    expect(queue.ingestQueue).toHaveBeenCalled();

    handlers.onProgress({ job_id: 'job' } as any);
    expect(queue.handleProgressMessage).toHaveBeenCalled();

    handlers.onComplete({ job_id: 'job', status: 'completed' });
    expect(queue.handleCompletionMessage).toHaveBeenCalled();
    expect(onJobsFinished).toHaveBeenCalledWith(['job']);

    handlers.onError({ job_id: 'job' } as any);
    expect(queue.handleErrorMessage).toHaveBeenCalled();

    handlers.onSystemStatus({ queue_length: 1 } as any);
    expect(systemStatus.applySystemStatusPayload).toHaveBeenCalled();

    handlers.onConnectionChange(true);
    expect(systemStatus.setConnectionState).toHaveBeenCalledWith(true);

    handlers.onRecentResults([{ id: 'result-1' }] as any);
    expect(results.setResults).toHaveBeenCalled();
  });

  it('reports jobs that left the active queue so results can be refreshed', () => {
    const jobsByBackendId = { value: new Map([['job-1', {}], ['job-2', {}]]) };
    const queue = {
      jobsByBackendId,
      ingestQueue: vi.fn((list: Array<{ id: string }>) => {
        jobsByBackendId.value = new Map(list.map((job) => [job.id, {}]));
      }),
      handleProgressMessage: vi.fn(),
      handleCompletionMessage: vi.fn(),
      handleErrorMessage: vi.fn(),
    } as any;
    const onJobsFinished = vi.fn();

    const handlers = createAdapterHandlers({
      queue,
      results: {} as any,
      systemStatus: {} as any,
      onJobsFinished,
    });

    handlers.onQueueUpdate([{ id: 'job-2' }] as any);
    expect(onJobsFinished).toHaveBeenCalledWith(['job-1']);

    onJobsFinished.mockClear();
    handlers.onQueueUpdate([{ id: 'job-2' }, { id: 'job-3' }] as any);
    expect(onJobsFinished).not.toHaveBeenCalled();
  });
});
