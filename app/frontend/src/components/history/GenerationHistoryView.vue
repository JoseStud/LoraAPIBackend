<template>
  <div class="history-page-container" v-cloak>
    <div v-if="!isInitialized" class="py-12 text-center text-gray-500">
      <svg class="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25" />
        <path d="M4 12a8 8 0 018-8" stroke-width="4" class="opacity-75" />
      </svg>
      <div>Loading history...</div>
    </div>

    <div v-else>
      <HistoryActionToolbar
        :view-mode="viewMode"
        :sort-by="sortBy"
        :selected-count="selectedCount"
        @update:viewMode="$emit('update:viewMode', $event)"
        @update:sortBy="$emit('update:sortBy', $event)"
        @sort-change="$emit('sort-change')"
        @delete-selected="$emit('delete-selected')"
      />

      <HistoryFilters
        :search-term="searchTerm"
        :date-filter="dateFilter"
        :rating-filter="ratingFilter"
        :dimension-filter="dimensionFilter"
        @update:searchTerm="$emit('update:searchTerm', $event)"
        @update:dateFilter="$emit('update:dateFilter', $event)"
        @update:ratingFilter="$emit('update:ratingFilter', $event)"
        @update:dimensionFilter="$emit('update:dimensionFilter', $event)"
        @search="$emit('search')"
        @change="$emit('filters-change')"
      />

      <HistoryStatsSummary :stats="stats" />

      <div class="results-container">
        <HistoryBulkActions
          :selected-count="selectedCount"
          @favorite="$emit('favorite-selected')"
          @export="$emit('export-selected')"
          @clear="$emit('clear-selection')"
        />

        <HistoryGrid
          v-if="viewMode === 'grid'"
          :results="results"
          :selected-set="selectedSet"
          :format-date="formatDate"
          @selection-change="$emit('selection-change', $event)"
          @view="$emit('view-result', $event)"
          @download="$emit('download-result', $event)"
          @toggle-favorite="$emit('toggle-favorite', $event)"
          @reuse="$emit('reuse', $event)"
          @rate="$emit('rate', $event)"
        />

        <HistoryList
          v-else
          :results="results"
          :selected-set="selectedSet"
          :format-date="formatDate"
          @selection-change="$emit('selection-change', $event)"
          @view="$emit('view-result', $event)"
          @download="$emit('download-result', $event)"
          @toggle-favorite="$emit('toggle-favorite', $event)"
          @reuse="$emit('reuse', $event)"
          @rate="$emit('rate', $event)"
        />

        <div v-if="results.length === 0 && !isLoading" class="empty-state">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <div class="empty-state-title">No results found</div>
          <div class="empty-state-message">Try adjusting your filters or search terms</div>
          <div class="empty-state-actions">
            <button @click="$emit('clear-filters')" class="btn btn-primary">
              Clear Filters
            </button>
          </div>
        </div>

        <div v-if="hasMore && results.length > 0" class="text-center mt-6">
          <button @click="$emit('load-more')" class="btn btn-secondary" :disabled="isLoading">
            <span v-if="!isLoading">Load More Results</span>
            <div v-else class="flex items-center">
              <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z" />
              </svg>
              Loading...
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';

import type {
  DateFilterOption,
  DimensionFilterOption,
  HistorySelectionChangePayload,
  HistorySortOption,
  RatingFilterOption,
} from '@/composables/history';
import type { GenerationHistoryResult, GenerationHistoryStats } from '@/types';

import HistoryActionToolbar, { type HistoryViewMode } from './HistoryActionToolbar.vue';
import HistoryBulkActions from './HistoryBulkActions.vue';
import HistoryFilters from './HistoryFilters.vue';
import HistoryGrid from './HistoryGrid.vue';
import HistoryList from './HistoryList.vue';
import HistoryStatsSummary from './HistoryStatsSummary.vue';

defineProps({
  isInitialized: {
    type: Boolean,
    required: true,
  },
  viewMode: {
    type: String as PropType<HistoryViewMode>,
    required: true,
  },
  sortBy: {
    type: String as PropType<HistorySortOption>,
    required: true,
  },
  selectedCount: {
    type: Number,
    required: true,
  },
  searchTerm: {
    type: String,
    required: true,
  },
  dateFilter: {
    type: String as PropType<DateFilterOption>,
    required: true,
  },
  ratingFilter: {
    type: Number as PropType<RatingFilterOption>,
    required: true,
  },
  dimensionFilter: {
    type: String as PropType<DimensionFilterOption>,
    required: true,
  },
  stats: {
    type: Object as PropType<GenerationHistoryStats>,
    required: true,
  },
  results: {
    type: Array as PropType<GenerationHistoryResult[]>,
    required: true,
  },
  selectedSet: {
    type: Object as PropType<Set<GenerationHistoryResult['id']>>,
    required: true,
  },
  isLoading: {
    type: Boolean,
    required: true,
  },
  hasMore: {
    type: Boolean,
    required: true,
  },
  formatDate: {
    type: Function as PropType<(value: string) => string>,
    required: true,
  },
});

defineEmits<{
  (event: 'update:viewMode', value: HistoryViewMode): void;
  (event: 'update:sortBy', value: HistorySortOption): void;
  (event: 'update:searchTerm', value: string): void;
  (event: 'update:dateFilter', value: DateFilterOption): void;
  (event: 'update:ratingFilter', value: RatingFilterOption): void;
  (event: 'update:dimensionFilter', value: DimensionFilterOption): void;
  (event: 'sort-change'): void;
  (event: 'search'): void;
  (event: 'filters-change'): void;
  (event: 'clear-filters'): void;
  (event: 'selection-change', payload: HistorySelectionChangePayload): void;
  (event: 'view-result', result: GenerationHistoryResult): void;
  (event: 'download-result', result: GenerationHistoryResult): void;
  (event: 'toggle-favorite', result: GenerationHistoryResult): void;
  (event: 'reuse', result: GenerationHistoryResult): void;
  (event: 'rate', payload: { result: GenerationHistoryResult; rating: number }): void;
  (event: 'delete-selected'): void;
  (event: 'favorite-selected'): void;
  (event: 'export-selected'): void;
  (event: 'clear-selection'): void;
  (event: 'load-more'): void;
}>();
</script>

<style scoped>
[v-cloak] {
  display: none;
}
</style>
