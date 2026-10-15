/**
 * @internal
 *
 * Read-only view of the generation orchestrator store: frozen snapshots of the queue, results and
 * system status, plus the transport state. Reading it has no lifecycle and starts nothing. A
 * component that needs the transport running, or wants to run a command, acquires a binding with
 * `useGenerationOrchestratorManager().acquire(...)` and releases it when it unmounts.
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useGenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';

import type { GenerationJob, GenerationResult, SystemStatusState } from '@/types';
import type { DeepReadonly } from '@/utils/freezeDeep';
import type {
  GenerationTransportError,
  GenerationTransportMetricsSnapshot,
  GenerationTransportPausePayload,
  GenerationTransportPauseReason,
  GenerationTransportPhase,
  GenerationTransportResumePayload,
  GenerationWebSocketStateSnapshot,
} from '../types/transport';
import {
  createImmutableArraySnapshot,
  createImmutableObjectSnapshot,
} from './utils/immutableSnapshots';

export type ReadonlyRef<T> = Readonly<Ref<T>>;

export type ImmutableGenerationJob = DeepReadonly<GenerationJob>;
export type ImmutableGenerationResult = DeepReadonly<GenerationResult>;

export type GenerationJobView = ImmutableGenerationJob;
export type GenerationResultView = ImmutableGenerationResult;

export type QueueItemView = GenerationJobView;
export type ResultItemView = GenerationResultView;
export type ReadonlyQueue = ReadonlyArray<GenerationJobView>;
export type ReadonlyResults = ReadonlyArray<GenerationResultView>;

export interface GenerationOrchestratorFacade {
  readonly queue: ComputedRef<ReadonlyQueue>;
  readonly jobs: ComputedRef<ReadonlyQueue>;
  readonly activeJobs: ComputedRef<readonly GenerationJobView[]>;
  readonly sortedActiveJobs: ComputedRef<readonly GenerationJobView[]>;
  readonly hasActiveJobs: ReadonlyRef<boolean>;
  readonly results: ComputedRef<ReadonlyResults>;
  readonly recentResults: ComputedRef<ReadonlyResults>;
  readonly historyLimit: ReadonlyRef<number>;
  readonly systemStatus: ComputedRef<DeepReadonly<SystemStatusState>>;
  readonly systemStatusReady: ReadonlyRef<boolean>;
  readonly systemStatusLastUpdated: ReadonlyRef<Date | null>;
  readonly systemStatusApiAvailable: ReadonlyRef<boolean>;
  readonly queueManagerActive: ReadonlyRef<boolean>;
  readonly isActive: ReadonlyRef<boolean>;
  readonly isConnected: ReadonlyRef<boolean>;
  readonly pollIntervalMs: ReadonlyRef<number>;
  readonly transportMetrics: ReadonlyRef<GenerationTransportMetricsSnapshot>;
  readonly transportPhase: ReadonlyRef<GenerationTransportPhase>;
  readonly transportReconnectAttempt: ReadonlyRef<number>;
  readonly transportConsecutiveFailures: ReadonlyRef<number>;
  readonly transportNextRetryDelayMs: ReadonlyRef<number | null>;
  readonly transportLastConnectedAt: ReadonlyRef<number | null>;
  readonly transportLastDisconnectedAt: ReadonlyRef<number | null>;
  readonly transportDowntimeMs: ReadonlyRef<number | null>;
  readonly transportTotalDowntimeMs: ReadonlyRef<number>;
  readonly transportPaused: ReadonlyRef<boolean>;
  readonly transportPauseReasons: ComputedRef<readonly GenerationTransportPauseReason[]>;
  readonly transportPauseSince: ReadonlyRef<number | null>;
  readonly transportLastPauseEvent: ReadonlyRef<GenerationTransportPausePayload | null>;
  readonly transportLastResumeEvent: ReadonlyRef<GenerationTransportResumePayload | null>;
  readonly lastError: ReadonlyRef<GenerationTransportError | null>;
  readonly lastSnapshot: ReadonlyRef<GenerationWebSocketStateSnapshot | null>;
}

export const useGenerationOrchestratorFacade = (): GenerationOrchestratorFacade => {
  const store = useGenerationOrchestratorStore();
  const {
    jobs,
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
    isActive,
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
    transportPaused,
    transportPauseReasons,
    transportPauseSince,
    transportLastPauseEvent,
    transportLastResumeEvent,
    transportLastError,
    transportLastSnapshot,
  } = storeToRefs(store);

  const queue = computed<ReadonlyQueue>(
    () =>
      createImmutableArraySnapshot(jobs.value, 'generation-orchestrator-facade.queue', {
        clone: false,
      }) as ReadonlyQueue,
  );
  const results = computed<ReadonlyResults>(
    () =>
      createImmutableArraySnapshot(
        recentResults.value,
        'generation-orchestrator-facade.recentResults',
        { clone: false },
      ) as ReadonlyResults,
  );

  return {
    queue,
    jobs: queue,
    activeJobs: computed(
      () =>
        createImmutableArraySnapshot(
          activeJobs.value,
          'generation-orchestrator-facade.activeJobs',
          { clone: false },
        ) as readonly GenerationJobView[],
    ),
    sortedActiveJobs: computed(
      () =>
        createImmutableArraySnapshot(
          sortedActiveJobs.value,
          'generation-orchestrator-facade.sortedActiveJobs',
          { clone: false },
        ) as readonly GenerationJobView[],
    ),
    hasActiveJobs,
    results,
    recentResults: results,
    historyLimit,
    systemStatus: computed(
      () =>
        createImmutableObjectSnapshot(
          systemStatus.value,
          'generation-orchestrator-facade.systemStatus',
          { clone: false },
        ) as DeepReadonly<SystemStatusState>,
    ),
    systemStatusReady,
    systemStatusLastUpdated,
    systemStatusApiAvailable,
    queueManagerActive,
    isActive,
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
    transportPaused,
    transportPauseReasons: computed(
      () =>
        createImmutableArraySnapshot(
          transportPauseReasons.value,
          'generation-orchestrator-facade.transportPauseReasons',
          { clone: false },
        ) as readonly GenerationTransportPauseReason[],
    ),
    transportPauseSince,
    transportLastPauseEvent,
    transportLastResumeEvent,
    lastError: transportLastError,
    lastSnapshot: transportLastSnapshot,
  };
};

export default useGenerationOrchestratorFacade;
