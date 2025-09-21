/**
 * Performance Analytics Composable
 *
 * Manages data fetching and state for performance analytics dashboards.
 */

import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { fetchTopAdapters } from '@/services/loraService';
import { fetchDashboardStats } from '@/services/systemService';
import { useSettingsStore } from '@/stores/settings';
import { formatDuration as formatDurationLabel } from '@/utils/format';

import type {
  ErrorAnalysisEntry,
  PerformanceAnalyticsCharts,
  PerformanceInsightEntry,
  PerformanceKpiSummary,
  PerformanceTimeRange,
  TopLoraPerformance,
} from '@/types';

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

const createDevErrorAnalysis = (): ErrorAnalysisEntry[] => [
  {
    type: 'GPU Memory Exhausted',
    count: 28,
    percentage: 39.4,
    description: 'Insufficient GPU memory',
  },
];

const createDevPerformanceInsights = (): PerformanceInsightEntry[] => [
  {
    id: 1,
    title: 'High GPU Memory Usage',
    description: 'GPU memory utilization averaging 87%.',
    severity: 'medium',
    recommendation: 'enable_memory_optimization',
  },
];

const generateMockChartData = (
  topLoras: TopLoraPerformance[],
): PerformanceAnalyticsCharts => {
  const hours = 24;
  const now = new Date();

  const generationVolume = Array.from({ length: hours }, (_, index) => {
    const time = new Date(now.getTime() - (hours - index - 1) * 60 * 60 * 1000);
    return {
      timestamp: time.toISOString(),
      count: Math.floor(Math.random() * 50) + 10,
    };
  });

  const performance = Array.from({ length: hours }, (_, index) => {
    const time = new Date(now.getTime() - (hours - index - 1) * 60 * 60 * 1000);
    return {
      timestamp: time.toISOString(),
      avg_time: Math.random() * 30 + 30,
      success_rate: Math.random() * 10 + 90,
    };
  });

  const loraUsage = topLoras.slice(0, 10).map((lora) => ({
    name: lora.name,
    usage_count: lora.usage_count,
  }));

  const resourceUsage = Array.from({ length: hours }, (_, index) => {
    const time = new Date(now.getTime() - (hours - index - 1) * 60 * 60 * 1000);
    return {
      timestamp: time.toISOString(),
      cpu_percent: Math.random() * 40 + 30,
      memory_percent: Math.random() * 30 + 50,
      gpu_percent: Math.random() * 50 + 40,
    };
  });

  return {
    generationVolume,
    performance,
    loraUsage,
    resourceUsage,
  };
};

export function usePerformanceAnalytics() {
  const settingsStore = useSettingsStore();
  const { backendUrl } = storeToRefs(settingsStore);

  const backendBase = computed<string>(() => backendUrl.value || '/api/v1');

  const timeRange = ref<PerformanceTimeRange>('24h');
  const autoRefresh = ref<boolean>(false);
  const refreshInterval = ref<ReturnType<typeof setInterval> | null>(null);
  const isLoading = ref<boolean>(false);

  const kpis = ref<PerformanceKpiSummary>({ ...DEFAULT_KPIS });
  const topLoras = ref<TopLoraPerformance[]>([]);
  const errorAnalysis = ref<ErrorAnalysisEntry[]>([]);
  const performanceInsights = ref<PerformanceInsightEntry[]>([]);
  const chartData = ref<PerformanceAnalyticsCharts>(createEmptyCharts());

  const loadKPIs = async (): Promise<void> => {
    try {
      const summary = await fetchDashboardStats(backendBase.value);
      const stats = summary?.stats;
      kpis.value = {
        ...DEFAULT_KPIS,
        active_loras: stats?.active_loras ?? 0,
        total_loras: stats?.total_loras ?? 0,
      };
    } catch (error) {
      console.error('Error loading KPIs:', error);
      if (import.meta.env.DEV) {
        kpis.value = {
          total_generations: 1247,
          generation_growth: 12.5,
          avg_generation_time: 45.3,
          time_improvement: 8.2,
          success_rate: 94.3,
          total_failed: 71,
          active_loras: 34,
          total_loras: 127,
        } satisfies PerformanceKpiSummary;
      } else {
        kpis.value = { ...DEFAULT_KPIS };
      }
    }
  };

  const loadTopLoras = async (): Promise<void> => {
    try {
      const adapters = await fetchTopAdapters(backendBase.value, 10);
      topLoras.value = adapters;

      if (!topLoras.value.length && import.meta.env.DEV) {
        topLoras.value = createDevTopLoras();
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

  const loadErrorAnalysis = async (): Promise<void> => {
    errorAnalysis.value = [];
    if (import.meta.env.DEV) {
      errorAnalysis.value = createDevErrorAnalysis();
    }
  };

  const loadPerformanceInsights = async (): Promise<void> => {
    performanceInsights.value = [];
    if (import.meta.env.DEV) {
      performanceInsights.value = createDevPerformanceInsights();
    }
  };

  const loadChartData = async (): Promise<void> => {
    chartData.value = createEmptyCharts();
    if (import.meta.env.DEV) {
      chartData.value = generateMockChartData(topLoras.value);
    }
  };

  const loadAllData = async (): Promise<void> => {
    isLoading.value = true;
    try {
      await Promise.all([
        loadKPIs(),
        loadTopLoras(),
        loadErrorAnalysis(),
        loadPerformanceInsights(),
      ]);
      await loadChartData();
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
  };
}

export type UsePerformanceAnalyticsReturn = ReturnType<typeof usePerformanceAnalytics>;
