<template>
  <div class="card">
    <div class="card-header">
      <h3 class="card-title">Active Jobs</h3>
    </div>
    <div class="card-body">
      <div v-if="activeJobs.length === 0" class="empty-state-container">
        <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
        </svg>
        <div class="empty-state-title">No active jobs</div>
        <div class="empty-state-message">Generation queue is empty</div>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="job in sortedActiveJobs"
          :key="job.id"
          class="border border-gray-200 rounded-lg p-3"
        >
          <!-- Job Header -->
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-medium text-gray-900 truncate">
              {{ job.prompt || 'Untitled Generation' }}
            </div>
            <div class="flex items-center space-x-2">
              <span
                class="px-2 py-1 text-xs rounded-full"
                :class="getJobStatusClasses(job.status)"
              >
                {{ getJobStatusText(job.status) }}
              </span>
              <button
                v-if="canCancelJob(job)"
                @click="emit('cancel-job', job.id)"
                class="text-red-500 hover:text-red-700 text-xs"
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Progress Bar -->
          <div v-if="job.status === 'processing'" class="mb-2">
            <div class="flex justify-between text-xs text-gray-600 mb-1">
              <span>Step {{ job.current_step || 0 }} of {{ job.total_steps || job.steps }}</span>
              <span>{{ Math.round(job.progress || 0) }}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-blue-600 h-2 rounded-full transition-all duration-500"
                :style="{ width: `${job.progress || 0}%` }"
              ></div>
            </div>
          </div>

          <!-- Job Details -->
          <div class="flex justify-between text-xs text-gray-500">
            <span>{{ job.width ?? '—' }}×{{ job.height ?? '—' }} • {{ job.steps ?? '—' }} steps</span>
            <span>{{ formatTime(job.created_at ?? job.startTime) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue'

import type { UseGenerationStudioReturn } from '../composables/useGenerationStudio'
import type { QueueItemView, ReadonlyQueue } from '@/features/generation/orchestrator'

const props = defineProps<{
  activeJobs: ReadonlyQueue
  sortedActiveJobs: ReadonlyQueue
  formatTime: UseGenerationStudioReturn['formatTime']
  getJobStatusClasses: UseGenerationStudioReturn['getJobStatusClasses']
  getJobStatusText: UseGenerationStudioReturn['getJobStatusText']
  canCancelJob: (job: QueueItemView) => boolean
}>()

const emit = defineEmits<{
  (event: 'cancel-job', jobId: string): void
}>()

const { activeJobs, sortedActiveJobs } = toRefs(props)
const formatTime = props.formatTime
const getJobStatusClasses = props.getJobStatusClasses
const getJobStatusText = props.getJobStatusText
const canCancelJob = props.canCancelJob
</script>
