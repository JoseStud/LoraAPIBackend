/** @internal */
import { computed, readonly, ref } from 'vue';

import { GenerationJobStatusSchema } from '@/schemas';
import { normalizeGenerationProgress } from '@/utils/progress';
import { normalizeJobStatus } from '@/utils/status';
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationJob,
  GenerationProgressMessage,
  ProgressUpdate,
} from '@/types';

export type GenerationJobInput = Partial<GenerationJob> & {
  id?: string | number;
  jobId?: string | number;
};

const CANCELLABLE_STATUSES: ReadonlySet<GenerationJob['status']> = new Set([
  'queued',
  'processing',
]);

const resolveJobId = (job: GenerationJobInput): string => {
  const rawId = job.id ?? job.jobId;
  const id = typeof rawId === 'number' || typeof rawId === 'string' ? String(rawId) : '';
  return id || `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toStoredJob = (job: GenerationJobInput): GenerationJob => {
  const id = resolveJobId(job);
  const startTime = job.startTime ?? job.created_at ?? new Date().toISOString();
  const parsed = GenerationJobStatusSchema.parse({
    id,
    jobId: job.jobId ?? job.id ?? id,
    status: normalizeJobStatus(job.status),
    progress: normalizeGenerationProgress(job.progress),
    created_at: job.created_at ?? startTime,
    startTime,
    ...job,
  }) as GenerationJob;

  return {
    ...parsed,
    progress: normalizeGenerationProgress(parsed.progress),
  };
};

export const createQueueModule = () => {
  const jobs = ref<GenerationJob[]>([]);
  const jobsState = readonly(jobs);

  const activeJobs = computed(() => jobs.value);

  const sortedActiveJobs = computed(() => {
    const statusPriority: Record<GenerationJob['status'], number> = {
      processing: 0,
      queued: 1,
      completed: 2,
      failed: 3,
    };

    return [...jobs.value].sort((a, b) => {
      const aPriority = statusPriority[a.status] ?? 4;
      const bPriority = statusPriority[b.status] ?? 4;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      const aCreated = Date.parse(a.created_at ?? a.startTime ?? '');
      const bCreated = Date.parse(b.created_at ?? b.startTime ?? '');

      if (Number.isNaN(aCreated) && Number.isNaN(bCreated)) {
        return 0;
      }

      if (Number.isNaN(aCreated)) {
        return 1;
      }

      if (Number.isNaN(bCreated)) {
        return -1;
      }

      return bCreated - aCreated;
    });
  });

  const hasActiveJobs = computed(() => activeJobs.value.length > 0);

  const enqueueJob = (job: GenerationJobInput): GenerationJob => {
    const stored = toStoredJob(job);
    const existingIndex = jobs.value.findIndex((item) => item.id === stored.id);
    if (existingIndex >= 0) {
      jobs.value.splice(existingIndex, 1, stored);
    } else {
      jobs.value.push(stored);
    }
    return stored;
  };

  const setJobs = (list: GenerationJobInput[]): void => {
    jobs.value = list.map((job) => toStoredJob(job));
  };

  const updateJob = (jobId: string, updates: Partial<GenerationJob>): void => {
    const index = jobs.value.findIndex((job) => job.id === jobId);
    if (index >= 0) {
      const merged = { ...jobs.value[index], ...updates } as GenerationJob;
      merged.progress = normalizeGenerationProgress(merged.progress);
      merged.status = normalizeJobStatus(merged.status);
      jobs.value.splice(index, 1, merged);
    }
  };

  const removeJob = (jobId: string): void => {
    jobs.value = jobs.value.filter((job) => job.id !== jobId);
  };

  const clearCompletedJobs = (): void => {
    jobs.value = jobs.value.filter((job) => !['completed', 'failed'].includes(job.status));
  };

  const isJobCancellable = (job: GenerationJob): boolean => CANCELLABLE_STATUSES.has(job.status);

  const getCancellableJobs = (): GenerationJob[] => jobs.value.filter((job) => isJobCancellable(job));

  const handleProgressMessage = (message: GenerationProgressMessage | ProgressUpdate): void => {
    const jobId = message.job_id;
    const job = jobs.value.find((item) => item.id === jobId);
    const updates: Partial<GenerationJob> = {
      status: normalizeJobStatus(message.status),
      progress: normalizeGenerationProgress(message.progress),
      current_step: typeof message.current_step === 'number' ? message.current_step : job?.current_step,
      total_steps: typeof message.total_steps === 'number' ? message.total_steps : job?.total_steps,
    };

    if (!job) {
      enqueueJob({ id: jobId, ...updates });
      return;
    }

    updateJob(jobId, updates);
  };

  const handleCompletionMessage = (message: GenerationCompleteMessage): void => {
    removeJob(message.job_id);
  };

  const handleErrorMessage = (message: GenerationErrorMessage): void => {
    removeJob(message.job_id);
  };

  const ingestQueue = (list: GenerationJobInput[] | undefined | null): void => {
    if (!Array.isArray(list)) {
      return;
    }
    setJobs(list);
  };

  const resetQueue = (): void => {
    jobs.value = [];
  };

  return {
    jobs: jobsState,
    activeJobs,
    sortedActiveJobs,
    hasActiveJobs,
    enqueueJob,
    setJobs,
    updateJob,
    removeJob,
    clearCompletedJobs,
    isJobCancellable,
    getCancellableJobs,
    handleProgressMessage,
    handleCompletionMessage,
    handleErrorMessage,
    ingestQueue,
    resetQueue,
  };
};

export type QueueModule = ReturnType<typeof createQueueModule>;
