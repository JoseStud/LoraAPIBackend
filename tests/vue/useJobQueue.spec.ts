import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import type { GenerationJobView, ReadonlyQueue } from '@/features/generation/orchestrator';

const sortedActiveJobs = ref<ReadonlyQueue>(Object.freeze([] as GenerationJobView[]));
const queueManagerActive = ref(false);
const widgetBinding = vi.hoisted(() => vi.fn());

vi.mock('@/features/generation/orchestrator', () => ({
  useGenerationOrchestratorFacade: () => ({
    sortedActiveJobs,
    queueManagerActive,
  }),
}));

vi.mock('@/features/generation/composables/useGenerationWidgetBinding', () => ({
  useGenerationWidgetBinding: widgetBinding,
}));

describe('useJobQueue', () => {
  beforeEach(() => {
    sortedActiveJobs.value = Object.freeze([
      Object.freeze({
        id: 'job-1',
        uiId: 'job-1',
        backendId: 'backend-1',
        jobId: 'backend-1',
        status: 'processing',
        progress: 10,
      }) as GenerationJobView,
    ]) as ReadonlyQueue;
    queueManagerActive.value = false;
    widgetBinding.mockClear();
  });

  it('mirrors the orchestrator manager job list', async () => {
    const { useJobQueue } = await import('@/features/generation/composables/useJobQueueActions');
    const queue = useJobQueue();
    expect(queue.jobs.value).toEqual([
      expect.objectContaining({ id: 'job-1', status: 'processing', progress: 10 }),
    ]);

    sortedActiveJobs.value = Object.freeze([
      Object.freeze({
        id: 'job-2',
        uiId: 'job-2',
        backendId: 'backend-2',
        jobId: 'backend-2',
        status: 'queued',
        progress: 0,
      }) as GenerationJobView,
    ]) as ReadonlyQueue;

    expect(queue.jobs.value).toEqual([
      expect.objectContaining({ id: 'job-2', status: 'queued', progress: 0 }),
    ]);
  });

  it('holds an orchestrator binding while mounted', async () => {
    const { useJobQueue } = await import('@/features/generation/composables/useJobQueueActions');
    useJobQueue();
    expect(widgetBinding).toHaveBeenCalledWith('JobQueue');
  });

  it('exposes the orchestrator queue manager state', async () => {
    const { useJobQueue } = await import('@/features/generation/composables/useJobQueueActions');
    const queue = useJobQueue();
    expect(queue.queueManagerActive.value).toBe(false);

    queueManagerActive.value = true;
    expect(queue.queueManagerActive.value).toBe(true);
  });

  it('is always ready to render', async () => {
    const { useJobQueue } = await import('@/features/generation/composables/useJobQueueActions');
    const queue = useJobQueue();
    expect(queue.isReady.value).toBe(true);

    queueManagerActive.value = true;
    expect(queue.isReady.value).toBe(true);
  });
});
