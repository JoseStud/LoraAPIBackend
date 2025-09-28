import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { ApiError } from '@/composables/shared';
import { fetchSystemStatus } from '@/services/system/systemService';
import { useGenerationConnectionStore } from '@/stores/generation';
import { useBackendBase } from '@/utils/backend';

import type { SystemStatusState } from '@/types';

const DEFAULT_POLL_INTERVAL = 10_000;

const formatMemory = (used: number, total: number) => {
  if (!total) {
    return 'N/A';
  }

  const safeUsed = Number.isFinite(used) && used > 0 ? used : 0;
  const usedGb = (safeUsed / 1024).toFixed(1);
  const totalGb = (total / 1024).toFixed(1);
  const percentage = total > 0 ? ((safeUsed / total) * 100).toFixed(0) : '0';

  return `${usedGb}GB / ${totalGb}GB (${percentage}%)`;
};

const formatLastUpdateLabel = (lastUpdate: Date | null) => {
  if (!lastUpdate) {
    return 'Never';
  }

  const now = new Date();
  const diffSecs = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);

  if (diffSecs < 60) {
    return `${diffSecs}s ago`;
  }

  const diffMins = Math.floor(diffSecs / 60);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  return `${diffHours}h ago`;
};

const getStatusIcon = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'healthy':
      return '✅';
    case 'warning':
      return '⚠️';
    case 'error':
      return '❌';
    default:
      return '❓';
  }
};

const getGpuStatusClass = (gpuStatus: string) => {
  const value = gpuStatus?.toLowerCase() ?? '';

  if (value.includes('available')) {
    return 'text-green-600';
  }

  if (value.includes('busy')) {
    return 'text-yellow-600';
  }

  return 'text-red-600';
};

interface UseSystemStatusOptions {
  pollInterval?: number;
}

export const useSystemStatus = (options: UseSystemStatusOptions = {}) => {
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;

  const connectionStore = useGenerationConnectionStore();
  const { systemStatus } = storeToRefs(connectionStore);
  const backendBase = useBackendBase();

  const apiAvailable = ref<boolean>(true);
  const isReady = ref<boolean>(false);
  const lastUpdate = ref<Date | null>(null);

  const queueLength = computed<number>(() => systemStatus.value.queue_length ?? 0);
  const queueJobsLabel = computed<string>(() => `${queueLength.value} jobs`);
  const gpuStatusLabel = computed<string>(() => systemStatus.value.gpu_status || 'Unknown');
  const gpuStatusClass = computed<string>(() => getGpuStatusClass(systemStatus.value.gpu_status));
  const memoryUsage = computed<string>(() =>
    formatMemory(systemStatus.value.memory_used, systemStatus.value.memory_total),
  );
  const hasMemoryData = computed<boolean>(() =>
    Boolean(systemStatus.value.memory_used && systemStatus.value.memory_total),
  );
  const memoryPercent = computed<number>(() => {
    if (!systemStatus.value.memory_used || !systemStatus.value.memory_total) {
      return 0;
    }

    return Math.min(100, Math.round((systemStatus.value.memory_used / systemStatus.value.memory_total) * 100));
  });
  const statusIcon = computed<string>(() => getStatusIcon(systemStatus.value.status));
  const statusLabel = computed<string>(() => systemStatus.value.status || 'Unknown');
  const lastUpdatedLabel = computed<string>(() => formatLastUpdateLabel(lastUpdate.value));

  const pollHandle = ref<ReturnType<typeof setInterval> | null>(null);

  const resetStatus = (): void => {
    connectionStore.resetSystemStatus();
  };

  const applyStatus = (next: Partial<SystemStatusState> = {}): void => {
    connectionStore.updateSystemStatus(next);
  };

  const stopPolling = (): void => {
    if (pollHandle.value) {
      clearInterval(pollHandle.value);
      pollHandle.value = null;
    }
  };

  const fetchStatus = async (): Promise<void> => {
    try {
      const payload = await fetchSystemStatus(backendBase.value);
      if (payload) {
        resetStatus();
        connectionStore.applySystemStatusPayload(payload);

        const updatedAt = payload.updated_at ?? payload.last_updated ?? null;
        lastUpdate.value = updatedAt ? new Date(updatedAt) : new Date();
        apiAvailable.value = true;
        return;
      }

      apiAvailable.value = true;
      resetStatus();
      lastUpdate.value = new Date();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 404) {
        apiAvailable.value = false;
        resetStatus();
        lastUpdate.value = new Date();
        stopPolling();
        return;
      }

      apiAvailable.value = true;
      resetStatus();
      applyStatus({ status: 'error', gpu_status: 'Unknown' });

      if (import.meta.env.DEV) {
        console.error('Failed to load system status', error);
      }
    } finally {
      if (!isReady.value) {
        isReady.value = true;
      }
    }
  };

  const startPolling = (): void => {
    stopPolling();

    if (!apiAvailable.value) {
      return;
    }

    pollHandle.value = setInterval(() => {
      if (!apiAvailable.value) {
        stopPolling();
        return;
      }

      void fetchStatus();
    }, pollInterval);
  };

  const refresh = () => fetchStatus();

  onMounted(async () => {
    await refresh();
    startPolling();
  });

  onBeforeUnmount(() => {
    stopPolling();
  });

  return {
    statusState: systemStatus,
    queueLength,
    queueJobsLabel,
    gpuStatusLabel,
    gpuStatusClass,
    memoryUsage,
    hasMemoryData,
    memoryPercent,
    statusIcon,
    statusLabel,
    lastUpdatedLabel,
    apiAvailable,
    isReady,
    refresh,
    startPolling,
    stopPolling,
  };
};

export default useSystemStatus;
