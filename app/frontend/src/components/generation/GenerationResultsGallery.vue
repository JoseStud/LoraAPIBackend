<template>
  <div class="card h-full">
    <div class="card-header">
      <div class="flex items-center justify-between">
        <h3 class="card-title">
          {{ showHistory ? 'Generation History' : 'Recent Results' }}
        </h3>
        <button
          @click="emit('refresh-results')"
          class="text-gray-400 hover:text-gray-600"
          type="button"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="space-y-4 max-h-96 overflow-y-auto">
        <div
          v-for="result in recentResults"
          :key="result.id"
          class="border border-gray-200 rounded-lg overflow-hidden"
        >
          <!-- Image Thumbnail -->
          <img
            v-if="result.image_url"
            :src="result.image_url"
            :alt="result.prompt ?? undefined"
            class="w-full h-32 object-cover cursor-pointer"
            @click="emit('show-image-modal', result)"
          >

          <!-- Result Info -->
          <div class="p-3">
            <div class="text-sm text-gray-900 mb-1 line-clamp-2">
              {{ result.prompt ?? 'Untitled Generation' }}
            </div>
            <div class="flex items-center justify-between text-xs text-gray-500">
              <span>{{ formatTime(result.created_at) }}</span>
              <div class="flex space-x-2">
                <button
                  @click="emit('reuse-parameters', result)"
                  class="text-blue-500 hover:text-blue-700"
                  type="button"
                >
                  Reuse
                </button>
                <button
                  @click="emit('delete-result', result.id)"
                  class="text-red-500 hover:text-red-700"
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="recentResults.length === 0" class="empty-state-container">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          <div class="empty-state-title">No results yet</div>
          <div class="empty-state-message">Generated images will appear here</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue'

import type { UseGenerationStudioReturn } from '@/composables/generation'
import type { GenerationResult } from '@/types'

const props = defineProps<{
  recentResults: GenerationResult[]
  showHistory: boolean
  formatTime: UseGenerationStudioReturn['formatTime']
}>()

const emit = defineEmits<{
  (event: 'refresh-results'): void
  (event: 'reuse-parameters', result: GenerationResult): void
  (event: 'delete-result', resultId: string | number): void
  (event: 'show-image-modal', result: GenerationResult): void
}>()

const { recentResults, showHistory, formatTime } = toRefs(props)
</script>
