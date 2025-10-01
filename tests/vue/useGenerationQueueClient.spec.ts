import { describe, expect, it, vi } from 'vitest';

import { useGenerationQueueClient } from '@/composables/generation';
import type { GenerationQueueClient } from '@/services/generation/queueClient';
import { ApiError } from '@/types';
import type { GenerationJobStatus, GenerationResult, SystemStatusPayload } from '@/types';

const iso = '2024-01-01T00:00:00Z';

const createQueueClient = (overrides: Partial<GenerationQueueClient> = {}): GenerationQueueClient => ({
  startGeneration: vi.fn().mockResolvedValue(undefined as never),
  cancelJob: vi.fn().mockResolvedValue(undefined),
  deleteResult: vi.fn().mockResolvedValue(undefined),
  fetchSystemStatus: vi.fn().mockResolvedValue(null),
  fetchActiveJobs: vi.fn().mockResolvedValue([]),
  fetchRecentResults: vi.fn().mockResolvedValue([]),
  ...overrides,
});

describe('useGenerationQueueClient validation', () => {
  it('ignores malformed active jobs before updating the queue store', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const validJob: GenerationJobStatus = {
      id: 'job-1',
      jobId: null,
      prompt: 'prompt',
      name: null,
      status: 'processing',
      progress: 0.5,
      message: null,
      error: null,
      params: null,
      created_at: iso,
      startTime: null,
      finished_at: null,
      result: null,
    };
    const invalidJob = { ...validJob, id: null } as unknown as GenerationJobStatus;

    const queueClient = createQueueClient({
      fetchActiveJobs: vi.fn().mockResolvedValue([validJob, invalidJob]),
    });

    const onQueueUpdate = vi.fn();
    const composable = useGenerationQueueClient(
      {
        getBackendUrl: () => null,
        queueClient,
      },
      {
        onQueueUpdate,
      },
    );

    await composable.refreshActiveJobs();

    expect(onQueueUpdate).toHaveBeenCalledTimes(1);
    expect(onQueueUpdate.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'job-1', status: 'processing', progress: 0.5 }),
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('ignores malformed generation results before notifying listeners', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const validResult: GenerationResult = {
      id: 'result-1',
      job_id: 'job-1',
      prompt: 'ok',
      negative_prompt: null,
      image_url: null,
      thumbnail_url: null,
      created_at: iso,
      finished_at: null,
      generation_info: null,
    };
    const invalidResult = { ...validResult, id: undefined } as unknown as GenerationResult;

    const queueClient = createQueueClient({
      fetchRecentResults: vi.fn().mockResolvedValue([validResult, invalidResult]),
    });

    const onRecentResults = vi.fn();
    const composable = useGenerationQueueClient(
      {
        getBackendUrl: () => null,
        queueClient,
      },
      {
        onRecentResults,
      },
    );

    await composable.refreshRecentResults(5);

    expect(onRecentResults).toHaveBeenCalledTimes(1);
    expect(onRecentResults.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'result-1', job_id: 'job-1' }),
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('skips invalid system status payloads', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalidStatus = { status: 123 } as unknown as SystemStatusPayload;

    const queueClient = createQueueClient({
      fetchSystemStatus: vi.fn().mockResolvedValue(invalidStatus),
    });

    const onSystemStatus = vi.fn();
    const composable = useGenerationQueueClient(
      {
        getBackendUrl: () => null,
        queueClient,
      },
      {
        onSystemStatus,
      },
    );

    await composable.refreshSystemStatus();

    expect(onSystemStatus).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('reports HTTP transport errors with metadata', async () => {
    const apiError = new ApiError({
      message: 'Server exploded',
      status: 500,
      statusText: 'Server Error',
      payload: null,
      meta: {
        ok: false,
        status: 500,
        statusText: 'Server Error',
      },
    });

    const queueClient = createQueueClient({
      fetchActiveJobs: vi.fn().mockRejectedValue(apiError),
    });

    const onTransportError = vi.fn();
    const composable = useGenerationQueueClient(
      {
        getBackendUrl: () => null,
        queueClient,
      },
      {
        onTransportError,
      },
    );

    await expect(composable.refreshActiveJobs()).rejects.toThrow(apiError);

    expect(onTransportError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'http',
        context: 'refreshActiveJobs',
        statusCode: 500,
        message: 'Server exploded',
      }),
    );
  });
});
