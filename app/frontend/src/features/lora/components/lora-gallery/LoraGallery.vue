<template>
  <div class="loras-page-container">
    <div v-show="!isInitialized" class="py-12 text-center text-gray-500">
      <svg class="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25"></circle>
        <path d="M4 12a8 8 0 018-8" stroke-width="4" class="opacity-75"></path>
      </svg>
      <div>Loading LoRAs...</div>
    </div>
    <div v-show="isInitialized">
      <LoraGalleryHeader
        :bulk-mode="bulkMode"
        :view-mode="viewMode"
        @toggle-bulk-mode="toggleBulkMode"
        @change-view-mode="setViewMode"
      />

      <div class="card">
        <LoraGalleryFilters
          v-model:search-term="searchTerm"
          v-model:active-only="activeOnly"
          v-model:sort-by="sortBy"
          v-model:selected-archetype="selectedArchetype"
          v-model:selected-series="selectedSeries"
          :available-archetypes="availableArchetypes"
          :available-series="availableSeries"
          :facet-options="facetOptions"
          :selected-facets="selectedFacets"
          @toggle-facet="toggleFacet"
          @clear-filters="clearFilters"
        />
      </div>

      <LoraGalleryBulkActions
        :bulk-mode="bulkMode"
        :selected-count="selectedCount"
        :all-selected="allSelected"
        @perform="performBulkAction"
        @toggle-select-all="toggleSelectAll"
      />
      <LoraGalleryGrid
        :loras="filteredLoras"
        :is-loading="isLoading"
        :view-mode="viewMode"
        :bulk-mode="bulkMode"
        :selected-loras="selectedLoras"
        key-field="id"
        :grid-item-size="530"
        :grid-item-width="320"
        :list-item-size="210"
        :min-item-size="190"
        :buffer="900"
        @toggle-selection="handleSelectionChange"
        @update="handleLoraUpdate"
        @delete="handleLoraDelete"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import LoraGalleryBulkActions from './LoraGalleryBulkActions.vue';
import LoraGalleryFilters from './LoraGalleryFilters.vue';
import LoraGalleryGrid from './LoraGalleryGrid.vue';
import LoraGalleryHeader from './LoraGalleryHeader.vue';
import { useLoraGalleryData } from '../../composables/lora-gallery/useLoraGalleryData';
import { useLoraGalleryFilters } from '../../composables/lora-gallery/useLoraGalleryFilters';
import { useLoraGallerySelection } from '../../composables/lora-gallery/useLoraGallerySelection';
import { useAsyncLifecycleTask, useDialogService, useNotifications, useSyncedQueryParam } from '@/composables/shared';
import type {
  LoraBulkAction,
  LoraUpdatePayload,
} from '@/types';

defineOptions({ name: 'LoraGallery' });

const { showWarning, showSuccess, showError } = useNotifications();
const dialog = useDialogService();

const {
  isInitialized,
  isLoading,
  loras,
  initialize,
  performBulkAction: runBulkAction,
  applyLoraUpdate,
  removeLora,
} = useLoraGalleryData();

const searchQuery = useSyncedQueryParam();

const {
  searchTerm,
  activeOnly,
  selectedArchetype,
  selectedSeries,
  availableArchetypes,
  availableSeries,
  selectedFacets,
  facetOptions,
  toggleFacet,
  sortBy,
  filteredLoras,
  clearFilters,
} = useLoraGalleryFilters(loras, searchQuery);

const {
  selectedLoras,
  selectedCount,
  viewMode,
  bulkMode,
  allSelected,
  setViewMode,
  toggleBulkMode,
  handleSelectionChange,
  toggleSelectAll,
  initializeSelection,
  clearSelection,
  deselect,
} = useLoraGallerySelection(filteredLoras);


const performBulkAction = async (action: LoraBulkAction) => {
  if (selectedCount.value === 0) {
    showWarning('No LoRAs selected.', 6000);
    return;
  }

  const count = selectedCount.value;
  const confirmMsg = `Are you sure you want to ${action} ${count} LoRA(s)?`;
  const confirmed = await dialog.confirm({
    title: 'Confirm Bulk Action',
    message: confirmMsg,
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
  });

  if (!confirmed) {
    return;
  }

  try {
    await runBulkAction(action, selectedLoras.value);
    clearSelection();

    showSuccess(`Successfully ${action}d ${count} LoRA(s).`, 5000);
  } catch (error) {
    console.error(`Error performing bulk ${action}:`, error);
    showError(`Error performing bulk ${action}.`, 8000);
  }
};

const handleLoraUpdate = (detail: LoraUpdatePayload) => {
  applyLoraUpdate(detail);
};

const handleLoraDelete = (id: string) => {
  removeLora(id);

  deselect(id);
};

useAsyncLifecycleTask(
  async () => {
    initializeSelection();
    await initialize();
  },
  {
    errorMessage: (error) =>
      error instanceof Error
        ? `Failed to load the LoRA gallery: ${error.message}`
        : 'Failed to load the LoRA gallery.',
    notifyError: (message) => {
      showError(message, 8000);
    },
    logLabel: '[LoraGallery] Initialization',
  },
);
</script>
