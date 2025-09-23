<template>
  <div class="grid grid-cols-2 gap-4 text-sm">
    <div>
      <div class="text-gray-600">GPU Status</div>
      <div class="font-semibold" :class="gpuStatusClass">{{ gpuStatusLabel }}</div>
    </div>
    <div>
      <div class="text-gray-600">Queue Length</div>
      <div class="font-semibold">{{ queueLength }}</div>
    </div>
    <div>
      <div class="text-gray-600">Memory Usage</div>
      <div class="font-semibold">{{ memoryUsage }}</div>
    </div>
    <div>
      <div class="text-gray-600">Status</div>
      <div class="font-semibold flex items-center">
        <span class="mr-1">{{ statusIcon }}</span>
        <span>{{ statusLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SystemStatusCardSimpleProps } from '@/types';

const {
  gpuStatusClass,
  gpuStatusLabel,
  queueLength,
  memoryUsage,
  statusIcon,
  statusLabel,
} = withDefaults(defineProps<SystemStatusCardSimpleProps>(), {
  gpuStatusClass: '',
  gpuStatusLabel: 'Unknown',
  queueLength: 0,
  memoryUsage: 'N/A',
  statusIcon: '',
  statusLabel: 'Unknown',
});
</script>
