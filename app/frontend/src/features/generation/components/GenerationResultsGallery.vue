<template>
  <div class="card h-full">
    <div class="card-header">
      <div class="flex items-center justify-between">
        <h3 class="card-title">
          {{ showHistory ? 'Generation History' : 'Recent Results' }}
        </h3>
        <button
          class="text-gray-400 hover:text-gray-600"
          type="button"
          @click="emit('refresh-results')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
    <div class="card-body">
      <RecycleScroller
        v-if="hasResults"
        class="max-h-96 overflow-y-auto pr-1"
        :items="virtualizedItems"
        :item-size="ITEM_SIZE"
        :buffer="SCROLLER_BUFFER"
        key-field="id"
      >
        <template #default="{ item }">
          <div class="pb-4 last:pb-0">
            <HistoryRecentResultCard
              :result="item.history"
              :formatted-date="formatTime(item.history.created_at)"
              @view="emit('show-image-modal', item.original)"
              @reuse="emit('reuse-parameters', item.original)"
              @delete="emit('delete-result', item.id)"
            />
          </div>
        </template>

        <template #placeholder>
          <div class="pb-4 last:pb-0">
            <HistoryRecentResultCard loading />
          </div>
        </template>
      </RecycleScroller>

      <div v-else>
        <div v-if="showSkeletons" class="space-y-4">
          <HistoryRecentResultCard
            v-for="index in SKELETON_COUNT"
            :key="`results-skeleton-${index}`"
            loading
          />
        </div>
        <div v-else class="empty-state-container">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div class="empty-state-title">No results yet</div>
          <div class="empty-state-message">Generated images will appear here</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRefs } from 'vue'

import { HistoryRecentResultCard } from '@/features/history'
import { toHistoryResult } from '@/utils/generationHistory'
import { RecycleScroller } from 'vue-virtual-scroller'

import type { UseGenerationStudioReturn } from '../composables/useGenerationStudio'
import type { ResultItemView, ReadonlyResults } from '@/features/generation/orchestrator'
import type { GenerationHistoryResult } from '@/types'

const props = defineProps<{
  recentResults: ReadonlyResults
  showHistory: boolean
  formatTime: UseGenerationStudioReturn['formatTime']
}>()

const emit = defineEmits<{
  (event: 'refresh-results'): void
  (event: 'reuse-parameters', result: ResultItemView): void
  (event: 'delete-result', resultId: string | number): void
  (event: 'show-image-modal', result: ResultItemView): void
}>()

const ITEM_SIZE = 184
const SCROLLER_BUFFER = 600
const SKELETON_COUNT = 3

const { recentResults, showHistory, formatTime } = toRefs(props)

type VirtualizedResultItem = {
  readonly id: ResultItemView['id']
  readonly original: ResultItemView
  readonly history: GenerationHistoryResult
}

const hasHydrated = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    hasHydrated.value = true
  })
})

const virtualizedItems = computed<VirtualizedResultItem[]>(() =>
  recentResults.value.map((result) => ({
    id: result.id,
    original: result,
    history: toHistoryResult(result),
  })),
)

const hasResults = computed(() => virtualizedItems.value.length > 0)

const showSkeletons = computed(() => !hasResults.value && !hasHydrated.value)
</script>
