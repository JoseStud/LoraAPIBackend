import { onUnmounted, watch, type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import { createGenerationUpdatesService, type GenerationUpdatesService } from '@/services/generationUpdates';
import { useGenerationStore } from '@/stores/generation';
import type { GenerationJob, GenerationResult, NotificationType } from '@/types';

interface UseGenerationUpdatesOptions {
  showHistory: Ref<boolean>;
  configuredBackendUrl: Ref<string | null | undefined>;
  logDebug: (...args: unknown[]) => void;
  showToast: (message: string, type?: NotificationType) => void;
  service?: GenerationUpdatesService;
}

export interface UseGenerationUpdatesReturn {
  activeJobs: Ref<GenerationJob[]>;
  recentResults: Ref<GenerationResult[]>;
  sortedActiveJobs: ComputedRef<GenerationJob[]>;
  isConnected: Ref<boolean>;
  initialize: () => Promise<void>;
  cleanup: () => void;
  loadSystemStatusData: () => Promise<void>;
  loadActiveJobsData: () => Promise<void>;
  loadRecentResultsData: () => Promise<void>;
}

export const useGenerationUpdates = ({
  showHistory,
  configuredBackendUrl,
  logDebug,
  showToast,
  service: injectedService,
}: UseGenerationUpdatesOptions): UseGenerationUpdatesReturn => {
  const generationStore = useGenerationStore();
  const { activeJobs, recentResults, sortedActiveJobs, isConnected } = storeToRefs(generationStore);

  const service =
    injectedService
    ?? createGenerationUpdatesService({
      store: generationStore,
      getBackendUrl: () => configuredBackendUrl.value,
      getHistoryLimit: () => (showHistory.value ? 50 : 10),
      logger: logDebug,
      onGenerationComplete: () => {
        showToast('Generation completed successfully', 'success');
      },
      onGenerationError: (message) => {
        showToast(`Generation failed: ${message}`, 'error');
      },
    });

  const loadSystemStatusData = (): Promise<void> => service.refreshSystemStatus();
  const loadActiveJobsData = (): Promise<void> => service.refreshActiveJobs();
  const loadRecentResultsData = (): Promise<void> => service.refreshRecentResults();

  const initialize = async (): Promise<void> => {
    await service.start();
  };

  const cleanup = (): void => {
    service.stop();
  };

  watch(showHistory, () => {
    void loadRecentResultsData();
  });

  watch(configuredBackendUrl, (next, previous) => {
    if (next === previous) {
      return;
    }

    service.reconnect();
    void Promise.all([
      loadSystemStatusData(),
      loadActiveJobsData(),
      loadRecentResultsData(),
    ]);
  });

  onUnmounted(() => {
    cleanup();
  });

  return {
    activeJobs,
    recentResults,
    sortedActiveJobs,
    isConnected,
    initialize,
    cleanup,
    loadSystemStatusData,
    loadActiveJobsData,
    loadRecentResultsData,
  };
};

export type UseGenerationUpdates = ReturnType<typeof useGenerationUpdates>;
