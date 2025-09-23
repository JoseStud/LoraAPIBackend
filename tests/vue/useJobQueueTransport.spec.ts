import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope } from 'vue';

import { useJobQueueTransport } from '@/composables/useJobQueueTransport';
import { ApiError } from '@/composables/useApi';

const serviceMocks = vi.hoisted(() => ({
  fetchActiveGenerationJobs: vi.fn(),
  fetchLegacyJobStatuses: vi.fn(),
}));

vi.mock('@/services', () => ({
  fetchActiveGenerationJobs: serviceMocks.fetchActiveGenerationJobs,
  fetchLegacyJobStatuses: serviceMocks.fetchLegacyJobStatuses,
  cancelGenerationJob: vi.fn(),
  cancelLegacyJob: vi.fn(),
}));

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

  it('falls back to the legacy endpoint when the primary fails', async () => {
    const records = [{ id: 'job-1' }];
    serviceMocks.fetchActiveGenerationJobs.mockRejectedValueOnce(new Error('primary failed'));
    serviceMocks.fetchLegacyJobStatuses.mockResolvedValueOnce(records);

    const { transport, stop } = createTransport();

    await expect(transport.fetchJobs()).resolves.toEqual(records);
    expect(transport.apiAvailable.value).toBe(true);
    expect(transport.legacyEndpointMissing.value).toBe(false);
    expect(serviceMocks.fetchLegacyJobStatuses).toHaveBeenCalledWith('/api/v1');

    stop();
  });

  it('marks the legacy endpoint as unavailable when it returns 404', async () => {
    const notFoundError = new ApiError({
      message: 'Not Found',
      status: 404,
      statusText: 'Not Found',
      payload: null,
      meta: { ok: false, status: 404, statusText: 'Not Found' },
    });

    serviceMocks.fetchActiveGenerationJobs.mockRejectedValue(new Error('primary failed'));
    serviceMocks.fetchLegacyJobStatuses.mockRejectedValueOnce(notFoundError);

    const { transport, stop } = createTransport();

    await expect(transport.fetchJobs()).resolves.toBeNull();
    expect(transport.legacyEndpointMissing.value).toBe(true);
    expect(transport.isLegacyFallbackAvailable.value).toBe(false);

    serviceMocks.fetchActiveGenerationJobs.mockResolvedValueOnce([{ id: 'job-2' }]);

    await expect(transport.fetchJobs()).resolves.toEqual([{ id: 'job-2' }]);
    expect(serviceMocks.fetchLegacyJobStatuses).toHaveBeenCalledTimes(1);

    stop();
  });
});
