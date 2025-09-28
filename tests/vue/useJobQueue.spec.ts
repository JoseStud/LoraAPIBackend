import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { mount } from '@vue/test-utils';

import { useJobQueue } from '@/composables/generation/useJobQueue';
import { useGenerationQueueStore } from '@/stores/generation';

const serviceMocks = vi.hoisted(() => ({
  fetchActiveGenerationJobs: vi.fn(),
  cancelGenerationJob: vi.fn(),
}));

vi.mock('@/services', () => ({
  fetchActiveGenerationJobs: serviceMocks.fetchActiveGenerationJobs,
  cancelGenerationJob: serviceMocks.cancelGenerationJob,
  buildAdapterListQuery: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  isVisible: { value: false },
  message: { value: '' },
  type: { value: 'info' },
  duration: { value: 3000 },
  showToast: vi.fn(),
  hideToast: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showWarning: vi.fn(),
  clearTimer: vi.fn(),
}));

vi.mock('@/composables/shared', async () => {
  const actual = await vi.importActual('@/composables/shared');
  return {
    ...actual,
    useToast: () => toastMocks,
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
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    toastMocks.showInfo.mockClear();
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

      expect(serviceMocks.fetchActiveGenerationJobs).toHaveBeenCalledTimes(1);
      expect(queue.jobs.value).toHaveLength(0);

      await queue.refresh();
      await Promise.resolve();

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

      expect(toastMocks.showSuccess).toHaveBeenCalledWith('Generation completed!');
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

      expect(toastMocks.showError).toHaveBeenCalledWith('Generation failed: Boom');
    }, () => ({
      disabled: computed(() => nextDisabled.value),
    }));
  });
});


