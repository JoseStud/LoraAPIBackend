import { effectScope, watch, type ComputedRef, type EffectScope, type Ref, type WatchStopHandle } from 'vue';

import type { GenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';

export interface OrchestratorEffectsOptions {
  historyLimit: ComputedRef<number>;
  backendUrl: ComputedRef<string>;
  isInitialized: Ref<boolean>;
  ensureOrchestrator: () => GenerationOrchestratorStore;
  onHistoryLimitChange?: (next: number, previous: number | undefined) => void;
  onBackendUrlChange?: (next: string, previous: string | undefined) => void;
}

export interface OrchestratorEffectsApi {
  updateAutoSyncWatchers: (state: { history: boolean; backend: boolean }) => void;
  stopAllWatchers: () => void;
}

export const useOrchestratorEffects = (
  options: OrchestratorEffectsOptions,
): OrchestratorEffectsApi => {
  let lifecycleScope: EffectScope | null = null;
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

  const startHistoryWatcher = (): void => {
    if (historyWatcherStop) {
      return;
    }

    const scope = ensureLifecycleScope();
    historyWatcherStop =
      scope.run(
        () =>
          watch(options.historyLimit, (next, previous) => {
            if (!options.isInitialized.value || previous === next) {
              return;
            }

            const orchestrator = options.ensureOrchestrator();
            orchestrator.setHistoryLimit(next);
            void orchestrator.loadRecentResults(false);
            options.onHistoryLimitChange?.(next, previous);
          }),
      ) ?? null;
  };

  const stopHistoryWatcher = (): void => {
    historyWatcherStop?.();
    historyWatcherStop = null;
  };

  const startBackendWatcher = (): void => {
    if (backendWatcherStop) {
      return;
    }

    const scope = ensureLifecycleScope();
    backendWatcherStop =
      scope.run(
        () =>
          watch(options.backendUrl, (next, previous) => {
            if (!options.isInitialized.value || next === previous) {
              return;
            }

            const orchestrator = options.ensureOrchestrator();
            void orchestrator.handleBackendUrlChange();
            options.onBackendUrlChange?.(next, previous);
          }),
      ) ?? null;
  };

  const stopBackendWatcher = (): void => {
    backendWatcherStop?.();
    backendWatcherStop = null;
  };

  const updateAutoSyncWatchers = (state: { history: boolean; backend: boolean }): void => {
    if (state.history) {
      startHistoryWatcher();
    } else {
      stopHistoryWatcher();
    }

    if (state.backend) {
      startBackendWatcher();
    } else {
      stopBackendWatcher();
    }

    if (!historyWatcherStop && !backendWatcherStop) {
      stopLifecycleScope();
    }
  };

  const stopAllWatchers = (): void => {
    stopHistoryWatcher();
    stopBackendWatcher();
    stopLifecycleScope();
  };

  return {
    updateAutoSyncWatchers,
    stopAllWatchers,
  };
};

