import { ref, type Ref } from 'vue';
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

export interface GenerationOrchestratorStoreDependencies {
  createTransportAdapter?: typeof createGenerationTransportAdapter;
}

const defaultDependencies: GenerationOrchestratorStoreDependencies = {
  createTransportAdapter: createGenerationTransportAdapter,
};

export const useGenerationOrchestratorStore = defineStore(
  'generation-orchestrator',
  (dependencies: GenerationOrchestratorStoreDependencies = defaultDependencies) => {
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

    const initialize = async (options: GenerationOrchestratorInitializeOptions): Promise<void> => {
      if (isActive.value) {
        return;
      }

      const createAdapter = dependencies.createTransportAdapter ?? createGenerationTransportAdapter;

      const { controller, release } = acquireSystemStatusController({
        getBackendUrl: options.getBackendUrl,
      });

      systemStatusRelease.value = () => {
        release();
      };

      const adapter = createAdapter({
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
      isActive,
      initialize,
      ...transportActions,
      cleanup,
      destroy,
      resetState,
    };
  },
);

export type GenerationOrchestratorStore = ReturnType<typeof useGenerationOrchestratorStore>;
