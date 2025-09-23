import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { mount } from '@vue/test-utils';

import { useJobQueue } from '@/composables/useJobQueue';
import { useGenerationQueueStore } from '@/stores/generation';
import { ApiError } from '@/types';

const serviceMocks = vi.hoisted(() => ({
  fetchActiveGenerationJobs: vi.fn(),
  fetchLegacyJobStatuses: vi.fn(),
}));

vi.mock('@/services', () => serviceMocks);

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

const withQueue = async (
  run: (queue: ReturnType<typeof useJobQueue>) => Promise<void>,
  optionsFactory?: () => Parameters<typeof useJobQueue>[0],
) => {
  let queueInstance: ReturnType<typeof useJobQueue> | undefined;

  const wrapper = mount({
    setup() {
      queueInstance = useJobQueue(optionsFactory?.() ?? {});
      return () => null;
    },
  });

  try {
    await run(queueInstance!);
  } finally {
    wrapper.unmount();
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

    const disabled = ref(true);

    await withQueue(async (queue) => {
      disabled.value = false;
      await queue.refresh();
      await Promise.resolve();

      expect(queue.apiAvailable.value).toBe(true);
      expect(serviceMocks.fetchActiveGenerationJobs).toHaveBeenCalledTimes(1);
      expect(serviceMocks.fetchLegacyJobStatuses).toHaveBeenCalledTimes(1);

      await queue.refresh();
      await Promise.resolve();

      expect(serviceMocks.fetchActiveGenerationJobs).toHaveBeenCalledTimes(2);
      expect(serviceMocks.fetchLegacyJobStatuses).toHaveBeenCalledTimes(1);
      expect(queue.jobs.value).toHaveLength(1);
      expect(queue.jobs.value[0]).toMatchObject({ id: 'job-1', status: 'processing', progress: 25 });
    }, () => ({
      disabled: computed(() => disabled.value),
    }));
  });

  it('emits notifications for completion and failure updates', async () => {
    serviceMocks.fetchActiveGenerationJobs.mockResolvedValueOnce([
      {
        id: 'job-2',
        status: 'completed',
        result: { id: 'result-1', job_id: 'job-2' },
      },
    ]);

    const disabled = ref(true);

    await withQueue(async (queue) => {
      disabled.value = false;
      const queueStore = useGenerationQueueStore();
      queueStore.enqueueJob({ id: 'job-2', status: 'processing' });

      await queue.refresh();
      await Promise.resolve();

      expect(notificationMocks.showSuccess).toHaveBeenCalledWith('Generation completed!');
      expect(queue.jobs.value).toHaveLength(0);
    }, () => ({
      disabled: computed(() => disabled.value),
    }));

    serviceMocks.fetchActiveGenerationJobs.mockResolvedValueOnce([
      { id: 'job-3', status: 'failed', error: 'Boom' },
    ]);

    const nextDisabled = ref(true);

    await withQueue(async (queue) => {
      nextDisabled.value = false;
      const queueStore = useGenerationQueueStore();
      queueStore.enqueueJob({ id: 'job-3', status: 'processing' });

      await queue.refresh();
      await Promise.resolve();

      expect(notificationMocks.showError).toHaveBeenCalledWith('Generation failed: Boom');
    }, () => ({
      disabled: computed(() => nextDisabled.value),
    }));
  });
});


