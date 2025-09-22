import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope } from 'vue';

import { useJobQueue } from '@/composables/useJobQueue';
import { ApiError } from '@/types';

const serviceMocks = vi.hoisted(() => ({
  fetchActiveGenerationJobs: vi.fn(),
  fetchLegacyJobStatuses: vi.fn(),
  cancelGenerationJob: vi.fn(),
  cancelLegacyJob: vi.fn(),
}));

vi.mock('@/services/generationService', () => serviceMocks);

const notificationMocks = vi.hoisted(() => ({
  notifications: { value: [] as unknown[] },
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showWarning: vi.fn(),
  addNotification: vi.fn(),
  removeNotification: vi.fn(),
  clearAll: vi.fn(),
}));

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => notificationMocks,
}));

vi.mock('@/utils/backend', () => ({
  useBackendBase: () => computed(() => '/api/v1'),
}));

const withQueue = async (run: (queue: ReturnType<typeof useJobQueue>) => Promise<void>) => {
  const scope = effectScope();
  let queueInstance: ReturnType<typeof useJobQueue>;

  scope.run(() => {
    queueInstance = useJobQueue();
  });

  try {
    await run(queueInstance!);
  } finally {
    scope.stop();
  }
};

describe('useJobQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationMocks.notifications.value = [];
  });

  it('retries the primary endpoint when fallback returns 404 and continues polling', async () => {
    const fallbackNotFound = new ApiError({
      message: 'Not Found',
      status: 404,
      statusText: 'Not Found',
      payload: null,
      meta: { ok: false, status: 404, statusText: 'Not Found' },
    });

    serviceMocks.fetchActiveGenerationJobs
      .mockRejectedValueOnce(new Error('Primary endpoint failed'))
      .mockResolvedValueOnce([
        {
          id: 'job-1',
          status: 'processing',
          progress: 25,
          message: 'Working',
        },
      ]);

    serviceMocks.fetchLegacyJobStatuses.mockRejectedValueOnce(fallbackNotFound);

    await withQueue(async (queue) => {
      await queue.refresh();

      expect(queue.apiAvailable.value).toBe(true);
      expect(serviceMocks.fetchActiveGenerationJobs).toHaveBeenCalledTimes(1);
      expect(serviceMocks.fetchLegacyJobStatuses).toHaveBeenCalledTimes(1);

      await queue.refresh();

      expect(serviceMocks.fetchActiveGenerationJobs).toHaveBeenCalledTimes(2);
      expect(serviceMocks.fetchLegacyJobStatuses).toHaveBeenCalledTimes(1);
      expect(queue.jobs.value).toHaveLength(1);
      expect(queue.jobs.value[0]).toMatchObject({ id: 'job-1', status: 'processing', progress: 25 });
    });
  });
});


