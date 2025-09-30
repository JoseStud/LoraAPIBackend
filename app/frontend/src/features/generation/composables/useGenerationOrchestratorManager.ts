import { type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import {
  createGenerationOrchestratorFactory,
  type GenerationOrchestrator,
} from './createGenerationOrchestrator';
import type { GenerationNotificationAdapter } from './useGenerationTransport';
import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '@/services';
import {
  useGenerationConnectionStore,
  useGenerationFormStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
  useGenerationOrchestratorManagerStore,
  type GenerationOrchestratorConsumer,
} from '@/features/generation/stores';
import { useSettingsStore, waitForSettingsHydration } from '@/stores';
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
  useGenerationFormStore: () => ReturnType<typeof useGenerationFormStore>;
  useGenerationQueueStore: () => ReturnType<typeof useGenerationQueueStore>;
  useGenerationResultsStore: () => ReturnType<typeof useGenerationResultsStore>;
  useGenerationConnectionStore: () => ReturnType<
    typeof useGenerationConnectionStore
  >;
  useSettingsStore: () => ReturnType<typeof useSettingsStore>;
  waitForSettingsHydration: typeof waitForSettingsHydration;
}

const defaultDependencies: UseGenerationOrchestratorManagerDependencies = {
  useGenerationOrchestratorManagerStore,
  useGenerationFormStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
  useGenerationConnectionStore,
  useSettingsStore,
  waitForSettingsHydration,
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

const createOrchestratorFactory = (
  options: GenerationOrchestratorAcquireOptions,
  context: {
    showHistory: Ref<boolean>;
    configuredBackendUrl: Ref<string | null | undefined>;
    queueStoreReturn: ReturnType<typeof useGenerationQueueStore>;
    resultsStoreReturn: ReturnType<typeof useGenerationResultsStore>;
    connectionStoreReturn: ReturnType<typeof useGenerationConnectionStore>;
    historyLimit: Ref<number>;
    pollIntervalMs: Ref<number>;
  },
  notifyAll: GenerationNotificationAdapter['notify'],
  debugAll: GenerationNotificationAdapter['debug'],
): GenerationOrchestrator =>
  createGenerationOrchestratorFactory({
    showHistory: context.showHistory,
    configuredBackendUrl: context.configuredBackendUrl,
    notificationAdapter: {
      notify: notifyAll,
      debug: debugAll,
    },
    queueStore: context.queueStoreReturn,
    resultsStore: context.resultsStoreReturn,
    connectionStore: context.connectionStoreReturn,
    historyLimit: context.historyLimit,
    pollIntervalMs: context.pollIntervalMs,
    queueClient: options.queueClient,
    websocketManager: options.websocketManager,
  });

export const createUseGenerationOrchestratorManager = (
  dependencies: UseGenerationOrchestratorManagerDependencies = defaultDependencies,
) => () => {
  const orchestratorManagerStore = dependencies.useGenerationOrchestratorManagerStore();
  const {
    orchestrator: orchestratorRef,
    initializationPromise,
    isInitialized,
    consumers,
  } = storeToRefs(orchestratorManagerStore);

  const formStore = dependencies.useGenerationFormStore();
  const queueStore = dependencies.useGenerationQueueStore();
  const resultsStore = dependencies.useGenerationResultsStore();
  const connectionStore = dependencies.useGenerationConnectionStore();
  const settingsStore = dependencies.useSettingsStore();

  const { showHistory } = storeToRefs(formStore);
  const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore);
  const { historyLimit, recentResults } = storeToRefs(resultsStore);
  const { pollIntervalMs, systemStatus, isConnected } = storeToRefs(connectionStore);
  const { activeJobs, sortedActiveJobs } = storeToRefs(queueStore);

  const ensureSettingsHydrated = async (): Promise<void> => {
    await dependencies.waitForSettingsHydration(settingsStore);
  };

  const callWithSettings = async <T>(operation: () => Promise<T>): Promise<T> => {
    await ensureSettingsHydrated();
    return operation();
  };

  const wrapWithSettings = <Args extends unknown[], T>(
    operation: (...args: Args) => Promise<T>,
  ) =>
    (...args: Args): Promise<T> =>
      callWithSettings(() => operation(...args));

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

  const ensureOrchestrator = (
    options: GenerationOrchestratorAcquireOptions,
  ): GenerationOrchestrator =>
    orchestratorManagerStore.ensureOrchestrator(() =>
      createOrchestratorFactory(
        options,
        {
          showHistory,
          configuredBackendUrl,
          queueStoreReturn: queueStore,
          resultsStoreReturn: resultsStore,
          connectionStoreReturn: connectionStore,
          historyLimit,
          pollIntervalMs,
        },
        notifyAll,
        debugAll,
      ),
    );

  const ensureInitialized = async (): Promise<void> => {
    if (isInitialized.value) {
      return;
    }

    await ensureSettingsHydrated();

    const orchestrator = orchestratorRef.value;

    if (!orchestrator) {
      throw new Error('Generation orchestrator has not been created yet');
    }

    if (!initializationPromise.value) {
      const promise = orchestrator
        .initialize()
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

    if (
      consumers.value.size === 0 &&
      orchestratorRef.value
    ) {
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

    orchestratorManagerStore.registerConsumer(consumer);

    const orchestrator = ensureOrchestrator(options);

    const loadSystemStatusData = wrapWithSettings(orchestrator.loadSystemStatusData);
    const loadActiveJobsData = wrapWithSettings(orchestrator.loadActiveJobsData);
    const loadRecentResultsData = wrapWithSettings(orchestrator.loadRecentResultsData);
    const startGeneration = wrapWithSettings(orchestrator.startGeneration);
    const cancelJob = wrapWithSettings(orchestrator.cancelJob);
    const clearQueue = wrapWithSettings(orchestrator.clearQueue);
    const deleteResult = wrapWithSettings(orchestrator.deleteResult);
    const refreshResults = wrapWithSettings((notifySuccess: boolean | undefined = false) =>
      orchestrator.loadRecentResultsData(notifySuccess),
    );

    const initialize = async (): Promise<void> => {
      await ensureInitialized();
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
      canCancelJob: (job: GenerationJob) => queueStore.isJobCancellable(job),
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
    acquire,
  };
};

export const useGenerationOrchestratorManager = createUseGenerationOrchestratorManager();

export type UseGenerationOrchestratorManagerReturn = ReturnType<
  typeof useGenerationOrchestratorManager
>;
