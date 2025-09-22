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
  SystemStatusPayload,
  SystemStatusState,
} from '@/types';

interface GenerationState {
  systemStatus: SystemStatusState;
  jobs: GenerationJob[];
  results: GenerationResult[];
  isConnected: boolean;
}

const DEFAULT_SYSTEM_STATUS: SystemStatusState = {
  gpu_available: true,
  queue_length: 0,
  status: 'healthy',
  gpu_status: 'Available',
  memory_used: 0,
  memory_total: 8192,
};

const MAX_RESULTS = 20;

type GenerationJobInput = Partial<GenerationJob> & {
  id?: string | number;
  jobId?: string | number;
};

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

const sanitizeResult = (result: GenerationResult): GenerationResult => {
  if (typeof result.created_at === 'string' && result.created_at.trim()) {
    return result;
  }
  return { ...result, created_at: new Date().toISOString() };
};

export const useGenerationStore = defineStore('generation', {
  state: (): GenerationState => ({
    systemStatus: { ...DEFAULT_SYSTEM_STATUS },
    jobs: [],
    results: [],
    isConnected: false,
  }),

  getters: {
    activeJobs: (state): GenerationJob[] => state.jobs,
    recentResults: (state): GenerationResult[] => state.results,
    sortedActiveJobs: (state): GenerationJob[] => {
      const statusPriority: Record<GenerationJob['status'], number> = {
        processing: 0,
        queued: 1,
        completed: 2,
        failed: 3,
      };

      return [...state.jobs].sort((a, b) => {
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
    },
    hasActiveJobs: (state): boolean => state.jobs.length > 0,
  },

  actions: {
    setConnectionState(connected: boolean): void {
      this.isConnected = connected;
    },

    resetSystemStatus(): void {
      this.systemStatus = { ...DEFAULT_SYSTEM_STATUS };
    },

    updateSystemStatus(status: Partial<SystemStatusState>): void {
      this.systemStatus = { ...this.systemStatus, ...status };
    },

    applySystemStatusPayload(payload: SystemStatusPayload | Partial<SystemStatusState>): void {
      const {
        metrics: _metrics,
        message: _message,
        updated_at: _updatedAt,
        type: _type,
        ...status
      } = payload as Record<string, unknown>;
      this.updateSystemStatus(status as Partial<SystemStatusState>);
    },

    enqueueJob(job: GenerationJobInput): GenerationJob {
      const stored = toStoredJob(job);
      const existingIndex = this.jobs.findIndex((item) => item.id === stored.id);
      if (existingIndex >= 0) {
        this.jobs.splice(existingIndex, 1, stored);
      } else {
        this.jobs.push(stored);
      }
      return stored;
    },

    setActiveJobs(jobs: GenerationJobInput[]): void {
      this.jobs = jobs.map((job) => toStoredJob(job));
    },

    updateJob(jobId: string, updates: Partial<GenerationJob>): void {
      const index = this.jobs.findIndex((job) => job.id === jobId);
      if (index >= 0) {
        const merged = { ...this.jobs[index], ...updates } as GenerationJob;
        merged.progress = normalizeGenerationProgress(merged.progress);
        merged.status = normalizeJobStatus(merged.status);
        this.jobs.splice(index, 1, merged);
      }
    },

    removeJob(jobId: string): void {
      this.jobs = this.jobs.filter((job) => job.id !== jobId);
    },

    clearCompletedJobs(): void {
      this.jobs = this.jobs.filter((job) => !['completed', 'failed'].includes(job.status));
    },

    addResult(result: GenerationResult): void {
      const sanitized = sanitizeResult(result);
      this.results = [sanitized, ...this.results].slice(0, MAX_RESULTS);
    },

    setRecentResults(results: GenerationResult[]): void {
      this.results = results.slice(0, MAX_RESULTS).map(sanitizeResult);
    },

    removeResult(resultId: string | number): void {
      this.results = this.results.filter((result) => result.id !== resultId);
    },

    handleProgressMessage(message: GenerationProgressMessage | ProgressUpdate): void {
      const jobId = message.job_id;
      const job = this.jobs.find((item) => item.id === jobId);
      const updates: Partial<GenerationJob> = {
        status: normalizeJobStatus(message.status),
        progress: normalizeGenerationProgress(message.progress),
        current_step: typeof message.current_step === 'number' ? message.current_step : job?.current_step,
        total_steps: typeof message.total_steps === 'number' ? message.total_steps : job?.total_steps,
      };

      if (!job) {
        this.enqueueJob({ id: jobId, ...updates });
        return;
      }

      this.updateJob(jobId, updates);
    },

    handleCompletionMessage(message: GenerationCompleteMessage): GenerationResult {
      this.removeJob(message.job_id);

      const createdAt = message.created_at ?? new Date().toISOString();
      const imageUrl = message.image_url ?? (Array.isArray(message.images) ? message.images[0] ?? null : null);

      const result: GenerationResult = {
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

      this.addResult(result);
      return result;
    },

    handleErrorMessage(message: GenerationErrorMessage): void {
      this.removeJob(message.job_id);
    },

    ingestQueue(jobs: GenerationJobInput[] | undefined | null): void {
      if (!Array.isArray(jobs)) {
        return;
      }
      this.setActiveJobs(jobs);
    },
  },
});

export type GenerationStore = ReturnType<typeof useGenerationStore>;
