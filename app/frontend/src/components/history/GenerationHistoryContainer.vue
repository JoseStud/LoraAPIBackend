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
        v-model:viewMode="viewMode"
        v-model:sortBy="sortBy"
        :selected-count="selectedCount"
        @sort-change="applyFilters()"
        @delete-selected="deleteSelected"
      />

      <HistoryFilters
        v-model:searchTerm="searchTerm"
        v-model:dateFilter="dateFilter"
        v-model:ratingFilter="ratingFilter"
        v-model:dimensionFilter="dimensionFilter"
        @search="debouncedApplyFilters()"
        @change="applyFilters()"
      />

      <HistoryStatsSummary :stats="stats" />

      <div class="results-container">
        <HistoryBulkActions
          :selected-count="selectedCount"
          @favorite="favoriteSelected"
          @export="exportSelected"
          @clear="clearSelection"
        />

        <HistoryGrid
          v-if="viewMode === 'grid'"
          :results="filteredResults"
          :selected-set="selectedSet"
          :format-date="formatDate"
          @selection-change="onSelectionChange"
          @view="showImageModal"
          @download="downloadImage"
          @toggle-favorite="toggleFavorite"
          @reuse="reuseParameters"
          @rate="onRate"
        />

        <HistoryList
          v-else
          :results="filteredResults"
          :selected-set="selectedSet"
          :format-date="formatDate"
          @selection-change="onSelectionChange"
          @view="showImageModal"
          @download="downloadImage"
          @toggle-favorite="toggleFavorite"
          @reuse="reuseParameters"
          @rate="onRate"
        />

        <div
          v-if="filteredResults.length === 0 && !isLoading"
          class="empty-state"
        >
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
            <button @click="clearFilters()" class="btn btn-primary">
              Clear Filters
            </button>
          </div>
        </div>

        <div v-if="hasMore && filteredResults.length > 0" class="text-center mt-6">
          <button @click="loadMore()" class="btn btn-secondary" :disabled="isLoading">
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

      <HistoryModalController
        ref="modalController"
        :format-date="formatDate"
        :on-reuse="reuseParameters"
        :on-download="downloadImage"
        :on-delete="deleteResult"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import HistoryActionToolbar from './HistoryActionToolbar.vue';
import HistoryBulkActions from './HistoryBulkActions.vue';
import HistoryFilters from './HistoryFilters.vue';
import HistoryGrid from './HistoryGrid.vue';
import HistoryList from './HistoryList.vue';
import HistoryModalController from './HistoryModalController.vue';
import HistoryStatsSummary from './HistoryStatsSummary.vue';

import {
  useGenerationHistory,
  useHistoryActions,
  useHistorySelection,
  useHistoryShortcuts,
  type HistorySelectionChangePayload,
  type HistoryToastType,
} from '@/composables/history';
import { useBackendBase } from '@/utils/backend';
import type { GenerationHistoryResult } from '@/types';

import type { HistoryViewMode } from './HistoryActionToolbar.vue';

type RatePayload = { result: GenerationHistoryResult; rating: number };

const viewMode = ref<HistoryViewMode>('grid');
const isInitialized = ref(false);

const apiBaseUrl = useBackendBase();
const router = useRouter();

const {
  data,
  filteredResults,
  stats,
  isLoading,
  error,
  hasMore,
  searchTerm,
  sortBy,
  dateFilter,
  ratingFilter,
  dimensionFilter,
  loadInitialResults,
  loadMore: loadMoreResults,
  applyFilters,
  debouncedApplyFilters,
  clearFilters,
} = useGenerationHistory({ apiBase: apiBaseUrl });

const {
  selectedItems,
  selectedSet,
  selectedCount,
  selectedIds,
  withUpdatedSelection,
  onSelectionChange: updateSelection,
  clearSelection,
} = useHistorySelection();

const modalController = ref<InstanceType<typeof HistoryModalController> | null>(null);

const showToast = (message: string, type: HistoryToastType = 'success'): void => {
  modalController.value?.showToast(message, type);
};

const {
  setRating,
  toggleFavorite,
  reuseParameters,
  downloadImage,
  deleteResult,
  deleteSelected,
  favoriteSelected,
  exportSelected,
} = useHistoryActions({
  apiBaseUrl,
  data,
  applyFilters,
  router,
  showToast,
  selectedIds,
  selectedCount,
  clearSelection,
  withUpdatedSelection,
});

const selectableIds = computed(() => filteredResults.value.map((result) => result.id));

const isModalOpen = computed(() => modalController.value?.isModalOpen ?? false);

watch(
  error,
  (value) => {
    if (value) {
      showToast(value, 'error');
    }
  },
  { immediate: true },
);

const showImageModal = (result: GenerationHistoryResult): void => {
  modalController.value?.openModal(result);
};

const loadMore = async (): Promise<void> => {
  await loadMoreResults();
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return 'Today';
  }
  if (diffDays === 2) {
    return 'Yesterday';
  }
  if (diffDays <= 7) {
    return `${diffDays - 1} days ago`;
  }

  return date.toLocaleDateString();
};

const onSelectionChange = (payload: HistorySelectionChangePayload): void => {
  updateSelection(payload);
};

const onRate = ({ result, rating }: RatePayload): void => {
  void setRating(result, rating);
};

const { unregister: unregisterShortcuts } = useHistoryShortcuts({
  isModalOpen,
  selectedItems,
  selectableIds,
  onDeleteSelected: () => {
    void deleteSelected();
  },
  onClearSelection: clearSelection,
  onCloseModal: () => {
    modalController.value?.closeModal();
  },
});

onMounted(async () => {
  const savedViewMode = localStorage.getItem('history-view-mode');
  if (savedViewMode === 'grid' || savedViewMode === 'list') {
    viewMode.value = savedViewMode;
  }

  await loadInitialResults();
  isInitialized.value = true;
});

onUnmounted(() => {
  debouncedApplyFilters.cancel();
  unregisterShortcuts();
});

watch(viewMode, (newMode: HistoryViewMode) => {
  localStorage.setItem('history-view-mode', newMode);
});
</script>

<style scoped>
[v-cloak] {
  display: none;
}
</style>
