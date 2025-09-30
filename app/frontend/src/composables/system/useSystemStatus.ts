import { computed, onScopeDispose } from 'vue';
import { storeToRefs } from 'pinia';

import {
  acquireSystemStatusController,
  useGenerationConnectionStore,
} from '@/stores/generation';

const formatMemory = (used: number | null | undefined, total: number | null | undefined) => {
  if (!total) {
    return 'N/A';
  }

  const numericUsed = typeof used === 'number' ? used : 0;
  const safeUsed = Number.isFinite(numericUsed) && numericUsed > 0 ? numericUsed : 0;
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

const getStatusIcon = (status: string | null | undefined) => {
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

const getGpuStatusClass = (gpuStatus: string | null | undefined) => {
  const value = gpuStatus?.toLowerCase() ?? '';

  if (value.includes('available')) {
    return 'text-green-600';
  }

  if (value.includes('busy')) {
    return 'text-yellow-600';
  }

  return 'text-red-600';
};

export const useSystemStatus = () => {
  const connectionStore = useGenerationConnectionStore();
  const {
    systemStatus,
    systemStatusApiAvailable: apiAvailable,
    systemStatusReady: isReady,
    systemStatusLastUpdated: lastUpdate,
  } = storeToRefs(connectionStore);

  const { controller, release } = acquireSystemStatusController();

  onScopeDispose(() => {
    release();
  });

  void controller.ensureHydrated();

  const queueLength = computed<number>(() => systemStatus.value.queue_length ?? 0);
  const queueJobsLabel = computed<string>(() => `${queueLength.value} jobs`);
  const gpuStatusLabel = computed<string>(() => systemStatus.value.gpu_status || 'Unknown');
  const gpuStatusClass = computed<string>(() => getGpuStatusClass(systemStatus.value.gpu_status));
  const memoryUsage = computed<string>(() =>
    formatMemory(systemStatus.value.memory_used, systemStatus.value.memory_total),
  );
  const hasMemoryData = computed<boolean>(() =>
    systemStatus.value.memory_used != null && systemStatus.value.memory_total != null,
  );
  const memoryPercent = computed<number>(() => {
    if (
      systemStatus.value.memory_used == null ||
      systemStatus.value.memory_total == null ||
      systemStatus.value.memory_total === 0
    ) {
      return 0;
    }

    return Math.min(100, Math.round((systemStatus.value.memory_used / systemStatus.value.memory_total) * 100));
  });
  const statusIcon = computed<string>(() => getStatusIcon(systemStatus.value.status));
  const statusLabel = computed<string>(() => systemStatus.value.status || 'Unknown');
  const lastUpdatedLabel = computed<string>(() => formatLastUpdateLabel(lastUpdate.value));

  const refresh = () => controller.refresh();
  const startPolling = () => controller.start();
  const stopPolling = () => controller.stop();

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
