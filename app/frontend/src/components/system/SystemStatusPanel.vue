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
              <span>{{ cpuPercentLabel }}</span>
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
              <span>{{ memoryPercentLabel }} ({{ formatSize(memoryUsed) }})</span>
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
              <span>{{ diskPercentLabel }} ({{ formatSize(diskUsed) }})</span>
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
                <span>{{ formatTemperature(gpu.temperature) }}</span>
              </div>
              
              <!-- GPU Memory -->
              <div class="mb-2">
                <div class="flex justify-between text-xs mb-1">
                  <span>Memory</span>
                  <span>{{ formatPercentLabel(gpu.memory_percent) }}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    class="bg-red-600 h-1.5 rounded-full transition-all duration-500"
                    :style="`width: ${clampPercent(gpu.memory_percent)}%`"
                  ></div>
                </div>
              </div>
              
              <!-- GPU Utilization -->
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span>Utilization</span>
                  <span>{{ formatPercentLabel(gpu.utilization) }}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    class="bg-purple-600 h-1.5 rounded-full transition-all duration-500"
                    :style="`width: ${clampPercent(gpu.utilization)}%`"
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
import { computed } from 'vue';

import { useAdminMetrics } from '@/composables/useAdminMetrics';

const {
  metrics,
  isLoading,
  error,
  lastUpdatedLabel,
} = useAdminMetrics({ intervalMs: 5_000 });

const metricsData = computed(() => metrics.value);

const clampPercent = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const formatPercentLabel = (value: number | null | undefined): string =>
  typeof value === 'number' && !Number.isNaN(value) ? `${clampPercent(value)}%` : '—%';

const cpuPercent = computed(() => clampPercent(metricsData.value.cpu_percent));
const memoryPercent = computed(() => clampPercent(metricsData.value.memory_percent));
const memoryUsed = computed(() => metricsData.value.memory_used ?? 0);
const diskPercent = computed(() => clampPercent(metricsData.value.disk_percent));
const diskUsed = computed(() => metricsData.value.disk_used ?? 0);
const cpuPercentLabel = computed(() => formatPercentLabel(metricsData.value.cpu_percent));
const memoryPercentLabel = computed(() => formatPercentLabel(metricsData.value.memory_percent));
const diskPercentLabel = computed(() => formatPercentLabel(metricsData.value.disk_percent));
const gpus = computed(() => metricsData.value.gpus ?? []);

const formatSize = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / k ** i;
  const formatted = Number.isInteger(value)
    ? value.toFixed(0)
    : value.toFixed(2).replace(/\.?(?:0)+$/, (match) => (match.startsWith('.') ? '' : match));
  return `${formatted} ${sizes[i]}`;
};

const formatTemperature = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${Math.round(value)}°C`;
};

const lastUpdated = computed(() => lastUpdatedLabel.value);
</script>
