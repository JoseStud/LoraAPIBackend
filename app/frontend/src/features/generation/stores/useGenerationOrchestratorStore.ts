import { computed, reactive, ref, watch, type Ref, type WatchStopHandle } from 'vue';
import { defineStore } from 'pinia';

import { createGenerationTransportAdapter, type GenerationTransportAdapter } from '../composables/createGenerationTransportAdapter';
import type { GenerationQueueClient } from '../services/queueClient';
import type { GenerationWebSocketManager } from '../services/websocketManager';
import { DEFAULT_POLL_INTERVAL } from '../services/updates';
import type { GenerationNotificationAdapter } from '../composables/useGenerationTransport';
import { acquireSystemStatusController } from './systemStatusController';
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
  ProgressUpdate,
  SystemStatusPayload,
  SystemStatusState,
} from '@/types';

export type GenerationJobInput = Partial<GenerationJob> & {
  id?: string | number;
  jobId?: string | number;
};

export const MAX_RESULTS = 200;
export const DEFAULT_HISTORY_LIMIT = 10;

const HISTORY_LIMIT_WHEN_SHOWING = 50;

const CANCELLABLE_STATUSES: ReadonlySet<GenerationJob['status']> = new Set([
  'queued',
  'processing',
]);

export const DEFAULT_SYSTEM_STATUS: SystemStatusState = {
  gpu_available: false,
  queue_length: 0,
  status: 'unknown',
  gpu_status: 'Unknown',
  memory_used: 0,
  memory_total: 0,
};

export const createDefaultSystemStatus = (): SystemStatusState => ({
  ...DEFAULT_SYSTEM_STATUS,
});

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

export interface GenerationOrchestratorInitializeOptions {
  showHistory: Ref<boolean>;
  configuredBackendUrl: Ref<string | null | undefined>;
  notificationAdapter: GenerationNotificationAdapter;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
}

export interface GenerationOrchestratorStoreDependencies {
  createTransportAdapter?: typeof createGenerationTransportAdapter;
}

const defaultDependencies: GenerationOrchestratorStoreDependencies = {
  createTransportAdapter: createGenerationTransportAdapter,
};

const HISTORY_LIMIT_DEFAULT = DEFAULT_HISTORY_LIMIT;

export const useGenerationOrchestratorStore = defineStore(
  'generation-orchestrator',
  (dependencies: GenerationOrchestratorStoreDependencies = defaultDependencies) => {
    const jobs = ref<GenerationJob[]>([]);
    const results = ref<GenerationResult[]>([]);
    const historyLimit = ref(HISTORY_LIMIT_DEFAULT);

    const systemStatus = reactive<SystemStatusState>(createDefaultSystemStatus());
    const isConnected = ref(false);
    const pollIntervalMs = ref(DEFAULT_POLL_INTERVAL);
    const systemStatusReady = ref(false);
    const systemStatusLastUpdated = ref<Date | null>(null);
    const systemStatusApiAvailable = ref(true);
    const queueManagerActive = ref(false);

    const isActive = ref(false);
    const transport = ref<GenerationTransportAdapter | null>(null);
    const systemStatusRelease = ref<(() => void) | null>(null);
    const watchers = ref<WatchStopHandle[]>([]);

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

    const recentResults = computed(() => results.value);

    const registerWatcher = (stopHandle: WatchStopHandle): void => {
      watchers.value.push(stopHandle);
    };

    const stopWatchers = (): void => {
      watchers.value.forEach((stop) => {
        stop();
      });
      watchers.value = [];
    };

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

    const handleCompletionMessage = (message: GenerationCompleteMessage): GenerationResult => {
      removeJob(message.job_id);
      const createdAt = message.created_at ?? new Date().toISOString();
      const imageUrl = message.image_url ?? (Array.isArray(message.images) ? message.images[0] ?? null : null);

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

    const resolveResultsLimit = (): number => {
      const normalized = Math.max(1, Math.floor(historyLimit.value || HISTORY_LIMIT_DEFAULT));
      return Math.min(normalized, MAX_RESULTS);
    };

    const clampResults = (list: GenerationResult[]): GenerationResult[] => {
      const limit = resolveResultsLimit();
      return list.slice(0, limit);
    };

    const addResult = (result: GenerationResult): void => {
      const sanitized = sanitizeResult(result);
      results.value = clampResults([sanitized, ...results.value]);
    };

    const setResults = (list: GenerationResult[]): void => {
      const sanitized = list.map(sanitizeResult);
      results.value = clampResults(sanitized);
    };

    const removeResult = (resultId: string | number): void => {
      results.value = results.value.filter((result) => result.id !== resultId);
    };

    const setHistoryLimit = (limit: number): void => {
      const normalized = Math.floor(Number(limit));
      const resolved = Number.isFinite(normalized) && normalized > 0 ? normalized : HISTORY_LIMIT_DEFAULT;
      historyLimit.value = resolved;
      results.value = clampResults(results.value);
    };

    const resetResults = (): void => {
      results.value = [];
      historyLimit.value = HISTORY_LIMIT_DEFAULT;
    };

    const setConnectionState = (connected: boolean): void => {
      isConnected.value = connected;
    };

    const setPollInterval = (interval: number): void => {
      const numeric = Math.floor(Number(interval));
      const next = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_POLL_INTERVAL;
      pollIntervalMs.value = next;
      transport.value?.setPollInterval(next);
    };

    const updateSystemStatus = (status: Partial<SystemStatusState>): void => {
      Object.assign(systemStatus, status);
    };

    const resetSystemStatus = (): void => {
      Object.assign(systemStatus, createDefaultSystemStatus());
      systemStatusReady.value = false;
      systemStatusLastUpdated.value = null;
      systemStatusApiAvailable.value = true;
    };

    const applySystemStatusPayload = (payload: SystemStatusPayload | Partial<SystemStatusState>): void => {
      const {
        metrics: _metrics,
        message: _message,
        updated_at: _updatedAt,
        type: _type,
        ...status
      } = payload as Record<string, unknown>;
      updateSystemStatus(status as Partial<SystemStatusState>);
      const timestamp =
        (payload as SystemStatusPayload).updated_at || (payload as SystemStatusPayload).last_updated || null;
      const resolvedTimestamp = timestamp ? new Date(timestamp) : new Date();
      systemStatusReady.value = true;
      systemStatusApiAvailable.value = true;
      systemStatusLastUpdated.value = resolvedTimestamp;
    };

    const markSystemStatusHydrated = (date: Date | null = null): void => {
      systemStatusReady.value = true;
      systemStatusApiAvailable.value = true;
      systemStatusLastUpdated.value = date ?? new Date();
    };

    const markSystemStatusUnavailable = (date: Date | null = null): void => {
      systemStatusReady.value = true;
      systemStatusApiAvailable.value = false;
      systemStatusLastUpdated.value = date ?? new Date();
    };

    const setQueueManagerActive = (active: boolean): void => {
      queueManagerActive.value = active;
    };

    const resetConnection = (): void => {
      resetSystemStatus();
      isConnected.value = false;
      pollIntervalMs.value = DEFAULT_POLL_INTERVAL;
      queueManagerActive.value = false;
    };

    const resetState = (): void => {
      resetQueue();
      resetResults();
      resetConnection();
    };

    const ensureTransport = (): GenerationTransportAdapter => {
      const instance = transport.value;
      if (!instance) {
        throw new Error('Generation transport has not been initialized');
      }
      return instance;
    };

    const cleanup = (): void => {
      transport.value?.clear();
      transport.value = null;
      stopWatchers();
      if (systemStatusRelease.value) {
        systemStatusRelease.value();
        systemStatusRelease.value = null;
      }
      setQueueManagerActive(false);
      isActive.value = false;
    };

    const initialize = async (options: GenerationOrchestratorInitializeOptions): Promise<void> => {
      if (isActive.value) {
        return;
      }

      const createAdapter = dependencies.createTransportAdapter ?? createGenerationTransportAdapter;

      const getBackendUrl = () => options.configuredBackendUrl.value ?? null;

      const { controller, release } = acquireSystemStatusController({ getBackendUrl });

      systemStatusRelease.value = () => {
        release();
      };

      const adapter = createAdapter({
        getBackendUrl,
        notificationAdapter: options.notificationAdapter,
        queueClient: options.queueClient,
        websocketManager: options.websocketManager,
        initialPollInterval: pollIntervalMs.value,
        shouldPollQueue: () => hasActiveJobs.value,
        onSystemStatus: (payload) => {
          applySystemStatusPayload(payload);
        },
        onQueueUpdate: (jobsPayload) => {
          ingestQueue(jobsPayload);
        },
        onProgress: (message) => {
          handleProgressMessage(message);
        },
        onComplete: (message) => {
          const result = handleCompletionMessage(message);
          addResult(result);
          return result;
        },
        onError: (message) => {
          handleErrorMessage(message);
        },
        onRecentResults: (payload) => {
          setResults(payload);
        },
        onConnectionChange: (connected) => {
          setConnectionState(connected);
        },
        onHydrateSystemStatus: () => controller.ensureHydrated(),
        onReleaseSystemStatus: () => {
          systemStatusRelease.value?.();
          systemStatusRelease.value = null;
        },
      });

      transport.value = adapter;

      const stopHistoryWatch = watch(options.showHistory, (next) => {
        const nextLimit = next ? HISTORY_LIMIT_WHEN_SHOWING : HISTORY_LIMIT_DEFAULT;
        setHistoryLimit(nextLimit);
        void loadRecentResults();
      });

      registerWatcher(stopHistoryWatch);

      const stopBackendWatch = watch(
        options.configuredBackendUrl,
        (next, previous) => {
          if (next === previous) {
            return;
          }
          transport.value?.reconnect();
          void refreshAllData();
        },
      );

      registerWatcher(stopBackendWatch);

      const nextLimit = options.showHistory.value ? HISTORY_LIMIT_WHEN_SHOWING : HISTORY_LIMIT_DEFAULT;
      setHistoryLimit(nextLimit);
      setQueueManagerActive(true);

      try {
        isActive.value = true;
        await adapter.initialize(historyLimit.value);
      } catch (error) {
        cleanup();
        throw error;
      }
    };

    const loadSystemStatusData = async (): Promise<void> => {
      await ensureTransport().refreshSystemStatus();
    };

    const loadActiveJobsData = async (): Promise<void> => {
      await ensureTransport().refreshActiveJobs();
    };

    const loadRecentResults = async (notifySuccess = false): Promise<void> => {
      await ensureTransport().refreshRecentResults(historyLimit.value, notifySuccess);
    };

    const refreshAllData = async (): Promise<void> => {
      await ensureTransport().refreshAll(historyLimit.value);
    };

    const startGeneration = async (
      payload: GenerationRequestPayload,
    ): Promise<GenerationStartResponse> => {
      const transportInstance = ensureTransport();
      const response = await transportInstance.startGeneration(payload);

      if (response.job_id) {
        const createdAt = new Date().toISOString();
        enqueueJob({
          id: response.job_id,
          prompt: payload.prompt,
          status: normalizeJobStatus(response.status),
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
      }

      return response;
    };

    const cancelJob = async (jobId: string): Promise<void> => {
      const transportInstance = ensureTransport();
      await transportInstance.cancelJob(jobId);
      removeJob(jobId);
    };

    const clearQueue = async (): Promise<void> => {
      const cancellableJobs = getCancellableJobs();
      if (cancellableJobs.length === 0) {
        return;
      }

      await Promise.allSettled(cancellableJobs.map((job) => cancelJob(job.id)));
    };

    const deleteResult = async (resultId: string | number): Promise<void> => {
      const transportInstance = ensureTransport();
      await transportInstance.deleteResult(resultId);
      removeResult(resultId);
    };

    const destroy = (): void => {
      cleanup();
      resetState();
    };

    return {
      // state
      jobs,
      results,
      historyLimit,
      systemStatus,
      isConnected,
      pollIntervalMs,
      systemStatusReady,
      systemStatusLastUpdated,
      systemStatusApiAvailable,
      queueManagerActive,
      isActive,
      // getters
      activeJobs,
      sortedActiveJobs,
      hasActiveJobs,
      recentResults,
      // queue actions
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
      // result actions
      addResult,
      setResults,
      removeResult,
      setHistoryLimit,
      resetResults,
      // connection actions
      setConnectionState,
      setPollInterval,
      updateSystemStatus,
      resetSystemStatus,
      applySystemStatusPayload,
      markSystemStatusHydrated,
      markSystemStatusUnavailable,
      resetConnection,
      setQueueManagerActive,
      // orchestrator actions
      initialize,
      loadSystemStatusData,
      loadActiveJobsData,
      loadRecentResults,
      refreshAllData,
      startGeneration,
      cancelJob,
      clearQueue,
      deleteResult,
      cleanup,
      destroy,
      resetState,
    };
  },
);

export type GenerationOrchestratorStore = ReturnType<typeof useGenerationOrchestratorStore>;
