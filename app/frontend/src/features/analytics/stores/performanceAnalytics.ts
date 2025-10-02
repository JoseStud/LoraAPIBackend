import { computed, onScopeDispose, ref, watch } from 'vue';
import { defineStore } from 'pinia';

import { useAsyncResource } from '@/composables/shared';
import { useBackendClient } from '@/services/shared/http/backendClient';
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

interface AnalyticsResourceState {
  generatedAt: string;
  kpis: PerformanceKpiSummary;
  chartData: PerformanceAnalyticsCharts;
  errorAnalysis: ErrorAnalysisEntry[];
  performanceInsights: PerformanceInsightEntry[];
  topLoras: TopLoraPerformance[];
}

const createDefaultState = (): AnalyticsResourceState => ({
  generatedAt: new Date(0).toISOString(),
  kpis: { ...DEFAULT_KPIS },
  chartData: createEmptyCharts(),
  errorAnalysis: [],
  performanceInsights: [],
  topLoras: [],
});

const resolveTopLoras = (items: TopLoraPerformance[]): TopLoraPerformance[] => {
  if (items.length) {
    return items.map((item) => ({ ...item }));
  }
  if (import.meta.env.DEV) {
    return createDevTopLoras();
  }
  return [];
};

export const usePerformanceAnalyticsStore = defineStore('performanceAnalytics', () => {
  const backendClient = useBackendClient();

  const timeRange = ref<PerformanceTimeRange>('24h');
  const autoRefresh = ref(false);

  const fallbackState = createDefaultState();

  const analyticsResource = useAsyncResource<AnalyticsResourceState, PerformanceTimeRange>(
    async (range) => {
      const targetRange = range ?? timeRange.value;

      const [summary, topLorasRaw] = await Promise.all([
        fetchPerformanceAnalytics(targetRange, backendClient),
        fetchTopAdapters(10, backendClient).catch((error) => {
          if (import.meta.env.DEV) {
            console.error('[performanceAnalytics] Error loading top LoRAs', error);
          }
          return [] as TopLoraPerformance[];
        }),
      ]);

      const topLoras = resolveTopLoras(topLorasRaw);
      const chartData = {
        ...createEmptyCharts(),
        ...summary.chartData,
      } satisfies PerformanceAnalyticsCharts;

      if (!chartData.loraUsage.length && topLoras.length) {
        chartData.loraUsage = topLoras.map((lora) => ({
          name: lora.name,
          usage_count: lora.usage_count,
        }));
      }

      const kpis: PerformanceKpiSummary = {
        ...DEFAULT_KPIS,
        ...(summary.kpis ?? {}),
      } satisfies PerformanceKpiSummary;

      return {
        generatedAt: summary.generatedAt,
        kpis,
        chartData,
        errorAnalysis: [...summary.errorAnalysis],
        performanceInsights: [...summary.performanceInsights],
        topLoras,
      } satisfies AnalyticsResourceState;
    },
    {
      initialArgs: '24h',
      initialValue: createDefaultState(),
      getKey: (range) => range ?? '24h',
      backendRefresh: {
        getArgs: () => timeRange.value,
      },
      onError: (error) => {
        if (import.meta.env.DEV) {
          console.error('[performanceAnalytics] Error loading analytics summary', error);
        }
      },
    },
  );

  watch(
    () => analyticsResource.error.value,
    (err) => {
      if (err) {
        analyticsResource.setData(createDefaultState());
      }
    },
  );

  const isLoading = computed(() => analyticsResource.isLoading.value);
  const isInitialized = computed(() => analyticsResource.isLoaded.value);

  const kpis = computed(() => analyticsResource.data.value?.kpis ?? fallbackState.kpis);
  const topLoras = computed(() => analyticsResource.data.value?.topLoras ?? []);
  const errorAnalysis = computed(
    () => analyticsResource.data.value?.errorAnalysis ?? fallbackState.errorAnalysis,
  );
  const performanceInsights = computed(
    () => analyticsResource.data.value?.performanceInsights ?? fallbackState.performanceInsights,
  );
  const chartData = computed(() => analyticsResource.data.value?.chartData ?? fallbackState.chartData);

  const loadAllData = async (): Promise<void> => {
    await analyticsResource.refresh(timeRange.value);
  };

  const ensureLoaded = async (force = false): Promise<void> => {
    if (force) {
      await loadAllData();
      return;
    }

    await analyticsResource.ensureLoaded(timeRange.value);
  };

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

  const stopAutoRefreshWatcher = watch(autoRefresh, (enabled) => {
    if (enabled) {
      void ensureLoaded();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });

  onScopeDispose(() => {
    stopAutoRefresh();
    stopAutoRefreshWatcher();
  });

  const toggleAutoRefresh = (next?: boolean): void => {
    if (typeof next === 'boolean') {
      autoRefresh.value = next;
      return;
    }

    autoRefresh.value = !autoRefresh.value;
  };

  const setTimeRange = (range: PerformanceTimeRange): void => {
    timeRange.value = range;
    void loadAllData();
  };

  const cleanup = (): void => {
    stopAutoRefresh();
    autoRefresh.value = false;
  };

  const exportAnalytics = async (
    format: string,
    overrides: Partial<AnalyticsExportOptions> = {},
  ): Promise<AnalyticsExportResult> => exportAnalyticsReport({ format, ...overrides }, backendClient);

  const formatDuration = (value: number): string => formatDurationLabel(value);

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
