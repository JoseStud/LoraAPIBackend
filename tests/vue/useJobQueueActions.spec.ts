import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope } from 'vue';
import { storeToRefs } from 'pinia';

import { useJobQueueActions } from '@/composables/useJobQueueActions';
import { useGenerationQueueStore } from '@/stores/generation';

const serviceMocks = vi.hoisted(() => ({
  cancelGenerationJob: vi.fn(),
  cancelLegacyJob: vi.fn(),
}));

vi.mock('@/services', () => ({
  fetchActiveGenerationJobs: vi.fn(),
  fetchLegacyJobStatuses: vi.fn(),
  cancelGenerationJob: serviceMocks.cancelGenerationJob,
  cancelLegacyJob: serviceMocks.cancelLegacyJob,
}));

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
    notificationMocks.notifications.value = [];
  });

  it('cancels a job via the primary endpoint', async () => {
    serviceMocks.cancelGenerationJob.mockResolvedValueOnce({ success: true });

    await withActions(async (actions) => {
      const queueStore = useGenerationQueueStore();
      const { jobs } = storeToRefs(queueStore);
      queueStore.enqueueJob({ id: 'job-1', jobId: 'backend-1', status: 'processing' });

      const result = await actions.cancelJob('job-1');

      expect(result).toBe(true);
      expect(serviceMocks.cancelLegacyJob).not.toHaveBeenCalled();
      expect(notificationMocks.showInfo).toHaveBeenCalledWith('Job cancelled');
      expect(jobs.value).toHaveLength(0);
    });
  });

  it('falls back to the legacy endpoint when the primary fails', async () => {
    serviceMocks.cancelGenerationJob.mockRejectedValueOnce(new Error('primary failed'));
    serviceMocks.cancelLegacyJob.mockResolvedValueOnce(true);

    await withActions(async (actions) => {
      const queueStore = useGenerationQueueStore();
      const { jobs } = storeToRefs(queueStore);
      queueStore.enqueueJob({ id: 'job-2', jobId: 'backend-2', status: 'queued' });

      const result = await actions.cancelJob('job-2');

      expect(result).toBe(true);
      expect(serviceMocks.cancelLegacyJob).toHaveBeenCalledWith('backend-2', '/api/v1');
      expect(notificationMocks.showInfo).toHaveBeenCalledWith('Job cancelled');
      expect(jobs.value).toHaveLength(0);
    });
  });

  it('notifies when cancellation fails', async () => {
    serviceMocks.cancelGenerationJob.mockRejectedValueOnce(new Error('primary failed'));
    serviceMocks.cancelLegacyJob.mockResolvedValueOnce(false);

    await withActions(async (actions) => {
      const queueStore = useGenerationQueueStore();
      const { jobs } = storeToRefs(queueStore);
      queueStore.enqueueJob({ id: 'job-3', jobId: 'backend-3', status: 'queued' });

      const result = await actions.cancelJob('job-3');

      expect(result).toBe(false);
      expect(notificationMocks.showError).toHaveBeenCalledWith('Failed to cancel job');
      expect(jobs.value).toHaveLength(1);
    });
  });
});
