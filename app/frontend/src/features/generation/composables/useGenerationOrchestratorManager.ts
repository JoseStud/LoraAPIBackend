/** @internal */
import {
  computed,
  effectScope,
  shallowRef,
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
import { useBackendUrl } from '@/utils/backend';
import type {
  GenerationRequestPayload,
  GenerationStartResponse,
  SystemStatusState,
} from '@/types';
import type { DeepReadonly } from '@/utils/freezeDeep';
import type { GenerationJobView, GenerationResultView } from '../orchestrator/facade';
import type {
  GenerationTransportPausePayload,
  GenerationTransportPauseReason,
  GenerationTransportResumePayload,
} from '../types/transport';

export interface GenerationOrchestratorAcquireOptions {
  notify: GenerationNotificationAdapter['notify'];
  debug?: GenerationNotificationAdapter['debug'];
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
  autoSync?: boolean | GenerationOrchestratorAutoSyncOptions;
  historyVisibility?: Readonly<Ref<boolean>>;
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
  useBackendUrl: typeof useBackendUrl;
}

const defaultDependencies: UseGenerationOrchestratorManagerDependencies = {
  useGenerationOrchestratorManagerStore,
  useGenerationOrchestratorStore,
  useBackendUrl,
};

export interface GenerationOrchestratorBinding {
  activeJobs: Ref<ReadonlyArray<GenerationJobView>>;
  sortedActiveJobs: Ref<ReadonlyArray<GenerationJobView>>;
  recentResults: Ref<ReadonlyArray<GenerationResultView>>;
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
  canCancelJob: (job: GenerationJobView) => boolean;
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
  const historyVisibilityRefs = shallowRef(new Map<symbol, Readonly<Ref<boolean>>>());

  const registerHistoryVisibilityRef = (
    consumerId: symbol,
    visibility: Readonly<Ref<boolean>> | undefined,
  ): void => {
    if (!visibility) {
      return;
    }

    const next = new Map(historyVisibilityRefs.value);
    next.set(consumerId, visibility);
    historyVisibilityRefs.value = next;
  };

  const unregisterHistoryVisibilityRef = (consumerId: symbol): void => {
    if (!historyVisibilityRefs.value.has(consumerId)) {
      return;
    }

    const next = new Map(historyVisibilityRefs.value);
    next.delete(consumerId);
    historyVisibilityRefs.value = next;
  };

  const backendUrl = dependencies.useBackendUrl('/') as ComputedRef<string>;
  const getBackendUrl = (): string | null => backendUrl.value || null;

  const historyLimit = computed<number>(() => {
    for (const visibility of historyVisibilityRefs.value.values()) {
      if (visibility.value) {
        return HISTORY_LIMIT_WHEN_SHOWING;
      }
    }

    return DEFAULT_HISTORY_LIMIT;
  });

  let lifecycleScope: EffectScope | null = null;

  const {
    recentResults,
    systemStatus,
    isConnected,
    activeJobs,
    sortedActiveJobs,
    queueManagerActive,
    transportPaused,
    transportPauseReasons,
    transportPauseSince,
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

  let environmentCleanup: (() => void) | null = null;
  let lastEnvironmentKey = '';
  let lastPauseActive = false;

  const logLifecycleEvent = (
    event: 'pause' | 'resume',
    payload: GenerationTransportPausePayload | GenerationTransportResumePayload,
  ): void => {
    const entry: Record<string, unknown> = {
      event,
      timestamp: new Date(payload.timestamp).toISOString(),
      source: payload.source,
      hidden: payload.hidden,
      online: payload.online,
    };

    if ('reasons' in payload) {
      entry.reasons = [...payload.reasons];
    }

    console.info('[GenerationOrchestratorLifecycle]', entry);
  };

  const getEnvironmentState = () => {
    const hidden = typeof document !== 'undefined' ? document.hidden === true : false;
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    const reasons: GenerationTransportPauseReason[] = [];

    if (hidden) {
      reasons.push('document-hidden');
    }

    if (!online) {
      reasons.push('network-offline');
    }

    return { hidden, online, reasons } as const;
  };

  const applyEnvironmentPauseState = (
    source: string,
    options: { force?: boolean } = {},
  ): void => {
    if (typeof window === 'undefined') {
      return;
    }

    const state = getEnvironmentState();
    const key = `${state.reasons.join('|')}|hidden:${state.hidden}|online:${state.online}`;
    const previousKey = lastEnvironmentKey;
    const wasPaused = lastPauseActive;

    if (!options.force && key === previousKey) {
      return;
    }

    lastEnvironmentKey = key;
    lastPauseActive = state.reasons.length > 0;

    if (!isInitialized.value) {
      return;
    }

    const orchestratorInstance = orchestratorManagerStore.orchestrator.value;
    if (!orchestratorInstance) {
      return;
    }

    const timestamp = Date.now();

    if (state.reasons.length > 0) {
      const payload: GenerationTransportPausePayload = {
        reasons: state.reasons,
        hidden: state.hidden,
        online: state.online,
        source,
        timestamp,
      };
      orchestratorInstance.pauseTransport(payload);
      logLifecycleEvent('pause', payload);
      return;
    }

    if (!options.force && !wasPaused) {
      return;
    }

    const resumePayload: GenerationTransportResumePayload = {
      hidden: state.hidden,
      online: state.online,
      source,
      timestamp,
    };

    void orchestratorInstance
      .resumeTransport(resumePayload)
      .catch((error) => {
        console.error('Failed to resume generation transport after environment change:', error);
      });
    logLifecycleEvent('resume', resumePayload);
  };

  const startEnvironmentListeners = (): void => {
    if (environmentCleanup || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = (): void => {
      applyEnvironmentPauseState('visibilitychange');
    };
    const handleOnline = (): void => {
      applyEnvironmentPauseState('online');
    };
    const handleOffline = (): void => {
      applyEnvironmentPauseState('offline');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    environmentCleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };

    applyEnvironmentPauseState('environment:init', { force: true });
  };

  const stopEnvironmentListeners = (): void => {
    if (!environmentCleanup) {
      return;
    }

    environmentCleanup();
    environmentCleanup = null;
    lastEnvironmentKey = '';
    lastPauseActive = false;
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
    applyEnvironmentPauseState('environment:sync', { force: true });
  };

  const releaseConsumer = (id: symbol): void => {
    if (!consumers.value.has(id)) {
      return;
    }

    orchestratorManagerStore.unregisterConsumer(id);
    unregisterHistoryVisibilityRef(id);

    if (!orchestratorManagerStore.hasActiveConsumers()) {
      stopHistoryWatcher();
      stopBackendWatcher();
      stopEnvironmentListeners();
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
    registerHistoryVisibilityRef(consumer.id, options.historyVisibility);

    updateAutoSyncWatchers();
    startEnvironmentListeners();

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
      canCancelJob: (job) => orchestrator.isJobCancellable(job),
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
    transportPaused,
    transportPauseReasons,
    transportPauseSince,
    isInitialized,
    acquire,
  };
};

export const useGenerationOrchestratorManager = createUseGenerationOrchestratorManager();

export type UseGenerationOrchestratorManagerReturn = ReturnType<
  typeof useGenerationOrchestratorManager
>;
