<template>
  <div class="space-y-6">
    <!-- Real-time Metrics Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      <!-- CPU & Memory Usage Card -->
      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">System Resources</h3>
        </div>
        <div class="card-body space-y-4">
          <!-- CPU Usage -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>CPU Usage</span>
              <span>{{ cpuPercent }}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div 
                class="bg-blue-600 h-2 rounded-full transition-all duration-500"
                :style="`width: ${cpuPercent}%`"
              ></div>
            </div>
          </div>
          
          <!-- Memory Usage -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>Memory Usage</span>
              <span>{{ memoryPercent }}% ({{ formatSize(memoryUsed) }})</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div 
                class="bg-green-600 h-2 rounded-full transition-all duration-500"
                :style="`width: ${memoryPercent}%`"
              ></div>
            </div>
          </div>
          
          <!-- Disk Usage -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>Disk Usage</span>
              <span>{{ diskPercent }}% ({{ formatSize(diskUsed) }})</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div 
                class="bg-yellow-600 h-2 rounded-full transition-all duration-500"
                :style="`width: ${diskPercent}%`"
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- GPU Status Card -->
      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">GPU Status</h3>
        </div>
        <div class="card-body space-y-4">
          <div v-if="gpus.length > 0">
            <div v-for="gpu in gpus" :key="gpu.id" class="space-y-2">
              <div class="flex justify-between text-sm mb-2">
                <span>GPU {{ gpu.id }}: {{ gpu.name }}</span>
                <span>{{ gpu.temperature }}°C</span>
              </div>
              
              <!-- GPU Memory -->
              <div class="mb-2">
                <div class="flex justify-between text-xs mb-1">
                  <span>Memory</span>
                  <span>{{ gpu.memory_percent }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    class="bg-red-600 h-1.5 rounded-full transition-all duration-500"
                    :style="`width: ${gpu.memory_percent}%`"
                  ></div>
                </div>
              </div>
              
              <!-- GPU Utilization -->
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span>Utilization</span>
                  <span>{{ gpu.utilization }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    class="bg-purple-600 h-1.5 rounded-full transition-all duration-500"
                    :style="`width: ${gpu.utilization}%`"
                  ></div>
                </div>
              </div>
            </div>
          </div>
          
          <div v-else class="text-gray-500 text-center py-4">
            No GPU information available
          </div>
        </div>
      </div>
    </div>
    
    <!-- Performance Charts Placeholder -->
    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-semibold">Performance Trends</h3>
      </div>
      <div class="card-body">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="performance-chart">
            <h4 class="text-sm font-medium mb-3">CPU & Memory (Last Hour)</h4>
            <div class="h-40 bg-gray-50 rounded flex items-center justify-center text-gray-500">
              <span>Performance chart will render here</span>
            </div>
          </div>
          <div class="performance-chart">
            <h4 class="text-sm font-medium mb-3">GPU Utilization (Last Hour)</h4>
            <div class="h-40 bg-gray-50 rounded flex items-center justify-center text-gray-500">
              <span>GPU chart will render here</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Status Information -->
    <div class="text-xs text-gray-500 text-center">
      <span v-if="isLoading">Loading system metrics...</span>
      <span v-else-if="error" class="text-red-500">
        Error loading metrics: {{ error?.message ?? 'Unknown error' }}
      </span>
      <span v-else>
        Last updated: {{ lastUpdated }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useSettingsStore } from '@/stores/settings';
import {
  deriveMetricsFromDashboard,
  emptyMetricsSnapshot,
  fetchDashboardStats,
} from '@/services/systemService';
import type { DashboardStatsSummary, SystemMetricsSnapshot } from '@/types';

const settingsStore = useSettingsStore();
const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore);
const apiBaseUrl = computed(() => configuredBackendUrl.value || '/api/v1');

const metricsData = ref<SystemMetricsSnapshot>(emptyMetricsSnapshot());
const dashboardSummary = ref<DashboardStatsSummary | null>(null);

const lastUpdated = ref('Never');
const pollInterval = ref<ReturnType<typeof setInterval> | null>(null);
const isLoading = ref(true);
const error = ref<Error | null>(null);

const cpuPercent = computed(() => metricsData.value.cpu_percent ?? 0);
const memoryPercent = computed(() => metricsData.value.memory_percent ?? 0);
const memoryUsed = computed(() => metricsData.value.memory_used ?? 0);
const diskPercent = computed(() => metricsData.value.disk_percent ?? 0);
const diskUsed = computed(() => metricsData.value.disk_used ?? 0);
const gpus = computed(() => metricsData.value.gpus ?? []);

const formatSize = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / k ** i;
  return `${value.toFixed(2)} ${sizes[i]}`;
};

const applyMetrics = (summary: DashboardStatsSummary | null) => {
  metricsData.value = deriveMetricsFromDashboard(summary);
};

const loadSystemMetrics = async () => {
  try {
    isLoading.value = true;
    error.value = null;

    const summary = await fetchDashboardStats(apiBaseUrl.value);
    dashboardSummary.value = summary;
    applyMetrics(summary);
    lastUpdated.value = new Date().toLocaleTimeString();
  } catch (err) {
    applyMetrics(null);
    dashboardSummary.value = null;
    error.value = err instanceof Error ? err : new Error('Failed to load metrics');
  } finally {
    isLoading.value = false;
  }
};

const startPolling = () => {
  void loadSystemMetrics();
  pollInterval.value = setInterval(() => {
    void loadSystemMetrics();
  }, 5000);
};

const stopPolling = () => {
  if (pollInterval.value) {
    clearInterval(pollInterval.value);
    pollInterval.value = null;
  }
};

onMounted(() => {
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>
