import type { ComputedRef, Ref } from 'vue';

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
