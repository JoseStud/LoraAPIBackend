import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue';
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

const freezeJob = (job: GenerationJob): Readonly<GenerationJob> =>
  Object.freeze({ ...job });

const freezeResult = (result: GenerationResult): Readonly<GenerationResult> =>
  Object.freeze({ ...result });

const freezeSystemStatus = (
  status: SystemStatusState,
): Readonly<SystemStatusState> => Object.freeze({ ...status });

type ImmutableJobs = readonly Readonly<GenerationJob>[];
type ImmutableResults = readonly Readonly<GenerationResult>[];

const toImmutableJobs = (
  source: { readonly value: readonly GenerationJob[] | readonly Readonly<GenerationJob>[] },
): ComputedRef<ImmutableJobs> =>
  computed(() => Object.freeze(source.value.map((job) => freezeJob(job as GenerationJob))));

const toImmutableResults = (
  source: { readonly value: readonly GenerationResult[] | readonly Readonly<GenerationResult>[] },
): ComputedRef<ImmutableResults> =>
  computed(() => Object.freeze(source.value.map((result) => freezeResult(result as GenerationResult))));

const toImmutableSystemStatus = (
  source: () => SystemStatusState,
): ComputedRef<Readonly<SystemStatusState>> => computed(() => freezeSystemStatus(source()));

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
    };

    const transportActions = createTransportActions({
      queue,
      results,
      transport: transportModule,
    });

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

    const jobs = toImmutableJobs(queue.jobs);
    const activeJobs = toImmutableJobs(queue.activeJobs);
    const sortedActiveJobs = toImmutableJobs(queue.sortedActiveJobs);
    const recentResults = toImmutableResults(resultsPublic.recentResults);
    const systemStatus = toImmutableSystemStatus(
      () => systemStatusModule.systemStatus as SystemStatusState,
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
        onConnectionChange: adapterHandlers.onConnectionChange,
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
      activeJobs,
      sortedActiveJobs,
      recentResults,
      systemStatus,
      isActive: isActiveState,
      initialize,
      ...transportActions,
      cleanup,
      destroy,
      resetState,
    };
  });

export type GenerationOrchestratorStore = ReturnType<typeof useGenerationOrchestratorStore>;
