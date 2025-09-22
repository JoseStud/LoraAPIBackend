import { onUnmounted, watch, type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import type { GenerationQueueClient, GenerationWebSocketManager } from '@/services/generationUpdates';
import { useGenerationStore } from '@/stores/generation';
import type { GenerationJob, GenerationResult } from '@/types';
import type { GenerationNotificationAdapter } from '@/stores/generation';

interface UseGenerationUpdatesOptions {
  showHistory: Ref<boolean>;
  configuredBackendUrl: Ref<string | null | undefined>;
  notificationAdapter: GenerationNotificationAdapter;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
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
  notificationAdapter,
  queueClient: injectedQueueClient,
  websocketManager: injectedWebsocketManager,
}: UseGenerationUpdatesOptions): UseGenerationUpdatesReturn => {
  const generationStore = useGenerationStore();
  const { activeJobs, recentResults, sortedActiveJobs, isConnected } = storeToRefs(generationStore);

  generationStore.configureGenerationServices({
    getBackendUrl: () => configuredBackendUrl.value,
    queueClient: injectedQueueClient,
    websocketManager: injectedWebsocketManager,
    notificationAdapter,
    historyLimit: showHistory.value ? 50 : 10,
  });

  const loadSystemStatusData = (): Promise<void> => generationStore.refreshSystemStatus();
  const loadActiveJobsData = (): Promise<void> => generationStore.refreshActiveJobs();
  const loadRecentResultsData = (): Promise<void> => generationStore.refreshRecentResults();

  const initialize = async (): Promise<void> => {
    await generationStore.initializeUpdates();
  };

  const cleanup = (): void => {
    generationStore.stopUpdates();
  };

  watch(showHistory, () => {
    const nextLimit = showHistory.value ? 50 : 10;
    generationStore.setHistoryLimit(nextLimit);
    void loadRecentResultsData();
  });

  watch(configuredBackendUrl, (next, previous) => {
    if (next === previous) {
      return;
    }

    generationStore.reconnectUpdates();
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
