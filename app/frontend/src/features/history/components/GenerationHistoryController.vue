<template>
  <slot
    :state="state"
    :actions="actions"
    :modal="modalBindings"
    :format-date="formatDate"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  useGenerationHistory,
  useHistoryActions,
  useHistorySelection,
  useHistoryShortcuts,
  useHistoryModalCoordinator,
  type HistorySelectionChangePayload,
  type HistorySortOption,
  type DateFilterOption,
  type RatingFilterOption,
  type DimensionFilterOption,
} from '@/features/history';
import { PERSISTENCE_KEYS, usePersistence } from '@/composables/shared';
import { useBackendBase } from '@/utils/backend';
import { formatHistoryDate } from '@/utils/format';
import type { GenerationHistoryResult } from '@/types';

import type { HistoryViewMode } from './HistoryActionToolbar.vue';

type RatePayload = {
  result: GenerationHistoryResult;
  rating: number;
};

const viewMode = ref<HistoryViewMode>('grid');
const isInitialized = ref(false);

const apiBaseUrl = useBackendBase();
const router = useRouter();
const persistence = usePersistence();

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

const modal = useHistoryModalCoordinator();

const showToast = modal.showToast;

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
  modal.openModal(result);
};

const loadMore = async (): Promise<void> => {
  await loadMoreResults();
};

const formatDate = (dateString: string): string => formatHistoryDate(dateString);

const onSelectionChange = (payload: HistorySelectionChangePayload): void => {
  updateSelection(payload);
};

const onRate = ({ result, rating }: RatePayload): void => {
  void setRating(result, rating);
};

const { unregister: unregisterShortcuts } = useHistoryShortcuts({
  isModalOpen: modal.isModalOpen,
  selectedItems,
  selectableIds,
  onDeleteSelected: () => {
    void deleteSelected();
  },
  onClearSelection: clearSelection,
  onCloseModal: () => {
    modal.closeModal();
  },
});

onMounted(async () => {
  const savedViewMode = persistence.getItem(PERSISTENCE_KEYS.historyViewMode);
  if (savedViewMode === 'grid' || savedViewMode === 'list') {
    viewMode.value = savedViewMode as HistoryViewMode;
  }

  await loadInitialResults();
  isInitialized.value = true;
});

onUnmounted(() => {
  debouncedApplyFilters.cancel();
  unregisterShortcuts();
});

watch(viewMode, (newMode: HistoryViewMode) => {
  persistence.setItem(PERSISTENCE_KEYS.historyViewMode, newMode);
});

const updateViewMode = (mode: HistoryViewMode): void => {
  viewMode.value = mode;
};

const updateSortBy = (value: HistorySortOption): void => {
  sortBy.value = value;
};

const updateSearchTerm = (value: string): void => {
  searchTerm.value = value;
};

const updateDateFilter = (value: DateFilterOption): void => {
  dateFilter.value = value;
};

const updateRatingFilter = (value: RatingFilterOption): void => {
  ratingFilter.value = value;
};

const updateDimensionFilter = (value: DimensionFilterOption): void => {
  dimensionFilter.value = value;
};

const handleModalReuse = async (result: GenerationHistoryResult): Promise<void> => {
  await reuseParameters(result);
  modal.closeModal();
};

const handleModalDownload = async (result: GenerationHistoryResult): Promise<void> => {
  await downloadImage(result);
};

const handleModalDelete = async (resultId: GenerationHistoryResult['id']): Promise<void> => {
  const deleted = await deleteResult(resultId);
  if (deleted) {
    modal.closeModal();
  }
};

const state = {
  isInitialized,
  viewMode,
  sortBy,
  searchTerm,
  dateFilter,
  ratingFilter,
  dimensionFilter,
  stats,
  filteredResults,
  selectedSet,
  selectedCount,
  hasMore,
  isLoading,
} as const;

const actions = {
  updateViewMode,
  updateSortBy,
  updateSearchTerm,
  updateDateFilter,
  updateRatingFilter,
  updateDimensionFilter,
  applyFilters,
  debouncedApplyFilters,
  clearFilters,
  loadMore,
  onSelectionChange,
  showImageModal,
  downloadImage,
  toggleFavorite,
  reuseParameters,
  onRate,
  deleteSelected,
  favoriteSelected,
  exportSelected,
  clearSelection,
  deleteResult,
  handleModalReuse,
  handleModalDownload,
  handleModalDelete,
} as const;

const modalBindings = {
  modalVisible: modal.modalVisible,
  activeResult: modal.activeResult,
  toastVisible: modal.toastVisible,
  toastMessage: modal.toastMessage,
  toastType: modal.toastType,
  closeModal: modal.closeModal,
} as const;
</script>
