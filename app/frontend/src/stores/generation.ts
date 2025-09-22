import { computed, reactive, ref, shallowRef } from 'vue';
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

export const useGenerationStore = defineStore('generation', () => {
  const systemStatus = reactive<SystemStatusState>({ ...DEFAULT_SYSTEM_STATUS });
  const jobs = ref<GenerationJob[]>([]);
  const results = ref<GenerationResult[]>([]);
  const isConnected = ref(false);
  const historyLimit = ref(DEFAULT_HISTORY_LIMIT);
  const pollIntervalMs = ref(DEFAULT_POLL_INTERVAL);

  const notificationAdapter = shallowRef<GenerationNotificationAdapter | null>(null);
  const queueClient = shallowRef<GenerationQueueClient | null>(null);
  const websocketManager = shallowRef<GenerationWebSocketManager | null>(null);

  let pollTimer: number | null = null;

  const activeJobs = computed(() => jobs.value);
  const recentResults = computed(() => results.value);
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

  function setConnectionState(connected: boolean): void {
    isConnected.value = connected;
  }

  function setNotificationAdapter(adapter: GenerationNotificationAdapter | null): void {
    notificationAdapter.value = adapter ?? null;
  }

  function setHistoryLimit(limit: number): void {
    const normalized = Math.max(1, Math.floor(Number(limit) || 0));
    historyLimit.value = Number.isFinite(normalized) && normalized > 0
      ? normalized
      : DEFAULT_HISTORY_LIMIT;
  }

  function updateSystemStatus(status: Partial<SystemStatusState>): void {
    Object.assign(systemStatus, status);
  }

  function resetSystemStatus(): void {
    Object.assign(systemStatus, { ...DEFAULT_SYSTEM_STATUS });
  }

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

  function setActiveJobs(list: GenerationJobInput[]): void {
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

  function addResult(result: GenerationResult): void {
    const sanitized = sanitizeResult(result);
    results.value = [sanitized, ...results.value].slice(0, MAX_RESULTS);
  }

  function setRecentResults(list: GenerationResult[]): void {
    results.value = list.slice(0, MAX_RESULTS).map(sanitizeResult);
  }

  function removeResult(resultId: string | number): void {
    results.value = results.value.filter((result) => result.id !== resultId);
  }

  function applySystemStatusPayload(payload: SystemStatusPayload | Partial<SystemStatusState>): void {
    const {
      metrics: _metrics,
      message: _message,
      updated_at: _updatedAt,
      type: _type,
      ...status
    } = payload as Record<string, unknown>;
    updateSystemStatus(status as Partial<SystemStatusState>);
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

    addResult(result);
    return result;
  }

  function handleErrorMessage(message: GenerationErrorMessage): void {
    removeJob(message.job_id);
  }

  function ingestQueue(list: GenerationJobInput[] | undefined | null): void {
    if (!Array.isArray(list)) {
      return;
    }
    setActiveJobs(list);
  }

  function configureGenerationServices(options: GenerationServiceConfiguration): void {
    const { getBackendUrl } = options;

    if (options.notificationAdapter !== undefined) {
      setNotificationAdapter(options.notificationAdapter);
    }

    if (typeof options.pollIntervalMs === 'number') {
      pollIntervalMs.value = options.pollIntervalMs;
    }

    if (typeof options.historyLimit === 'number') {
      setHistoryLimit(options.historyLimit);
    }

    queueClient.value = options.queueClient ?? createGenerationQueueClient({ getBackendUrl });

    const manager =
      options.websocketManager
      ?? createGenerationWebSocketManager({
        getBackendUrl,
        logger: (...args: unknown[]) => {
          notificationAdapter.value?.debug?.(...args);
        },
        onConnectionChange: (connected) => {
          setConnectionState(connected);
        },
        onProgress: (message) => {
          handleProgressMessage(message);
        },
        onComplete: (message) => {
          const result = handleCompletionMessage(message);
          notificationAdapter.value?.notify('Generation completed successfully', 'success');
          return result;
        },
        onError: (message) => {
          handleErrorMessage(message);
          const errorMessage = extractGenerationErrorMessage(message);
          notificationAdapter.value?.notify(`Generation failed: ${errorMessage}`, 'error');
        },
        onQueueUpdate: (jobsUpdate) => {
          const list = Array.isArray(jobsUpdate) ? jobsUpdate : [];
          ingestQueue(list as GenerationJobInput[]);
        },
        onSystemStatus: (payload) => {
          applySystemStatusPayload(payload);
        },
      });

    if (websocketManager.value && websocketManager.value !== manager) {
      websocketManager.value.stop();
    }

    websocketManager.value = manager;
  }

  function getQueueClient(): GenerationQueueClient {
    if (!queueClient.value) {
      throw new Error('Generation queue client is not configured');
    }
    return queueClient.value;
  }

  function getWebSocketManager(): GenerationWebSocketManager {
    if (!websocketManager.value) {
      throw new Error('Generation WebSocket manager is not configured');
    }
    return websocketManager.value;
  }

  function startPolling(): void {
    if (typeof window === 'undefined' || pollTimer != null) {
      return;
    }

    pollTimer = window.setInterval(async () => {
      try {
        if (hasActiveJobs.value) {
          await refreshActiveJobs();
        }
        await refreshSystemStatus();
      } catch (error) {
        console.error('Failed to refresh generation data during polling:', error);
      }
    }, pollIntervalMs.value);
  }

  function stopPolling(): void {
    if (pollTimer != null && typeof window !== 'undefined') {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function refreshSystemStatus(): Promise<void> {
    try {
      const status = await getQueueClient().fetchSystemStatus();
      if (status) {
        applySystemStatusPayload(status);
      }
    } catch (error) {
      console.error('Failed to refresh system status:', error);
    }
  }

  async function refreshActiveJobs(): Promise<void> {
    try {
      const active = await getQueueClient().fetchActiveJobs();
      setActiveJobs(active as GenerationJobInput[]);
    } catch (error) {
      console.error('Failed to refresh active jobs:', error);
    }
  }

  async function refreshRecentResults(notifySuccess = false): Promise<void> {
    try {
      const recent = await getQueueClient().fetchRecentResults(historyLimit.value);
      setRecentResults(recent);
      if (notifySuccess) {
        notificationAdapter.value?.notify('Results refreshed', 'success');
      }
    } catch (error) {
      console.error('Failed to refresh recent results:', error);
      if (notifySuccess) {
        notificationAdapter.value?.notify('Failed to refresh results', 'error');
      }
    }
  }

  async function refreshAllData(): Promise<void> {
    await Promise.all([
      refreshSystemStatus(),
      refreshActiveJobs(),
      refreshRecentResults(),
    ]);
  }

  async function initializeUpdates(): Promise<void> {
    await refreshAllData();
    websocketManager.value?.start();
    startPolling();
  }

  function stopUpdates(): void {
    stopPolling();
    websocketManager.value?.stop();
  }

  function reconnectUpdates(): void {
    websocketManager.value?.reconnect();
  }

  function isJobCancellable(job: GenerationJob): boolean {
    return CANCELLABLE_STATUSES.has(job.status);
  }

  async function startGeneration(payload: GenerationRequestPayload): Promise<GenerationStartResponse> {
    try {
      const response = await getQueueClient().startGeneration(payload);

      if (response.job_id) {
        const createdAt = new Date().toISOString();
        enqueueJob({
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
        notificationAdapter.value?.notify('Generation started successfully', 'success');
      }

      return response;
    } catch (error) {
      console.error('Error starting generation:', error);
      notificationAdapter.value?.notify('Error starting generation', 'error');
      throw error;
    }
  }

  async function cancelJob(jobId: string): Promise<void> {
    try {
      await getQueueClient().cancelJob(jobId);
      removeJob(jobId);
      notificationAdapter.value?.notify('Generation cancelled', 'success');
    } catch (error) {
      console.error('Error cancelling job:', error);
      notificationAdapter.value?.notify('Error cancelling generation', 'error');
      throw error;
    }
  }

  async function clearQueue(): Promise<void> {
    const cancellableJobs = jobs.value.filter((job) => isJobCancellable(job));
    if (cancellableJobs.length === 0) {
      return;
    }

    await Promise.allSettled(cancellableJobs.map((job) => cancelJob(job.id)));
  }

  async function deleteResult(resultId: string | number): Promise<void> {
    try {
      await getQueueClient().deleteResult(resultId);
      removeResult(resultId);
      notificationAdapter.value?.notify('Result deleted', 'success');
    } catch (error) {
      console.error('Error deleting result:', error);
      notificationAdapter.value?.notify('Error deleting result', 'error');
      throw error;
    }
  }

  function $reset(): void {
    stopPolling();
    websocketManager.value?.stop();
    websocketManager.value = null;
    queueClient.value = null;
    notificationAdapter.value = null;
    jobs.value = [];
    results.value = [];
    resetSystemStatus();
    isConnected.value = false;
    historyLimit.value = DEFAULT_HISTORY_LIMIT;
    pollIntervalMs.value = DEFAULT_POLL_INTERVAL;
  }

  return {
    systemStatus,
    jobs,
    results,
    isConnected,
    historyLimit,
    pollIntervalMs,
    activeJobs,
    recentResults,
    sortedActiveJobs,
    hasActiveJobs,
    setConnectionState,
    setNotificationAdapter,
    setHistoryLimit,
    configureGenerationServices,
    getQueueClient,
    getWebSocketManager,
    startPolling,
    stopPolling,
    refreshSystemStatus,
    refreshActiveJobs,
    refreshRecentResults,
    refreshAllData,
    initializeUpdates,
    stopUpdates,
    reconnectUpdates,
    isJobCancellable,
    startGeneration,
    cancelJob,
    clearQueue,
    deleteResult,
    resetSystemStatus,
    updateSystemStatus,
    applySystemStatusPayload,
    enqueueJob,
    setActiveJobs,
    updateJob,
    removeJob,
    clearCompletedJobs,
    addResult,
    setRecentResults,
    removeResult,
    handleProgressMessage,
    handleCompletionMessage,
    handleErrorMessage,
    ingestQueue,
    $reset,
  };
});

export type GenerationStore = ReturnType<typeof useGenerationStore>;
