import type { ComputedRef, Ref } from 'vue';

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

export interface GenerationHistoryRefreshOptions {
  readonly notifySuccess?: boolean;
}

export type GenerationHistoryLimit = number;

export interface GenerationOrchestratorFacadeSelectors {
  readonly jobs: ComputedRef<readonly ImmutableGenerationJob[]>;
  readonly activeJobs: ComputedRef<readonly ImmutableGenerationJob[]>;
  readonly sortedActiveJobs: ComputedRef<readonly ImmutableGenerationJob[]>;
  readonly hasActiveJobs: ComputedRef<boolean>;
  readonly recentResults: ComputedRef<readonly ImmutableGenerationResult[]>;
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
}

export interface GenerationOrchestratorFacadeCommands {
  cancelJob(jobId: string): Promise<void>;
  removeJob(jobId: string | number): void;
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
  refreshHistory(options?: GenerationHistoryRefreshOptions): Promise<void>;
  reconnect(): void | Promise<void>;
  setHistoryLimit(limit: GenerationHistoryLimit): void;
}

const normalizeJobId = (jobId: string | number): string => String(jobId);

const createStoreBackedManager = (
  store: GenerationOrchestratorStore,
): GenerationManager => ({
  jobs: store.jobs,
  activeJobs: store.activeJobs,
  sortedActiveJobs: store.sortedActiveJobs,
  hasActiveJobs: store.hasActiveJobs,
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
  cancelJob: async (jobId: string): Promise<void> => {
    await store.cancelJob(jobId);
  },
  removeJob: (jobId: string | number): void => {
    store.removeJob(normalizeJobId(jobId));
  },
  refreshHistory: async (options?: GenerationHistoryRefreshOptions): Promise<void> => {
    await store.loadRecentResults(options?.notifySuccess ?? false);
  },
  reconnect: () => store.reconnect(),
  setHistoryLimit: (limit: GenerationHistoryLimit): void => {
    store.setHistoryLimit(limit);
    if (store.isActive.value) {
      void store.loadRecentResults(false);
    }
  },
});

export interface CreateGenerationFacadeOptions {
  manager: GenerationManager;
}

export const createGenerationFacade = ({
  manager,
}: CreateGenerationFacadeOptions): GenerationOrchestratorFacade => ({
  jobs: manager.jobs,
  activeJobs: manager.activeJobs,
  sortedActiveJobs: manager.sortedActiveJobs,
  hasActiveJobs: manager.hasActiveJobs,
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
  cancelJob: (jobId: string): Promise<void> => manager.cancelJob(jobId),
  removeJob: (jobId: string | number): void => manager.removeJob(jobId),
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
