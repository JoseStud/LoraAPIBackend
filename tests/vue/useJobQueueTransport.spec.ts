import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope } from 'vue';

import { useJobQueueTransport } from '@/composables/generation/useJobQueueTransport';

const serviceMocks = vi.hoisted(() => ({
  fetchActiveGenerationJobs: vi.fn(),
}));

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchActiveGenerationJobs: serviceMocks.fetchActiveGenerationJobs,
    cancelGenerationJob: vi.fn(),
  };
});

const createTransport = () => {
  const scope = effectScope();
  let transport: ReturnType<typeof useJobQueueTransport>;

  scope.run(() => {
    transport = useJobQueueTransport({ backendBase: computed(() => '/api/v1') });
  });

  return {
    transport: transport!,
    stop: () => scope.stop(),
  };
};

describe('useJobQueueTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns records from the canonical job endpoint', async () => {
    const records = [{ id: 'job-1' }];
    serviceMocks.fetchActiveGenerationJobs.mockResolvedValueOnce(records);

    const { transport, stop } = createTransport();

    await expect(transport.fetchJobs()).resolves.toEqual(records);
    expect(serviceMocks.fetchActiveGenerationJobs).toHaveBeenCalledWith('/api/v1');
    expect(transport.apiAvailable.value).toBe(true);

    stop();
  });

  it('marks the API as unavailable when the request fails and recovers on success', async () => {
    serviceMocks.fetchActiveGenerationJobs.mockRejectedValueOnce(new Error('primary failed'));

    const { transport, stop } = createTransport();

    await expect(transport.fetchJobs()).resolves.toBeNull();
    expect(transport.apiAvailable.value).toBe(false);

    const nextRecords = [{ id: 'job-2' }];
    serviceMocks.fetchActiveGenerationJobs.mockResolvedValueOnce(nextRecords);

    await expect(transport.fetchJobs()).resolves.toEqual(nextRecords);
    expect(transport.apiAvailable.value).toBe(true);

    stop();
  });
});
