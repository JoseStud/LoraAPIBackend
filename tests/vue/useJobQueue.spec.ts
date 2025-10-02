import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import type { GenerationJob } from '@/types';

const orchestratorRefs = {
  sortedActiveJobs: ref<GenerationJob[]>([]),
  queueManagerActive: ref(false),
  activeJobs: ref<GenerationJob[]>([]),
  recentResults: ref([]),
  systemStatus: ref({}),
  isConnected: ref(false),
  isInitialized: ref(false),
  acquire: vi.fn(),
};

vi.mock('@/composables/generation/useGenerationOrchestratorManager', () => ({
  useGenerationOrchestratorManager: () => orchestratorRefs,
}));

describe('useJobQueue', () => {
  beforeEach(() => {
    orchestratorRefs.sortedActiveJobs.value = [
      {
        id: 'job-1',
        uiId: 'job-1',
        backendId: 'backend-1',
        status: 'processing',
        progress: 10,
      } as GenerationJob,
    ];
    orchestratorRefs.queueManagerActive.value = false;
    orchestratorRefs.acquire.mockReset();
  });

  it('mirrors the orchestrator manager job list', async () => {
    const { useJobQueue } = await import('@/composables/generation/useJobQueue');
    const queue = useJobQueue();
    expect(queue.jobs.value).toEqual([
      expect.objectContaining({ id: 'job-1', status: 'processing', progress: 10 }),
    ]);

    orchestratorRefs.sortedActiveJobs.value = [
      {
        id: 'job-2',
        uiId: 'job-2',
        backendId: 'backend-2',
        status: 'queued',
        progress: 0,
      } as GenerationJob,
    ];

    expect(queue.jobs.value).toEqual([
      expect.objectContaining({ id: 'job-2', status: 'queued', progress: 0 }),
    ]);
  });

  it('exposes the orchestrator queue manager state', async () => {
    const { useJobQueue } = await import('@/composables/generation/useJobQueue');
    const queue = useJobQueue();
    expect(queue.queueManagerActive.value).toBe(false);

    orchestratorRefs.queueManagerActive.value = true;
    expect(queue.queueManagerActive.value).toBe(true);
  });

  it('is always ready to render', async () => {
    const { useJobQueue } = await import('@/composables/generation/useJobQueue');
    const queue = useJobQueue();
    expect(queue.isReady.value).toBe(true);

    orchestratorRefs.queueManagerActive.value = true;
    expect(queue.isReady.value).toBe(true);
  });
});
