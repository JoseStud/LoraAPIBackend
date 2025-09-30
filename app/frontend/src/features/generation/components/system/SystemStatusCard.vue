<template>
  <div v-if="isReady" class="card system-status-card">
    <div
      class="card-header"
      :class="isDetailed ? 'cursor-pointer' : ''"
      @click="handleHeaderClick"
    >
      <h3 class="card-title" :class="isDetailed ? 'flex items-center' : ''">
        <template v-if="isDetailed">
          <span class="mr-2">{{ statusIcon }}</span>
          System Status
          <span
            class="ml-auto text-xs transition-transform duration-200"
            :class="isExpanded ? 'rotate-180' : ''"
          >
            ▼
          </span>
        </template>
        <template v-else>
          System Status
        </template>
      </h3>
    </div>
    <div class="card-body space-y-3" v-if="!isDetailed || isExpanded">
      <SystemStatusCardDetailed
        v-if="isDetailed"
        :gpu-status-class="gpuStatusClass"
        :gpu-status-label="gpuStatusLabel"
        :queue-jobs-label="queueJobsLabel"
        :has-memory-data="hasMemoryData"
        :memory-usage="memoryUsage"
        :memory-percent="memoryPercent"
        :last-updated-label="lastUpdatedLabel"
      />
      <SystemStatusCardSimple
        v-else
        :gpu-status-class="gpuStatusClass"
        :gpu-status-label="gpuStatusLabel"
        :queue-length="queueLength"
        :memory-usage="memoryUsage"
        :status-icon="statusIcon"
        :status-label="statusLabel"
      />
      <p v-if="!apiAvailable" class="text-xs text-gray-500">
        Real-time status is unavailable; showing default values.
      </p>
      <p v-else-if="statusState.status === 'error'" class="text-xs text-red-600">
        Unable to retrieve the latest status. Showing the most recent known values.
      </p>
    </div>
  </div>
  <SystemStatusCardSkeleton v-else />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { useSystemStatus } from '../../composables/useSystemStatus';
import SystemStatusCardDetailed from './SystemStatusCardDetailed.vue';
import SystemStatusCardSimple from './SystemStatusCardSimple.vue';
import SystemStatusCardSkeleton from './SystemStatusCardSkeleton.vue';

interface Props {
  variant?: 'simple' | 'detailed';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'simple',
});

const {
  statusState,
  queueLength,
  queueJobsLabel,
  gpuStatusLabel,
  gpuStatusClass,
  memoryUsage,
  hasMemoryData,
  memoryPercent,
  statusIcon,
  statusLabel,
  lastUpdatedLabel,
  apiAvailable,
  isReady,
} = useSystemStatus();

const isDetailed = computed(() => props.variant === 'detailed');
const isExpanded = ref(false);

watch(
  isDetailed,
  (value) => {
    isExpanded.value = value ? false : true;
  },
  { immediate: true }
);

const handleHeaderClick = () => {
  if (isDetailed.value) {
    isExpanded.value = !isExpanded.value;
  }
};
</script>
