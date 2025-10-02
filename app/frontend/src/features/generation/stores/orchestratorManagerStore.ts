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
  const readOnlyConsumers = shallowRef(new Set<symbol>());

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
    readOnlyConsumers.value.clear();
  };

  const registerConsumer = (consumer: GenerationOrchestratorConsumer): void => {
    consumers.value.set(consumer.id, consumer);
  };

  const unregisterConsumer = (consumerId: symbol): void => {
    consumers.value.delete(consumerId);
  };

  const registerReadOnlyConsumer = (consumerId: symbol): void => {
    readOnlyConsumers.value.add(consumerId);
  };

  const unregisterReadOnlyConsumer = (consumerId: symbol): void => {
    readOnlyConsumers.value.delete(consumerId);
  };

  const hasActiveConsumers = (): boolean =>
    consumers.value.size > 0 || readOnlyConsumers.value.size > 0;

  return {
    orchestrator,
    initializationPromise,
    isInitialized,
    consumers,
    readOnlyConsumers,
    ensureOrchestrator,
    destroyOrchestrator,
    registerConsumer,
    unregisterConsumer,
    registerReadOnlyConsumer,
    unregisterReadOnlyConsumer,
    hasActiveConsumers,
  };
});

export type GenerationOrchestratorManagerStore = ReturnType<
  typeof useGenerationOrchestratorManagerStore
>;
