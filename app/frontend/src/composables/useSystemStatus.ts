import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useAppStore } from '@/stores/app';

import type { SystemStatusState } from '@/types';
import { useSettingsStore } from '@/stores/settings';

const DEFAULT_STATUS: SystemStatusState = {
  gpu_status: 'Loading…',
  queue_length: 0,
  status: 'unknown',
  gpu_available: true,
  memory_used: 0,
  memory_total: 8192,
};

const FALLBACK_STATUS: Partial<SystemStatusState> = {
  gpu_status: 'Available',
  memory_used: 2048,
  memory_total: 8192,
  status: 'Ready',
};

const DEFAULT_POLL_INTERVAL = 10_000;

const formatMemory = (used: number, total: number) => {
  if (!used || !total) {
    return 'N/A';
  }

  const usedGb = (used / 1024).toFixed(1);
  const totalGb = (total / 1024).toFixed(1);
  const percentage = ((used / total) * 100).toFixed(0);

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

  const appStore = useAppStore();
  const settingsStore = useSettingsStore();
  const { systemStatus } = storeToRefs(appStore);
  const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore);

  const apiAvailable = ref(true);
  const isReady = ref(false);
  const lastUpdate = ref<Date | null>(null);

  const queueLength = computed(() => systemStatus.value.queue_length ?? 0);
  const queueJobsLabel = computed(() => `${queueLength.value} jobs`);
  const gpuStatusLabel = computed(() => systemStatus.value.gpu_status || 'Unknown');
  const gpuStatusClass = computed(() => getGpuStatusClass(systemStatus.value.gpu_status));
  const memoryUsage = computed(() => formatMemory(systemStatus.value.memory_used, systemStatus.value.memory_total));
  const hasMemoryData = computed(() => Boolean(systemStatus.value.memory_used && systemStatus.value.memory_total));
  const memoryPercent = computed(() => {
    if (!systemStatus.value.memory_used || !systemStatus.value.memory_total) {
      return 0;
    }

    return Math.min(100, Math.round((systemStatus.value.memory_used / systemStatus.value.memory_total) * 100));
  });
  const statusIcon = computed(() => getStatusIcon(systemStatus.value.status));
  const statusLabel = computed(() => systemStatus.value.status || 'Unknown');
  const lastUpdatedLabel = computed(() => formatLastUpdateLabel(lastUpdate.value));

  let pollHandle: ReturnType<typeof setInterval> | null = null;

  const applyStatus = (next: Partial<SystemStatusState> = {}) => {
    appStore.updateSystemStatus(next);
  };

  const applyFallback = () => {
    applyStatus(FALLBACK_STATUS);
  };

  const stopPolling = () => {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  };

  const statusUrl = computed(() => {
    const base = configuredBackendUrl.value || '/api/v1';
    return `${base}/system/status`;
  });

  const fetchStatus = async () => {
    try {
      const response = await fetch(statusUrl.value, { credentials: 'same-origin' });
      if (response.ok) {
        const payload = (await response.json()) as Partial<SystemStatusState>;
        applyStatus({ ...DEFAULT_STATUS, ...payload });
        lastUpdate.value = new Date();
        apiAvailable.value = true;
      } else if (response.status === 404) {
        apiAvailable.value = false;
        applyFallback();
        lastUpdate.value = new Date();
        stopPolling();
      } else {
        apiAvailable.value = true;
        applyStatus({ status: 'error', gpu_status: 'Unknown' });
      }
    } catch (error) {
      apiAvailable.value = true;
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

  const startPolling = () => {
    stopPolling();

    if (!apiAvailable.value) {
      return;
    }

    pollHandle = setInterval(() => {
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
