import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

const DEFAULT_STATUS = {
  gpu_status: 'Loading…',
  queue_length: 0,
  status: 'unknown',
  gpu_available: true,
  memory_used: 0,
  memory_total: 8192,
};

const FALLBACK_STATUS = {
  gpu_status: 'Available',
  memory_used: 2048,
  memory_total: 8192,
  status: 'Ready',
};

const DEFAULT_POLL_INTERVAL = 10000;

const formatMemory = (used, total) => {
  if (!used || !total) {
    return 'N/A';
  }

  const usedGb = (used / 1024).toFixed(1);
  const totalGb = (total / 1024).toFixed(1);
  const percentage = ((used / total) * 100).toFixed(0);

  return `${usedGb}GB / ${totalGb}GB (${percentage}%)`;
};

const formatLastUpdateLabel = (lastUpdate) => {
  if (!lastUpdate) {
    return 'Never';
  }

  const now = new Date();
  const diffSecs = Math.floor((now - lastUpdate) / 1000);

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

const getStatusIcon = (status) => {
  switch ((status || '').toLowerCase()) {
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

const getGpuStatusClass = (gpuStatus) => {
  const value = (gpuStatus || '').toLowerCase();

  if (value.includes('available')) {
    return 'text-green-600';
  }

  if (value.includes('busy')) {
    return 'text-yellow-600';
  }

  return 'text-red-600';
};

const safeUpdateStore = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  try {
    const store = window?.Alpine?.store?.('app');
    if (store && typeof store.updateSystemStatus === 'function') {
      store.updateSystemStatus(payload);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('Unable to update Alpine store with system status', error);
    }
  }
};

export const useSystemStatus = (options = {}) => {
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;

  const statusState = reactive({ ...DEFAULT_STATUS });
  const apiAvailable = ref(true);
  const isReady = ref(false);
  const lastUpdate = ref(null);

  const queueLength = computed(() => statusState.queue_length ?? 0);
  const queueJobsLabel = computed(() => `${queueLength.value} jobs`);
  const gpuStatusLabel = computed(() => statusState.gpu_status || 'Unknown');
  const gpuStatusClass = computed(() => getGpuStatusClass(statusState.gpu_status));
  const memoryUsage = computed(() => formatMemory(statusState.memory_used, statusState.memory_total));
  const hasMemoryData = computed(() => Boolean(statusState.memory_used && statusState.memory_total));
  const memoryPercent = computed(() => {
    if (!statusState.memory_used || !statusState.memory_total) {
      return 0;
    }

    return Math.min(100, Math.round((statusState.memory_used / statusState.memory_total) * 100));
  });
  const statusIcon = computed(() => getStatusIcon(statusState.status));
  const statusLabel = computed(() => statusState.status || 'Unknown');
  const lastUpdatedLabel = computed(() => formatLastUpdateLabel(lastUpdate.value));

  const applyStatus = (next = {}) => {
    Object.assign(statusState, next);
    safeUpdateStore(next);
  };

  const applyFallback = () => {
    applyStatus(FALLBACK_STATUS);
  };

  let pollHandle = null;

  const stopPolling = () => {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  };

  const fetchStatus = async () => {
    const backend = window?.BACKEND_URL || '';

    try {
      const response = await fetch(`${backend}/system/status`);

      if (response.ok) {
        const data = await response.json();
        applyStatus(data);
        lastUpdate.value = new Date();
        apiAvailable.value = true;
      } else if (response.status === 404) {
        apiAvailable.value = false;
        applyFallback();
        lastUpdate.value = new Date();
        stopPolling();
      } else {
        apiAvailable.value = true;
        applyStatus({
          status: 'error',
          gpu_status: 'Unknown',
        });
      }
    } catch (error) {
      apiAvailable.value = true;
      applyStatus({
        status: 'error',
        gpu_status: 'Unknown',
      });

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
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

      fetchStatus();
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
    statusState,
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
