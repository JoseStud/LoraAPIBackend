import { storeToRefs } from 'pinia';
import type { Ref } from 'vue';

import {
  type GenerationOrchestratorAcquireOptions,
  type GenerationOrchestratorBinding,
} from './useGenerationOrchestratorManager.types';
import { useGenerationOrchestratorManagerStore } from '../stores/orchestratorManagerStore';
import { useGenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';
import { useBackendUrl } from '@/utils/backend';

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

/**
 * Thin per-call wrapper around the shared manager store. All consumers, watchers, environment
 * listeners and initialization state live in `orchestratorManagerStore`, so calling this from any
 * number of places still yields one set of effects, torn down when the last consumer releases.
 */
export const createUseGenerationOrchestratorManager = (
  dependencies: UseGenerationOrchestratorManagerDependencies = defaultDependencies,
) => () => {
  const orchestratorManagerStore = dependencies.useGenerationOrchestratorManagerStore();
  const orchestratorStore = dependencies.useGenerationOrchestratorStore();

  const { isInitialized } = storeToRefs(orchestratorManagerStore);
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

  const acquire = (options: GenerationOrchestratorAcquireOptions): GenerationOrchestratorBinding =>
    orchestratorManagerStore.acquire(options, {
      orchestratorStore,
      resolveBackendUrl: () => dependencies.useBackendUrl('/') as Readonly<Ref<string>>,
    });

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

export { HISTORY_LIMIT_WHEN_SHOWING } from '../stores/orchestratorManagerStore';
export type { GenerationOrchestratorAcquireOptions, GenerationOrchestratorAutoSyncOptions, GenerationOrchestratorBinding } from './useGenerationOrchestratorManager.types';
