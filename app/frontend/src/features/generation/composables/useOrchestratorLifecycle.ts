import { storeToRefs } from 'pinia';
import type { ComputedRef } from 'vue';

import type { GenerationOrchestratorAcquireOptions } from './useGenerationOrchestratorManager.types';
import type { GenerationNotificationAdapter } from './useGenerationTransport';
import type { GenerationOrchestratorManagerStore } from '../stores/orchestratorManagerStore';
import type { GenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';
import type {
  GenerationTransportPausePayload,
  GenerationTransportResumePayload,
  GenerationTransportPauseReason,
} from '../types/transport';

export interface OrchestratorLifecycleOptions {
  managerStore: GenerationOrchestratorManagerStore;
  historyLimit: ComputedRef<number>;
  getBackendUrl: () => string | null;
  ensureOrchestrator: () => GenerationOrchestratorStore;
  notifyAll: GenerationNotificationAdapter['notify'];
  debugAll: GenerationNotificationAdapter['debug'];
}

export interface OrchestratorLifecycleApi {
  ensureInitialized: (
    options: Pick<GenerationOrchestratorAcquireOptions, 'queueClient' | 'websocketManager'>,
  ) => Promise<void>;
  startEnvironmentListeners: () => void;
  stopEnvironmentListeners: () => void;
  destroy: () => void;
  applyEnvironmentStateForTests?: () => void;
}

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

export const useOrchestratorLifecycle = (
  options: OrchestratorLifecycleOptions,
): OrchestratorLifecycleApi => {
  const { orchestrator, initializationPromise, isInitialized } = storeToRefs(options.managerStore);
  let environmentCleanup: (() => void) | null = null;
  let lastEnvironmentKey = '';
  let lastPauseActive = false;

  const applyEnvironmentPauseState = (
    source: string,
    applyOptions: { force?: boolean } = {},
  ): void => {
    if (typeof window === 'undefined') {
      return;
    }

    const state = getEnvironmentState();
    const key = `${state.reasons.join('|')}|hidden:${state.hidden}|online:${state.online}`;
    const previousKey = lastEnvironmentKey;
    const wasPaused = lastPauseActive;

    if (!applyOptions.force && key === previousKey) {
      return;
    }

    lastEnvironmentKey = key;
    lastPauseActive = state.reasons.length > 0;

    if (!isInitialized.value) {
      return;
    }

    const orchestratorInstance = orchestrator.value;
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

  const ensureInitialized = async (
    initializeOptions: Pick<GenerationOrchestratorAcquireOptions, 'queueClient' | 'websocketManager'>,
  ): Promise<void> => {
    if (isInitialized.value) {
      return;
    }

    if (!initializationPromise.value) {
      const orchestratorInstance = options.ensureOrchestrator();

      const promise = orchestratorInstance
        .initialize({
          historyLimit: options.historyLimit.value,
          getBackendUrl: options.getBackendUrl,
          notificationAdapter: {
            notify: options.notifyAll,
            debug: options.debugAll,
          },
          queueClient: initializeOptions.queueClient,
          websocketManager: initializeOptions.websocketManager,
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

  const destroy = (): void => {
    stopEnvironmentListeners();
    options.managerStore.destroyOrchestrator();
  };

  return {
    ensureInitialized,
    startEnvironmentListeners,
    stopEnvironmentListeners,
    destroy,
    applyEnvironmentStateForTests: () => {
      applyEnvironmentPauseState('test', { force: true });
    },
  };
};

