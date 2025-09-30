import { ref, watch, type Ref } from 'vue';
import { defineStore } from 'pinia';

import { createGenerationTransportAdapter, type GenerationTransportAdapter } from '../composables/createGenerationTransportAdapter';
import type { GenerationQueueClient } from '../services/queueClient';
import type { GenerationWebSocketManager } from '../services/websocketManager';
import type { GenerationNotificationAdapter } from '../composables/useGenerationTransport';
import { acquireSystemStatusController } from './systemStatusController';
import { createQueueModule } from './orchestrator/queueModule';
import { createResultsModule, DEFAULT_HISTORY_LIMIT } from './orchestrator/resultsModule';
import { createSystemStatusModule } from './orchestrator/systemStatusModule';
import { createTransportModule } from './orchestrator/transportModule';
import { createWatcherRegistry } from './orchestrator/watcherRegistry';
import type { GenerationRequestPayload, GenerationStartResponse } from '@/types';

export type { GenerationJobInput } from './orchestrator/queueModule';
export { MAX_RESULTS, DEFAULT_HISTORY_LIMIT } from './orchestrator/resultsModule';
export { DEFAULT_SYSTEM_STATUS, createDefaultSystemStatus } from './orchestrator/systemStatusModule';

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

const HISTORY_LIMIT_WHEN_SHOWING = 50;

export const useGenerationOrchestratorStore = defineStore(
  'generation-orchestrator',
  (dependencies: GenerationOrchestratorStoreDependencies = defaultDependencies) => {
    const queue = createQueueModule();
    const results = createResultsModule();

    const transportModule = createTransportModule();
    const handlePollIntervalChange = (next: number): void => {
      if (transportModule.transport.value) {
        transportModule.transport.value.setPollInterval(next);
      }
    };

    const systemStatusModule = createSystemStatusModule({
      onPollIntervalChange: handlePollIntervalChange,
    });

    const watcherRegistry = createWatcherRegistry();

    const isActive = ref(false);
    const systemStatusRelease = ref<(() => void) | null>(null);

    const cleanup = (): void => {
      transportModule.clearTransport();
      watcherRegistry.stopAll();
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
        initialPollInterval: systemStatusModule.pollIntervalMs.value,
        shouldPollQueue: () => queue.hasActiveJobs.value,
        onSystemStatus: (payload) => {
          systemStatusModule.applySystemStatusPayload(payload);
        },
        onQueueUpdate: (jobsPayload) => {
          queue.ingestQueue(jobsPayload);
        },
        onProgress: (message) => {
          queue.handleProgressMessage(message);
        },
        onComplete: (message) => {
          queue.handleCompletionMessage(message);
          const result = results.createResultFromCompletion(message);
          results.addResult(result);
          return result;
        },
        onError: (message) => {
          queue.handleErrorMessage(message);
        },
        onRecentResults: (payload) => {
          results.setResults(payload);
        },
        onConnectionChange: (connected) => {
          systemStatusModule.setConnectionState(connected);
        },
        onHydrateSystemStatus: () => controller.ensureHydrated(),
        onReleaseSystemStatus: () => {
          systemStatusRelease.value?.();
          systemStatusRelease.value = null;
        },
      });

      transportModule.setTransport(adapter);

      const stopHistoryWatch = watch(options.showHistory, (next) => {
        const nextLimit = next ? HISTORY_LIMIT_WHEN_SHOWING : DEFAULT_HISTORY_LIMIT;
        results.setHistoryLimit(nextLimit);
        void loadRecentResults();
      });

      watcherRegistry.register(stopHistoryWatch);

      const stopBackendWatch = watch(
        options.configuredBackendUrl,
        (next, previous) => {
          if (next === previous) {
            return;
          }
          transportModule.transport.value?.reconnect();
          void refreshAllData();
        },
      );

      watcherRegistry.register(stopBackendWatch);

      const nextLimit = options.showHistory.value ? HISTORY_LIMIT_WHEN_SHOWING : DEFAULT_HISTORY_LIMIT;
      results.setHistoryLimit(nextLimit);
      systemStatusModule.setQueueManagerActive(true);

      try {
        isActive.value = true;
        await adapter.initialize(results.historyLimit.value);
      } catch (error) {
        cleanup();
        throw error;
      }
    };

    const ensureTransport = (): GenerationTransportAdapter => transportModule.ensureTransport();

    const loadSystemStatusData = async (): Promise<void> => {
      await ensureTransport().refreshSystemStatus();
    };

    const loadActiveJobsData = async (): Promise<void> => {
      await ensureTransport().refreshActiveJobs();
    };

    const loadRecentResults = async (notifySuccess = false): Promise<void> => {
      await ensureTransport().refreshRecentResults(results.historyLimit.value, notifySuccess);
    };

    const refreshAllData = async (): Promise<void> => {
      await ensureTransport().refreshAll(results.historyLimit.value);
    };

    const startGeneration = async (
      payload: GenerationRequestPayload,
    ): Promise<GenerationStartResponse> => {
      const transportInstance = ensureTransport();
      const response = await transportInstance.startGeneration(payload);

      if (response.job_id) {
        const createdAt = new Date().toISOString();
        queue.enqueueJob({
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
      }

      return response;
    };

    const cancelJob = async (jobId: string): Promise<void> => {
      const transportInstance = ensureTransport();
      await transportInstance.cancelJob(jobId);
      queue.removeJob(jobId);
    };

    const clearQueue = async (): Promise<void> => {
      const cancellableJobs = queue.getCancellableJobs();
      if (cancellableJobs.length === 0) {
        return;
      }

      await Promise.allSettled(cancellableJobs.map((job) => cancelJob(job.id)));
    };

    const deleteResult = async (resultId: string | number): Promise<void> => {
      const transportInstance = ensureTransport();
      await transportInstance.deleteResult(resultId);
      results.removeResult(resultId);
    };

    const destroy = (): void => {
      cleanup();
      resetState();
    };

    return {
      // state
      jobs: queue.jobs,
      results: results.results,
      historyLimit: results.historyLimit,
      systemStatus: systemStatusModule.systemStatus,
      isConnected: systemStatusModule.isConnected,
      pollIntervalMs: systemStatusModule.pollIntervalMs,
      systemStatusReady: systemStatusModule.systemStatusReady,
      systemStatusLastUpdated: systemStatusModule.systemStatusLastUpdated,
      systemStatusApiAvailable: systemStatusModule.systemStatusApiAvailable,
      queueManagerActive: systemStatusModule.queueManagerActive,
      isActive,
      // getters
      activeJobs: queue.activeJobs,
      sortedActiveJobs: queue.sortedActiveJobs,
      hasActiveJobs: queue.hasActiveJobs,
      recentResults: results.recentResults,
      // queue actions
      enqueueJob: queue.enqueueJob,
      setJobs: queue.setJobs,
      updateJob: queue.updateJob,
      removeJob: queue.removeJob,
      clearCompletedJobs: queue.clearCompletedJobs,
      isJobCancellable: queue.isJobCancellable,
      getCancellableJobs: queue.getCancellableJobs,
      handleProgressMessage: queue.handleProgressMessage,
      handleCompletionMessage: queue.handleCompletionMessage,
      handleErrorMessage: queue.handleErrorMessage,
      ingestQueue: queue.ingestQueue,
      resetQueue: queue.resetQueue,
      // result actions
      addResult: results.addResult,
      setResults: results.setResults,
      removeResult: results.removeResult,
      setHistoryLimit: results.setHistoryLimit,
      resetResults: results.resetResults,
      // connection actions
      setConnectionState: systemStatusModule.setConnectionState,
      setPollInterval: systemStatusModule.setPollInterval,
      updateSystemStatus: systemStatusModule.updateSystemStatus,
      resetSystemStatus: systemStatusModule.resetSystemStatus,
      applySystemStatusPayload: systemStatusModule.applySystemStatusPayload,
      markSystemStatusHydrated: systemStatusModule.markSystemStatusHydrated,
      markSystemStatusUnavailable: systemStatusModule.markSystemStatusUnavailable,
      resetConnection: systemStatusModule.resetConnection,
      setQueueManagerActive: systemStatusModule.setQueueManagerActive,
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
