import { describe, it, expect, vi } from 'vitest';

import { createTransportActions } from '@/features/generation/stores/orchestrator/transportActions';

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
