<template>
  <div class="generation-shell grid gap-6 xl:grid-cols-[3fr_2fr]">
    <div class="generation-page-container flex flex-col gap-6">
      <slot
        name="header"
        :is-connected="isConnected"
        :show-history="showHistory"
        :toggle-history="emitToggleHistory"
        :clear-queue="emitClearQueue"
        :has-active-jobs="hasActiveJobs"
      >
        <div class="page-header">
          <div class="flex justify-between items-center">
            <div>
              <h1 class="page-title">Generation Studio</h1>
              <p class="page-subtitle">Generate images with AI-powered LoRA integration</p>
              <div class="mt-2 flex items-center text-sm text-gray-500 gap-2">
                <span
                  class="inline-flex h-2 w-2 rounded-full"
                  :class="isConnected ? 'bg-green-500' : 'bg-red-500'"
                ></span>
                <span v-if="isConnected">Live updates connected</span>
                <span v-else>Reconnecting to updates…</span>
              </div>
            </div>
            <div class="header-actions flex gap-2">
              <button
                data-testid="toggle-history"
                @click="emitToggleHistory()"
                class="btn btn-secondary btn-sm"
                :class="{ 'btn-primary': showHistory }"
                type="button"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0 1180z"></path>
                </svg>
                History
              </button>
              <button
                data-testid="clear-queue"
                @click="emitClearQueue()"
                class="btn btn-secondary btn-sm"
                :disabled="!hasActiveJobs"
                type="button"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  ></path>
                </svg>
                Clear Queue
              </button>
            </div>
          </div>
        </div>
      </slot>

      <slot
        name="primary"
        :generation-parameter-form="GenerationParameterForm"
        :generation-active-jobs-list="GenerationActiveJobsList"
        :generation-results-gallery="GenerationResultsGallery"
        :generation-system-status-card="GenerationSystemStatusCard"
        :params="params"
        :is-generating="isGenerating"
        :active-jobs="activeJobs"
        :sorted-active-jobs="sortedActiveJobs"
        :recent-results="recentResults"
        :show-history="showHistory"
        :format-time="formatTime"
        :get-job-status-classes="getJobStatusClasses"
        :get-job-status-text="getJobStatusText"
        :can-cancel-job="canCancelJob"
        :system-status="systemStatus"
        :get-system-status-classes="getSystemStatusClasses"
        :update-params="emitUpdateParams"
        :start-generation="emitStartGeneration"
        :load-from-composer="emitLoadFromComposer"
        :use-random-prompt="emitUseRandomPrompt"
        :save-preset="emitSavePreset"
        :cancel-job="emitCancelJob"
        :refresh-results="emitRefreshResults"
        :reuse-parameters="emitReuseParameters"
        :delete-result="emitDeleteResult"
        :show-image-modal="emitShowImageModal"
      >
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-1">
            <GenerationParameterForm
              :params="params"
              :is-generating="isGenerating"
              @update:params="emitUpdateParams"
              @start-generation="emitStartGeneration"
              @load-from-composer="emitLoadFromComposer"
              @use-random-prompt="emitUseRandomPrompt"
              @save-preset="emitSavePreset"
            />
          </div>

          <div class="lg:col-span-1">
            <div class="space-y-6">
              <GenerationActiveJobsList
                :active-jobs="activeJobs"
                :sorted-active-jobs="sortedActiveJobs"
                :format-time="formatTime"
                :get-job-status-classes="getJobStatusClasses"
                :get-job-status-text="getJobStatusText"
                :can-cancel-job="canCancelJob"
                @cancel-job="emitCancelJob"
              />

              <GenerationSystemStatusCard
                :system-status="systemStatus"
                :get-system-status-classes="getSystemStatusClasses"
              />
            </div>
          </div>

          <div class="lg:col-span-1">
            <GenerationResultsGallery
              :recent-results="recentResults"
              :show-history="showHistory"
              :format-time="formatTime"
              @refresh-results="emitRefreshResults"
              @reuse-parameters="emitReuseParameters"
              @delete-result="emitDeleteResult"
              @show-image-modal="emitShowImageModal"
            />
          </div>
        </div>
      </slot>
    </div>

    <slot
      name="secondary"
      :system-status-card="SystemStatusCard"
      :job-queue="JobQueue"
      :system-status="systemStatus"
      :active-jobs="activeJobs"
      :clear-queue="emitClearQueue"
      :has-active-jobs="hasActiveJobs"
      :is-connected="isConnected"
    >
      <div class="flex flex-col gap-6">
        <SystemStatusCard variant="detailed" />
        <JobQueue :show-clear-completed="true" />
      </div>
    </slot>
  </div>

  <div
    v-if="showModal && selectedResult"
    class="fixed inset-0 z-50 overflow-y-auto"
    data-testid="result-modal"
    @click.self="emitHideImageModal()"
  >
    <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75" @click="emitHideImageModal"></div>

      <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
        <img
          v-if="selectedResult?.image_url"
          :src="selectedResult.image_url"
          :alt="selectedResult?.prompt ?? 'Generated image'"
          class="w-full"
        >
        <div class="p-4">
          <h3 class="text-lg font-medium text-gray-900 mb-2">Generation Details</h3>
          <div class="space-y-1 text-sm text-gray-600">
            <div><strong>Prompt:</strong> {{ selectedResult?.prompt ?? 'Unknown prompt' }}</div>
            <div>
              <strong>Size:</strong>
              {{ selectedResult?.width ?? '—' }}×{{ selectedResult?.height ?? '—' }}
            </div>
            <div><strong>Steps:</strong> {{ selectedResult?.steps ?? '—' }}</div>
            <div><strong>CFG Scale:</strong> {{ selectedResult?.cfg_scale ?? '—' }}</div>
            <div><strong>Seed:</strong> {{ selectedResult?.seed ?? '—' }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import GenerationActiveJobsList from '../components/GenerationActiveJobsList.vue'
import GenerationParameterForm from '../components/GenerationParameterForm.vue'
import GenerationResultsGallery from '../components/GenerationResultsGallery.vue'
import GenerationSystemStatusCard from '../components/GenerationSystemStatusCard.vue'
import JobQueue from '../components/JobQueue.vue'
import SystemStatusCard from '../components/system/SystemStatusCard.vue'
import type { GenerationFormState, SystemStatusState } from '@/types'
import type {
  QueueItemView,
  ReadonlyQueue,
  ReadonlyResults,
  ResultItemView,
} from '@/features/generation/orchestrator'
import type { DeepReadonly } from '@/utils/freezeDeep'

const props = defineProps<{
  isConnected: boolean
  showHistory: boolean
  params: GenerationFormState
  isGenerating: boolean
  activeJobs: ReadonlyQueue
  sortedActiveJobs: ReadonlyQueue
  recentResults: ReadonlyResults
  formatTime: (value?: string) => string
  getJobStatusClasses: (status: QueueItemView['status']) => string
  getJobStatusText: (status: QueueItemView['status']) => string
  canCancelJob: (job: QueueItemView) => boolean
  systemStatus: DeepReadonly<SystemStatusState>
  getSystemStatusClasses: (status?: string) => string
  showModal: boolean
  selectedResult: ResultItemView | null
}>()

const emit = defineEmits<{
  (event: 'toggle-history'): void
  (event: 'clear-queue'): void
  (event: 'update-params', value: GenerationFormState): void
  (event: 'start-generation'): void
  (event: 'load-from-composer'): void
  (event: 'use-random-prompt'): void
  (event: 'save-preset'): void
  (event: 'cancel-job', jobId: string): void
  (event: 'refresh-results'): void
  (event: 'reuse-parameters', result: ResultItemView): void
  (event: 'delete-result', resultId: string | number): void
  (event: 'show-image-modal', result: ResultItemView): void
  (event: 'hide-image-modal'): void
}>()

const params = computed(() => props.params)
const isGenerating = computed(() => props.isGenerating)
const activeJobs = computed(() => props.activeJobs)
const sortedActiveJobs = computed(() => props.sortedActiveJobs)
const recentResults = computed(() => props.recentResults)
const showHistory = computed(() => props.showHistory)
const systemStatus = computed(() => props.systemStatus)
const showModal = computed(() => props.showModal)
const selectedResult = computed(() => props.selectedResult)

const hasActiveJobs = computed(() => activeJobs.value.length > 0)

const emitToggleHistory = (): void => {
  emit('toggle-history')
}

const emitClearQueue = (): void => {
  emit('clear-queue')
}

const emitUpdateParams = (value: GenerationFormState): void => {
  emit('update-params', value)
}

const emitStartGeneration = (): void => {
  emit('start-generation')
}

const emitLoadFromComposer = (): void => {
  emit('load-from-composer')
}

const emitUseRandomPrompt = (): void => {
  emit('use-random-prompt')
}

const emitSavePreset = (): void => {
  emit('save-preset')
}

const emitCancelJob = (jobId: string): void => {
  emit('cancel-job', jobId)
}

const emitRefreshResults = (): void => {
  emit('refresh-results')
}

const emitReuseParameters = (result: ResultItemView): void => {
  emit('reuse-parameters', result)
}

const emitDeleteResult = (resultId: string | number): void => {
  emit('delete-result', resultId)
}

const emitShowImageModal = (result: ResultItemView): void => {
  emit('show-image-modal', result)
}

const emitHideImageModal = (): void => {
  emit('hide-image-modal')
}

const formatTime = props.formatTime
const getJobStatusClasses = props.getJobStatusClasses
const getJobStatusText = props.getJobStatusText
const canCancelJob = props.canCancelJob
const getSystemStatusClasses = props.getSystemStatusClasses
const isConnected = computed(() => props.isConnected)
</script>
