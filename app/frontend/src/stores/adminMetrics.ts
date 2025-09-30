import { ref } from 'vue';
import { defineStore } from 'pinia';

import {
  deriveMetricsFromDashboard,
  emptyMetricsSnapshot,
  fetchDashboardStats,
  useBackendClient,
  useBackendEnvironmentSubscription,
} from '@/services';
import {
  buildResourceStats,
  defaultResourceStats,
  defaultSystemStatus,
  deriveSeverityFromMetrics,
  mergeStatusLevels,
  normaliseStatus,
} from '@/utils/systemMetrics';

import type {
  DashboardStatsSummary,
  SystemMetricsSnapshot,
  SystemResourceStatsSummary,
  SystemStatusLevel,
} from '@/types';

interface RefreshOptions {
  showLoader?: boolean;
}

export const useAdminMetricsStore = defineStore('adminMetrics', () => {
  const backendClient = useBackendClient();

  const summary = ref<DashboardStatsSummary | null>(null);
  const metrics = ref<SystemMetricsSnapshot>(emptyMetricsSnapshot());
  const stats = ref<SystemResourceStatsSummary>(defaultResourceStats());
  const status = ref<SystemStatusLevel>(defaultSystemStatus);
  const lastUpdated = ref<Date | null>(null);
  const error = ref<Error | null>(null);
  const apiAvailable = ref(true);
  const isReady = ref(false);
  const isLoading = ref(false);
  const isRefreshing = ref(false);

  const applySummary = (payload: DashboardStatsSummary | null) => {
    summary.value = payload;
    metrics.value = deriveMetricsFromDashboard(payload);
    stats.value = buildResourceStats(payload, metrics.value);

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
    status.value = status.value === defaultSystemStatus ? 'error' : status.value;
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
      const payload = await fetchDashboardStats(backendClient);
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

  useBackendEnvironmentSubscription(() => {
    void refresh({ showLoader: false });
  });

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
    isRefreshing,
    refresh,
    applySummary,
  };
});

export type AdminMetricsStore = ReturnType<typeof useAdminMetricsStore>;
