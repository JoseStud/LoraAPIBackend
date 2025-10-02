import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { useAsyncResource } from '@/composables/shared';

import { useBackendClient } from '@/services/shared/http';
import {
  deriveMetricsFromDashboard,
  emptyMetricsSnapshot,
  fetchDashboardStats,
} from '@/services/system/systemService';
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

interface AdminMetricsState {
  summary: DashboardStatsSummary | null;
  metrics: SystemMetricsSnapshot;
  stats: SystemResourceStatsSummary;
  status: SystemStatusLevel;
  apiAvailable: boolean;
  lastUpdated: Date | null;
}

const createDefaultState = (): AdminMetricsState => ({
  summary: null,
  metrics: emptyMetricsSnapshot(),
  stats: defaultResourceStats(),
  status: defaultSystemStatus,
  apiAvailable: true,
  lastUpdated: null,
});

const buildStateFromSummary = (payload: DashboardStatsSummary | null): AdminMetricsState => {
  const metrics = deriveMetricsFromDashboard(payload);
  const stats = buildResourceStats(payload, metrics);

  const baseStatus = normaliseStatus(payload?.system_health?.status);
  const derivedStatus = deriveSeverityFromMetrics(metrics);

  return {
    summary: payload,
    metrics,
    stats,
    status: mergeStatusLevels(baseStatus, derivedStatus),
    apiAvailable: true,
    lastUpdated: new Date(),
  } satisfies AdminMetricsState;
};

const buildErrorState = (previous: AdminMetricsState | null): AdminMetricsState => {
  const priorStatus = previous?.status ?? defaultSystemStatus;
  const status = priorStatus === defaultSystemStatus ? 'error' : priorStatus;

  return {
    summary: null,
    metrics: emptyMetricsSnapshot(),
    stats: defaultResourceStats(),
    status,
    apiAvailable: false,
    lastUpdated: new Date(),
  } satisfies AdminMetricsState;
};

export const useAdminMetricsStore = defineStore('adminMetrics', () => {
  const backendClient = useBackendClient();

  const error = ref<Error | null>(null);

  const metricsResource = useAsyncResource<AdminMetricsState, void>(
    async () => {
      const payload = await fetchDashboardStats(backendClient);
      return buildStateFromSummary(payload);
    },
    {
      initialValue: createDefaultState(),
      backendRefresh: true,
      onSuccess: () => {
        error.value = null;
      },
      onError: (err) => {
        const message = err instanceof Error ? err : new Error('Failed to load admin metrics');
        error.value = message;
        metricsResource.setData(buildErrorState(metricsResource.data.value), { markLoaded: true });
      },
    },
  );

  const summary = computed(() => metricsResource.data.value?.summary ?? null);
  const metrics = computed(() => metricsResource.data.value?.metrics ?? emptyMetricsSnapshot());
  const stats = computed(() => metricsResource.data.value?.stats ?? defaultResourceStats());
  const status = computed(() => metricsResource.data.value?.status ?? defaultSystemStatus);
  const apiAvailable = computed(() => metricsResource.data.value?.apiAvailable ?? true);
  const lastUpdated = computed(() => metricsResource.data.value?.lastUpdated ?? null);

  const isReady = computed(() => metricsResource.isLoaded.value);
  const isRefreshing = computed(() => metricsResource.isLoading.value);
  const isLoading = computed(() => !isReady.value && metricsResource.isLoading.value);

  const refresh = async (_options: RefreshOptions = {}): Promise<void> => {
    await metricsResource.refresh();
  };

  const applySummary = (payload: DashboardStatsSummary | null) => {
    metricsResource.setData(buildStateFromSummary(payload), { markLoaded: true });
    error.value = null;
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
    isRefreshing,
    refresh,
    applySummary,
  };
});

export type AdminMetricsStore = ReturnType<typeof useAdminMetricsStore>;
