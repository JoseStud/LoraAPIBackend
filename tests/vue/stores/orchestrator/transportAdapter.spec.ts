import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenerationWebSocketManagerOptions } from '@/features/generation/services/websocketManager';

const socketMocks = vi.hoisted(() => ({
  created: [] as Array<{
    options: GenerationWebSocketManagerOptions;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    reconnect: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('@/features/generation/services/websocketManager', () => ({
  createGenerationWebSocketManager: (options: GenerationWebSocketManagerOptions) => {
    const manager = { options, start: vi.fn(), stop: vi.fn(), reconnect: vi.fn() };
    socketMocks.created.push(manager);
    return manager;
  },
}));

import {
  createGenerationTransportAdapter,
  toQueueJobInput,
} from '@/features/generation/stores/orchestrator/transportAdapter';
import type { GenerationTransportAdapterOptions } from '@/features/generation/stores/orchestrator/transportAdapter';
import { ApiError } from '@/types';
import type { GenerationJobStatus } from '@/types';

const POLL_MS = 1_000;

const createQueueClient = () => ({
  startGeneration: vi.fn().mockResolvedValue({ job_id: 'job-1', status: 'queued', progress: 0 }),
  cancelJob: vi.fn().mockResolvedValue(undefined),
  deleteResult: vi.fn().mockResolvedValue(undefined),
  fetchActiveJobs: vi.fn().mockResolvedValue([]),
  fetchRecentResults: vi.fn().mockResolvedValue([]),
});

const createOptions = (
  overrides: Partial<GenerationTransportAdapterOptions> = {},
): GenerationTransportAdapterOptions & {
  notificationAdapter: { notify: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
} => ({
  getBackendUrl: () => 'http://backend.test',
  notificationAdapter: { notify: vi.fn(), debug: vi.fn() },
  initialPollInterval: POLL_MS,
  shouldPollQueue: () => true,
  queueClient: createQueueClient(),
  refreshSystemStatus: vi.fn().mockResolvedValue(undefined),
  onQueueUpdate: vi.fn(),
  onProgress: vi.fn(),
  onComplete: vi.fn(),
  onError: vi.fn(),
  onRecentResults: vi.fn(),
  onConnectionChange: vi.fn(),
  onConnectionStateChange: vi.fn(),
  onTransportError: vi.fn(),
  onHydrateSystemStatus: vi.fn(),
  onReleaseSystemStatus: vi.fn(),
  ...overrides,
}) as never;

const pausePayload = {
  reasons: ['document-hidden'] as const,
  hidden: true,
  online: true,
  source: 'test',
  timestamp: 1,
};

const resumePayload = { hidden: false, online: true, source: 'test', timestamp: 2 };

describe('createGenerationTransportAdapter', () => {
  beforeEach(() => {
    socketMocks.created.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts nothing until initialize, then loads data, hydrates status and opens the socket', async () => {
    const options = createOptions();
    const adapter = createGenerationTransportAdapter(options);

    expect(socketMocks.created).toHaveLength(0);
    expect(options.queueClient!.fetchActiveJobs).not.toHaveBeenCalled();

    await adapter.initialize(10);

    expect(options.refreshSystemStatus).toHaveBeenCalledTimes(1);
    expect(options.queueClient!.fetchActiveJobs).toHaveBeenCalledTimes(1);
    expect(options.queueClient!.fetchRecentResults).toHaveBeenCalledWith(10);
    expect(options.onQueueUpdate).toHaveBeenCalledWith([]);
    expect(options.onRecentResults).toHaveBeenCalledWith([]);
    expect(options.onHydrateSystemStatus).toHaveBeenCalledTimes(1);
    expect(socketMocks.created).toHaveLength(1);
    expect(socketMocks.created[0].start).toHaveBeenCalledTimes(1);
    expect(adapter.isPaused()).toBe(false);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(options.queueClient!.fetchActiveJobs).toHaveBeenCalledTimes(2);

    adapter.clear();
  });

  it('forwards socket events and notifies on completion and failure', async () => {
    const options = createOptions();
    const adapter = createGenerationTransportAdapter(options);
    await adapter.initialize(5);

    const socket = socketMocks.created[0].options;
    expect(socket.getBackendUrl()).toBe('http://backend.test');

    const progress = { type: 'progress', job_id: 'job-1', progress: 50 } as never;
    socket.onProgress?.(progress);
    expect(options.onProgress).toHaveBeenCalledWith(progress);

    const complete = { type: 'complete', job_id: 'job-1' } as never;
    socket.onComplete?.(complete);
    expect(options.onComplete).toHaveBeenCalledWith(complete);
    expect(options.notificationAdapter.notify).toHaveBeenCalledWith(
      'Generation completed successfully',
      'success',
    );

    socket.onError?.({ type: 'error', job_id: 'job-1', error: 'boom' } as never);
    expect(options.notificationAdapter.notify).toHaveBeenCalledWith('Generation failed: boom', 'error');

    socket.onError?.({ type: 'error', job_id: 'job-1', status: 'failed' } as never);
    expect(options.notificationAdapter.notify).toHaveBeenCalledWith('Generation failed: failed', 'error');

    socket.onError?.({ type: 'error', job_id: 'job-1' } as never);
    expect(options.notificationAdapter.notify).toHaveBeenCalledWith(
      'Generation failed: Unknown error',
      'error',
    );
    expect(options.onError).toHaveBeenCalledTimes(3);

    socket.onConnectionChange?.(true);
    expect(options.onConnectionChange).toHaveBeenCalledTimes(1);
    expect(vi.mocked(options.onConnectionChange).mock.calls[0][0]).toBe(true);

    const snapshot = { event: 'connect:success' } as never;
    socket.onStateChange?.(snapshot);
    expect(options.onConnectionStateChange).toHaveBeenCalledWith(snapshot);

    const transportError = { source: 'websocket', context: 'x', message: 'y', timestamp: 1 } as const;
    socket.onTransportError?.(transportError);
    expect(options.onTransportError).toHaveBeenCalledWith(transportError);

    socket.logger?.('socket says hi');
    expect(options.notificationAdapter.debug).toHaveBeenCalledWith('socket says hi');

    adapter.clear();
  });

  it('notifies and debug-logs queue-client commands', async () => {
    const options = createOptions();
    const adapter = createGenerationTransportAdapter(options);

    await adapter.cancelJob('job-1');
    expect(options.queueClient!.cancelJob).toHaveBeenCalledWith('job-1');
    expect(options.notificationAdapter.notify).toHaveBeenCalledWith('Generation cancelled', 'success');
    expect(options.notificationAdapter.debug).toHaveBeenCalledWith(
      '[GenerationTransport]',
      'Generation cancelled',
      'success',
    );

    await adapter.deleteResult(7);
    expect(options.queueClient!.deleteResult).toHaveBeenCalledWith(7);

    await expect(adapter.startGeneration({ prompt: 'a cat' } as never)).resolves.toEqual(
      expect.objectContaining({ job_id: 'job-1' }),
    );

    await adapter.refreshRecentResults(3, true);
    expect(options.queueClient!.fetchRecentResults).toHaveBeenCalledWith(3);
    expect(options.notificationAdapter.notify).toHaveBeenCalledWith('Results refreshed', 'success');
  });

  it('pauses polling and the socket, and resumes once with a full refresh', async () => {
    const options = createOptions();
    const adapter = createGenerationTransportAdapter(options);
    await adapter.initialize(10);
    const socket = socketMocks.created[0];

    adapter.pause(pausePayload);
    adapter.pause(pausePayload);
    expect(adapter.isPaused()).toBe(true);
    expect(socket.stop).toHaveBeenCalledTimes(1);

    const callsBefore = options.queueClient!.fetchActiveJobs.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(options.queueClient!.fetchActiveJobs).toHaveBeenCalledTimes(callsBefore);

    await Promise.all([adapter.resume(10, resumePayload), adapter.resume(10, resumePayload)]);
    expect(adapter.isPaused()).toBe(false);
    expect(options.refreshSystemStatus).toHaveBeenCalledTimes(2);
    expect(socket.start).toHaveBeenCalledTimes(2);

    await adapter.resume(10, resumePayload);
    expect(options.refreshSystemStatus).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(options.queueClient!.fetchActiveJobs).toHaveBeenCalledTimes(callsBefore + 2);

    adapter.clear();
  });

  it('stays paused when the resume refresh fails', async () => {
    const options = createOptions();
    const adapter = createGenerationTransportAdapter(options);
    await adapter.initialize(10);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    adapter.pause(pausePayload);
    vi.mocked(options.refreshSystemStatus).mockRejectedValueOnce(new Error('offline'));

    await expect(adapter.resume(10, resumePayload)).rejects.toThrow('offline');
    expect(adapter.isPaused()).toBe(true);

    adapter.clear();
  });

  it('clears polling and the socket, releases system status and recreates the socket on reconnect', async () => {
    const options = createOptions();
    const adapter = createGenerationTransportAdapter(options);
    await adapter.initialize(10);
    const socket = socketMocks.created[0];

    adapter.clear();
    expect(socket.stop).toHaveBeenCalledTimes(1);
    expect(options.onReleaseSystemStatus).toHaveBeenCalledTimes(1);
    expect(adapter.isPaused()).toBe(false);

    const callsAfterClear = options.queueClient!.fetchActiveJobs.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(options.queueClient!.fetchActiveJobs).toHaveBeenCalledTimes(callsAfterClear);

    adapter.reconnect();
    expect(socketMocks.created).toHaveLength(2);
    expect(socketMocks.created[1].reconnect).toHaveBeenCalledTimes(1);
  });

  it('uses an injected WebSocket manager instead of creating one', async () => {
    const websocketManager = { start: vi.fn(), stop: vi.fn(), reconnect: vi.fn() };
    const options = createOptions({ websocketManager });
    const adapter = createGenerationTransportAdapter(options);

    await adapter.initialize(10);
    adapter.reconnect();

    expect(socketMocks.created).toHaveLength(0);
    expect(websocketManager.start).toHaveBeenCalledTimes(1);
    expect(websocketManager.reconnect).toHaveBeenCalledTimes(1);

    adapter.clear();
    expect(websocketManager.stop).toHaveBeenCalledTimes(1);
  });

  it('only polls the queue while shouldPollQueue allows it and honours poll interval changes', async () => {
    let shouldPoll = false;
    const options = createOptions({ shouldPollQueue: () => shouldPoll });
    const adapter = createGenerationTransportAdapter(options);
    await adapter.initialize(10);

    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(options.queueClient!.fetchActiveJobs).toHaveBeenCalledTimes(1);

    shouldPoll = true;
    adapter.setPollInterval(POLL_MS * 5);
    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(options.queueClient!.fetchActiveJobs).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(options.queueClient!.fetchActiveJobs).toHaveBeenCalledTimes(2);

    adapter.clear();
  });

  it('maps active jobs onto queue inputs, keeping UI and backend ids', async () => {
    const job: GenerationJobStatus = {
      id: 'ui-1',
      jobId: 'backend-1',
      prompt: 'a cat',
      name: null,
      status: 'processing',
      progress: 0.5,
      message: null,
      error: null,
      params: null,
      created_at: '2024-01-01T00:00:00Z',
      startTime: null,
      finished_at: null,
      result: null,
    };
    const options = createOptions();
    options.queueClient!.fetchActiveJobs = vi.fn().mockResolvedValue([job]);
    const adapter = createGenerationTransportAdapter(options);

    await adapter.refreshActiveJobs();

    expect(options.onQueueUpdate).toHaveBeenCalledWith([toQueueJobInput(job)]);
    expect(toQueueJobInput(job)).toMatchObject({
      id: 'ui-1',
      uiId: 'ui-1',
      jobId: 'backend-1',
      backendId: 'backend-1',
      prompt: 'a cat',
      progress: 0.5,
      name: undefined,
    });
  });

  it('reports HTTP failures as transport errors and rethrows them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const apiError = new ApiError({
      message: 'Server exploded',
      status: 500,
      statusText: 'Server Error',
      payload: null,
      meta: { ok: false, status: 500, statusText: 'Server Error' },
    });
    const options = createOptions();
    options.queueClient!.fetchActiveJobs = vi.fn().mockRejectedValue(apiError);
    options.queueClient!.cancelJob = vi.fn().mockRejectedValue(new Error('gone'));
    const adapter = createGenerationTransportAdapter(options);

    await expect(adapter.refreshActiveJobs()).rejects.toBe(apiError);
    expect(options.onTransportError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'http',
        context: 'refreshActiveJobs',
        statusCode: 500,
        message: 'Server exploded',
      }),
    );

    await expect(adapter.cancelJob('job-9')).rejects.toThrow('gone');
    expect(options.onTransportError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: 'cancelJob',
        message: 'gone',
        details: expect.objectContaining({ jobId: 'job-9' }),
      }),
    );
    expect(options.notificationAdapter.notify).toHaveBeenCalledWith('Failed to cancel generation', 'error');
  });

  it('reports a failed polling cycle without stopping the timer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = createOptions();
    const adapter = createGenerationTransportAdapter(options);
    await adapter.initialize(10);

    vi.mocked(options.queueClient!.fetchActiveJobs).mockRejectedValueOnce(new Error('flaky'));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(options.onTransportError).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'pollActiveJobs', message: 'flaky' }),
    );

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(options.queueClient!.fetchActiveJobs).toHaveBeenCalledTimes(3);

    adapter.clear();
  });
});
