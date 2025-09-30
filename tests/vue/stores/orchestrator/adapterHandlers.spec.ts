import { describe, it, expect, vi } from 'vitest';

import { createAdapterHandlers } from '@/features/generation/stores/orchestrator/adapterHandlers';

describe('adapterHandlers', () => {
  it('delegates events to queue, results, and system status modules', () => {
    const queue = {
      ingestQueue: vi.fn(),
      handleProgressMessage: vi.fn(),
      handleCompletionMessage: vi.fn(),
      handleErrorMessage: vi.fn(),
    } as any;

    const results = {
      setResults: vi.fn(),
      addResult: vi.fn(),
      createResultFromCompletion: vi.fn().mockReturnValue({ id: 'result-1' }),
    } as any;

    const systemStatus = {
      applySystemStatusPayload: vi.fn(),
      setConnectionState: vi.fn(),
    } as any;

    const handlers = createAdapterHandlers({ queue, results, systemStatus });

    handlers.onQueueUpdate([{ id: 'job' }] as any);
    expect(queue.ingestQueue).toHaveBeenCalled();

    handlers.onProgress({ job_id: 'job' } as any);
    expect(queue.handleProgressMessage).toHaveBeenCalled();

    const result = handlers.onComplete({ job_id: 'job' } as any);
    expect(queue.handleCompletionMessage).toHaveBeenCalled();
    expect(results.addResult).toHaveBeenCalledWith({ id: 'result-1' });
    expect(result).toEqual({ id: 'result-1' });

    handlers.onError({ job_id: 'job' } as any);
    expect(queue.handleErrorMessage).toHaveBeenCalled();

    handlers.onSystemStatus({ queue_length: 1 } as any);
    expect(systemStatus.applySystemStatusPayload).toHaveBeenCalled();

    handlers.onConnectionChange(true);
    expect(systemStatus.setConnectionState).toHaveBeenCalledWith(true);

    handlers.onRecentResults([{ id: 'result-1' }] as any);
    expect(results.setResults).toHaveBeenCalled();
  });
});
