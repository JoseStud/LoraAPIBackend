import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';

import { useJobQueue } from '@/composables/generation/useJobQueue';
import { useGenerationConnectionStore, useGenerationQueueStore } from '@/stores/generation';

const serviceMocks = vi.hoisted(() => ({
  fetchActiveGenerationJobs: vi.fn(),
  cancelGenerationJob: vi.fn(),
}));

vi.mock('@/services', () => ({
  fetchActiveGenerationJobs: serviceMocks.fetchActiveGenerationJobs,
  cancelGenerationJob: serviceMocks.cancelGenerationJob,
  buildAdapterListQuery: vi.fn(),
}));

vi.mock('@/services/generation/generationService', () => ({
  fetchActiveGenerationJobs: serviceMocks.fetchActiveGenerationJobs,
  cancelGenerationJob: serviceMocks.cancelGenerationJob,
}));

const notificationMocks = vi.hoisted(() => ({
  notifications: { value: [] },
  toastVisible: { value: false },
  toastMessage: { value: '' },
  toastType: { value: 'info' },
  toastDuration: { value: 0 },
  showToast: vi.fn(),
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
  showToastInfo: vi.fn(),
  showToastWarning: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showWarning: vi.fn(),
  addNotification: vi.fn(),
  notify: vi.fn(),
  removeNotification: vi.fn(),
  clearAll: vi.fn(),
  hideToast: vi.fn(),
  clearToastTimer: vi.fn(),
}));

vi.mock('@/composables/shared', async () => {
  const actual = await vi.importActual('@/composables/shared');
  return {
    ...actual,
    useNotifications: () => notificationMocks,
  };
});

vi.mock('@/utils/backend', () => ({
  DEFAULT_BACKEND_BASE: '/api/v1',
  useBackendBase: () => computed(() => '/api/v1'),
  resolveBackendUrl: (path: string) => `/api/v1${path}`,
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
    notificationMocks.showToastSuccess.mockClear();
    notificationMocks.showToastError.mockClear();
    notificationMocks.showToastInfo.mockClear();

    const connectionStore = useGenerationConnectionStore();
    connectionStore.reset();
    connectionStore.setQueueManagerActive(false);
  });

  it('continues polling after transient failures', async () => {
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

    const disabled = ref(true);

    await withQueue(async (queue) => {
      disabled.value = false;

      await queue.refresh();
      await Promise.resolve();
      await nextTick();

      expect(serviceMocks.fetchActiveGenerationJobs).toHaveBeenCalledTimes(1);
      expect(queue.jobs.value).toHaveLength(0);

      await queue.refresh();
      await Promise.resolve();
      await nextTick();

      expect(serviceMocks.fetchActiveGenerationJobs).toHaveBeenCalledTimes(2);
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

      expect(notificationMocks.showToastSuccess).toHaveBeenCalledWith('Generation completed!');
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

      expect(notificationMocks.showToastError).toHaveBeenCalledWith('Generation failed: Boom');
    }, () => ({
      disabled: computed(() => nextDisabled.value),
    }));
  });

  it('does not poll when a manager is active', async () => {
    const connectionStore = useGenerationConnectionStore();
    connectionStore.setQueueManagerActive(true);

    await withQueue(async (queue) => {
      await queue.refresh();
      await Promise.resolve();

      expect(serviceMocks.fetchActiveGenerationJobs).not.toHaveBeenCalled();
      expect(queue.isPolling.value).toBe(false);
      expect(queue.isReady.value).toBe(true);
    });
  });

  it('resumes polling when the manager becomes inactive', async () => {
    const connectionStore = useGenerationConnectionStore();
    connectionStore.setQueueManagerActive(true);
    serviceMocks.fetchActiveGenerationJobs.mockResolvedValueOnce([
      { id: 'job-1', status: 'processing', progress: 10 },
    ]);

    await withQueue(async (queue) => {
      await queue.refresh();
      await Promise.resolve();
      expect(serviceMocks.fetchActiveGenerationJobs).not.toHaveBeenCalled();

      connectionStore.setQueueManagerActive(false);
      await nextTick();

      await queue.refresh();
      await Promise.resolve();

      await vi.waitFor(() => {
        expect(serviceMocks.fetchActiveGenerationJobs).toHaveBeenCalledTimes(1);
        expect(queue.jobs.value).toHaveLength(1);
      });
    });
  });
});


