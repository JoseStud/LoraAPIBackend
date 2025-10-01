import { readonly, ref, type ComputedRef, type Ref } from 'vue';

import { useGenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';
import type { GenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';

import type { GenerationJob, GenerationResult, SystemStatusState } from '@/types';
import type { DeepReadonly } from '@/utils/freezeDeep';
import type {
  GenerationTransportError,
  GenerationTransportMetricsSnapshot,
  GenerationTransportPhase,
  GenerationWebSocketStateSnapshot,
} from '../types/transport';

export type ReadonlyRef<T> = Readonly<Ref<T>>;

export type ImmutableGenerationJob = DeepReadonly<GenerationJob>;
export type ImmutableGenerationResult = DeepReadonly<GenerationResult>;

export type QueueItemView = ImmutableGenerationJob;
export type ResultItemView = ImmutableGenerationResult;
export type ReadonlyQueue = ReadonlyArray<QueueItemView>;
export type ReadonlyResults = ReadonlyArray<ResultItemView>;

export interface GenerationHistoryRefreshOptions {
  readonly notifySuccess?: boolean;
}

export type GenerationHistoryLimit = number;

export interface GenerationOrchestratorFacadeSelectors {
  readonly queue: ComputedRef<ReadonlyQueue>;
  readonly jobs: ComputedRef<ReadonlyQueue>;
  readonly activeJobs: ComputedRef<readonly ImmutableGenerationJob[]>;
  readonly sortedActiveJobs: ComputedRef<readonly ImmutableGenerationJob[]>;
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
}

export interface GenerationOrchestratorFacade
  extends GenerationOrchestratorFacadeSelectors,
    GenerationOrchestratorFacadeCommands {}

export type GenerationOrchestratorFacadeFactory = () => GenerationOrchestratorFacade;

export interface GenerationManager extends GenerationOrchestratorFacadeSelectors {
  cancelJob(jobId: string): Promise<void>;
  removeJob(jobId: string | number): void;
  clearCompletedJobs(): void;
  refreshHistory(options?: GenerationHistoryRefreshOptions): Promise<void>;
  reconnect(): void | Promise<void>;
  setHistoryLimit(limit: GenerationHistoryLimit): void;
}

const normalizeJobId = (jobId: string | number): string => String(jobId);

const createStoreBackedManager = (
  store: GenerationOrchestratorStore,
): GenerationManager => {
  const pendingActionsCount = ref(0);
  const lastActionAt = ref<Date | null>(null);
  const lastCommandError = ref<Error | null>(null);

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

  return {
    queue: store.jobs,
    jobs: store.jobs,
    activeJobs: store.activeJobs,
    sortedActiveJobs: store.sortedActiveJobs,
    hasActiveJobs: store.hasActiveJobs,
    results: store.recentResults,
    recentResults: store.recentResults,
    historyLimit: store.historyLimit,
    systemStatus: store.systemStatus,
    systemStatusReady: store.systemStatusReady,
    systemStatusLastUpdated: store.systemStatusLastUpdated,
    systemStatusApiAvailable: store.systemStatusApiAvailable,
    queueManagerActive: store.queueManagerActive,
    isActive: store.isActive,
    isConnected: store.isConnected,
    pollIntervalMs: store.pollIntervalMs,
    transportMetrics: store.transportMetrics,
    transportPhase: store.transportPhase,
    transportReconnectAttempt: store.transportReconnectAttempt,
    transportConsecutiveFailures: store.transportConsecutiveFailures,
    transportNextRetryDelayMs: store.transportNextRetryDelayMs,
    transportLastConnectedAt: store.transportLastConnectedAt,
    transportLastDisconnectedAt: store.transportLastDisconnectedAt,
    transportDowntimeMs: store.transportDowntimeMs,
    transportTotalDowntimeMs: store.transportTotalDowntimeMs,
    lastError: store.transportLastError,
    lastSnapshot: store.transportLastSnapshot,
    lastCommandError: lastCommandErrorReadonly,
    lastActionAt: lastActionAtReadonly,
    pendingActionsCount: pendingActionsCountReadonly,
    cancelJob: (jobId: string): Promise<void> =>
      runCommand('cancelJob', () => store.cancelJob(jobId), { jobId }),
    removeJob: (jobId: string | number): void => {
      const normalizedJobId = normalizeJobId(jobId);
      runSyncCommand(
        'removeJob',
        () => {
          store.removeJob(normalizedJobId);
        },
        { jobId: normalizedJobId },
      );
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
        isActive: store.isActive.value,
      }),
    setHistoryLimit: (limit: GenerationHistoryLimit): void => {
      runSyncCommand(
        'setHistoryLimit',
        () => {
          store.setHistoryLimit(limit);
          if (store.isActive.value) {
            void store.loadRecentResults(false);
          }
        },
        { limit },
      );
    },
  };
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
});

export const useGenerationOrchestratorFacade: GenerationOrchestratorFacadeFactory = () => {
  const store = useGenerationOrchestratorStore();
  const manager = createStoreBackedManager(store);
  return createGenerationFacade({ manager });
};

export default useGenerationOrchestratorFacade;
