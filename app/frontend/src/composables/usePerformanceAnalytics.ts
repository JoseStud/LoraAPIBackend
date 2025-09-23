/**
 * Performance Analytics Composable
 *
 * Manages data fetching and state for performance analytics dashboards.
 */

import { ref } from 'vue';

import { exportAnalyticsReport, fetchPerformanceAnalytics } from '@/services';
import { fetchTopAdapters } from '@/services';
import { useBackendBase } from '@/utils/backend';
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

export function usePerformanceAnalytics() {
  const backendBase = useBackendBase();

  const timeRange = ref<PerformanceTimeRange>('24h');
  const autoRefresh = ref<boolean>(false);
  const refreshInterval = ref<ReturnType<typeof setInterval> | null>(null);
  const isLoading = ref<boolean>(false);

  const kpis = ref<PerformanceKpiSummary>({ ...DEFAULT_KPIS });
  const topLoras = ref<TopLoraPerformance[]>([]);
  const errorAnalysis = ref<ErrorAnalysisEntry[]>([]);
  const performanceInsights = ref<PerformanceInsightEntry[]>([]);
  const chartData = ref<PerformanceAnalyticsCharts>(createEmptyCharts());

  const loadTopLoras = async (): Promise<void> => {
    try {
      const adapters = await fetchTopAdapters(backendBase.value, 10);
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
      console.error('Error loading top LoRAs:', error);
      if (import.meta.env.DEV) {
        topLoras.value = createDevTopLoras();
      } else {
        topLoras.value = [];
      }
    }
  };

  const loadAnalyticsSummary = async (): Promise<void> => {
    try {
      const summary = await fetchPerformanceAnalytics(backendBase.value, timeRange.value);

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
      console.error('Error loading analytics summary:', error);
      kpis.value = { ...DEFAULT_KPIS };
      chartData.value = createEmptyCharts();
      errorAnalysis.value = [];
      performanceInsights.value = [];
    }
  };

  const loadAllData = async (): Promise<void> => {
    isLoading.value = true;
    try {
      await loadAnalyticsSummary();
      await loadTopLoras();
    } finally {
      isLoading.value = false;
    }
  };

  const toggleAutoRefresh = (): void => {
    if (autoRefresh.value) {
      if (refreshInterval.value) {
        clearInterval(refreshInterval.value);
      }
      refreshInterval.value = setInterval(() => {
        void loadAllData();
      }, 30_000);
    } else if (refreshInterval.value) {
      clearInterval(refreshInterval.value);
      refreshInterval.value = null;
    }
  };

  const cleanup = (): void => {
    if (refreshInterval.value) {
      clearInterval(refreshInterval.value);
      refreshInterval.value = null;
    }
  };

  const exportAnalytics = async (
    format: string,
    overrides: Partial<AnalyticsExportOptions> = {},
  ): Promise<AnalyticsExportResult> =>
    exportAnalyticsReport(backendBase.value, { format, ...overrides });

  return {
    timeRange,
    autoRefresh,
    kpis,
    topLoras,
    errorAnalysis,
    performanceInsights,
    chartData,
    isLoading,
    loadAllData,
    toggleAutoRefresh,
    formatDuration: formatDurationLabel,
    cleanup,
    exportAnalytics,
  };
}

export type UsePerformanceAnalyticsReturn = ReturnType<typeof usePerformanceAnalytics>;
