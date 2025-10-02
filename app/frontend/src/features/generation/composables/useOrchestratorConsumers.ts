import { storeToRefs } from 'pinia';
import { computed, shallowRef, type ComputedRef, type Ref } from 'vue';

import type {
  GenerationOrchestratorAcquireOptions,
  GenerationOrchestratorAutoSyncOptions,
} from './useGenerationOrchestratorManager.types';
import type {
  GenerationOrchestratorConsumer,
  GenerationOrchestratorManagerStore,
} from '../stores/orchestratorManagerStore';
import { DEFAULT_HISTORY_LIMIT } from '../stores/useGenerationOrchestratorStore';

export interface OrchestratorConsumersOptions {
  managerStore: GenerationOrchestratorManagerStore;
}

export interface AcquireConsumerOptions
  extends Pick<GenerationOrchestratorAcquireOptions, 'notify' | 'debug' | 'historyVisibility'> {
  autoSync: Required<GenerationOrchestratorAutoSyncOptions>;
}

export interface OrchestratorConsumersApi {
  consumers: Ref<Map<symbol, GenerationOrchestratorConsumer>>;
  historyLimit: ComputedRef<number>;
  acquireConsumer: (options: AcquireConsumerOptions) => { id: symbol; release: () => void };
  hasHistoryAutoSync: () => boolean;
  hasBackendAutoSync: () => boolean;
}

const HISTORY_LIMIT_WHEN_SHOWING = 50;

export const useOrchestratorConsumers = (
  options: OrchestratorConsumersOptions,
): OrchestratorConsumersApi => {
  const { consumers } = storeToRefs(options.managerStore);
  const historyVisibilityRefs = shallowRef(
    new Map<symbol, Readonly<Ref<boolean>> | undefined>(),
  );

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

  const historyLimit = computed<number>(() => {
    for (const visibility of historyVisibilityRefs.value.values()) {
      if (visibility?.value) {
        return HISTORY_LIMIT_WHEN_SHOWING;
      }
    }

    return DEFAULT_HISTORY_LIMIT;
  });

  const acquireConsumer = (
    acquireOptions: AcquireConsumerOptions,
  ): { id: symbol; release: () => void } => {
    const consumer: GenerationOrchestratorConsumer = {
      id: Symbol('generation-orchestrator-consumer'),
      notify: acquireOptions.notify,
      debug: acquireOptions.debug,
      autoSyncHistory: acquireOptions.autoSync.historyLimit,
      autoSyncBackend: acquireOptions.autoSync.backendUrl,
    };

    options.managerStore.registerConsumer(consumer);
    registerHistoryVisibilityRef(consumer.id, acquireOptions.historyVisibility);

    const release = (): void => {
      options.managerStore.unregisterConsumer(consumer.id);
      unregisterHistoryVisibilityRef(consumer.id);
    };

    return { id: consumer.id, release };
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

  return {
    consumers,
    historyLimit,
    acquireConsumer,
    hasHistoryAutoSync,
    hasBackendAutoSync,
  };
};

export { HISTORY_LIMIT_WHEN_SHOWING };

