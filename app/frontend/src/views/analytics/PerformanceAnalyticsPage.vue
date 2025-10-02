<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      v-if="displayPageHeader"
      title="Performance Analytics"
      subtitle="Track system load, trends, and workload distribution."
    >
      <template #actions>
        <button class="btn btn-secondary btn-sm" type="button" @click="handleRefresh">
          Refresh Analytics
        </button>
      </template>
    </PageHeader>

    <div v-if="displaySystemStatus" class="grid gap-6 xl:grid-cols-2">
      <SystemStatusPanel />
      <SystemStatusCard variant="detailed" />
    </div>

    <div class="analytics-container">
      <div v-if="!isInitialized" class="py-12 text-center text-gray-500">
        <svg class="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25"></circle>
          <path d="M4 12a8 8 0 018-8" stroke-width="4" class="opacity-75"></path>
        </svg>
        <div>Loading analytics...</div>
      </div>

      <div v-else>
        <div class="page-header">
          <div class="flex justify-between items-center">
            <div>
              <h1 class="page-title">Performance Analytics</h1>
              <p class="page-subtitle">Monitor and analyze system performance metrics</p>
            </div>
            <div class="header-actions">
              <div class="flex items-center space-x-3">
                <select v-model="timeRange" @change="handleTimeRangeChange" class="form-input text-sm">
                  <option value="1h">Last Hour</option>
                  <option value="6h">Last 6 Hours</option>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>

                <label class="flex items-center text-sm">
                  <input
                    type="checkbox"
                    v-model="autoRefresh"
                    @change="handleAutoRefreshToggle"
                    class="form-checkbox mr-2"
                  >
                  Auto-refresh
                </label>

                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="isLoading"
                  @click="handleRefresh"
                >
                  <svg class="w-4 h-4 mr-2" :class="{ 'animate-spin': isLoading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        <PerformanceAnalyticsKpiGrid :kpis="kpis" :format-duration="formatDuration" />

        <PerformanceAnalyticsChartGrid :chart-data="chartData" />

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div class="card">
            <div class="card-header">
              <h3 class="text-lg font-semibold">Top Performing LoRAs</h3>
              <p class="text-sm text-gray-600">Most used LoRAs in selected time period</p>
            </div>
            <div class="card-body">
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LoRA</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage Count</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Success Rate</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-for="lora in topLoras" :key="lora.id">
                      <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">{{ lora.name }}</div>
                        <div class="text-sm text-gray-500">{{ lora.version }}</div>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ lora.usage_count }}</td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full" :class="successRateClass(lora.success_rate)">
                          {{ lora.success_rate }}%
                        </span>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ formatDuration(lora.avg_time) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3 class="text-lg font-semibold">Error Analysis</h3>
              <p class="text-sm text-gray-600">Common errors and failure patterns</p>
            </div>
            <div class="card-body">
              <div v-if="errorAnalysis.length > 0" class="space-y-4">
                <div v-for="error in errorAnalysis" :key="error.type" class="border-l-4 border-red-400 bg-red-50 p-4">
                  <div class="flex">
                    <div class="flex-shrink-0">
                      <svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                    </div>
                    <div class="ml-3">
                      <h4 class="text-sm font-medium text-red-800">{{ error.type }}</h4>
                      <div class="mt-1 text-sm text-red-700">
                        <p>{{ error.count }} occurrences ({{ error.percentage }}% of failures)</p>
                        <p class="text-xs mt-1">{{ error.description }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="text-center py-8 text-gray-500">
                <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p>No errors in selected time period</p>
              </div>
            </div>
          </div>
        </div>

        <PerformanceAnalyticsInsights :insights="performanceInsights" @apply="handleApplyRecommendation" />

        <PerformanceAnalyticsExportToolbar @export="handleExport" @schedule="handleSchedule" />
      </div>

      <div v-if="isLoading" class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 flex items-center space-x-4">
          <svg class="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
          </svg>
          <span>Loading analytics data...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue';

import PageHeader from '@/components/layout/PageHeader.vue';
import {
  PerformanceAnalyticsChartGrid,
  PerformanceAnalyticsExportToolbar,
  PerformanceAnalyticsInsights,
  PerformanceAnalyticsKpiGrid,
  usePerformanceAnalytics,
} from '@/features/analytics/public';
import { useNotifications } from '@/composables/shared';
import { downloadFile } from '@/utils/browser';
import { successRateClass } from '@/utils/analyticsFormatting';
import type { PerformanceInsightEntry } from '@/types';

const loadGenerationWidgets = () => import('@/features/generation/public/widgets');

const SystemStatusCard = defineAsyncComponent({
  loader: () => loadGenerationWidgets().then((module) => module.SystemStatusCard),
  suspensible: false,
});

const SystemStatusPanel = defineAsyncComponent({
  loader: () => loadGenerationWidgets().then((module) => module.SystemStatusPanel),
  suspensible: false,
});

const props = defineProps<{
  showPageHeader?: boolean;
  showSystemStatus?: boolean;
}>();

const displayPageHeader = computed(() => props.showPageHeader ?? true);
const displaySystemStatus = computed(() => props.showSystemStatus ?? true);

const notifications = useNotifications();

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
  ensureLoaded,
  loadAllData,
  toggleAutoRefresh,
  formatDuration,
  cleanup,
  exportAnalytics,
} = usePerformanceAnalytics();

const handleTimeRangeChange = async () => {
  await loadAllData();
};

const handleAutoRefreshToggle = () => {
  toggleAutoRefresh();
};

const handleRefresh = async () => {
  await loadAllData();
  notifications.showSuccess('Data refreshed successfully');
};

const handleExport = async (format: string) => {
  try {
    const result = await exportAnalytics(format);
    downloadFile(result.blob, result.filename);
    notifications.showSuccess('Export completed successfully');
  } catch (error) {
    console.error('Error exporting data:', error);
    notifications.showError('Failed to export data');
  }
};

const handleSchedule = () => {
  notifications.showInfo('Report scheduling feature coming soon');
};

const handleApplyRecommendation = (insight: PerformanceInsightEntry) => {
  notifications.showInfo(`Applying recommendation "${insight.title}" is not available yet`);
};

onMounted(() => {
  void ensureLoaded().catch((error: unknown) => {
    console.error('Failed to initialize performance analytics:', error);
    notifications.showError('Failed to load analytics data');
  });
});

onUnmounted(() => {
  cleanup();
});
</script>
