<template>
  <div class="generation-page-container">
    <!-- Page Header -->
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
            @click="showHistory = !showHistory"
            class="btn btn-secondary btn-sm"
            :class="{ 'btn-primary': showHistory }"
            type="button"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            History
          </button>
          <button
            @click="clearQueue"
            class="btn btn-secondary btn-sm"
            :disabled="activeJobs.length === 0"
            type="button"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
            Clear Queue
          </button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Panel: Generation Parameters -->
      <div class="lg:col-span-1">
        <GenerationParameterForm
          :params="params"
          :is-generating="isGenerating"
          @start-generation="startGeneration"
          @load-from-composer="loadFromComposer"
          @use-random-prompt="useRandomPrompt"
          @save-preset="savePreset"
        />
      </div>

      <!-- Center Panel: Generation Queue & Progress -->
      <div class="lg:col-span-1">
        <div class="space-y-6">
          <GenerationActiveJobsList
            :active-jobs="activeJobs"
            :sorted-active-jobs="sortedActiveJobs"
            :format-time="formatTime"
            :get-job-status-classes="getJobStatusClasses"
            :get-job-status-text="getJobStatusText"
            :can-cancel-job="canCancelJob"
            @cancel-job="cancelJob"
          />

          <GenerationSystemStatusCard
            :system-status="systemStatus"
            :get-system-status-classes="getSystemStatusClasses"
          />
        </div>
      </div>

      <!-- Right Panel: Recent Results -->
      <div class="lg:col-span-1">
        <GenerationResultsGallery
          :recent-results="recentResults"
          :show-history="showHistory"
          :format-time="formatTime"
          @refresh-results="refreshResults"
          @reuse-parameters="reuseParameters"
          @delete-result="deleteResult"
          @show-image-modal="showImageModal"
        />
      </div>
    </div>
  </div>

  <!-- Image Modal -->
  <div
    v-if="showModal && selectedResult"
    class="fixed inset-0 z-50 overflow-y-auto"
    @click.self="hideImageModal"
  >
    <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75" @click="hideImageModal"></div>

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
import GenerationActiveJobsList from '@/components/generation/GenerationActiveJobsList.vue'
import GenerationParameterForm from '@/components/generation/GenerationParameterForm.vue'
import GenerationResultsGallery from '@/components/generation/GenerationResultsGallery.vue'
import GenerationSystemStatusCard from '@/components/generation/GenerationSystemStatusCard.vue'
import { useGenerationStudio } from '@/composables/useGenerationStudio'

const {
  params,
  systemStatus,
  isGenerating,
  showHistory,
  showModal,
  selectedResult,
  activeJobs,
  recentResults,
  sortedActiveJobs,
  isConnected,
  startGeneration,
  cancelJob,
  clearQueue,
  refreshResults,
  loadFromComposer,
  useRandomPrompt,
  savePreset,
  showImageModal,
  hideImageModal,
  reuseParameters,
  deleteResult,
  formatTime,
  getJobStatusClasses,
  getJobStatusText,
  canCancelJob,
  getSystemStatusClasses,
} = useGenerationStudio()
</script>
