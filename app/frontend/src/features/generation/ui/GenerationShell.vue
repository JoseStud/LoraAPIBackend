<template>
  <GenerationShellView
    :is-connected="isConnected"
    :show-history="showHistory"
    :params="params"
    :is-generating="isGenerating"
    :active-jobs="activeJobs"
    :sorted-active-jobs="sortedActiveJobs"
    :recent-results="recentResults"
    :format-time="formatTime"
    :get-job-status-classes="getJobStatusClasses"
    :get-job-status-text="getJobStatusText"
    :can-cancel-job="canCancelJob"
    :system-status="systemStatus"
    :get-system-status-classes="getSystemStatusClasses"
    :show-modal="showModal"
    :selected-result="selectedResult"
    @toggle-history="toggleHistory"
    @clear-queue="clearQueue"
    @update-params="updateParams"
    @start-generation="startGeneration"
    @load-from-composer="loadFromComposer"
    @use-random-prompt="useRandomPrompt"
    @save-preset="savePreset"
    @cancel-job="cancelJob"
    @refresh-results="refreshResults"
    @reuse-parameters="reuseParameters"
    @delete-result="deleteResult"
    @show-image-modal="showImageModal"
    @hide-image-modal="hideImageModal"
  >
    <template #header="slotProps">
      <slot name="header" v-bind="slotProps" />
    </template>
    <template #primary="slotProps">
      <slot name="primary" v-bind="slotProps" />
    </template>
    <template #secondary="slotProps">
      <slot name="secondary" v-bind="slotProps" />
    </template>
  </GenerationShellView>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import GenerationShellView from './GenerationShellView.vue'
import { useGenerationStudio } from '../composables/useGenerationStudio'

const generationStudio = useGenerationStudio()

const {
  params,
  systemStatus,
  isGenerating,
  showHistory: showHistoryRef,
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
  updateParams,
  toggleHistory,
} = generationStudio

const showHistory = computed(() => showHistoryRef.value)
</script>
