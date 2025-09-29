import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope } from 'vue';
import { storeToRefs } from 'pinia';

import { useJobQueueActions } from '@/composables/generation/useJobQueueActions';
import { useGenerationQueueStore } from '@/stores/generation';

const serviceMocks = vi.hoisted(() => ({
  cancelGenerationJob: vi.fn(),
  fetchActiveGenerationJobs: vi.fn(),
  fetchSystemStatus: vi.fn(),
  useDashboardStatsApi: vi.fn(() => ({ fetchData: vi.fn() })),
  useSystemStatusApi: vi.fn(() => ({ fetchData: vi.fn() })),
}));


vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cancelGenerationJob: serviceMocks.cancelGenerationJob,
    fetchActiveGenerationJobs: serviceMocks.fetchActiveGenerationJobs,
    buildAdapterListQuery: vi.fn(),
  };
});


vi.mock('@/services/generation/generationService', () => ({
  cancelGenerationJob: serviceMocks.cancelGenerationJob,
  fetchActiveGenerationJobs: serviceMocks.fetchActiveGenerationJobs,
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

vi.mock('@/utils/backend', async () => {
  const actual = await vi.importActual<typeof import('@/utils/backend')>('@/utils/backend');
  return {
    ...actual,
    DEFAULT_BACKEND_BASE: '/api/v1',
    useBackendBase: () => computed(() => '/api/v1'),
    resolveBackendUrl: (path: string) => `/api/v1${path}`,
  };
});

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
    notificationMocks.showToastInfo.mockClear();
    notificationMocks.showToastError.mockClear();
  });

  it('cancels a job via the primary endpoint', async () => {
    serviceMocks.cancelGenerationJob.mockResolvedValueOnce({ success: true });

    await withActions(async (actions) => {
      const queueStore = useGenerationQueueStore();
      const { jobs } = storeToRefs(queueStore);
      queueStore.enqueueJob({ id: 'job-1', jobId: 'backend-1', status: 'processing' });

      const result = await actions.cancelJob('job-1');

      expect(result).toBe(true);
      expect(notificationMocks.showToastInfo).toHaveBeenCalledWith('Job cancelled');
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
      expect(notificationMocks.showToastError).toHaveBeenCalledWith('Failed to cancel job');
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
      expect(notificationMocks.showToastError).toHaveBeenCalledWith('Failed to cancel job');
      expect(jobs.value).toHaveLength(1);
    });
  });
});
