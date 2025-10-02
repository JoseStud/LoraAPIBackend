/** @internal */
import { readonly, ref, type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useGenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';
import type { GenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';
import {
  useGenerationOrchestratorManagerStore,
  type GenerationOrchestratorManagerStore,
} from '../stores/orchestratorManagerStore';
import type { GenerationNotificationAdapter } from '../composables/useGenerationTransport';

import type { GenerationJob, GenerationResult, SystemStatusState } from '@/types';
import type { DeepReadonly } from '@/utils/freezeDeep';
import type {
  GenerationTransportError,
  GenerationTransportMetricsSnapshot,
  GenerationTransportPhase,
  GenerationWebSocketStateSnapshot,
} from '../types/transport';
import { useBackendUrl } from '@/utils/backend';

export type ReadonlyRef<T> = Readonly<Ref<T>>;

export type ImmutableGenerationJob = DeepReadonly<GenerationJob>;
export type ImmutableGenerationResult = DeepReadonly<GenerationResult>;

export type GenerationJobView = ImmutableGenerationJob;
export type GenerationResultView = ImmutableGenerationResult;

export type QueueItemView = GenerationJobView;
export type ResultItemView = GenerationResultView;
export type ReadonlyQueue = ReadonlyArray<GenerationJobView>;
export type ReadonlyResults = ReadonlyArray<GenerationResultView>;

export interface GenerationHistoryRefreshOptions {
  readonly notifySuccess?: boolean;
}

export type GenerationHistoryLimit = number;

export interface GenerationOrchestratorFacadeSelectors {
  readonly queue: ComputedRef<ReadonlyQueue>;
  readonly jobs: ComputedRef<ReadonlyQueue>;
  readonly activeJobs: ComputedRef<readonly GenerationJobView[]>;
  readonly sortedActiveJobs: ComputedRef<readonly GenerationJobView[]>;
  readonly hasActiveJobs: ComputedRef<boolean>;
  readonly results: ComputedRef<ReadonlyResults>;
  readonly recentResults: ComputedRef<ReadonlyResults>;
  readonly historyLimit: ReadonlyRef<GenerationHistoryLimit>;
  readonly systemStatus: ComputedRef<DeepReadonly<SystemStatusState>>;
  readonly systemStatusReady: ReadonlyRef<boolean>;
  readonly systemStatusLastUpdated: ReadonlyRef<Date | null>;
  readonly systemStatusApiAvailable: ReadonlyRef<boolean>;
  readonly queueManagerActive: ReadonlyRef<boolean>;
  readonly isActive: ReadonlyRef<boolean>;
  readonly isConnected: ReadonlyRef<boolean>;
  readonly pollIntervalMs: ReadonlyRef<number>;
  readonly transportMetrics: ComputedRef<GenerationTransportMetricsSnapshot>;
  readonly transportPhase: ReadonlyRef<GenerationTransportPhase>;
  readonly transportReconnectAttempt: ReadonlyRef<number>;
  readonly transportConsecutiveFailures: ReadonlyRef<number>;
  readonly transportNextRetryDelayMs: ReadonlyRef<number | null>;
  readonly transportLastConnectedAt: ReadonlyRef<number | null>;
  readonly transportLastDisconnectedAt: ReadonlyRef<number | null>;
  readonly transportDowntimeMs: ReadonlyRef<number | null>;
  readonly transportTotalDowntimeMs: ReadonlyRef<number>;
  readonly lastError: ReadonlyRef<GenerationTransportError | null>;
  readonly lastSnapshot: ReadonlyRef<GenerationWebSocketStateSnapshot | null>;
  readonly lastCommandError: ReadonlyRef<Error | null>;
  readonly lastActionAt: ReadonlyRef<Date | null>;
  readonly pendingActionsCount: ReadonlyRef<number>;
}

export interface GenerationOrchestratorFacadeCommands {
  cancelJob(jobId: string): Promise<void>;
  removeJob(jobId: string | number): void;
  clearCompletedJobs(): void;
  refreshHistory(options?: GenerationHistoryRefreshOptions): Promise<void>;
  reconnect(): void | Promise<void>;
  setHistoryLimit(limit: GenerationHistoryLimit): void;
  ensureInitialized(options?: GenerationOrchestratorEnsureOptions): Promise<void>;
  releaseIfLastConsumer(): void;
}

export interface GenerationOrchestratorFacade
  extends GenerationOrchestratorFacadeSelectors,
    GenerationOrchestratorFacadeCommands {}

export type GenerationOrchestratorFacadeFactory = () => GenerationOrchestratorFacade;

export interface GenerationManager extends GenerationOrchestratorFacadeSelectors {
  cancelJob(jobId: string): Promise<void>;
  cancelJobByBackendId(jobId: string): Promise<void>;
  removeJob(jobId: string | number): void;
  removeJobLocal(jobId: string): void;
  clearCompletedJobs(): void;
  refreshHistory(options?: GenerationHistoryRefreshOptions): Promise<void>;
  reconnect(): void | Promise<void>;
  setHistoryLimit(limit: GenerationHistoryLimit): void;
  ensureInitialized(options?: GenerationOrchestratorEnsureOptions): Promise<void>;
  releaseIfLastConsumer(): void;
}

export interface GenerationOrchestratorEnsureOptions {
  readonly readOnly?: boolean;
}

interface StoreBackedManagerOptions {
  readonly managerStore: GenerationOrchestratorManagerStore;
  readonly getBackendUrl: () => string | null;
}

const createLifecycleNotificationAdapter = (): GenerationNotificationAdapter => ({
  notify: (message, type = 'info') => {
    const entry = {
      message,
      type,
      timestamp: new Date().toISOString(),
    };

    if (type === 'error') {
      console.error('[GenerationOrchestratorFacade]', entry);
      return;
    }

    if (type === 'warning') {
      console.warn('[GenerationOrchestratorFacade]', entry);
      return;
    }

    console.info('[GenerationOrchestratorFacade]', entry);
  },
  debug: (...args: unknown[]) => {
    console.debug('[GenerationOrchestratorFacade]', ...args);
  },
});

const normalizeJobId = (jobId: string | number): string => String(jobId).trim();

const createStoreBackedManager = (
  store: GenerationOrchestratorStore,
  options: StoreBackedManagerOptions,
): GenerationManager => {
  const pendingActionsCount = ref(0);
  const lastActionAt = ref<Date | null>(null);
  const lastCommandError = ref<Error | null>(null);
  const { initializationPromise, isInitialized } = storeToRefs(options.managerStore);
  const {
    jobs,
    jobsByBackendId,
    jobsByUiId,
    activeJobs,
    sortedActiveJobs,
    hasActiveJobs,
    recentResults,
    historyLimit,
    systemStatus,
    systemStatusReady,
    systemStatusLastUpdated,
    systemStatusApiAvailable,
    queueManagerActive,
    isActive: isActiveRef,
    isConnected,
    pollIntervalMs,
    transportMetrics,
    transportPhase,
    transportReconnectAttempt,
    transportConsecutiveFailures,
    transportNextRetryDelayMs,
    transportLastConnectedAt,
    transportLastDisconnectedAt,
    transportDowntimeMs,
    transportTotalDowntimeMs,
    transportLastError,
    transportLastSnapshot,
  } = storeToRefs(store);
  const lifecycleNotificationAdapter = createLifecycleNotificationAdapter();
  let readOnlyConsumerId: symbol | null = null;

  const pendingActionsCountReadonly = readonly(pendingActionsCount);
  const lastActionAtReadonly = readonly(lastActionAt);
  const lastCommandErrorReadonly = readonly(lastCommandError);

  const resolveNow = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const incrementPending = (): void => {
    pendingActionsCount.value += 1;
  };

  const decrementPending = (): void => {
    pendingActionsCount.value = Math.max(0, pendingActionsCount.value - 1);
  };

  const normalizeError = (error: unknown): Error => {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string' && error.trim()) {
      return new Error(error);
    }

    return new Error('Generation orchestrator command failed');
  };

  const resolveBackendJobId = (
    jobId: string,
    options: { strict?: boolean } = {},
  ): string => {
    const normalized = jobId.trim();

    if (!normalized) {
      throw new Error('Job identifier is required');
    }

    const backendMap = jobsByBackendId.value;
    if (backendMap.has(normalized)) {
      return normalized;
    }

    const job = jobsByUiId.value.get(normalized);
    if (job) {
      return job.backendId;
    }

    if (!options.strict || normalized.startsWith('backend-')) {
      return normalized;
    }

    throw new Error(`Job not found for UI id: ${normalized}`);
  };

  const performCancel = (
    backendJobId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> =>
    runCommand('cancelJob', () => store.cancelJob(backendJobId), metadata);

  const performRemove = (
    backendJobId: string,
    metadata: Record<string, unknown>,
  ): void =>
    runSyncCommand(
      'removeJob',
      () => {
        store.removeJob(backendJobId);
      },
      metadata,
    );

  const logTelemetry = (
    stage: 'start' | 'success' | 'error',
    commandName: string,
    payload: Record<string, unknown> = {},
    error?: Error,
  ): void => {
    const entry = {
      command: commandName,
      stage,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    if (stage === 'error') {
      console.error('[GenerationOrchestratorFacade]', entry, error);
    } else {
      console.info('[GenerationOrchestratorFacade]', entry);
    }
  };

  const beginCommand = (
    commandName: string,
    metadata: Record<string, unknown>,
  ): number => {
    incrementPending();
    lastActionAt.value = new Date();
    logTelemetry('start', commandName, metadata);
    return resolveNow();
  };

  const completeCommand = (
    commandName: string,
    metadata: Record<string, unknown>,
    startedAt: number,
  ): void => {
    lastCommandError.value = null;
    logTelemetry('success', commandName, {
      ...metadata,
      durationMs: Math.round(resolveNow() - startedAt),
    });
  };

  const failCommand = (
    commandName: string,
    metadata: Record<string, unknown>,
    startedAt: number,
    error: unknown,
  ): never => {
    const normalized = normalizeError(error);
    lastCommandError.value = normalized;
    logTelemetry(
      'error',
      commandName,
      {
        ...metadata,
        durationMs: Math.round(resolveNow() - startedAt),
        errorName: normalized.name,
        errorMessage: normalized.message,
      },
      normalized,
    );
    throw normalized;
  };

  const finalizeCommand = (): void => {
    decrementPending();
  };

  const runCommand = async <T>(
    commandName: string,
    action: () => Promise<T> | T,
    metadata: Record<string, unknown> = {},
  ): Promise<T> => {
    const startedAt = beginCommand(commandName, metadata);
    try {
      const result = await Promise.resolve(action());
      completeCommand(commandName, metadata, startedAt);
      return result;
    } catch (error) {
      throw failCommand(commandName, metadata, startedAt, error);
    } finally {
      finalizeCommand();
    }
  };

  const runSyncCommand = <T>(
    commandName: string,
    action: () => T,
    metadata: Record<string, unknown> = {},
  ): T => {
    const startedAt = beginCommand(commandName, metadata);
    try {
      const result = action();
      completeCommand(commandName, metadata, startedAt);
      return result;
    } catch (error) {
      throw failCommand(commandName, metadata, startedAt, error);
    } finally {
      finalizeCommand();
    }
  };

  const ensureReadOnlyRegistration = (): void => {
    if (readOnlyConsumerId) {
      return;
    }

    readOnlyConsumerId = Symbol('generation-orchestrator-read-only-consumer');
    options.managerStore.registerReadOnlyConsumer(readOnlyConsumerId);
  };

  const releaseReadOnlyRegistration = (): void => {
    if (!readOnlyConsumerId) {
      return;
    }

    options.managerStore.unregisterReadOnlyConsumer(readOnlyConsumerId);
    readOnlyConsumerId = null;
  };

  const destroyIfUnused = (): void => {
    if (!options.managerStore.hasActiveConsumers()) {
      options.managerStore.destroyOrchestrator();
    }
  };

  const ensureInitialized = async (
    ensureOptions: GenerationOrchestratorEnsureOptions = { readOnly: true },
  ): Promise<void> => {
    const { readOnly = true } = ensureOptions;

    if (readOnly) {
      ensureReadOnlyRegistration();
    }

    const orchestrator = options.managerStore.ensureOrchestrator(() => store);

    if (isActiveRef.value) {
      return;
    }

    if (!initializationPromise.value) {
      const initialization = orchestrator
        .initialize({
          historyLimit: historyLimit.value,
          getBackendUrl: options.getBackendUrl,
          notificationAdapter: lifecycleNotificationAdapter,
        })
        .then(() => {
          isInitialized.value = true;
        })
        .catch((error) => {
          isInitialized.value = false;
          if (readOnly) {
            releaseReadOnlyRegistration();
          }
          throw error;
        })
        .finally(() => {
          initializationPromise.value = null;
        });

      initializationPromise.value = initialization;
    }

    await initializationPromise.value;
  };

  const releaseIfLastConsumer = (): void => {
    const pendingInitialization = initializationPromise.value;

    releaseReadOnlyRegistration();

    if (pendingInitialization) {
      void pendingInitialization
        .catch(() => {
          // Swallow to ensure cleanup still runs after failure.
        })
        .finally(() => {
          destroyIfUnused();
        });
      return;
    }

    destroyIfUnused();
  };

  return {
    queue: jobs,
    jobs,
    activeJobs,
    sortedActiveJobs,
    hasActiveJobs,
    results: recentResults,
    recentResults,
    historyLimit,
    systemStatus,
    systemStatusReady,
    systemStatusLastUpdated,
    systemStatusApiAvailable,
    queueManagerActive,
    isActive: isActiveRef,
    isConnected,
    pollIntervalMs,
    transportMetrics,
    transportPhase,
    transportReconnectAttempt,
    transportConsecutiveFailures,
    transportNextRetryDelayMs,
    transportLastConnectedAt,
    transportLastDisconnectedAt,
    transportDowntimeMs,
    transportTotalDowntimeMs,
    lastError: transportLastError,
    lastSnapshot: transportLastSnapshot,
    lastCommandError: lastCommandErrorReadonly,
    lastActionAt: lastActionAtReadonly,
    pendingActionsCount: pendingActionsCountReadonly,
    cancelJob: (jobId: string): Promise<void> => {
      const normalizedJobId = normalizeJobId(jobId);
      const backendJobId = resolveBackendJobId(normalizedJobId, { strict: true });
      return performCancel(backendJobId, { jobId: normalizedJobId, backendJobId });
    },
    cancelJobByBackendId: (jobId: string): Promise<void> => {
      const backendJobId = normalizeJobId(jobId);
      return performCancel(backendJobId, { backendJobId });
    },
    removeJob: (jobId: string | number): void => {
      const normalizedJobId = normalizeJobId(jobId);
      const backendJobId = resolveBackendJobId(normalizedJobId);
      performRemove(backendJobId, { jobId: normalizedJobId, backendJobId });
    },
    removeJobLocal: (jobId: string): void => {
      const backendJobId = normalizeJobId(jobId);
      performRemove(backendJobId, { backendJobId });
    },
    clearCompletedJobs: (): void => {
      runSyncCommand('clearCompletedJobs', () => {
        store.clearCompletedJobs();
      });
    },
    refreshHistory: (options?: GenerationHistoryRefreshOptions): Promise<void> =>
      runCommand(
        'refreshHistory',
        () => store.loadRecentResults(options?.notifySuccess ?? false),
        { notifySuccess: options?.notifySuccess ?? false },
      ),
    reconnect: (): Promise<void> =>
      runCommand('reconnect', () => store.reconnect(), {
        isActive: isActiveRef.value,
      }),
    setHistoryLimit: (limit: GenerationHistoryLimit): void => {
      runSyncCommand(
        'setHistoryLimit',
        () => {
          store.setHistoryLimit(limit);
          if (isActiveRef.value) {
            void store.loadRecentResults(false);
          }
        },
        { limit },
      );
    },
    ensureInitialized,
    releaseIfLastConsumer,
  } satisfies GenerationManager;
};

export interface CreateGenerationFacadeOptions {
  manager: GenerationManager;
}

export const createGenerationFacade = ({
  manager,
}: CreateGenerationFacadeOptions): GenerationOrchestratorFacade => ({
  queue: manager.queue,
  jobs: manager.jobs,
  activeJobs: manager.activeJobs,
  sortedActiveJobs: manager.sortedActiveJobs,
  hasActiveJobs: manager.hasActiveJobs,
  results: manager.results,
  recentResults: manager.recentResults,
  historyLimit: manager.historyLimit,
  systemStatus: manager.systemStatus,
  systemStatusReady: manager.systemStatusReady,
  systemStatusLastUpdated: manager.systemStatusLastUpdated,
  systemStatusApiAvailable: manager.systemStatusApiAvailable,
  queueManagerActive: manager.queueManagerActive,
  isActive: manager.isActive,
  isConnected: manager.isConnected,
  pollIntervalMs: manager.pollIntervalMs,
  transportMetrics: manager.transportMetrics,
  transportPhase: manager.transportPhase,
  transportReconnectAttempt: manager.transportReconnectAttempt,
  transportConsecutiveFailures: manager.transportConsecutiveFailures,
  transportNextRetryDelayMs: manager.transportNextRetryDelayMs,
  transportLastConnectedAt: manager.transportLastConnectedAt,
  transportLastDisconnectedAt: manager.transportLastDisconnectedAt,
  transportDowntimeMs: manager.transportDowntimeMs,
  transportTotalDowntimeMs: manager.transportTotalDowntimeMs,
  lastError: manager.lastError,
  lastSnapshot: manager.lastSnapshot,
  lastCommandError: manager.lastCommandError,
  lastActionAt: manager.lastActionAt,
  pendingActionsCount: manager.pendingActionsCount,
  cancelJob: (jobId: string): Promise<void> => manager.cancelJob(jobId),
  removeJob: (jobId: string | number): void => manager.removeJob(jobId),
  clearCompletedJobs: (): void => manager.clearCompletedJobs(),
  refreshHistory: (options?: GenerationHistoryRefreshOptions): Promise<void> =>
    manager.refreshHistory(options),
  reconnect: (): void | Promise<void> => manager.reconnect(),
  setHistoryLimit: (limit: GenerationHistoryLimit): void => manager.setHistoryLimit(limit),
  ensureInitialized: (options?: GenerationOrchestratorEnsureOptions): Promise<void> =>
    manager.ensureInitialized(options),
  releaseIfLastConsumer: (): void => manager.releaseIfLastConsumer(),
}) satisfies GenerationOrchestratorFacade;

export const useGenerationOrchestratorFacade: GenerationOrchestratorFacadeFactory = () => {
  const store = useGenerationOrchestratorStore();
  const managerStore = useGenerationOrchestratorManagerStore();
  const backendUrl = useBackendUrl('/') as ComputedRef<string>;
  const getBackendUrl = (): string | null => backendUrl.value || null;
  const manager = createStoreBackedManager(store, {
    managerStore,
    getBackendUrl,
  });
  return createGenerationFacade({ manager });
};

export default useGenerationOrchestratorFacade;
