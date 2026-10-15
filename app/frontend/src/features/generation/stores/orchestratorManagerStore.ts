/**
 * @internal
 *
 * Single owner of the generation orchestrator's shared lifecycle.
 *
 * Every `useGenerationOrchestratorManager()` call site delegates to this store, so there is exactly
 * one consumer registry, one history-limit computation, one pair of auto-sync watchers and one set
 * of `visibilitychange`/`online`/`offline` listeners, however many call sites acquire bindings.
 *
 * Effects never start on import: they are created in an "activation" effect scope on the first
 * `acquire()` and stopped when the last consumer releases (from any call site), when
 * `destroyOrchestrator()` runs, or when Pinia disposes the store (the activation scope is a child of
 * the store's own scope).
 */
import { defineStore, storeToRefs } from 'pinia';
import {
  computed,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type EffectScope,
  type Ref,
} from 'vue';

import type { GenerationRequestPayload, GenerationStartResponse } from '@/types';

import type { GenerationNotificationAdapter } from '../composables/useGenerationTransport';
import type {
  GenerationOrchestratorAcquireOptions,
  GenerationOrchestratorAutoSyncOptions,
  GenerationOrchestratorBinding,
} from '../composables/useGenerationOrchestratorManager.types';
import type { GenerationJobView } from '../orchestrator/facade';
import type {
  GenerationTransportPausePayload,
  GenerationTransportPauseReason,
  GenerationTransportResumePayload,
} from '../types/transport';
import { DEFAULT_HISTORY_LIMIT, type GenerationOrchestratorStore } from './useGenerationOrchestratorStore';

export const HISTORY_LIMIT_WHEN_SHOWING = 50;

export interface GenerationOrchestratorConsumer {
  id: symbol;
  notify: GenerationNotificationAdapter['notify'];
  debug?: GenerationNotificationAdapter['debug'];
  autoSyncHistory: boolean;
  autoSyncBackend: boolean;
}

/** What a call site hands the store when it acquires a binding. */
export interface GenerationOrchestratorAcquireContext {
  /** The orchestrator store the call site resolved; used if no orchestrator exists yet. */
  orchestratorStore: GenerationOrchestratorStore;
  /** Resolves the backend URL ref. Called once per activation, inside the store's scope. */
  resolveBackendUrl: () => Readonly<Ref<string>>;
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

const normalizeCommandError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string' && error.trim()) {
    return new Error(error);
  }

  return new Error('Generation orchestrator command failed');
};

const wrapCommand = <Args extends unknown[], Result>(
  handler: (...args: Args) => Promise<Result> | Result,
): ((...args: Args) => Promise<Result>) => {
  return async (...args: Args): Promise<Result> => {
    try {
      return await Promise.resolve(handler(...args));
    } catch (error) {
      throw normalizeCommandError(error);
    }
  };
};

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

export const useGenerationOrchestratorManagerStore = defineStore('generation-orchestrator-manager', () => {
  const storeScope = getCurrentScope();

  const orchestrator = shallowRef<GenerationOrchestratorStore | null>(null);
  const initializationPromise = shallowRef<Promise<void> | null>(null);
  const isInitialized = ref(false);
  const consumers = shallowRef(new Map<symbol, GenerationOrchestratorConsumer>());
  const readOnlyConsumers = shallowRef(new Set<symbol>());
  const historyVisibilityRefs = shallowRef(new Map<symbol, Readonly<Ref<boolean>>>());

  const historyLimit = computed<number>(() => {
    for (const visibility of historyVisibilityRefs.value.values()) {
      if (visibility.value) {
        return HISTORY_LIMIT_WHEN_SHOWING;
      }
    }

    return DEFAULT_HISTORY_LIMIT;
  });

  // Per-activation state. Not exposed: only `acquire()` and the teardown paths touch it.
  let activationScope: EffectScope | null = null;
  let activeBackendUrl: Readonly<Ref<string>> | null = null;
  let activeOrchestratorStore: GenerationOrchestratorStore | null = null;
  let lastEnvironmentKey = '';
  let lastPauseActive = false;
  // Bumped by every teardown, so work from an attempt that started before it is recognised as stale.
  let lifecycleEpoch = 0;

  const ensureOrchestrator = (factory: () => GenerationOrchestratorStore): GenerationOrchestratorStore => {
    if (!orchestrator.value) {
      orchestrator.value = factory();
    }

    return orchestrator.value;
  };

  const hasActiveConsumers = (): boolean =>
    consumers.value.size > 0 || readOnlyConsumers.value.size > 0;

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

  const notifyAll: GenerationNotificationAdapter['notify'] = (message, type = 'info') => {
    consumers.value.forEach((consumer) => {
      consumer.notify(message, type);
    });
  };

  const debugAll: NonNullable<GenerationNotificationAdapter['debug']> = (...args: unknown[]) => {
    consumers.value.forEach((consumer) => {
      consumer.debug?.(...args);
    });
  };

  const registerConsumer = (consumer: GenerationOrchestratorConsumer): void => {
    consumers.value.set(consumer.id, consumer);
  };

  const unregisterConsumer = (consumerId: symbol): void => {
    consumers.value.delete(consumerId);

    if (historyVisibilityRefs.value.has(consumerId)) {
      const next = new Map(historyVisibilityRefs.value);
      next.delete(consumerId);
      historyVisibilityRefs.value = next;
    }
  };

  const registerReadOnlyConsumer = (consumerId: symbol): void => {
    readOnlyConsumers.value.add(consumerId);
  };

  const unregisterReadOnlyConsumer = (consumerId: symbol): void => {
    readOnlyConsumers.value.delete(consumerId);
  };

  const applyEnvironmentPauseState = (
    source: string,
    applyOptions: { force?: boolean } = {},
  ): void => {
    if (typeof window === 'undefined') {
      return;
    }

    const state = getEnvironmentState();
    const key = `${state.reasons.join('|')}|hidden:${state.hidden}|online:${state.online}`;
    const wasPaused = lastPauseActive;

    if (!applyOptions.force && key === lastEnvironmentKey) {
      return;
    }

    lastEnvironmentKey = key;
    lastPauseActive = state.reasons.length > 0;

    const orchestratorInstance = orchestrator.value;
    if (!isInitialized.value || !orchestratorInstance) {
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

    if (!applyOptions.force && !wasPaused) {
      return;
    }

    const resumePayload: GenerationTransportResumePayload = {
      hidden: state.hidden,
      online: state.online,
      source,
      timestamp,
    };

    void orchestratorInstance.resumeTransport(resumePayload).catch((error) => {
      console.error('Failed to resume generation transport after environment change:', error);
    });
    logLifecycleEvent('resume', resumePayload);
  };

  /** Runs inside the activation scope; the listeners are removed when that scope stops. */
  const startEnvironmentListeners = (): void => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
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

    onScopeDispose(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      lastEnvironmentKey = '';
      lastPauseActive = false;
    });

    applyEnvironmentPauseState('environment:init', { force: true });
  };

  const getActiveOrchestrator = (): GenerationOrchestratorStore | null => {
    const fallback = activeOrchestratorStore;
    if (orchestrator.value || !fallback) {
      return orchestrator.value;
    }

    return ensureOrchestrator(() => fallback);
  };

  /** Runs inside the activation scope; the watchers stop when that scope stops. */
  const startAutoSyncWatchers = (backendUrl: Readonly<Ref<string>>): void => {
    watch(historyLimit, (next, previous) => {
      if (!isInitialized.value || next === previous || !hasHistoryAutoSync()) {
        return;
      }

      const orchestratorInstance = getActiveOrchestrator();
      if (!orchestratorInstance) {
        return;
      }

      orchestratorInstance.setHistoryLimit(next);
      void orchestratorInstance.loadRecentResults(false);
    });

    watch(backendUrl, (next, previous) => {
      if (!isInitialized.value || next === previous || !hasBackendAutoSync()) {
        return;
      }

      void getActiveOrchestrator()?.handleBackendUrlChange();
    });
  };

  const activate = (context: GenerationOrchestratorAcquireContext): void => {
    if (activationScope) {
      return;
    }

    // A child of the store's scope, so `$dispose()` also stops it. A fresh scope per activation,
    // because a stopped scope cannot be reused.
    const scope = storeScope?.run(() => effectScope()) ?? effectScope(true);
    activationScope = scope;
    activeOrchestratorStore = context.orchestratorStore;

    scope.run(() => {
      const backendUrl = context.resolveBackendUrl();
      activeBackendUrl = backendUrl;

      onScopeDispose(() => {
        activationScope = null;
        activeBackendUrl = null;
        activeOrchestratorStore = null;
      });

      startAutoSyncWatchers(backendUrl);
      startEnvironmentListeners();
    });
  };

  const stopEffects = (): void => {
    activationScope?.stop();
    activationScope = null;
  };

  const destroyOrchestrator = (): void => {
    lifecycleEpoch += 1;
    stopEffects();

    if (orchestrator.value) {
      orchestrator.value.destroy();
    }

    initializationPromise.value = null;
    isInitialized.value = false;
    orchestrator.value = null;
    readOnlyConsumers.value.clear();
  };

  const ensureInitialized = async (
    initializeOptions: Pick<GenerationOrchestratorAcquireOptions, 'queueClient' | 'websocketManager'>,
    orchestratorStore: GenerationOrchestratorStore,
  ): Promise<void> => {
    if (isInitialized.value) {
      return;
    }

    const epoch = lifecycleEpoch;

    if (!initializationPromise.value) {
      const orchestratorInstance = ensureOrchestrator(() => orchestratorStore);

      const promise: Promise<void> = orchestratorInstance
        .initialize({
          historyLimit: historyLimit.value,
          getBackendUrl: () => activeBackendUrl?.value || null,
          notificationAdapter: {
            notify: notifyAll,
            debug: debugAll,
          },
          queueClient: initializeOptions.queueClient,
          websocketManager: initializeOptions.websocketManager,
        })
        // Only the current attempt may change shared state. If the orchestrator was destroyed (or
        // another attempt replaced this one) while initialize() was pending, the caller still sees
        // this attempt settle, but a fresh orchestrator must not be marked initialized by it.
        .then(() => {
          if (initializationPromise.value === promise) {
            isInitialized.value = true;
          }
        })
        .catch((error: unknown) => {
          if (initializationPromise.value === promise) {
            isInitialized.value = false;
          }
          throw error;
        })
        .finally(() => {
          if (initializationPromise.value === promise) {
            initializationPromise.value = null;
          }
        });

      initializationPromise.value = promise;
    }

    await initializationPromise.value;

    if (epoch === lifecycleEpoch) {
      applyEnvironmentPauseState('environment:sync', { force: true });
    }
  };

  const acquire = (
    options: GenerationOrchestratorAcquireOptions,
    context: GenerationOrchestratorAcquireContext,
  ): GenerationOrchestratorBinding => {
    const autoSync = normalizeAutoSyncOptions(options.autoSync);
    const consumer: GenerationOrchestratorConsumer = {
      id: Symbol('generation-orchestrator-consumer'),
      notify: options.notify,
      debug: options.debug,
      autoSyncHistory: autoSync.historyLimit,
      autoSyncBackend: autoSync.backendUrl,
    };

    registerConsumer(consumer);

    if (options.historyVisibility) {
      const next = new Map(historyVisibilityRefs.value);
      next.set(consumer.id, options.historyVisibility);
      historyVisibilityRefs.value = next;
    }

    activate(context);

    const getOrchestrator = (): GenerationOrchestratorStore =>
      ensureOrchestrator(() => context.orchestratorStore);

    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;

      unregisterConsumer(consumer.id);

      if (!hasActiveConsumers()) {
        destroyOrchestrator();
      }
    };

    const { activeJobs, sortedActiveJobs, recentResults, systemStatus, isConnected } = storeToRefs(
      context.orchestratorStore,
    );

    return {
      activeJobs,
      sortedActiveJobs,
      recentResults,
      systemStatus,
      isConnected,
      initialize: () =>
        ensureInitialized(
          { queueClient: options.queueClient, websocketManager: options.websocketManager },
          context.orchestratorStore,
        ),
      cleanup: release,
      loadSystemStatusData: () => getOrchestrator().loadSystemStatusData(),
      loadActiveJobsData: () => getOrchestrator().loadActiveJobsData(),
      loadRecentResultsData: (notifySuccess = false) =>
        getOrchestrator().loadRecentResults(notifySuccess),
      startGeneration: (payload: GenerationRequestPayload): Promise<GenerationStartResponse> =>
        getOrchestrator().startGeneration(payload),
      cancelJob: wrapCommand((jobId: string) => getOrchestrator().cancelJob(jobId)),
      clearQueue: wrapCommand(() => getOrchestrator().clearQueue()),
      deleteResult: wrapCommand((resultId: string | number) =>
        getOrchestrator().deleteResult(resultId),
      ),
      refreshResults: wrapCommand((notifySuccess: boolean | undefined = false) =>
        getOrchestrator().loadRecentResults(notifySuccess),
      ),
      setHistoryLimit: (limit: number) => {
        getOrchestrator().setHistoryLimit(limit);
      },
      handleBackendUrlChange: () => getOrchestrator().handleBackendUrlChange(),
      canCancelJob: (job: GenerationJobView) => getOrchestrator().isJobCancellable(job),
      release,
    };
  };

  return {
    orchestrator,
    initializationPromise,
    isInitialized,
    consumers,
    readOnlyConsumers,
    historyLimit,
    acquire,
    ensureOrchestrator,
    destroyOrchestrator,
    registerReadOnlyConsumer,
    unregisterReadOnlyConsumer,
    hasActiveConsumers,
  };
});

export type GenerationOrchestratorManagerStore = ReturnType<
  typeof useGenerationOrchestratorManagerStore
>;
