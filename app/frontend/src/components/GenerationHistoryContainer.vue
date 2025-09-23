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
      <div class="page-header">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="page-title">Generation History</h1>
            <p class="page-subtitle">View and manage your generated images</p>
          </div>
          <div class="header-actions">
            <div class="flex items-center space-x-3">
              <div class="view-mode-toggle">
                <button
                  @click="viewMode = 'grid'"
                  :class="viewMode === 'grid' ? 'view-mode-btn active' : 'view-mode-btn'"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                    />
                  </svg>
                </button>
                <button
                  @click="viewMode = 'list'"
                  :class="viewMode === 'list' ? 'view-mode-btn active' : 'view-mode-btn'"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>

              <select v-model="sortBy" @change="applyFilters()" class="form-input text-sm">
                <option value="created_at">Newest First</option>
                <option value="created_at_asc">Oldest First</option>
                <option value="prompt">By Prompt</option>
                <option value="rating">By Rating</option>
              </select>

              <button
                @click="deleteSelected()"
                class="btn btn-danger btn-sm"
                :disabled="selectedCount === 0"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Delete ({{ selectedCount }})
              </button>
            </div>
          </div>
        </div>
      </div>

      <HistoryFilters
        v-model:searchTerm="searchTerm"
        v-model:dateFilter="dateFilter"
        v-model:ratingFilter="ratingFilter"
        v-model:dimensionFilter="dimensionFilter"
        @search="debouncedApplyFilters()"
        @change="applyFilters()"
      />

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold text-blue-600">{{ stats.total_results }}</div>
            <div class="text-sm text-gray-600">Total Images</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold text-green-600">{{ stats.avg_rating.toFixed(1) }}</div>
            <div class="text-sm text-gray-600">Average Rating</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold text-purple-600">{{ stats.total_favorites }}</div>
            <div class="text-sm text-gray-600">Favorited</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold text-orange-600">{{ formatFileSize(stats.total_size) }}</div>
            <div class="text-sm text-gray-600">Storage Used</div>
          </div>
        </div>
      </div>

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

      <HistoryModal
        :visible="showModal"
        :result="selectedResult"
        :formatted-date="selectedResult ? formatDate(selectedResult.created_at) : ''"
        @close="showModal = false"
        @reuse="handleReuse"
        @download="downloadImage"
        @delete="handleDelete"
      />

      <HistoryToast :visible="toastVisible" :message="toastMessage" :type="toastType" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import HistoryBulkActions from './HistoryBulkActions.vue';
import HistoryFilters from './HistoryFilters.vue';
import HistoryGrid from './HistoryGrid.vue';
import HistoryList from './HistoryList.vue';
import HistoryModal from './HistoryModal.vue';
import HistoryToast from './HistoryToast.vue';

import { useGenerationHistory } from '@/composables/useGenerationHistory';
import { useHistoryShortcuts } from '@/composables/useHistoryShortcuts';
import { downloadFile } from '@/utils/browser';
import { useBackendBase } from '@/utils/backend';
import { formatFileSize as formatBytes } from '@/utils/format';
import {
  deleteResult as deleteHistoryResult,
  deleteResults as deleteHistoryResults,
  downloadResult as downloadHistoryResult,
  exportResults as exportHistoryResults,
  favoriteResult as favoriteHistoryResult,
  favoriteResults as favoriteHistoryResults,
  rateResult as rateHistoryResult,
} from '@/services/historyService';
import type { GenerationHistoryResult } from '@/types';

type ViewMode = 'grid' | 'list';
type ToastType = 'success' | 'error' | 'info' | 'warning';
type SelectionChangePayload = { id: GenerationHistoryResult['id']; selected: boolean };
type RatePayload = { result: GenerationHistoryResult; rating: number };

const viewMode = ref<ViewMode>('grid');
const selectedItems = ref<Set<GenerationHistoryResult['id']>>(new Set());
const selectedResult = ref<GenerationHistoryResult | null>(null);
const showModal = ref(false);
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

const toastVisible = ref(false);
const toastMessage = ref('');
const toastType = ref<ToastType>('success');
let toastTimeout: ReturnType<typeof setTimeout> | undefined;

const selectableIds = computed(() => filteredResults.value.map((result) => result.id));
const selectedIds = computed(() => Array.from(selectedItems.value));
const selectedCount = computed(() => selectedItems.value.size);
const selectedSet = computed(() => selectedItems.value);

const withUpdatedSelection = (
  updater: (current: Set<GenerationHistoryResult['id']>) => void,
): void => {
  const next = new Set(selectedItems.value);
  updater(next);
  selectedItems.value = next;
};

const showToastMessage = (message: string, type: ToastType = 'success'): void => {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  toastMessage.value = message;
  toastType.value = type;
  toastVisible.value = true;

  toastTimeout = setTimeout(() => {
    toastVisible.value = false;
    toastTimeout = undefined;
  }, 3000);
};

watch(
  error,
  (value) => {
    if (value) {
      showToastMessage(value, 'error');
    }
  },
  { immediate: true },
);

const showImageModal = (result: GenerationHistoryResult): void => {
  selectedResult.value = result;
  showModal.value = true;
};

const setRating = async (result: GenerationHistoryResult, rating: number): Promise<void> => {
  try {
    await rateHistoryResult(apiBaseUrl.value, result.id, rating);

    result.rating = rating;
    applyFilters();

    showToastMessage('Rating updated successfully');
  } catch (err) {
    console.error('Error updating rating:', err);
    showToastMessage('Failed to update rating', 'error');
  }
};

const toggleFavorite = async (result: GenerationHistoryResult): Promise<void> => {
  try {
    const updatedResult = await favoriteHistoryResult(apiBaseUrl.value, result.id, !result.is_favorite);

    if (updatedResult) {
      result.is_favorite = updatedResult.is_favorite;
    } else {
      result.is_favorite = !result.is_favorite;
    }

    applyFilters();
    showToastMessage(result.is_favorite ? 'Added to favorites' : 'Removed from favorites');
  } catch (err) {
    console.error('Error updating favorite status:', err);
    showToastMessage('Failed to update favorites', 'error');
  }
};

const reuseParameters = (result: GenerationHistoryResult): void => {
  try {
    const parameters = {
      prompt: result.prompt,
      negative_prompt: result.negative_prompt ?? '',
      steps: result.steps,
      cfg_scale: result.cfg_scale,
      width: result.width,
      height: result.height,
      seed: result.seed ?? null,
      sampler: result.sampler ?? result.sampler_name ?? null,
      model: result.model ?? result.model_name ?? null,
      clip_skip: result.clip_skip ?? null,
      loras: result.loras ?? [],
    };

    localStorage.setItem('reuse-parameters', JSON.stringify(parameters));

    showToastMessage('Parameters copied to generation form');
    void router.push({ name: 'compose' });
  } catch (err) {
    console.error('Error saving parameters:', err);
    showToastMessage('Failed to save parameters', 'error');
  }
};

const handleReuse = (result: GenerationHistoryResult): void => {
  reuseParameters(result);
  showModal.value = false;
};

const downloadImage = async (result: GenerationHistoryResult): Promise<void> => {
  try {
    const download = await downloadHistoryResult(apiBaseUrl.value, result.id);
    downloadFile(download.blob, download.filename);

    showToastMessage('Download started');
  } catch (err) {
    console.error('Error downloading image:', err);
    showToastMessage('Failed to download image', 'error');
  }
};

const deleteResult = async (resultId: GenerationHistoryResult['id']): Promise<void> => {
  if (!confirm('Are you sure you want to delete this image?')) {
    return;
  }

  try {
    await deleteHistoryResult(apiBaseUrl.value, resultId);

    data.value = data.value.filter((item) => item.id !== resultId);
    withUpdatedSelection((next) => {
      next.delete(resultId);
    });
    applyFilters();

    showToastMessage('Image deleted successfully');
  } catch (err) {
    console.error('Error deleting result:', err);
    showToastMessage('Failed to delete image', 'error');
  }
};

const handleDelete = async (resultId: GenerationHistoryResult['id']): Promise<void> => {
  await deleteResult(resultId);
  showModal.value = false;
};

const deleteSelected = async (): Promise<void> => {
  if (selectedCount.value === 0) {
    return;
  }

  const ids = selectedIds.value;
  const count = ids.length;
  if (!confirm(`Are you sure you want to delete ${count} selected images?`)) {
    return;
  }

  try {
    await deleteHistoryResults(apiBaseUrl.value, { ids });

    const idsToRemove = new Set(ids);
    data.value = data.value.filter((item) => !idsToRemove.has(item.id));
    selectedItems.value = new Set();
    applyFilters();

    showToastMessage(`${count} images deleted successfully`);
  } catch (err) {
    console.error('Error deleting results:', err);
    showToastMessage('Failed to delete images', 'error');
  }
};

const favoriteSelected = async (): Promise<void> => {
  if (selectedCount.value === 0) {
    return;
  }

  const ids = selectedIds.value;
  try {
    await favoriteHistoryResults(apiBaseUrl.value, {
      ids,
      is_favorite: true,
    });

    const selectedSnapshot = new Set(ids);
    data.value.forEach((result) => {
      if (selectedSnapshot.has(result.id)) {
        result.is_favorite = true;
      }
    });

    applyFilters();
    showToastMessage(`${ids.length} images added to favorites`);
  } catch (err) {
    console.error('Error updating favorites:', err);
    showToastMessage('Failed to update favorites', 'error');
  }
};

const exportSelected = async (): Promise<void> => {
  if (selectedCount.value === 0) {
    return;
  }

  try {
    const download = await exportHistoryResults(apiBaseUrl.value, { ids: selectedIds.value });
    downloadFile(download.blob, download.filename);

    showToastMessage('Export started');
  } catch (err) {
    console.error('Error exporting results:', err);
    showToastMessage('Failed to export images', 'error');
  }
};

const clearSelection = (): void => {
  selectedItems.value = new Set();
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

const formatFileSize = (bytes: number) => formatBytes(Number.isFinite(bytes) ? bytes : 0);

const onSelectionChange = ({ id, selected }: SelectionChangePayload): void => {
  if (selected) {
    withUpdatedSelection((next) => {
      next.add(id);
    });
    return;
  }

  withUpdatedSelection((next) => {
    next.delete(id);
  });
};

const onRate = ({ result, rating }: RatePayload): void => {
  void setRating(result, rating);
};

const { unregister: unregisterShortcuts } = useHistoryShortcuts({
  isModalOpen: showModal,
  selectedItems,
  selectableIds,
  onDeleteSelected: deleteSelected,
  onClearSelection: clearSelection,
  onCloseModal: () => {
    showModal.value = false;
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
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = undefined;
  }
});

watch(viewMode, (newMode: ViewMode) => {
  localStorage.setItem('history-view-mode', newMode);
});
</script>

<style scoped>
[v-cloak] {
  display: none;
}
</style>
