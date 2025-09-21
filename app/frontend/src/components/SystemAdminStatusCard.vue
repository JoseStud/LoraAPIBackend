<template>
  <div class="space-y-6">
    <!-- Real-time Metrics -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      <!-- CPU & Memory Usage -->
      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">System Resources</h3>
        </div>
        <div class="card-body space-y-4">
          <!-- CPU Usage -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>CPU Usage</span>
              <span>{{ systemMetrics.cpu_percent ?? 0 }}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-blue-600 h-2 rounded-full transition-all duration-500"
                :style="`width: ${(systemMetrics.cpu_percent ?? 0)}%`"
              ></div>
            </div>
          </div>
          
          <!-- Memory Usage -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>Memory Usage</span>
              <span>
                {{ systemMetrics.memory_percent ?? 0 }}%
                ({{ formatSize(systemMetrics.memory_used) }})
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-green-600 h-2 rounded-full transition-all duration-500"
                :style="`width: ${(systemMetrics.memory_percent ?? 0)}%`"
              ></div>
            </div>
          </div>
          
          <!-- Disk Usage -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>Disk Usage</span>
              <span>
                {{ systemMetrics.disk_percent ?? 0 }}%
                ({{ formatSize(systemMetrics.disk_used ?? 0) }})
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-yellow-600 h-2 rounded-full transition-all duration-500"
                :style="`width: ${(systemMetrics.disk_percent ?? 0)}%`"
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- GPU Status -->
      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">GPU Status</h3>
        </div>
        <div class="card-body space-y-4">
          <div v-if="systemMetrics.gpus.length > 0">
            <div v-for="gpu in systemMetrics.gpus" :key="gpu.id" class="space-y-2">
              <div class="flex justify-between text-sm mb-2">
                <span>GPU {{ gpu.id }}: {{ gpu.name }}</span>
                <span>{{ gpu.temperature ?? 0 }}°C</span>
              </div>

              <!-- GPU Memory -->
              <div class="mb-2">
                <div class="flex justify-between text-xs mb-1">
                  <span>Memory</span>
                  <span>{{ gpu.memory_percent ?? 0 }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    class="bg-red-600 h-1.5 rounded-full transition-all duration-500"
                    :style="`width: ${(gpu.memory_percent ?? 0)}%`"
                  ></div>
                </div>
              </div>

              <!-- GPU Utilization -->
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span>Utilization</span>
                  <span>{{ gpu.utilization ?? 0 }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    class="bg-purple-600 h-1.5 rounded-full transition-all duration-500"
                    :style="`width: ${(gpu.utilization ?? 0)}%`"
                  ></div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-center text-gray-500 py-4">
            No GPU data available
          </div>
        </div>
      </div>
    </div>
    
    <!-- Performance Charts -->
    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-semibold">Performance Trends</h3>
      </div>
      <div class="card-body">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="performance-chart">
            <h4 class="text-sm font-medium mb-3">CPU & Memory (Last Hour)</h4>
            <div id="cpu-memory-chart" class="h-40 bg-gray-50 rounded flex items-center justify-center text-gray-500">
              <span>Performance chart will render here</span>
            </div>
          </div>
          <div class="performance-chart">
            <h4 class="text-sm font-medium mb-3">GPU Utilization (Last Hour)</h4>
            <div id="gpu-chart" class="h-40 bg-gray-50 rounded flex items-center justify-center text-gray-500">
              <span>GPU chart will render here</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- System Status -->
    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-semibold">System Status</h3>
      </div>
      <div class="card-body">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="text-center">
            <div class="text-2xl mb-2">{{ getStatusIcon(systemStatus.overall) }}</div>
            <div class="text-lg font-semibold" :class="getStatusClass(systemStatus.overall)">
              {{ (systemStatus.overall || 'unknown').toUpperCase() }}
            </div>
            <div class="text-sm text-gray-500">Overall Status</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-600">{{ systemStats.active_workers }}</div>
            <div class="text-sm text-gray-600">Active Workers</div>
            <div class="text-xs text-gray-500">{{ systemStats.total_workers }} total</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-600">{{ formatSize(systemStats.database_size) }}</div>
            <div class="text-sm text-gray-600">Database Size</div>
            <div class="text-xs text-gray-500">{{ systemStats.total_records }} records</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error Messages -->
    <div v-if="errorMessage" class="card border-red-200 bg-red-50">
      <div class="card-body">
        <div class="flex items-center text-red-600">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>{{ errorMessage }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';

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
  SystemStatusOverview,
} from '@/types';

const apiBaseUrl = useBackendBase();

const systemStatus = reactive<SystemStatusOverview>({
  overall: 'unknown',
  last_check: new Date().toISOString(),
});

const systemStats = reactive<SystemResourceStatsSummary>({
  uptime: 'N/A',
  active_workers: 0,
  total_workers: 0,
  database_size: 0,
  total_records: 0,
  gpu_memory_used: 'N/A',
  gpu_memory_total: 'N/A',
});

const systemMetrics = reactive<SystemMetricsSnapshot>({
  ...emptyMetricsSnapshot(),
});

const dashboardSummary = ref<DashboardStatsSummary | null>(null);
const errorMessage = ref<string | null>(null);
const metricsInterval = ref<ReturnType<typeof setInterval> | null>(null);
const statsInterval = ref<ReturnType<typeof setInterval> | null>(null);

const formatSize = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / k ** i;
  return `${value.toFixed(2)} ${sizes[i]}`;
};

const getStatusIcon = (status: SystemStatusLevel): string => {
  switch (status) {
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

const getStatusClass = (status: SystemStatusLevel): string => {
  switch (status) {
    case 'healthy':
      return 'text-green-600';
    case 'warning':
      return 'text-yellow-600';
    case 'error':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
};

const normalizeStatus = (status?: string | null): SystemStatusLevel => {
  if (!status) {
    return 'unknown';
  }
  const value = status.toLowerCase();
  if (value === 'healthy' || value === 'warning' || value === 'error') {
    return value;
  }
  return 'unknown';
};

const refreshDashboardSummary = async (): Promise<DashboardStatsSummary | null> => {
  const summary = await fetchDashboardStats(apiBaseUrl.value);
  dashboardSummary.value = summary;
  return summary;
};

const handleDashboardError = (err: unknown) => {
  dashboardSummary.value = null;
  errorMessage.value = err instanceof Error ? err.message : 'Failed to load dashboard stats';
};

const applyStatusFromSummary = (summary: DashboardStatsSummary | null): SystemStatusLevel => {
  const status = normalizeStatus(summary?.system_health?.status);
  systemStatus.overall = status;
  systemStatus.last_check = new Date().toISOString();
  return status;
};

const applyMetricsFromSummary = (
  summary: DashboardStatsSummary | null,
): SystemMetricsSnapshot => {
  const metrics = deriveMetricsFromDashboard(summary);
  Object.assign(systemMetrics, metrics);
  return systemMetrics;
};

const formatDisplaySize = (value: number): string => (value > 0 ? formatSize(value) : 'N/A');

const applyStatsFromSummary = (
  summary: DashboardStatsSummary | null,
  metrics: SystemMetricsSnapshot = systemMetrics,
) => {
  const stats = summary?.stats;
  systemStats.uptime = 'N/A';
  systemStats.active_workers = 0;
  systemStats.total_workers = 0;
  systemStats.database_size = 0;
  systemStats.total_records = stats?.total_loras ?? 0;
  systemStats.gpu_memory_used = formatDisplaySize(metrics.memory_used);
  systemStats.gpu_memory_total = formatDisplaySize(metrics.memory_total);
};

type MetricStatus = Exclude<SystemStatusLevel, 'unknown'>;

const evaluateMetricsSeverity = (): MetricStatus => {
  const cpuPercent = systemMetrics.cpu_percent ?? 0;
  const memoryPercent = systemMetrics.memory_percent ?? 0;
  const diskPercent = systemMetrics.disk_percent ?? 0;
  const gpus = systemMetrics.gpus ?? [];

  const hasCriticalGpu = gpus.some(
    (gpu) => (gpu.temperature ?? 0) > 85 || (gpu.memory_percent ?? 0) > 95,
  );

  if (cpuPercent > 90 || memoryPercent > 95 || diskPercent > 95 || hasCriticalGpu) {
    return 'error';
  }

  const hasWarningGpu = gpus.some(
    (gpu) => (gpu.temperature ?? 0) > 75 || (gpu.memory_percent ?? 0) > 85,
  );

  if (cpuPercent > 75 || memoryPercent > 85 || diskPercent > 85 || hasWarningGpu) {
    return 'warning';
  }

  return 'healthy';
};

const mergeStatusLevels = (
  base: SystemStatusLevel,
  derived: MetricStatus,
): SystemStatusLevel => {
  if (derived === 'error' || base === 'error') {
    return 'error';
  }
  if (derived === 'warning' || base === 'warning') {
    return 'warning';
  }
  if (base === 'unknown') {
    return 'unknown';
  }
  return 'healthy';
};

const updateSystemStatus = (baseStatus: SystemStatusLevel) => {
  const derivedStatus = evaluateMetricsSeverity();
  systemStatus.overall = mergeStatusLevels(baseStatus, derivedStatus);
};

const loadAllData = async () => {
  try {
    const summary = await refreshDashboardSummary();
    const metrics = applyMetricsFromSummary(summary);
    applyStatsFromSummary(summary, metrics);
    const baseStatus = applyStatusFromSummary(summary);
    updateSystemStatus(baseStatus);
    errorMessage.value = null;
  } catch (err) {
    handleDashboardError(err);
    const metrics = applyMetricsFromSummary(null);
    applyStatsFromSummary(null, metrics);
    const baseStatus = applyStatusFromSummary(null);
    updateSystemStatus(baseStatus);
  }
};

const loadSystemMetrics = async () => {
  try {
    const summary = await refreshDashboardSummary();
    const metrics = applyMetricsFromSummary(summary);
    applyStatsFromSummary(summary, metrics);
    const baseStatus = applyStatusFromSummary(summary);
    updateSystemStatus(baseStatus);
    errorMessage.value = null;
  } catch (err) {
    handleDashboardError(err);
    const metrics = applyMetricsFromSummary(null);
    applyStatsFromSummary(null, metrics);
    const baseStatus = applyStatusFromSummary(null);
    updateSystemStatus(baseStatus);
  }
};

const loadSystemStats = async () => {
  try {
    const summary = await refreshDashboardSummary();
    applyStatsFromSummary(summary);
    const baseStatus = applyStatusFromSummary(summary);
    updateSystemStatus(baseStatus);
    errorMessage.value = null;
  } catch (err) {
    handleDashboardError(err);
    applyStatsFromSummary(null);
    const baseStatus = applyStatusFromSummary(null);
    updateSystemStatus(baseStatus);
  }
};

const startRealTimeUpdates = () => {
  metricsInterval.value = setInterval(() => {
    void loadSystemMetrics();
  }, 5000);

  statsInterval.value = setInterval(() => {
    void loadSystemStats();
  }, 30000);
};

const stopRealTimeUpdates = () => {
  if (metricsInterval.value) {
    clearInterval(metricsInterval.value);
    metricsInterval.value = null;
  }
  if (statsInterval.value) {
    clearInterval(statsInterval.value);
    statsInterval.value = null;
  }
};

onMounted(async () => {
  await loadAllData();
  startRealTimeUpdates();
});

onBeforeUnmount(() => {
  stopRealTimeUpdates();
});
</script>
