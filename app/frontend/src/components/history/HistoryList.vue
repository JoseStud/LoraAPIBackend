<template>
  <RecycleScroller
    class="history-list-scroller"
    key-field="id"
    :items="results"
    :item-size="estimateSize"
    :buffer="buffer"
    v-slot="{ item }"
  >
    <div class="history-list-item-wrapper" data-test="history-list-row">
      <HistoryListItem
        :result="item"
        :is-selected="selectedSet.has(item.id)"
        :formatted-date="formatDate(item.created_at)"
        @selection-change="(selected) => emit('selectionChange', { id: item.id, selected })"
        @view="emit('view', item)"
        @download="emit('download', item)"
        @toggle-favorite="emit('toggle-favorite', item)"
        @reuse="emit('reuse', item)"
        @rate="(rating) => emit('rate', { result: item, rating })"
      />
    </div>
  </RecycleScroller>
</template>

<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller';

import HistoryListItem from './HistoryListItem.vue';

import type { GenerationHistoryResult } from '@/types';

withDefaults(
  defineProps<{
    results: GenerationHistoryResult[];
    selectedSet: ReadonlySet<GenerationHistoryResult['id']>;
    formatDate: (date: string) => string;
    estimateSize?: number;
    buffer?: number;
  }>(),
  {
    estimateSize: 184,
    buffer: 600,
  },
);

const emit = defineEmits<{
  (e: 'selectionChange', payload: { id: GenerationHistoryResult['id']; selected: boolean }): void;
  (e: 'view', result: GenerationHistoryResult): void;
  (e: 'download', result: GenerationHistoryResult): void;
  (e: 'toggle-favorite', result: GenerationHistoryResult): void;
  (e: 'reuse', result: GenerationHistoryResult): void;
  (e: 'rate', payload: { result: GenerationHistoryResult; rating: number }): void;
}>();
</script>

<style scoped>
.history-list-scroller {
  display: block;
}

.history-list-item-wrapper {
  margin-bottom: 0.75rem;
}

.history-list-item-wrapper:last-child {
  margin-bottom: 0;
}
</style>
