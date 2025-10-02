/** @internal */
import { computed, readonly, ref, type ComputedRef } from 'vue';
import { defineStore } from 'pinia';

import { createGenerationTransportAdapter } from '../composables/createGenerationTransportAdapter';
import type { GenerationQueueClient } from '../services/queueClient';
import type { GenerationWebSocketManager } from '../services/websocketManager';
import type { GenerationNotificationAdapter } from '../composables/useGenerationTransport';
import { acquireSystemStatusController } from './systemStatusController';
import { createQueueModule } from './orchestrator/queueModule';
import { createResultsModule } from './orchestrator/resultsModule';
import { createSystemStatusModule } from './orchestrator/systemStatusModule';
import { createTransportModule } from './orchestrator/transportModule';
import { createAdapterHandlers } from './orchestrator/adapterHandlers';
import { createTransportActions } from './orchestrator/transportActions';
import type { GenerationJob, GenerationResult, SystemStatusState } from '@/types';
import type {
  GenerationTransportMetricsSnapshot,
  GenerationTransportPausePayload,
  GenerationTransportResumePayload,
  GenerationWebSocketStateSnapshot,
} from '../types/transport';
import type { DeepReadonly } from '@/utils/freezeDeep';
import { createImmutableArraySnapshot, createImmutableObjectSnapshot } from '../orchestrator/utils/immutableSnapshots';

export type { GenerationJobInput } from './orchestrator/queueModule';
export { MAX_RESULTS, DEFAULT_HISTORY_LIMIT } from './orchestrator/resultsModule';
export { DEFAULT_SYSTEM_STATUS, createDefaultSystemStatus } from './orchestrator/systemStatusModule';

export interface GenerationOrchestratorInitializeOptions {
  historyLimit: number;
  getBackendUrl: () => string | null;
  notificationAdapter: GenerationNotificationAdapter;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
}

type ImmutableJob = DeepReadonly<GenerationJob>;
type ImmutableJobs = ReadonlyArray<ImmutableJob>;
type ImmutableResult = DeepReadonly<GenerationResult>;
type ImmutableResults = ReadonlyArray<ImmutableResult>;
type ImmutableSystemStatus = DeepReadonly<SystemStatusState>;

/**
 * Thin façade that orchestrates generation transport, queue, and history state.
 *
 * Public contract:
 * - Reactive state (`jobs`, `activeJobs`, `sortedActiveJobs`, `recentResults`, `systemStatus`,
 *   `isConnected`, `queueManagerActive`, etc.) is exposed as immutable snapshots so consumers
 *   cannot mutate internal state directly.
 * - Lifecycle methods (`initialize`, `cleanup`, `destroy`, `resetState`) prepare and dispose of
 *   transports without introducing background watchers. They must be invoked via the orchestrator
 *   manager to guarantee a single shared instance.
 * - Data loaders and queue actions (`loadSystemStatusData`, `loadActiveJobsData`,
 *   `loadRecentResults`, `refreshAllData`, `handleBackendUrlChange`, `startGeneration`,
 *   `cancelJob`, `clearQueue`, `deleteResult`) delegate to specialised helpers and never mutate
 *   observable state outside of those helpers.
 *
 * Consumers should always obtain access through `useGenerationOrchestratorManager` so the façade
 * remains the single source of truth for generation flows.
 */
export const useGenerationOrchestratorStore = defineStore('generation-orchestrator', () => {
    const queue = createQueueModule();
    const results = createResultsModule();

    const transportModule = createTransportModule();
    const handlePollIntervalChange = (next: number): void => {
      transportModule.setPollInterval(next);
    };

    const systemStatusModule = createSystemStatusModule({
      onPollIntervalChange: handlePollIntervalChange,
    });

    const isActive = ref(false);
    const systemStatusRelease = ref<(() => void) | null>(null);

    const cleanup = (): void => {
      transportModule.clearTransport();
      if (systemStatusRelease.value) {
        systemStatusRelease.value();
        systemStatusRelease.value = null;
      }
      systemStatusModule.setQueueManagerActive(false);
      isActive.value = false;
    };

    const resetState = (): void => {
      queue.resetQueue();
      results.resetResults();
      systemStatusModule.resetConnection();
      transportModule.resetMetrics();
    };

    const transportActions = createTransportActions({
      queue,
      results,
      transport: transportModule,
    });

    const pauseTransport = (payload: GenerationTransportPausePayload): void => {
      transportModule.pauseTransport(payload);
    };

    const resumeTransport = async (
      payload: GenerationTransportResumePayload,
    ): Promise<void> => {
      await transportModule.resumeTransport(resultsPublic.historyLimit.value, payload);
    };

    const destroy = (): void => {
      cleanup();
      resetState();
    };

    const adapterHandlers = createAdapterHandlers({
      queue,
      results,
      systemStatus: systemStatusModule,
    });

    const { createResultFromCompletion: _ignored, ...resultsPublic } = results;
    const transportMetrics = transportModule.metrics as ComputedRef<GenerationTransportMetricsSnapshot>;
    const transportPaused = transportModule.paused;
    const transportPauseReasons = transportModule.pauseReasons;
    const transportPauseSince = transportModule.pauseSince;
    const transportLastPauseEvent = transportModule.lastPauseEvent;
    const transportLastResumeEvent = transportModule.lastResumeEvent;

    const jobs = computed(() =>
      createImmutableArraySnapshot(queue.jobs.value as GenerationJob[], 'generation-orchestrator.jobs') as ImmutableJobs,
    );
    const jobsByUiId = computed(() => queue.jobsByUiId.value);
    const jobsByBackendId = computed(() => queue.jobsByBackendId.value);
    const activeJobs = computed(() =>
      createImmutableArraySnapshot(queue.activeJobs.value as GenerationJob[], 'generation-orchestrator.activeJobs') as ImmutableJobs,
    );
    const sortedActiveJobs = computed(() =>
      createImmutableArraySnapshot(
        queue.sortedActiveJobs.value as GenerationJob[],
        'generation-orchestrator.sortedActiveJobs',
      ) as ImmutableJobs,
    );
    const recentResults = computed(() =>
      createImmutableArraySnapshot(
        resultsPublic.recentResults.value as GenerationResult[],
        'generation-orchestrator.recentResults',
      ) as ImmutableResults,
    );
    const systemStatus = computed(
      () =>
        createImmutableObjectSnapshot(
          systemStatusModule.systemStatus as SystemStatusState,
          'generation-orchestrator.systemStatus',
        ) as ImmutableSystemStatus,
    );

    const isActiveState = readonly(isActive);

    const initialize = async (options: GenerationOrchestratorInitializeOptions): Promise<void> => {
      if (isActive.value) {
        return;
      }

      const { controller, release } = acquireSystemStatusController({
        getBackendUrl: options.getBackendUrl,
      });

      systemStatusRelease.value = () => {
        release();
      };

      const adapter = createGenerationTransportAdapter({
        getBackendUrl: options.getBackendUrl,
        notificationAdapter: options.notificationAdapter,
        queueClient: options.queueClient,
        websocketManager: options.websocketManager,
        initialPollInterval: systemStatusModule.pollIntervalMs.value,
        shouldPollQueue: () => queue.hasActiveJobs.value,
        onSystemStatus: adapterHandlers.onSystemStatus,
        onQueueUpdate: adapterHandlers.onQueueUpdate,
        onProgress: adapterHandlers.onProgress,
        onComplete: (message) => adapterHandlers.onComplete(message),
        onError: adapterHandlers.onError,
        onRecentResults: adapterHandlers.onRecentResults,
        onConnectionChange: (connected) => {
          adapterHandlers.onConnectionChange(connected);
        },
        onConnectionStateChange: (snapshot: GenerationWebSocketStateSnapshot) => {
          transportModule.recordConnectionSnapshot(snapshot);
        },
        onTransportError: (error) => {
          transportModule.recordTransportError(error);
        },
        onHydrateSystemStatus: () => controller.ensureHydrated(),
        onReleaseSystemStatus: () => {
          systemStatusRelease.value?.();
          systemStatusRelease.value = null;
        },
      });

      transportModule.setTransport(adapter);

      resultsPublic.setHistoryLimit(options.historyLimit);
      systemStatusModule.setQueueManagerActive(true);

      try {
        isActive.value = true;
        await adapter.initialize(resultsPublic.historyLimit.value);
      } catch (error) {
        cleanup();
        throw error;
      }
    };

    return {
      ...queue,
      ...resultsPublic,
      ...systemStatusModule,
      jobs,
      jobsByUiId,
      jobsByBackendId,
      activeJobs,
      sortedActiveJobs,
      recentResults,
      systemStatus,
      isActive: isActiveState,
      initialize,
      ...transportActions,
      pauseTransport,
      resumeTransport,
      getJobByIdentifier: queue.getJobByIdentifier,
      cleanup,
      destroy,
      resetState,
      transportMetrics,
      transportPaused,
      transportPauseReasons,
      transportPauseSince,
      transportLastPauseEvent,
      transportLastResumeEvent,
      transportPhase: transportModule.phase,
      transportReconnectAttempt: transportModule.reconnectAttempt,
      transportConsecutiveFailures: transportModule.consecutiveFailures,
      transportNextRetryDelayMs: transportModule.nextRetryDelayMs,
      transportLastConnectedAt: transportModule.lastConnectedAt,
      transportLastDisconnectedAt: transportModule.lastDisconnectedAt,
      transportDowntimeMs: transportModule.downtimeMs,
      transportTotalDowntimeMs: transportModule.totalDowntimeMs,
      transportLastError: transportModule.lastError,
      transportLastSnapshot: transportModule.lastSnapshot,
    };
  });

export type GenerationOrchestratorStore = ReturnType<typeof useGenerationOrchestratorStore>;
