/** @internal */
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type { GenerationNotificationAdapter } from '../composables/useGenerationTransport';
import type { GenerationOrchestratorStore } from './useGenerationOrchestratorStore';

export interface GenerationOrchestratorConsumer {
  id: symbol;
  notify: GenerationNotificationAdapter['notify'];
  debug?: GenerationNotificationAdapter['debug'];
  autoSyncHistory: boolean;
  autoSyncBackend: boolean;
}

export const useGenerationOrchestratorManagerStore = defineStore('generation-orchestrator-manager', () => {
  const orchestrator = shallowRef<GenerationOrchestratorStore | null>(null);
  const initializationPromise = shallowRef<Promise<void> | null>(null);
  const isInitialized = ref(false);
  const consumers = shallowRef(new Map<symbol, GenerationOrchestratorConsumer>());

  const ensureOrchestrator = (factory: () => GenerationOrchestratorStore): GenerationOrchestratorStore => {
    if (!orchestrator.value) {
      orchestrator.value = factory();
    }

    return orchestrator.value;
  };

  const destroyOrchestrator = (): void => {
    if (orchestrator.value) {
      orchestrator.value.destroy();
    }

    initializationPromise.value = null;
    isInitialized.value = false;
    orchestrator.value = null;
  };

  const registerConsumer = (consumer: GenerationOrchestratorConsumer): void => {
    consumers.value.set(consumer.id, consumer);
  };

  const unregisterConsumer = (consumerId: symbol): void => {
    consumers.value.delete(consumerId);
  };

  return {
    orchestrator,
    initializationPromise,
    isInitialized,
    consumers,
    ensureOrchestrator,
    destroyOrchestrator,
    registerConsumer,
    unregisterConsumer,
  };
});

export type GenerationOrchestratorManagerStore = ReturnType<
  typeof useGenerationOrchestratorManagerStore
>;
