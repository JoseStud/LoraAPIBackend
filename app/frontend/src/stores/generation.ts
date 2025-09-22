import { defineStore } from 'pinia';

import {
  createGenerationQueueClient,
  createGenerationWebSocketManager,
  DEFAULT_POLL_INTERVAL,
  extractGenerationErrorMessage,
  type GenerationQueueClient,
  type GenerationWebSocketManager,
} from '@/services/generationUpdates';
import { normalizeGenerationProgress } from '@/utils/progress';
import { normalizeJobStatus } from '@/utils/status';
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationJob,
  GenerationProgressMessage,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  NotificationType,
  ProgressUpdate,
  SystemStatusPayload,
  SystemStatusState,
} from '@/types';

interface GenerationState {
  systemStatus: SystemStatusState;
  jobs: GenerationJob[];
  results: GenerationResult[];
  isConnected: boolean;
  historyLimit: number;
  pollIntervalMs: number;
  pollTimer: number | null;
  queueClient: GenerationQueueClient | null;
  websocketManager: GenerationWebSocketManager | null;
  notificationAdapter: GenerationNotificationAdapter | null;
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
const DEFAULT_HISTORY_LIMIT = 10;

const CANCELLABLE_STATUSES: ReadonlySet<GenerationJob['status']> = new Set([
  'queued',
  'processing',
]);

export interface GenerationNotificationAdapter {
  notify(message: string, type?: NotificationType): void;
  debug?: (...args: unknown[]) => void;
}

interface GenerationServiceConfiguration {
  getBackendUrl: () => string | null | undefined;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
  notificationAdapter?: GenerationNotificationAdapter | null;
  pollIntervalMs?: number;
  historyLimit?: number;
}

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
    historyLimit: DEFAULT_HISTORY_LIMIT,
    pollIntervalMs: DEFAULT_POLL_INTERVAL,
    pollTimer: null,
    queueClient: null,
    websocketManager: null,
    notificationAdapter: null,
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

    setNotificationAdapter(adapter: GenerationNotificationAdapter | null): void {
      this.notificationAdapter = adapter ?? null;
    },

    setHistoryLimit(limit: number): void {
      const normalized = Math.max(1, Math.floor(Number(limit) || 0));
      this.historyLimit = Number.isFinite(normalized) && normalized > 0 ? normalized : DEFAULT_HISTORY_LIMIT;
    },

    configureGenerationServices(options: GenerationServiceConfiguration): void {
      const { getBackendUrl } = options;

      if (options.notificationAdapter !== undefined) {
        this.setNotificationAdapter(options.notificationAdapter);
      }

      if (typeof options.pollIntervalMs === 'number') {
        this.pollIntervalMs = options.pollIntervalMs;
      }

      if (typeof options.historyLimit === 'number') {
        this.setHistoryLimit(options.historyLimit);
      }

      const queueClient =
        options.queueClient ?? createGenerationQueueClient({ getBackendUrl });
      const websocketManager =
        options.websocketManager
        ?? createGenerationWebSocketManager({
          getBackendUrl,
          logger: (...args: unknown[]) => {
            this.notificationAdapter?.debug?.(...args);
          },
          onConnectionChange: (connected) => {
            this.setConnectionState(connected);
          },
          onProgress: (message) => {
            this.handleProgressMessage(message);
          },
          onComplete: (message) => {
            const result = this.handleCompletionMessage(message);
            this.notificationAdapter?.notify('Generation completed successfully', 'success');
            return result;
          },
          onError: (message) => {
            this.handleErrorMessage(message);
            const errorMessage = extractGenerationErrorMessage(message);
            this.notificationAdapter?.notify(`Generation failed: ${errorMessage}`, 'error');
          },
          onQueueUpdate: (jobs) => {
            const list = Array.isArray(jobs) ? jobs : [];
            this.ingestQueue(list as GenerationJobInput[]);
          },
          onSystemStatus: (payload) => {
            this.applySystemStatusPayload(payload);
          },
        });

      this.queueClient = queueClient;
      this.websocketManager = websocketManager;
    },

    getQueueClient(): GenerationQueueClient {
      if (!this.queueClient) {
        throw new Error('Generation queue client is not configured');
      }
      return this.queueClient;
    },

    getWebSocketManager(): GenerationWebSocketManager {
      if (!this.websocketManager) {
        throw new Error('Generation WebSocket manager is not configured');
      }
      return this.websocketManager;
    },

    startPolling(): void {
      if (typeof window === 'undefined' || this.pollTimer != null) {
        return;
      }

      this.pollTimer = window.setInterval(async () => {
        try {
          if (this.hasActiveJobs) {
            await this.refreshActiveJobs();
          }
          await this.refreshSystemStatus();
        } catch (error) {
          console.error('Failed to refresh generation data during polling:', error);
        }
      }, this.pollIntervalMs);
    },

    stopPolling(): void {
      if (this.pollTimer != null && typeof window !== 'undefined') {
        window.clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    },

    async initializeUpdates(): Promise<void> {
      await Promise.all([
        this.refreshSystemStatus(),
        this.refreshActiveJobs(),
        this.refreshRecentResults(),
      ]);
      this.websocketManager?.start();
      this.startPolling();
    },

    stopUpdates(): void {
      this.stopPolling();
      this.websocketManager?.stop();
    },

    reconnectUpdates(): void {
      this.websocketManager?.reconnect();
    },

    async refreshSystemStatus(): Promise<void> {
      try {
        const status = await this.getQueueClient().fetchSystemStatus();
        if (status) {
          this.applySystemStatusPayload(status);
        }
      } catch (error) {
        console.error('Failed to refresh system status:', error);
      }
    },

    async refreshActiveJobs(): Promise<void> {
      try {
        const jobs = await this.getQueueClient().fetchActiveJobs();
        this.setActiveJobs(jobs);
      } catch (error) {
        console.error('Failed to refresh active jobs:', error);
      }
    },

    async refreshRecentResults(notifySuccess = false): Promise<void> {
      try {
        const results = await this.getQueueClient().fetchRecentResults(this.historyLimit);
        this.setRecentResults(results);
        if (notifySuccess) {
          this.notificationAdapter?.notify('Results refreshed', 'success');
        }
      } catch (error) {
        console.error('Failed to refresh recent results:', error);
        if (notifySuccess) {
          this.notificationAdapter?.notify('Failed to refresh results', 'error');
        }
      }
    },

    isJobCancellable(job: GenerationJob): boolean {
      return CANCELLABLE_STATUSES.has(job.status);
    },

    async startGeneration(payload: GenerationRequestPayload): Promise<GenerationStartResponse> {
      try {
        const response = await this.getQueueClient().startGeneration(payload);

        if (response.job_id) {
          const createdAt = new Date().toISOString();
          this.enqueueJob({
            id: response.job_id,
            prompt: payload.prompt,
            status: response.status,
            progress: response.progress ?? 0,
            startTime: createdAt,
            created_at: createdAt,
            width: payload.width,
            height: payload.height,
            steps: payload.steps,
            total_steps: payload.steps,
            cfg_scale: payload.cfg_scale,
            seed: payload.seed,
          });
          this.notificationAdapter?.notify('Generation started successfully', 'success');
        }

        return response;
      } catch (error) {
        console.error('Error starting generation:', error);
        this.notificationAdapter?.notify('Error starting generation', 'error');
        throw error;
      }
    },

    async cancelJob(jobId: string): Promise<void> {
      try {
        await this.getQueueClient().cancelJob(jobId);
        this.removeJob(jobId);
        this.notificationAdapter?.notify('Generation cancelled', 'success');
      } catch (error) {
        console.error('Error cancelling job:', error);
        this.notificationAdapter?.notify('Error cancelling generation', 'error');
        throw error;
      }
    },

    async clearQueue(): Promise<void> {
      const cancellableJobs = this.jobs.filter((job) => this.isJobCancellable(job));
      if (cancellableJobs.length === 0) {
        return;
      }

      await Promise.allSettled(cancellableJobs.map((job) => this.cancelJob(job.id)));
    },

    async deleteResult(resultId: string | number): Promise<void> {
      try {
        await this.getQueueClient().deleteResult(resultId);
        this.removeResult(resultId);
        this.notificationAdapter?.notify('Result deleted', 'success');
      } catch (error) {
        console.error('Error deleting result:', error);
        this.notificationAdapter?.notify('Error deleting result', 'error');
        throw error;
      }
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
