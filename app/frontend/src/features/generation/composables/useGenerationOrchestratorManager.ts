import { storeToRefs } from 'pinia';
import { type ComputedRef } from 'vue';

import type { GenerationRequestPayload } from '@/types';

import { useOrchestratorConsumers } from './useOrchestratorConsumers';
import { useOrchestratorEffects } from './useOrchestratorEffects';
import { useOrchestratorLifecycle } from './useOrchestratorLifecycle';
import { useOrchestratorCommands } from './useOrchestratorCommands';
import {
  type GenerationOrchestratorAcquireOptions,
  type GenerationOrchestratorAutoSyncOptions,
  type GenerationOrchestratorBinding,
} from './useGenerationOrchestratorManager.types';
import { useGenerationOrchestratorManagerStore } from '../stores/orchestratorManagerStore';
import { useGenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';
import { useBackendUrl } from '@/utils/backend';
import type { GenerationRequestPayload } from '@/types';

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

export const createUseGenerationOrchestratorManager = (
  dependencies: UseGenerationOrchestratorManagerDependencies = defaultDependencies,
) => () => {
  const orchestratorManagerStore = dependencies.useGenerationOrchestratorManagerStore();
  const orchestratorStore = dependencies.useGenerationOrchestratorStore();
  const backendUrl = dependencies.useBackendUrl('/') as ComputedRef<string>;

  const { isInitialized } = storeToRefs(orchestratorManagerStore);

  const ensureOrchestrator = () =>
    orchestratorManagerStore.ensureOrchestrator(() => orchestratorStore);

  const consumersApi = useOrchestratorConsumers({ managerStore: orchestratorManagerStore });

  const notifyAll: GenerationOrchestratorAcquireOptions['notify'] = (
    message,
    type: Parameters<GenerationOrchestratorAcquireOptions['notify']>[1] = 'info',
  ) => {
    consumersApi.consumers.value.forEach((consumer) => {
      consumer.notify(message, type);
    });
  };

  const debugAll: NonNullable<GenerationOrchestratorAcquireOptions['debug']> = (
    ...args: unknown[]
  ) => {
    consumersApi.consumers.value.forEach((consumer) => {
      consumer.debug?.(...args);
    });
  };

  const lifecycle = useOrchestratorLifecycle({
    managerStore: orchestratorManagerStore,
    historyLimit: consumersApi.historyLimit,
    getBackendUrl: () => backendUrl.value || null,
    ensureOrchestrator,
    notifyAll,
    debugAll,
  });

  const commands = useOrchestratorCommands({ getOrchestrator: ensureOrchestrator });
  const effects = useOrchestratorEffects({
    historyLimit: consumersApi.historyLimit,
    backendUrl,
    isInitialized,
    ensureOrchestrator,
  });

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

  const updateAutoSyncWatchers = (): void => {
    effects.updateAutoSyncWatchers({
      history: consumersApi.hasHistoryAutoSync(),
      backend: consumersApi.hasBackendAutoSync(),
    });
  };

  const releaseConsumer = (releaseFn: () => void): void => {
    releaseFn();

    if (!orchestratorManagerStore.hasActiveConsumers()) {
      effects.stopAllWatchers();
      lifecycle.destroy();
      return;
    }

    updateAutoSyncWatchers();
  };

  const acquire = (options: GenerationOrchestratorAcquireOptions): GenerationOrchestratorBinding => {
    const autoSync = normalizeAutoSyncOptions(options.autoSync);

    const consumer = consumersApi.acquireConsumer({
      notify: options.notify,
      debug: options.debug,
      historyVisibility: options.historyVisibility,
      autoSync,
    });

    updateAutoSyncWatchers();
    lifecycle.startEnvironmentListeners();

    const initialize = async (): Promise<void> => {
      await lifecycle.ensureInitialized({
        queueClient: options.queueClient,
        websocketManager: options.websocketManager,
      });
    };

    const release = (): void => {
      releaseConsumer(consumer.release);
    };

    const binding: GenerationOrchestratorBinding = {
      activeJobs,
      sortedActiveJobs,
      recentResults,
      systemStatus,
      isConnected,
      initialize,
      cleanup: release,
      loadSystemStatusData: () => commands.loadSystemStatusData(),
      loadActiveJobsData: () => commands.loadActiveJobsData(),
      loadRecentResultsData: (notifySuccess?: boolean) => commands.loadRecentResultsData(notifySuccess),
      startGeneration: (payload: GenerationRequestPayload) => commands.startGeneration(payload),
      cancelJob: (jobId: string) => commands.cancelJob(jobId),
      clearQueue: () => commands.clearQueue(),
      deleteResult: (resultId: string | number) => commands.deleteResult(resultId),
      refreshResults: (notifySuccess?: boolean) => commands.refreshResults(notifySuccess),
      setHistoryLimit: (limit: number) => {
        commands.setHistoryLimit(limit);
      },
      handleBackendUrlChange: () => commands.handleBackendUrlChange(),
      canCancelJob: (job) => commands.canCancelJob(job),
      release,
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

export type { GenerationOrchestratorAcquireOptions, GenerationOrchestratorAutoSyncOptions, GenerationOrchestratorBinding } from './useGenerationOrchestratorManager.types';

