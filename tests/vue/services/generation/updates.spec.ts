import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { createGenerationQueueClient } from '@/services/generation/updates';
import type { ApiResponseMeta } from '@/types';

vi.mock('@/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/services/apiClient')>(
    '@/services/apiClient',
  );
  return {
    ...actual,
    requestJson: vi.fn(),
  };
});

import { requestJson } from '@/services/apiClient';

const createMeta = (overrides: Partial<ApiResponseMeta> = {}): ApiResponseMeta => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  ...overrides,
});

const createClient = () =>
  createGenerationQueueClient({
    getBackendUrl: () => 'https://backend.example/api',
  });

describe('createGenerationQueueClient', () => {
  beforeEach(() => {
    (requestJson as unknown as Mock).mockReset();
  });

  it('filters malformed active job records', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (requestJson as unknown as Mock).mockResolvedValueOnce({
      data: [
        {
          id: 'job-1',
          status: 'processing',
          progress: 0.5,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: null,
          status: 'processing',
          progress: 0.1,
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      meta: createMeta(),
    });

    const client = createClient();
    const jobs = await client.fetchActiveJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: 'job-1', status: 'processing', progress: 0.5 });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('returns null when the system status payload is invalid', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (requestJson as unknown as Mock).mockResolvedValueOnce({
      data: { status: 42 },
      meta: createMeta(),
    });

    const client = createClient();
    const status = await client.fetchSystemStatus();

    expect(status).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('filters malformed generation results', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (requestJson as unknown as Mock).mockResolvedValueOnce({
      data: [
        {
          id: 'result-1',
          job_id: 'job-1',
        },
        {
          job_id: 'job-2',
        },
      ],
      meta: createMeta(),
    });

    const client = createClient();
    const results = await client.fetchRecentResults(5);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'result-1', job_id: 'job-1' });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
