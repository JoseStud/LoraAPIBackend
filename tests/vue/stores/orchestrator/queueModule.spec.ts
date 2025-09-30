import { describe, it, expect } from 'vitest';

import { createQueueModule } from '@/features/generation/stores/orchestrator/queueModule';

const createProgressMessage = (overrides: Partial<any> = {}) => ({
  job_id: 'job-1',
  progress: 0.5,
  status: 'processing',
  current_step: 5,
  total_steps: 10,
  ...overrides,
});

describe('queueModule', () => {
  it('normalizes jobs when enqueuing and sorting', () => {
    const queue = createQueueModule();

    queue.enqueueJob({ id: 'job-1', status: 'processing', progress: 0.25 } as any);
    queue.enqueueJob({ id: 'job-2', status: 'queued', created_at: new Date(Date.now() - 1000).toISOString() } as any);

    expect(queue.jobs.value).toHaveLength(2);
    expect(queue.jobs.value[0]?.progress).toBe(25);

    const sorted = queue.sortedActiveJobs.value;
    expect(sorted[0]?.status).toBe('processing');
    expect(sorted[1]?.status).toBe('queued');
  });

  it('updates progress and removes jobs on completion', () => {
    const queue = createQueueModule();

    queue.enqueueJob({ id: 'job-1', status: 'queued', progress: 0 } as any);

    queue.handleProgressMessage(createProgressMessage());
    expect(queue.jobs.value[0]?.progress).toBe(50);
    expect(queue.jobs.value[0]?.status).toBe('processing');

    queue.handleCompletionMessage({ job_id: 'job-1' } as any);
    expect(queue.jobs.value).toHaveLength(0);
  });

  it('cancels completed jobs when clearing queue', async () => {
    const queue = createQueueModule();
    queue.enqueueJob({ id: 'job-1', status: 'failed' } as any);
    queue.enqueueJob({ id: 'job-2', status: 'processing' } as any);

    queue.clearCompletedJobs();
    expect(queue.jobs.value).toHaveLength(1);
    expect(queue.jobs.value[0]?.id).toBe('job-2');
  });
});
