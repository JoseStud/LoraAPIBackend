<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Generation Studio"
      subtitle="Launch image generations and monitor live progress."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/compose">
          Edit Prompt Composition
        </RouterLink>
      </template>
    </PageHeader>

    <GenerationShell>
      <template
        #header="{ isConnected, showHistory, toggleHistory, clearQueue, hasActiveJobs }"
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
                @click="toggleHistory()"
                class="btn btn-secondary btn-sm"
                :class="{ 'btn-primary': showHistory }"
                type="button"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 01180z"></path>
                </svg>
                History
              </button>
              <button
                @click="clearQueue()"
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
      </template>

      <template #aside="{ systemStatusCard, jobQueue }">
        <div class="flex flex-col gap-6">
          <component :is="systemStatusCard" variant="detailed" />
          <component :is="jobQueue" :show-clear-completed="true" />
          <RecommendationsPanel />
        </div>
      </template>
    </GenerationShell>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import { GenerationShell } from '@/features/generation/public';
import PageHeader from '@/components/layout/PageHeader.vue';
import { RecommendationsPanel } from '@/features/recommendations/public';
</script>
