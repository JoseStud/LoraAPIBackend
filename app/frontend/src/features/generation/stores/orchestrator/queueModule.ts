/** @internal */
import { computed, readonly, ref } from 'vue';

import { GenerationJobStatusSchema } from '@/schemas';
import { normalizeGenerationProgress } from '@/utils/progress';
import { normalizeJobStatus } from '@/utils/status';
import type { DeepReadonly } from '@/utils/freezeDeep';
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationJob,
  GenerationProgressMessage,
  ProgressUpdate,
} from '@/types';

type GenerationJobIdentifierOverrides = {
  id?: string | number;
  jobId?: string | number;
  uiId?: string | number;
  backendId?: string | number;
};

export type GenerationJobInput = Partial<
  Omit<GenerationJob, 'id' | 'jobId' | 'uiId' | 'backendId'>
> &
  GenerationJobIdentifierOverrides;

const CANCELLABLE_STATUSES: ReadonlySet<GenerationJob['status']> = new Set([
  'queued',
  'processing',
]);

const normalizeIdentifier = (identifier: unknown): string => {
  if (typeof identifier === 'number' || typeof identifier === 'string') {
    const normalized = String(identifier).trim();
    return normalized;
  }
  return '';
};

const resolveUiId = (job: GenerationJobInput): string => {
  const id =
    normalizeIdentifier(job.uiId ?? job.id) ||
    normalizeIdentifier(job.jobId) ||
    normalizeIdentifier(job.backendId);

  return id || `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const resolveBackendId = (job: GenerationJobInput, uiId: string): string => {
  const backendId =
    normalizeIdentifier(job.backendId) ||
    normalizeIdentifier(job.jobId) ||
    normalizeIdentifier(job.id);

  return backendId || uiId;
};

const toStoredJob = (job: GenerationJobInput): GenerationJob => {
  const uiId = resolveUiId(job);
  const backendId = resolveBackendId(job, uiId);
  const startTime = job.startTime ?? job.created_at ?? new Date().toISOString();
  const parsed = GenerationJobStatusSchema.parse({
    ...job,
    id: uiId,
    jobId: backendId,
    status: normalizeJobStatus(job.status),
    progress: normalizeGenerationProgress(job.progress),
    created_at: job.created_at ?? startTime,
    startTime,
  }) as GenerationJob;

  return {
    ...parsed,
    id: uiId,
    jobId: backendId,
    uiId,
    backendId,
    progress: normalizeGenerationProgress(parsed.progress),
  };
};

export const createQueueModule = () => {
  const jobs = ref<GenerationJob[]>([]);
  const jobsState = readonly(jobs);

  const findJobIndex = (identifier: string): number => {
    if (!identifier) {
      return -1;
    }

    return jobs.value.findIndex(
      (job) => job.uiId === identifier || job.backendId === identifier,
    );
  };

  const getJobByIdentifier = (identifier: string): GenerationJob | undefined => {
    if (!identifier) {
      return undefined;
    }

    return jobs.value.find(
      (job) => job.uiId === identifier || job.backendId === identifier,
    );
  };

  const activeJobs = computed(() => jobs.value);

  const jobsByUiId = computed(() => {
    const map = new Map<string, GenerationJob>();
    for (const job of jobs.value) {
      map.set(job.uiId, job);
    }
    return map;
  });

  const jobsByBackendId = computed(() => {
    const map = new Map<string, GenerationJob>();
    for (const job of jobs.value) {
      map.set(job.backendId, job);
    }
    return map;
  });

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
    let existingIndex = findJobIndex(stored.uiId);

    if (existingIndex < 0) {
      existingIndex = findJobIndex(stored.backendId);
    }

    if (existingIndex >= 0) {
      const nextJobs = [...jobs.value];
      nextJobs.splice(existingIndex, 1, stored);
      jobs.value = nextJobs;
    } else {
      jobs.value = [...jobs.value, stored];
    }
    return stored;
  };

  const setJobs = (list: GenerationJobInput[]): void => {
    jobs.value = list.map((job) => toStoredJob(job));
  };

  const updateJob = (jobId: string, updates: Partial<GenerationJob>): void => {
    const identifier = normalizeIdentifier(jobId);
    if (!identifier) {
      return;
    }

    const index = findJobIndex(identifier);
    if (index >= 0) {
      const existing = jobs.value[index];
      const merged = toStoredJob({
        ...existing,
        ...updates,
        uiId: existing.uiId,
        backendId: existing.backendId,
      });
      const nextJobs = [...jobs.value];
      nextJobs.splice(index, 1, merged);
      jobs.value = nextJobs;
    }
  };

  const removeJob = (jobId: string): void => {
    const identifier = normalizeIdentifier(jobId);
    if (!identifier) {
      return;
    }

    jobs.value = jobs.value.filter(
      (job) => job.uiId !== identifier && job.backendId !== identifier,
    );
  };

  const clearCompletedJobs = (): void => {
    jobs.value = jobs.value.filter((job) => !['completed', 'failed'].includes(job.status));
  };

  const isJobCancellable = (job: GenerationJob | DeepReadonly<GenerationJob>): boolean =>
    CANCELLABLE_STATUSES.has(job.status);

  const getCancellableJobs = (): GenerationJob[] => jobs.value.filter((job) => isJobCancellable(job));

  const handleProgressMessage = (message: GenerationProgressMessage | ProgressUpdate): void => {
    const backendJobId = normalizeIdentifier(message.job_id);
    if (!backendJobId) {
      return;
    }

    const job = getJobByIdentifier(backendJobId);
    const updates: Partial<GenerationJob> = {
      status: normalizeJobStatus(message.status),
      progress: normalizeGenerationProgress(message.progress),
      current_step: typeof message.current_step === 'number' ? message.current_step : job?.current_step,
      total_steps: typeof message.total_steps === 'number' ? message.total_steps : job?.total_steps,
      backendId: backendJobId,
      jobId: backendJobId,
    };

    if (!job) {
      enqueueJob({
        id: backendJobId,
        jobId: backendJobId,
        uiId: backendJobId,
        backendId: backendJobId,
        ...updates,
      });
      return;
    }

    updateJob(backendJobId, updates);
  };

  const handleCompletionMessage = (message: GenerationCompleteMessage): void => {
    const backendJobId = normalizeIdentifier(message.job_id);
    if (!backendJobId) {
      return;
    }

    removeJob(backendJobId);
  };

  const handleErrorMessage = (message: GenerationErrorMessage): void => {
    const backendJobId = normalizeIdentifier(message.job_id);
    if (!backendJobId) {
      return;
    }

    removeJob(backendJobId);
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
    jobsByUiId,
    jobsByBackendId,
    sortedActiveJobs,
    hasActiveJobs,
    enqueueJob,
    setJobs,
    updateJob,
    removeJob,
    clearCompletedJobs,
    isJobCancellable,
    getCancellableJobs,
    getJobByIdentifier,
    handleProgressMessage,
    handleCompletionMessage,
    handleErrorMessage,
    ingestQueue,
    resetQueue,
  };
};

export type QueueModule = ReturnType<typeof createQueueModule>;
