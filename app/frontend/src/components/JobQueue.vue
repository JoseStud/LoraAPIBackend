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
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useAppStore } from '@/stores/app';
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

const appStore = useAppStore();
const { activeJobs } = storeToRefs(appStore);

const isReady = ref(false);
const isPolling = ref(false);
const apiAvailable = ref(true);
const isCancelling = ref(false);
const pollingTimer = ref<ReturnType<typeof setInterval> | null>(null);

const title = computed(() => props.title);
const emptyStateTitle = computed(() => props.emptyStateTitle);
const emptyStateMessage = computed(() => props.emptyStateMessage);
const cardClass = computed(() => props.cardClass);
const showJobCount = computed(() => props.showJobCount);
const showClearCompleted = computed(() => props.showClearCompleted);

const jobs = computed(() => activeJobs.value);
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
    case 'running':
      return 'text-blue-600';
    case 'completed':
      return 'text-green-600';
    case 'failed':
      return 'text-red-600';
    case 'cancelled':
      return 'text-gray-600';
    default:
      return 'text-yellow-600';
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
  return job.status === 'running' || job.status === 'starting' || job.status === 'queued' || job.status === 'processing';
};

const handleClearCompleted = () => {
  appStore.clearCompletedJobs();
};

const stopPolling = () => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value);
    pollingTimer.value = null;
  }
  isPolling.value = false;
};

const updateJobStatuses = async () => {
  if (!apiAvailable.value) return;

  try {
    let response: Response | null = null;
    try {
      response = await fetch('/api/v1/generation/jobs/active', {
        credentials: 'same-origin',
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[JobQueue] Generation jobs endpoint failed, falling back', error);
      }
    }

    if (!response) {
      response = await fetch('/api/v1/jobs/status', {
        credentials: 'same-origin',
      });
    }

    if (response.ok) {
      const apiJobs: Array<Record<string, unknown>> = await response.json();
      apiJobs.forEach((apiJob) => {
        const apiId = String(apiJob.id ?? apiJob.jobId ?? '');
        if (!apiId) {
          return;
        }
        const storeJob = jobs.value.find((job) => job.id === apiId || job.jobId === apiId);
        const jobId = storeJob?.id ?? apiId;

        const status = String(apiJob.status ?? storeJob?.status ?? 'running');
        const progress = Number(apiJob.progress ?? storeJob?.progress ?? 0);
        const message = typeof apiJob.message === 'string' ? apiJob.message : storeJob?.message;

        appStore.updateJob(jobId, {
          status,
          progress: Number.isFinite(progress) ? progress : 0,
          message,
        });

        if (status === 'completed' && apiJob.result) {
          appStore.addResult(apiJob.result as Record<string, unknown> as any);
          appStore.removeJob(jobId);
          appStore.addNotification('Generation completed!', 'success');
        } else if (status === 'failed') {
          appStore.removeJob(jobId);
          const errorMessage = typeof apiJob.error === 'string' ? apiJob.error : 'Unknown error';
          appStore.addNotification(`Generation failed: ${errorMessage}`, 'error');
        }
      });
    } else if (response.status === 404) {
      apiAvailable.value = false;
      stopPolling();
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.debug('[JobQueue] Polling error:', error);
    }
  }
};

const handleCancelJob = async (jobId: string) => {
  if (isCancelling.value) {
    return;
  }

  try {
    isCancelling.value = true;
    const job = jobs.value.find((item) => item.id === jobId);
    if (!job) {
      appStore.addNotification('Job not found', 'error');
      return;
    }

    const backendJobId = job.jobId ?? job.id;
    let response: Response | null = null;

    try {
      response = await fetch(`/api/v1/generation/jobs/${backendJobId}/cancel`, {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[JobQueue] Failed to cancel via generation endpoint, retrying legacy', error);
      }
    }

    if (!response) {
      response = await fetch(`/api/v1/jobs/${backendJobId}/cancel`, {
        method: 'POST',
        credentials: 'same-origin',
      });
    }

    if (response.ok) {
      appStore.removeJob(jobId);
      appStore.addNotification('Job cancelled', 'info');
    } else {
      appStore.addNotification('Failed to cancel job', 'error');
    }
  } catch (error) {
    appStore.addNotification('Failed to cancel job', 'error');
  } finally {
    isCancelling.value = false;
  }
};

const startPolling = () => {
  if (!apiAvailable.value || pollingTimer.value || props.disabled) {
    return;
  }

  pollingTimer.value = setInterval(async () => {
    if (isPolling.value) {
      return;
    }

    if (!apiAvailable.value) {
      stopPolling();
      return;
    }

    try {
      isPolling.value = true;
      await updateJobStatuses();
    } finally {
      isPolling.value = false;
    }
  }, props.pollingInterval);
};

onMounted(() => {
  isReady.value = true;
  if (!props.disabled) {
    startPolling();
  }
});

onUnmounted(() => {
  stopPolling();
});
</script>
