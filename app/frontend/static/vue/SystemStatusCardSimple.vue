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

<script setup>
defineProps({
  gpuStatusClass: {
    type: [String, Object, Array],
    default: '',
  },
  gpuStatusLabel: {
    type: String,
    default: 'Unknown',
  },
  queueLength: {
    type: [Number, String],
    default: 0,
  },
  memoryUsage: {
    type: String,
    default: 'N/A',
  },
  statusIcon: {
    type: String,
    default: '',
  },
  statusLabel: {
    type: String,
    default: 'Unknown',
  },
});
</script>
