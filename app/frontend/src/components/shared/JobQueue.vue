<template>
  <div v-if="isReady" class="card" :class="cardClass">
    <div class="card-header">
      <div class="flex items-center justify-between">
        <h3 class="card-title">{{ title }}</h3>
        <div class="flex items-center space-x-2">
          <span v-if="showJobCount" class="text-sm text-gray-500">{{ jobCountLabel }}</span>
          <button
            v-if="showClearCompleted && hasJobs"
            type="button"
            class="btn btn-outline btn-sm"
            :disabled="isCancelling"
            @click="handleClearCompleted"
          >
            Clear Completed
          </button>
        </div>
      </div>
    </div>
    <div class="card-body">
      <div class="space-y-3 max-h-96 overflow-y-auto">
        <template v-for="job in jobs" :key="job.id">
          <div class="border border-gray-200 rounded-lg p-3">
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900 truncate">
                  {{ job.name || job.prompt || 'Generation Job' }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ getJobDetailsText(job) }}
                </div>
              </div>
              <button
                v-if="canCancelJob(job)"
                type="button"
                class="text-gray-400 hover:text-red-500 ml-2"
                :disabled="isCancelling"
                @click="handleCancelJob(job.id)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span :class="getStatusColorClass(job.status)">{{ job.status }}</span>
                <span class="text-gray-600">{{ job.progress || 0 }}%</span>
              </div>
              <div class="progress-bar-bg">
                <div
                  class="progress-bar-fg bg-blue-500"
                  :style="{ width: `${job.progress || 0}%` }"
                />
              </div>
              <div class="flex justify-between text-xs text-gray-500">
                <span>{{ formatDuration(job.startTime) }}</span>
                <span>{{ job.message || '' }}</span>
              </div>
            </div>
          </div>
        </template>

        <div v-if="!hasJobs" class="empty-state-container">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
          </svg>
          <div class="empty-state-title">{{ emptyStateTitle }}</div>
          <div class="empty-state-message">{{ emptyStateMessage }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useJobQueue } from '@/composables/useJobQueue';
import { useJobQueueActions } from '@/composables/useJobQueueActions';
import { formatElapsedTime } from '@/utils/format';

import type { GenerationJob } from '@/types';

interface Props {
  title?: string;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  cardClass?: string;
  pollingInterval?: number;
  disabled?: boolean;
  showJobCount?: boolean;
  showClearCompleted?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Generation Queue',
  emptyStateTitle: 'No active generations',
  emptyStateMessage: 'Start a generation to see progress here',
  cardClass: '',
  pollingInterval: 2000,
  disabled: false,
  showJobCount: true,
  showClearCompleted: false,
});

const { jobs, isReady } = useJobQueue({
  pollInterval: computed(() => props.pollingInterval),
  disabled: computed(() => props.disabled),
});

const { isCancelling, clearCompletedJobs, cancelJob: cancelQueueJob } = useJobQueueActions();

const title = computed(() => props.title);
const emptyStateTitle = computed(() => props.emptyStateTitle);
const emptyStateMessage = computed(() => props.emptyStateMessage);
const cardClass = computed(() => props.cardClass);
const showJobCount = computed(() => props.showJobCount);
const showClearCompleted = computed(() => props.showClearCompleted);

const hasJobs = computed(() => jobs.value.length > 0);
const jobCountLabel = computed(() => `${jobs.value.length} active`);

const formatDuration = (startTime?: string) => {
  if (!startTime) {
    return '—';
  }

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return '—';
  }

  return formatElapsedTime(start);
};

const getStatusColorClass = (status: string) => {
  switch (status) {
    case 'processing':
      return 'text-blue-600';
    case 'queued':
      return 'text-yellow-600';
    case 'completed':
      return 'text-green-600';
    case 'failed':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
};

const getJobDetailsText = (job: GenerationJob) => {
  if (job.params && typeof job.params === 'object') {
    const width = job.params.width ?? '—';
    const height = job.params.height ?? '—';
    const steps = job.params.steps ?? '—';
    return `${width}x${height} • ${steps} steps`;
  }
  return 'Processing…';
};

const canCancelJob = (job: GenerationJob) => {
  return job.status === 'queued' || job.status === 'processing';
};

const handleClearCompleted = () => {
  clearCompletedJobs();
};

const handleCancelJob = async (jobId: string) => {
  await cancelQueueJob(jobId);
};
</script>
