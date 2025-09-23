import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { normalizeGenerationProgress } from '@/utils/progress';
import { normalizeJobStatus } from '@/utils/status';
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationJob,
  GenerationProgressMessage,
  GenerationResult,
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
  const progress = normalizeGenerationProgress(
    typeof job.progress === 'number' ? job.progress : undefined,
  );
  const status = normalizeJobStatus(typeof job.status === 'string' ? job.status : undefined);

  const createdAt = job.created_at ?? startTime;

  return {
    ...job,
    id,
    startTime,
    created_at: createdAt,
    progress,
    status,
  } as GenerationJob;
};

const toResultFromCompletion = (message: GenerationCompleteMessage): GenerationResult => {
  const createdAt = message.created_at ?? new Date().toISOString();
  const imageUrl = message.image_url
    ?? (Array.isArray(message.images) ? message.images[0] ?? null : null);

  return {
    id: message.result_id ?? message.job_id,
    job_id: message.job_id,
    result_id: message.result_id,
    prompt: message.prompt,
    negative_prompt: message.negative_prompt,
    image_url: imageUrl,
    width: message.width,
    height: message.height,
    steps: message.steps,
    cfg_scale: message.cfg_scale,
    seed: message.seed ?? null,
    created_at: createdAt,
  };
};

export const useGenerationQueueStore = defineStore('generation-queue', () => {
  const jobs = ref<GenerationJob[]>([]);

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

  function enqueueJob(job: GenerationJobInput): GenerationJob {
    const stored = toStoredJob(job);
    const existingIndex = jobs.value.findIndex((item) => item.id === stored.id);
    if (existingIndex >= 0) {
      jobs.value.splice(existingIndex, 1, stored);
    } else {
      jobs.value.push(stored);
    }
    return stored;
  }

  function setJobs(list: GenerationJobInput[]): void {
    jobs.value = list.map((job) => toStoredJob(job));
  }

  function updateJob(jobId: string, updates: Partial<GenerationJob>): void {
    const index = jobs.value.findIndex((job) => job.id === jobId);
    if (index >= 0) {
      const merged = { ...jobs.value[index], ...updates } as GenerationJob;
      merged.progress = normalizeGenerationProgress(merged.progress);
      merged.status = normalizeJobStatus(merged.status);
      jobs.value.splice(index, 1, merged);
    }
  }

  function removeJob(jobId: string): void {
    jobs.value = jobs.value.filter((job) => job.id !== jobId);
  }

  function clearCompletedJobs(): void {
    jobs.value = jobs.value.filter((job) => !['completed', 'failed'].includes(job.status));
  }

  function isJobCancellable(job: GenerationJob): boolean {
    return CANCELLABLE_STATUSES.has(job.status);
  }

  function getCancellableJobs(): GenerationJob[] {
    return jobs.value.filter((job) => isJobCancellable(job));
  }

  function handleProgressMessage(message: GenerationProgressMessage | ProgressUpdate): void {
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
  }

  function handleCompletionMessage(message: GenerationCompleteMessage): GenerationResult {
    removeJob(message.job_id);
    return toResultFromCompletion(message);
  }

  function handleErrorMessage(message: GenerationErrorMessage): void {
    removeJob(message.job_id);
  }

  function ingestQueue(list: GenerationJobInput[] | undefined | null): void {
    if (!Array.isArray(list)) {
      return;
    }
    setJobs(list);
  }

  function reset(): void {
    jobs.value = [];
  }

  return {
    jobs,
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
    reset,
  };
});

export type GenerationQueueStore = ReturnType<typeof useGenerationQueueStore>;
