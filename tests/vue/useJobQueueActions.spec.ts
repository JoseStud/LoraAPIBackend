import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope } from 'vue';
import { storeToRefs } from 'pinia';

import { useJobQueueActions } from '@/composables/generation/useJobQueueActions';
import { useGenerationQueueStore } from '@/stores/generation';

const serviceMocks = vi.hoisted(() => ({
  cancelGenerationJob: vi.fn(),
  fetchActiveGenerationJobs: vi.fn(),
}));

vi.mock('@/services', () => ({
  cancelGenerationJob: serviceMocks.cancelGenerationJob,
  fetchActiveGenerationJobs: serviceMocks.fetchActiveGenerationJobs,
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

const withActions = async (
  run: (actions: ReturnType<typeof useJobQueueActions>) => Promise<void>,
) => {
  const scope = effectScope();
  let actionsInstance: ReturnType<typeof useJobQueueActions>;

  scope.run(() => {
    actionsInstance = useJobQueueActions();
  });

  try {
    await run(actionsInstance!);
  } finally {
    scope.stop();
  }
};

describe('useJobQueueActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastMocks.showInfo.mockClear();
    toastMocks.showError.mockClear();
  });

  it('cancels a job via the primary endpoint', async () => {
    serviceMocks.cancelGenerationJob.mockResolvedValueOnce({ success: true });

    await withActions(async (actions) => {
      const queueStore = useGenerationQueueStore();
      const { jobs } = storeToRefs(queueStore);
      queueStore.enqueueJob({ id: 'job-1', jobId: 'backend-1', status: 'processing' });

      const result = await actions.cancelJob('job-1');

      expect(result).toBe(true);
      expect(toastMocks.showInfo).toHaveBeenCalledWith('Job cancelled');
      expect(jobs.value).toHaveLength(0);
    });
  });

  it('notifies when cancellation fails', async () => {
    serviceMocks.cancelGenerationJob.mockResolvedValueOnce({ success: false });

    await withActions(async (actions) => {
      const queueStore = useGenerationQueueStore();
      const { jobs } = storeToRefs(queueStore);
      queueStore.enqueueJob({ id: 'job-3', jobId: 'backend-3', status: 'queued' });

      const result = await actions.cancelJob('job-3');

      expect(result).toBe(false);
      expect(toastMocks.showError).toHaveBeenCalledWith('Failed to cancel job');
      expect(jobs.value).toHaveLength(1);
    });
  });

  it('handles request failures gracefully', async () => {
    serviceMocks.cancelGenerationJob.mockRejectedValueOnce(new Error('primary failed'));

    await withActions(async (actions) => {
      const queueStore = useGenerationQueueStore();
      const { jobs } = storeToRefs(queueStore);
      queueStore.enqueueJob({ id: 'job-4', jobId: 'backend-4', status: 'queued' });

      const result = await actions.cancelJob('job-4');

      expect(result).toBe(false);
      expect(toastMocks.showError).toHaveBeenCalledWith('Failed to cancel job');
      expect(jobs.value).toHaveLength(1);
    });
  });
});
