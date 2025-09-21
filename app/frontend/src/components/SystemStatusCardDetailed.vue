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
import { computed } from 'vue';

import type { SystemStatusCardDetailedProps } from '@/types';

const props = defineProps<SystemStatusCardDetailedProps>();

const gpuStatusClass = computed(() => props.gpuStatusClass ?? '');
const gpuStatusLabel = computed(() => props.gpuStatusLabel ?? 'Unknown');
const queueJobsLabel = computed(() => props.queueJobsLabel ?? '0 jobs');
const memoryUsage = computed(() => props.memoryUsage ?? 'N/A');
const lastUpdatedLabel = computed(() => props.lastUpdatedLabel ?? 'Never');

const memoryPercent = computed(() => {
  const value = props.memoryPercent;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
});

const hasMemoryData = computed(() => {
  if (!props.hasMemoryData) {
    return false;
  }
  const usage = props.memoryUsage;
  if (typeof usage === 'string' && usage.trim().length > 0) {
    return true;
  }
  return typeof props.memoryPercent === 'number' && Number.isFinite(props.memoryPercent);
});
</script>
