import { defineStore } from 'pinia';
import { effectScope, markRaw, ref, shallowRef, type EffectScope } from 'vue';

import type { GenerationOrchestrator } from '../composables/createGenerationOrchestrator';
import type { GenerationNotificationAdapter } from '../composables/useGenerationTransport';
import type { SystemStatusController, SystemStatusControllerHandle } from './systemStatusController';

export interface GenerationOrchestratorConsumer {
  id: symbol;
  notify: GenerationNotificationAdapter['notify'];
  debug?: GenerationNotificationAdapter['debug'];
}

interface ControllerEntry {
  controller: SystemStatusController;
  consumers: number;
}

export const useGenerationOrchestratorManagerStore = defineStore('generation-orchestrator-manager', () => {
  const orchestrator = shallowRef<GenerationOrchestrator | null>(null);
  const scope = shallowRef<EffectScope | null>(null);
  const initializationPromise = shallowRef<Promise<void> | null>(null);
  const isInitialized = ref(false);
  const consumers = shallowRef(new Map<symbol, GenerationOrchestratorConsumer>());
  const controllerRegistry = shallowRef(new Map<string, ControllerEntry>());

  const ensureOrchestrator = (factory: () => GenerationOrchestrator): GenerationOrchestrator => {
    if (!orchestrator.value) {
      const orchestratorScope = effectScope(true);
      const created = orchestratorScope.run(factory);

      if (!created) {
        orchestratorScope.stop();
        throw new Error('Failed to create generation orchestrator');
      }

      scope.value = orchestratorScope;
      orchestrator.value = markRaw(created);
    }

    return orchestrator.value;
  };

  const destroyOrchestrator = (): void => {
    if (orchestrator.value) {
      orchestrator.value.cleanup();
    }

    initializationPromise.value = null;
    isInitialized.value = false;
    scope.value?.stop();
    scope.value = null;
    orchestrator.value = null;
  };

  const registerConsumer = (consumer: GenerationOrchestratorConsumer): void => {
    consumers.value.set(consumer.id, consumer);
  };

  const unregisterConsumer = (consumerId: symbol): void => {
    consumers.value.delete(consumerId);
  };

  const resetConsumers = (): void => {
    consumers.value.clear();
  };

  const ensureControllerEntry = (
    key: string,
    factory: () => SystemStatusController,
  ): ControllerEntry => {
    const existing = controllerRegistry.value.get(key);
    if (existing) {
      return existing;
    }

    const entry: ControllerEntry = {
      controller: factory(),
      consumers: 0,
    };

    controllerRegistry.value.set(key, entry);
    return entry;
  };

  const resolveController = (
    key: string,
    factory: () => SystemStatusController,
  ): SystemStatusController => ensureControllerEntry(key, factory).controller;

  const acquireController = (
    key: string,
    factory: () => SystemStatusController,
  ): SystemStatusControllerHandle => {
    const entry = ensureControllerEntry(key, factory);
    entry.consumers += 1;

    if (entry.consumers === 1) {
      entry.controller.start();
    }

    let released = false;

    const release = (): void => {
      if (released) {
        return;
      }

      released = true;
      entry.consumers = Math.max(0, entry.consumers - 1);

      if (entry.consumers === 0) {
        entry.controller.stop();
        controllerRegistry.value.delete(key);
      }
    };

    return { controller: entry.controller, release };
  };

  const resetControllers = (): void => {
    controllerRegistry.value.forEach((entry) => {
      entry.controller.stop();
    });
    controllerRegistry.value.clear();
  };

  const reset = (): void => {
    destroyOrchestrator();
    resetConsumers();
    resetControllers();
  };

  return {
    orchestrator,
    scope,
    initializationPromise,
    isInitialized,
    consumers,
    ensureOrchestrator,
    destroyOrchestrator,
    registerConsumer,
    unregisterConsumer,
    resetConsumers,
    resolveController,
    acquireController,
    resetControllers,
    reset,
  };
});

export type GenerationOrchestratorManagerStore = ReturnType<
  typeof useGenerationOrchestratorManagerStore
>;
