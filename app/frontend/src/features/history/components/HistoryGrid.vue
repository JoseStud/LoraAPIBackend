<template>
  <RecycleScroller
    class="history-grid-scroller grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
    key-field="id"
    :items="results"
    :item-size="rowHeight"
    :min-item-size="minItemSize"
    :buffer="buffer"
    grid
    v-slot="{ item }"
  >
    <HistoryGridItem
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
  </RecycleScroller>
</template>

<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller';

import HistoryGridItem from './HistoryGridItem.vue';

import type { GenerationHistoryResult } from '@/types';

withDefaults(
  defineProps<{
    results: GenerationHistoryResult[];
    selectedSet: ReadonlySet<GenerationHistoryResult['id']>;
    formatDate: (date: string) => string;
    rowHeight?: number;
    minItemSize?: number;
    buffer?: number;
  }>(),
  {
    rowHeight: 340,
    minItemSize: 280,
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
.history-grid-scroller {
  display: grid;
}
</style>
