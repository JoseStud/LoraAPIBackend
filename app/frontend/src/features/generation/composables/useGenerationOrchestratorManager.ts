import { type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import type { GenerationNotificationAdapter } from './useGenerationTransport';
import type { GenerationQueueClient } from '../services/queueClient';
import type { GenerationWebSocketManager } from '../services/websocketManager';
import {
  useGenerationOrchestratorManagerStore,
  type GenerationOrchestratorConsumer,
} from '../stores/orchestratorManagerStore';
import { useGenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';
import { useGenerationStudioUiStore } from '../stores/ui';
import { useSettingsStore } from '@/stores';
import type {
  GenerationJob,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  SystemStatusState,
} from '@/types';

export interface GenerationOrchestratorAcquireOptions {
  notify: GenerationNotificationAdapter['notify'];
  debug?: GenerationNotificationAdapter['debug'];
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
}

export interface UseGenerationOrchestratorManagerDependencies {
  useGenerationOrchestratorManagerStore: () => ReturnType<
    typeof useGenerationOrchestratorManagerStore
  >;
  useGenerationOrchestratorStore: () => ReturnType<typeof useGenerationOrchestratorStore>;
  useGenerationStudioUiStore: () => ReturnType<typeof useGenerationStudioUiStore>;
  useSettingsStore: () => ReturnType<typeof useSettingsStore>;
}

const defaultDependencies: UseGenerationOrchestratorManagerDependencies = {
  useGenerationOrchestratorManagerStore,
  useGenerationOrchestratorStore,
  useGenerationStudioUiStore,
  useSettingsStore,
};

export interface GenerationOrchestratorBinding {
  activeJobs: Ref<GenerationJob[]>;
  sortedActiveJobs: Ref<GenerationJob[]>;
  recentResults: Ref<GenerationResult[]>;
  systemStatus: Ref<SystemStatusState>;
  isConnected: Ref<boolean>;
  initialize: () => Promise<void>;
  cleanup: () => void;
  loadSystemStatusData: () => Promise<void>;
  loadActiveJobsData: () => Promise<void>;
  loadRecentResultsData: (notifySuccess?: boolean) => Promise<void>;
  startGeneration: (payload: GenerationRequestPayload) => Promise<GenerationStartResponse>;
  cancelJob: (jobId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  deleteResult: (resultId: string | number) => Promise<void>;
  refreshResults: (notifySuccess?: boolean) => Promise<void>;
  canCancelJob: (job: GenerationJob) => boolean;
  release: () => void;
}

export const createUseGenerationOrchestratorManager = (
  dependencies: UseGenerationOrchestratorManagerDependencies = defaultDependencies,
) => () => {
  const orchestratorManagerStore = dependencies.useGenerationOrchestratorManagerStore();
  const orchestratorStore = dependencies.useGenerationOrchestratorStore();
  const { initializationPromise, isInitialized, consumers } = storeToRefs(orchestratorManagerStore);

  const uiStore = dependencies.useGenerationStudioUiStore();
  const settingsStore = dependencies.useSettingsStore();

  const { showHistory } = storeToRefs(uiStore);
  const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore);
  const {
    recentResults,
    systemStatus,
    isConnected,
    activeJobs,
    sortedActiveJobs,
    queueManagerActive,
  } = storeToRefs(orchestratorStore);

  const notifyAll: GenerationNotificationAdapter['notify'] = (
    message,
    type: Parameters<GenerationNotificationAdapter['notify']>[1] = 'info',
  ) => {
    consumers.value.forEach((consumer) => {
      consumer.notify(message, type);
    });
  };

  const debugAll: GenerationNotificationAdapter['debug'] = (...args: unknown[]) => {
    consumers.value.forEach((consumer) => {
      consumer.debug?.(...args);
    });
  };

  const ensureOrchestrator = (): ReturnType<typeof useGenerationOrchestratorStore> =>
    orchestratorManagerStore.ensureOrchestrator(() => orchestratorStore);

  const ensureInitialized = async (
    options: GenerationOrchestratorAcquireOptions,
  ): Promise<void> => {
    if (isInitialized.value) {
      return;
    }

    if (!initializationPromise.value) {
      const orchestrator = ensureOrchestrator();
      const promise = orchestrator
        .initialize({
          showHistory,
          configuredBackendUrl,
          notificationAdapter: {
            notify: notifyAll,
            debug: debugAll,
          },
          queueClient: options.queueClient,
          websocketManager: options.websocketManager,
        })
        .then(() => {
          isInitialized.value = true;
        })
        .catch((error) => {
          isInitialized.value = false;
          throw error;
        })
        .finally(() => {
          initializationPromise.value = null;
        });

      initializationPromise.value = promise;
    }

    await initializationPromise.value;
  };

  const releaseConsumer = (id: symbol): void => {
    if (!consumers.value.has(id)) {
      return;
    }

    orchestratorManagerStore.unregisterConsumer(id);

    if (consumers.value.size === 0) {
      orchestratorManagerStore.destroyOrchestrator();
    }
  };

  const acquire = (
    options: GenerationOrchestratorAcquireOptions,
  ): GenerationOrchestratorBinding => {
    const consumer: GenerationOrchestratorConsumer = {
      id: Symbol('generation-orchestrator-consumer'),
      notify: options.notify,
      debug: options.debug,
    };

    const orchestrator = ensureOrchestrator();
    orchestratorManagerStore.registerConsumer(consumer);

    const loadSystemStatusData = (): Promise<void> => orchestrator.loadSystemStatusData();
    const loadActiveJobsData = (): Promise<void> => orchestrator.loadActiveJobsData();
    const loadRecentResultsData = (notifySuccess?: boolean): Promise<void> =>
      orchestrator.loadRecentResults(notifySuccess);
    const startGeneration = (payload: GenerationRequestPayload): Promise<GenerationStartResponse> =>
      orchestrator.startGeneration(payload);
    const cancelJob = (jobId: string): Promise<void> => orchestrator.cancelJob(jobId);
    const clearQueue = (): Promise<void> => orchestrator.clearQueue();
    const deleteResult = (resultId: string | number): Promise<void> =>
      orchestrator.deleteResult(resultId);
    const refreshResults = (notifySuccess = false): Promise<void> =>
      orchestrator.loadRecentResults(notifySuccess);

    const initialize = async (): Promise<void> => {
      await ensureInitialized(options);
    };

    const cleanup = (): void => {
      releaseConsumer(consumer.id);
    };

    const binding: GenerationOrchestratorBinding = {
      activeJobs,
      sortedActiveJobs,
      recentResults,
      systemStatus,
      isConnected,
      initialize,
      cleanup,
      loadSystemStatusData,
      loadActiveJobsData,
      loadRecentResultsData,
      startGeneration,
      cancelJob,
      clearQueue,
      deleteResult,
      refreshResults,
      canCancelJob: (job: GenerationJob) => orchestrator.isJobCancellable(job),
      release: () => {
        releaseConsumer(consumer.id);
      },
    };

    return binding;
  };

  return {
    activeJobs,
    sortedActiveJobs,
    recentResults,
    systemStatus,
    isConnected,
    queueManagerActive,
    isInitialized,
    acquire,
  };
};

export const useGenerationOrchestratorManager = createUseGenerationOrchestratorManager();

export type UseGenerationOrchestratorManagerReturn = ReturnType<
  typeof useGenerationOrchestratorManager
>;
