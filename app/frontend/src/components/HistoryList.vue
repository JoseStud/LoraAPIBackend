<template>
  <div class="space-y-3">
    <HistoryListItem
      v-for="result in results"
      :key="result.id"
      :result="result"
      :is-selected="selectedItems.includes(result.id)"
      :formatted-date="formatDate(result.created_at)"
      @selection-change="(selected) => emit('selectionChange', { id: result.id, selected })"
      @view="emit('view', result)"
      @download="emit('download', result)"
      @toggle-favorite="emit('toggle-favorite', result)"
      @reuse="emit('reuse', result)"
      @rate="(rating) => emit('rate', { result, rating })"
    />
  </div>
</template>

<script setup lang="ts">
import HistoryListItem from './HistoryListItem.vue';

import type { GenerationHistoryResult } from '@/types';

defineProps<{
  results: GenerationHistoryResult[];
  selectedItems: readonly GenerationHistoryResult['id'][];
  formatDate: (date: string) => string;
}>();

const emit = defineEmits<{
  (e: 'selectionChange', payload: { id: GenerationHistoryResult['id']; selected: boolean }): void;
  (e: 'view', result: GenerationHistoryResult): void;
  (e: 'download', result: GenerationHistoryResult): void;
  (e: 'toggle-favorite', result: GenerationHistoryResult): void;
  (e: 'reuse', result: GenerationHistoryResult): void;
  (e: 'rate', payload: { result: GenerationHistoryResult; rating: number }): void;
}>();
</script>
