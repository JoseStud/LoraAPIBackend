<template>
  <div class="space-y-3">
    <div class="flex justify-between">
      <span>GPU Status:</span>
      <span :class="gpuStatusClass">{{ gpuStatusLabel }}</span>
    </div>
    <div class="flex justify-between">
      <span>Queue:</span>
      <span>{{ queueJobsLabel }}</span>
    </div>
    <div v-if="hasMemoryData" class="space-y-1">
      <div class="flex justify-between text-sm">
        <span>VRAM:</span>
        <span>{{ memoryUsage }}</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div
          class="bg-blue-600 h-2 rounded-full transition-all duration-300"
          :style="{ width: `${memoryPercent}%` }"
        ></div>
      </div>
    </div>
    <div class="text-xs text-gray-500 pt-2 border-t">
      Last update: {{ lastUpdatedLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SystemStatusCardDetailedProps } from '@/types';

const {
  gpuStatusClass,
  gpuStatusLabel,
  queueJobsLabel,
  hasMemoryData,
  memoryUsage,
  memoryPercent,
  lastUpdatedLabel,
} = withDefaults(defineProps<SystemStatusCardDetailedProps>(), {
  gpuStatusClass: '',
  gpuStatusLabel: 'Unknown',
  queueJobsLabel: '0 jobs',
  hasMemoryData: false,
  memoryUsage: 'N/A',
  memoryPercent: 0,
  lastUpdatedLabel: 'Never',
});
</script>
