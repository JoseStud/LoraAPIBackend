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
            <div class="text-2xl mb-2">{{ statusIcon }}</div>
            <div class="text-lg font-semibold" :class="statusClass">
              {{ statusLabel }}
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
import { computed } from 'vue';

import { useAdminMetrics } from '@/composables/system';
import type { SystemStatusLevel } from '@/types';

const {
  metrics,
  stats,
  status,
  error,
} = useAdminMetrics({ intervalMs: 5_000 });

const systemMetrics = computed(() => metrics.value);
const systemStats = computed(() => stats.value);
const statusLevel = computed<SystemStatusLevel>(() => status.value ?? 'unknown');
const errorMessage = computed(() => (error.value ? error.value.message : null));

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

const statusIcon = computed(() => getStatusIcon(statusLevel.value));
const statusClass = computed(() => getStatusClass(statusLevel.value));
const statusLabel = computed(() => (statusLevel.value || 'unknown').toUpperCase());
</script>
