import { storeToRefs } from 'pinia';

import { usePerformanceAnalyticsStore } from '../stores/performanceAnalytics';

export function usePerformanceAnalytics() {
  const store = usePerformanceAnalyticsStore();
  const {
    timeRange,
    autoRefresh,
    kpis,
    topLoras,
    errorAnalysis,
    performanceInsights,
    chartData,
    isLoading,
    isInitialized,
  } = storeToRefs(store);

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
    loadAllData: store.loadAllData,
    ensureLoaded: store.ensureLoaded,
    toggleAutoRefresh: store.toggleAutoRefresh,
    setTimeRange: store.setTimeRange,
    cleanup: store.cleanup,
    exportAnalytics: store.exportAnalytics,
    formatDuration: store.formatDuration,
  };
}

export type UsePerformanceAnalyticsReturn = ReturnType<typeof usePerformanceAnalytics>;
