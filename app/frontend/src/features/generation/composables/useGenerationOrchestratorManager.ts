import {
  computed,
  effectScope,
  watch,
  type ComputedRef,
  type EffectScope,
  type Ref,
  type WatchStopHandle,
} from 'vue';
import { storeToRefs } from 'pinia';

import type { GenerationNotificationAdapter } from './useGenerationTransport';
import type { GenerationQueueClient } from '../services/queueClient';
import type { GenerationWebSocketManager } from '../services/websocketManager';
import {
  useGenerationOrchestratorManagerStore,
  type GenerationOrchestratorConsumer,
} from '../stores/orchestratorManagerStore';
import {
  useGenerationOrchestratorStore,
  DEFAULT_HISTORY_LIMIT,
} from '../stores/useGenerationOrchestratorStore';
import { useGenerationStudioUiStore } from '../stores/ui';
import { useBackendUrl } from '@/utils/backend';
import type {
  GenerationJob,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  SystemStatusState,
} from '@/types';
import type { DeepReadonly } from '@/utils/freezeDeep';

export interface GenerationOrchestratorAcquireOptions {
  notify: GenerationNotificationAdapter['notify'];
  debug?: GenerationNotificationAdapter['debug'];
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
  autoSync?: boolean | GenerationOrchestratorAutoSyncOptions;
}

export interface GenerationOrchestratorAutoSyncOptions {
  historyLimit?: boolean;
  backendUrl?: boolean;
}

const normalizeAutoSyncOptions = (
  value: GenerationOrchestratorAcquireOptions['autoSync'],
): Required<GenerationOrchestratorAutoSyncOptions> => {
  if (value === false) {
    return { historyLimit: false, backendUrl: false };
  }

  if (value === true || value === undefined) {
    return { historyLimit: true, backendUrl: true };
  }

  return {
    historyLimit: value.historyLimit ?? true,
    backendUrl: value.backendUrl ?? true,
  };
};

export interface UseGenerationOrchestratorManagerDependencies {
  useGenerationOrchestratorManagerStore: () => ReturnType<
    typeof useGenerationOrchestratorManagerStore
  >;
  useGenerationOrchestratorStore: () => ReturnType<typeof useGenerationOrchestratorStore>;
  useGenerationStudioUiStore: () => ReturnType<typeof useGenerationStudioUiStore>;
  useBackendUrl: typeof useBackendUrl;
}

const defaultDependencies: UseGenerationOrchestratorManagerDependencies = {
  useGenerationOrchestratorManagerStore,
  useGenerationOrchestratorStore,
  useGenerationStudioUiStore,
  useBackendUrl,
};

export interface GenerationOrchestratorBinding {
  activeJobs: Ref<ReadonlyArray<DeepReadonly<GenerationJob>>>;
  sortedActiveJobs: Ref<ReadonlyArray<DeepReadonly<GenerationJob>>>;
  recentResults: Ref<ReadonlyArray<DeepReadonly<GenerationResult>>>;
  systemStatus: Ref<DeepReadonly<SystemStatusState>>;
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
  setHistoryLimit: (limit: number) => void;
  handleBackendUrlChange: () => Promise<void>;
  release: () => void;
}

export const HISTORY_LIMIT_WHEN_SHOWING = 50;

export const createUseGenerationOrchestratorManager = (
  dependencies: UseGenerationOrchestratorManagerDependencies = defaultDependencies,
) => () => {
  const orchestratorManagerStore = dependencies.useGenerationOrchestratorManagerStore();
  const orchestratorStore = dependencies.useGenerationOrchestratorStore();
  const { initializationPromise, isInitialized, consumers } = storeToRefs(orchestratorManagerStore);
  const generationUiStore = dependencies.useGenerationStudioUiStore();
  const { showHistory } = storeToRefs(generationUiStore);

  const backendUrl = dependencies.useBackendUrl('/') as ComputedRef<string>;
  const getBackendUrl = (): string | null => backendUrl.value || null;

  const historyLimit = computed<number>(() =>
    showHistory.value ? HISTORY_LIMIT_WHEN_SHOWING : DEFAULT_HISTORY_LIMIT,
  );

  let lifecycleScope: EffectScope | null = null;

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

  let historyWatcherStop: WatchStopHandle | null = null;
  let backendWatcherStop: WatchStopHandle | null = null;

  const ensureLifecycleScope = (): EffectScope => {
    if (!lifecycleScope) {
      lifecycleScope = effectScope();
    }

    return lifecycleScope;
  };

  const stopLifecycleScope = (): void => {
    if (!lifecycleScope) {
      return;
    }

    historyWatcherStop?.();
    backendWatcherStop?.();
    historyWatcherStop = null;
    backendWatcherStop = null;
    lifecycleScope.stop();
    lifecycleScope = null;
  };

  const hasHistoryAutoSync = (): boolean => {
    for (const consumer of consumers.value.values()) {
      if (consumer.autoSyncHistory) {
        return true;
      }
    }
    return false;
  };

  const hasBackendAutoSync = (): boolean => {
    for (const consumer of consumers.value.values()) {
      if (consumer.autoSyncBackend) {
        return true;
      }
    }
    return false;
  };

  const startHistoryWatcher = (): void => {
    if (historyWatcherStop || !hasHistoryAutoSync()) {
      return;
    }

    const scope = ensureLifecycleScope();
    historyWatcherStop =
      scope.run(
        () =>
          watch(historyLimit, (next, previous) => {
            if (!isInitialized.value || previous === next) {
              return;
            }

            const orchestrator = ensureOrchestrator();
            orchestrator.setHistoryLimit(next);
            void orchestrator.loadRecentResults(false);
          }),
      ) ?? null;
  };

  const stopHistoryWatcher = (): void => {
    if (!historyWatcherStop) {
      return;
    }

    historyWatcherStop();
    historyWatcherStop = null;
  };

  const startBackendWatcher = (): void => {
    if (backendWatcherStop || !hasBackendAutoSync()) {
      return;
    }

    const scope = ensureLifecycleScope();
    backendWatcherStop =
      scope.run(
        () =>
          watch(backendUrl, (next, previous) => {
            if (!isInitialized.value || next === previous) {
              return;
            }

            const orchestrator = ensureOrchestrator();
            void orchestrator.handleBackendUrlChange();
          }),
      ) ?? null;
  };

  const stopBackendWatcher = (): void => {
    if (!backendWatcherStop) {
      return;
    }

    backendWatcherStop();
    backendWatcherStop = null;
  };

  const updateAutoSyncWatchers = (): void => {
    if (hasHistoryAutoSync()) {
      startHistoryWatcher();
    } else {
      stopHistoryWatcher();
    }

    if (hasBackendAutoSync()) {
      startBackendWatcher();
    } else {
      stopBackendWatcher();
    }

    if (!historyWatcherStop && !backendWatcherStop && consumers.value.size === 0) {
      stopLifecycleScope();
    }
  };

  const ensureInitialized = async (
    options: GenerationOrchestratorAcquireOptions,
  ): Promise<void> => {
    if (isInitialized.value) {
      return;
    }

    if (!initializationPromise.value) {
      const orchestrator = ensureOrchestrator();
      ensureLifecycleScope();
      const promise = orchestrator
        .initialize({
          historyLimit: historyLimit.value,
          getBackendUrl,
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
      stopHistoryWatcher();
      stopBackendWatcher();
      orchestratorManagerStore.destroyOrchestrator();
      stopLifecycleScope();
      return;
    }

    updateAutoSyncWatchers();

  };

  const acquire = (
    options: GenerationOrchestratorAcquireOptions,
  ): GenerationOrchestratorBinding => {
    const autoSync = normalizeAutoSyncOptions(options.autoSync);

    const consumer: GenerationOrchestratorConsumer = {
      id: Symbol('generation-orchestrator-consumer'),
      notify: options.notify,
      debug: options.debug,
      autoSyncHistory: autoSync.historyLimit,
      autoSyncBackend: autoSync.backendUrl,
    };

    const orchestrator = ensureOrchestrator();
    orchestratorManagerStore.registerConsumer(consumer);

    updateAutoSyncWatchers();

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
    const setHistoryLimit = (limit: number): void => {
      orchestrator.setHistoryLimit(limit);
    };
    const handleBackendUrlChange = (): Promise<void> => orchestrator.handleBackendUrlChange();

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
      setHistoryLimit,
      handleBackendUrlChange,
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
