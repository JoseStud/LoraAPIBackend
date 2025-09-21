import { computed, ref, type Ref } from 'vue';
import { defineStore } from 'pinia';

import {
  deriveMetricsFromDashboard,
  emptyMetricsSnapshot,
  fetchDashboardStats,
} from '@/services/systemService';
import { useBackendBase } from '@/utils/backend';

import type {
  DashboardStatsSummary,
  SystemMetricsSnapshot,
  SystemResourceStatsSummary,
  SystemStatusLevel,
} from '@/types';

const DEFAULT_STATS: SystemResourceStatsSummary = {
  uptime: 'N/A',
  active_workers: 0,
  total_workers: 0,
  database_size: 0,
  total_records: 0,
  gpu_memory_used: 'N/A',
  gpu_memory_total: 'N/A',
};

const DEFAULT_STATUS: SystemStatusLevel = 'unknown';

const MIN_POLL_INTERVAL = 1_000;
const DEFAULT_POLL_INTERVAL = 5_000;

interface RefreshOptions {
  showLoader?: boolean;
}

const clampPercent = (value?: number | null): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const formatBytes = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 'N/A';
  }

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const formatted = unitIndex === 0 ? size.toFixed(0) : size.toFixed(2);
  return `${Number.parseFloat(formatted).toString()} ${units[unitIndex]}`;
};

const normaliseStatus = (status?: string | null): SystemStatusLevel => {
  if (!status) {
    return DEFAULT_STATUS;
  }

  const value = status.toLowerCase();
  if (value === 'healthy' || value === 'warning' || value === 'error') {
    return value;
  }

  return DEFAULT_STATUS;
};

const deriveSeverityFromMetrics = (metrics: SystemMetricsSnapshot): SystemStatusLevel => {
  const memoryPercent = clampPercent(metrics.memory_percent);
  const diskPercent = clampPercent(metrics.disk_percent);
  const gpus = metrics.gpus ?? [];

  const hasCriticalGpu = gpus.some((gpu) => {
    const temperature = typeof gpu.temperature === 'number' ? gpu.temperature : 0;
    const memory = clampPercent(gpu.memory_percent);
    return temperature > 85 || memory > 95;
  });

  if (memoryPercent > 95 || diskPercent > 95 || hasCriticalGpu) {
    return 'error';
  }

  const hasWarningGpu = gpus.some((gpu) => {
    const temperature = typeof gpu.temperature === 'number' ? gpu.temperature : 0;
    const memory = clampPercent(gpu.memory_percent);
    return temperature > 75 || memory > 85;
  });

  if (memoryPercent > 85 || diskPercent > 85 || hasWarningGpu) {
    return 'warning';
  }

  return 'healthy';
};

const mergeStatusLevels = (base: SystemStatusLevel, derived: SystemStatusLevel): SystemStatusLevel => {
  if (base === 'error' || derived === 'error') {
    return 'error';
  }
  if (base === 'warning' || derived === 'warning') {
    return 'warning';
  }
  if (base === 'healthy' && derived === 'healthy') {
    return 'healthy';
  }
  return DEFAULT_STATUS;
};

const applyStatsFromSummary = (
  statsRef: Ref<SystemResourceStatsSummary>,
  summary: DashboardStatsSummary | null,
  metrics: SystemMetricsSnapshot,
) => {
  const next: SystemResourceStatsSummary = { ...DEFAULT_STATS };
  const stats = summary?.stats ?? null;

  next.total_records = stats?.total_loras ?? 0;
  next.active_workers = (stats as Record<string, number | undefined>)?.active_workers ?? 0;
  next.total_workers = (stats as Record<string, number | undefined>)?.total_workers ?? 0;
  next.database_size = (stats as Record<string, number | undefined>)?.database_size ?? 0;
  next.gpu_memory_used = formatBytes(metrics.memory_used);
  next.gpu_memory_total = formatBytes(metrics.memory_total);

  statsRef.value = next;
};

export const useAdminMetricsStore = defineStore('adminMetrics', () => {
  const backendBase = useBackendBase();

  const summary = ref<DashboardStatsSummary | null>(null);
  const metrics = ref<SystemMetricsSnapshot>(emptyMetricsSnapshot());
  const stats = ref<SystemResourceStatsSummary>({ ...DEFAULT_STATS });
  const status = ref<SystemStatusLevel>(DEFAULT_STATUS);
  const lastUpdated = ref<Date | null>(null);
  const error = ref<Error | null>(null);
  const apiAvailable = ref(true);
  const isReady = ref(false);
  const isLoading = ref(false);

  const pollIntervalMs = ref(DEFAULT_POLL_INTERVAL);
  const pollTimer = ref<ReturnType<typeof setInterval> | null>(null);
  const subscribers = ref(0);
  const isRefreshing = ref(false);

  const isPolling = computed(() => pollTimer.value !== null);

  const applySummary = (payload: DashboardStatsSummary | null) => {
    summary.value = payload;
    metrics.value = deriveMetricsFromDashboard(payload);
    applyStatsFromSummary(stats, payload, metrics.value);

    const baseStatus = normaliseStatus(payload?.system_health?.status);
    const derivedStatus = deriveSeverityFromMetrics(metrics.value);
    status.value = mergeStatusLevels(baseStatus, derivedStatus);

    lastUpdated.value = new Date();
    apiAvailable.value = true;
    error.value = null;
  };

  const handleError = (err: unknown) => {
    const message = err instanceof Error ? err : new Error('Failed to load admin metrics');
    error.value = message instanceof Error ? message : new Error(String(message));
    apiAvailable.value = false;
    status.value = status.value === DEFAULT_STATUS ? 'error' : status.value;
    lastUpdated.value = new Date();
  };

  const refresh = async (options: RefreshOptions = {}): Promise<void> => {
    if (isRefreshing.value) {
      return;
    }

    const showLoader = options.showLoader ?? !isReady.value;

    isRefreshing.value = true;
    if (showLoader) {
      isLoading.value = true;
    }

    try {
      const payload = await fetchDashboardStats(backendBase.value);
      applySummary(payload);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[adminMetrics] Failed to load dashboard stats', err);
      }
      handleError(err);
    } finally {
      if (!isReady.value) {
        isReady.value = true;
      }
      if (showLoader) {
        isLoading.value = false;
      }
      isRefreshing.value = false;
    }
  };

  const stopPolling = () => {
    if (pollTimer.value) {
      clearInterval(pollTimer.value);
      pollTimer.value = null;
    }
  };

  const startPolling = () => {
    if (pollTimer.value) {
      return;
    }

    pollTimer.value = setInterval(() => {
      void refresh({ showLoader: false });
    }, pollIntervalMs.value);
  };

  const setPollInterval = (interval: number) => {
    if (!Number.isFinite(interval) || interval <= 0) {
      return;
    }

    const normalised = Math.max(MIN_POLL_INTERVAL, Math.floor(interval));
    if (normalised === pollIntervalMs.value) {
      return;
    }

    pollIntervalMs.value = normalised;

    if (pollTimer.value) {
      stopPolling();
      startPolling();
    }
  };

  const subscribe = (interval?: number) => {
    subscribers.value += 1;

    if (interval) {
      setPollInterval(interval);
    }

    if (subscribers.value === 1) {
      void refresh({ showLoader: !isReady.value });
      startPolling();
    }
  };

  const unsubscribe = () => {
    subscribers.value = Math.max(0, subscribers.value - 1);
    if (subscribers.value === 0) {
      stopPolling();
    }
  };

  return {
    summary,
    metrics,
    stats,
    status,
    lastUpdated,
    error,
    apiAvailable,
    isReady,
    isLoading,
    pollIntervalMs,
    isPolling,
    refresh,
    subscribe,
    unsubscribe,
    setPollInterval,
    startPolling,
    stopPolling,
  };
});

export type AdminMetricsStore = ReturnType<typeof useAdminMetricsStore>;
