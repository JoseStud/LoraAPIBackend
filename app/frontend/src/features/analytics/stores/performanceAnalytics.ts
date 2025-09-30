import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { useBackendClient, useBackendRefresh } from '@/services';
import { fetchTopAdapters } from '@/features/lora/public';
import { exportAnalyticsReport, fetchPerformanceAnalytics } from '../services/analyticsService';
import { formatDuration as formatDurationLabel } from '@/utils/format';

import type {
  ErrorAnalysisEntry,
  PerformanceAnalyticsCharts,
  PerformanceInsightEntry,
  PerformanceKpiSummary,
  PerformanceTimeRange,
  TopLoraPerformance,
} from '@/types';
import type { AnalyticsExportOptions, AnalyticsExportResult } from '@/types';

const DEFAULT_KPIS: PerformanceKpiSummary = {
  total_generations: 0,
  generation_growth: 0,
  avg_generation_time: 0,
  time_improvement: 0,
  success_rate: 0,
  total_failed: 0,
  active_loras: 0,
  total_loras: 0,
};

const createEmptyCharts = (): PerformanceAnalyticsCharts => ({
  generationVolume: [],
  performance: [],
  loraUsage: [],
  resourceUsage: [],
});

const createDevTopLoras = (): TopLoraPerformance[] => [
  {
    id: 1,
    name: 'Anime Style v2.1',
    version: 'v2.1',
    usage_count: 342,
    success_rate: 96.8,
    avg_time: 42.3,
  },
  {
    id: 2,
    name: 'Realistic Portrait',
    version: 'v1.5',
    usage_count: 289,
    success_rate: 94.2,
    avg_time: 38.7,
  },
  {
    id: 3,
    name: 'Fantasy Art',
    version: 'v3.0',
    usage_count: 267,
    success_rate: 92.1,
    avg_time: 51.2,
  },
  {
    id: 4,
    name: 'Cyberpunk Style',
    version: 'v1.8',
    usage_count: 198,
    success_rate: 89.4,
    avg_time: 47.9,
  },
  {
    id: 5,
    name: 'Nature Photography',
    version: 'v2.0',
    usage_count: 156,
    success_rate: 97.1,
    avg_time: 35.8,
  },
];

export const usePerformanceAnalyticsStore = defineStore('performanceAnalytics', () => {
  const backendClient = useBackendClient();

  const timeRange = ref<PerformanceTimeRange>('24h');
  const autoRefresh = ref(false);
  const isLoading = ref(false);
  const hasLoaded = ref(false);

  const kpis = ref<PerformanceKpiSummary>({ ...DEFAULT_KPIS });
  const topLoras = ref<TopLoraPerformance[]>([]);
  const errorAnalysis = ref<ErrorAnalysisEntry[]>([]);
  const performanceInsights = ref<PerformanceInsightEntry[]>([]);
  const chartData = ref<PerformanceAnalyticsCharts>(createEmptyCharts());

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  const stopAutoRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };

  const startAutoRefresh = () => {
    stopAutoRefresh();
    refreshInterval = setInterval(() => {
      void loadAllData();
    }, 30_000);
  };

  const loadTopLoras = async (): Promise<void> => {
    try {
      const adapters = await fetchTopAdapters(10, backendClient);
      topLoras.value = adapters;

      if (!topLoras.value.length && import.meta.env.DEV) {
        topLoras.value = createDevTopLoras();
      }

      if (topLoras.value.length && chartData.value.loraUsage.length === 0) {
        chartData.value = {
          ...chartData.value,
          loraUsage: topLoras.value.map((lora) => ({
            name: lora.name,
            usage_count: lora.usage_count,
          })),
        } satisfies PerformanceAnalyticsCharts;
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[performanceAnalytics] Error loading top LoRAs', error);
      }
      topLoras.value = import.meta.env.DEV ? createDevTopLoras() : [];
    }
  };

  const loadAnalyticsSummary = async (): Promise<void> => {
    try {
      const summary = await fetchPerformanceAnalytics(timeRange.value, backendClient);

      kpis.value = {
        ...DEFAULT_KPIS,
        ...(summary.kpis ?? {}),
      } satisfies PerformanceKpiSummary;

      chartData.value = {
        ...createEmptyCharts(),
        ...summary.chartData,
      } satisfies PerformanceAnalyticsCharts;

      errorAnalysis.value = [...summary.errorAnalysis];
      performanceInsights.value = [...summary.performanceInsights];
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[performanceAnalytics] Error loading analytics summary', error);
      }
      kpis.value = { ...DEFAULT_KPIS };
      chartData.value = createEmptyCharts();
      errorAnalysis.value = [];
      performanceInsights.value = [];
    }
  };

  const loadAllData = async (): Promise<void> => {
    if (isLoading.value) {
      return;
    }

    isLoading.value = true;
    try {
      await loadAnalyticsSummary();
      await loadTopLoras();
      hasLoaded.value = true;
    } finally {
      isLoading.value = false;
    }
  };

  const ensureLoaded = async (force = false): Promise<void> => {
    if (force || !hasLoaded.value) {
      await loadAllData();
    }
  };

  const toggleAutoRefresh = (): void => {
    if (autoRefresh.value) {
      if (!hasLoaded.value) {
        void ensureLoaded();
      }
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  };

  const setTimeRange = (range: PerformanceTimeRange): void => {
    timeRange.value = range;
  };

  useBackendRefresh(() => {
    void loadAllData();
  });

  const cleanup = (): void => {
    stopAutoRefresh();
    autoRefresh.value = false;
  };

  const exportAnalytics = async (
    format: string,
    overrides: Partial<AnalyticsExportOptions> = {},
  ): Promise<AnalyticsExportResult> =>
    exportAnalyticsReport({ format, ...overrides }, backendClient);

  const formatDuration = (value: number): string => formatDurationLabel(value);

  const isInitialized = computed(() => hasLoaded.value);

  return {
    timeRange,
    autoRefresh,
    kpis,
    topLoras,
    errorAnalysis,
    performanceInsights,
    chartData,
    isLoading,
    isInitialized,
    loadAllData,
    ensureLoaded,
    toggleAutoRefresh,
    setTimeRange,
    cleanup,
    exportAnalytics,
    formatDuration,
  };
});

export type PerformanceAnalyticsStore = ReturnType<typeof usePerformanceAnalyticsStore>;
