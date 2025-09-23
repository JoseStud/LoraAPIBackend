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
          v-model:selected-tags="selectedTags"
          v-model:sort-by="sortBy"
          :available-tags="availableTags"
          :is-tag-modal-open="isTagModalOpen"
          @clear-filters="handleClearFilters"
          @open-tag-modal="toggleTagModal"
        />
        <LoraGalleryTagModal
          :show="isTagModalOpen"
          :available-tags="availableTags"
          v-model:selected-tags="selectedTags"
          @close="closeTagModal"
        />
      </div>

      <LoraGalleryBulkActions
        :bulk-mode="bulkMode"
        :selected-count="selectedLoras.length"
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
        @toggle-selection="handleSelectionChange"
        @update="handleLoraUpdate"
        @delete="handleLoraDelete"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import LoraGalleryBulkActions from './LoraGalleryBulkActions.vue';
import LoraGalleryFilters from './LoraGalleryFilters.vue';
import LoraGalleryGrid from './LoraGalleryGrid.vue';
import LoraGalleryHeader from './LoraGalleryHeader.vue';
import LoraGalleryTagModal from './LoraGalleryTagModal.vue';
import { performBulkLoraAction } from '@/services/loraService';
import { useLoraGalleryData } from '@/composables/useLoraGalleryData';
import { useLoraGalleryFilters } from '@/composables/useLoraGalleryFilters';
import { useLoraGallerySelection } from '@/composables/useLoraGallerySelection';
import { useBackendBase } from '@/utils/backend';
import type {
  LoraBulkAction,
  LoraUpdatePayload,
} from '@/types';
import type { WindowWithExtras } from '@/types/window';

defineOptions({ name: 'LoraGallery' });

const apiBaseUrl = useBackendBase();
const windowExtras = window as WindowWithExtras;

const {
  isInitialized,
  isLoading,
  loras,
  availableTags,
  loadLoras,
  initialize,
} = useLoraGalleryData(apiBaseUrl, windowExtras);

const {
  searchTerm,
  activeOnly,
  selectedTags,
  sortBy,
  filteredLoras,
  clearFilters,
} = useLoraGalleryFilters(loras);

const {
  selectedLoras,
  viewMode,
  bulkMode,
  allSelected,
  setViewMode,
  toggleBulkMode,
  handleSelectionChange,
  toggleSelectAll,
  initializeSelection,
} = useLoraGallerySelection(filteredLoras);

const isTagModalOpen = ref(false);

const handleClearFilters = () => {
  clearFilters();
  isTagModalOpen.value = false;
};

const toggleTagModal = () => {
  isTagModalOpen.value = !isTagModalOpen.value;
};

const closeTagModal = () => {
  isTagModalOpen.value = false;
};

const performBulkAction = async (action: LoraBulkAction) => {
  if (selectedLoras.value.length === 0) {
    windowExtras.htmx?.trigger(document.body, 'show-notification', {
      detail: { message: 'No LoRAs selected.', type: 'warning' },
    });
    return;
  }

  const confirmMsg = `Are you sure you want to ${action} ${selectedLoras.value.length} LoRA(s)?`;
  if (!confirm(confirmMsg)) {
    return;
  }

  const count = selectedLoras.value.length;

  try {
    await performBulkLoraAction(apiBaseUrl.value, {
      action,
      lora_ids: selectedLoras.value,
    });

    await loadLoras();
    selectedLoras.value = [];

    windowExtras.htmx?.trigger(document.body, 'show-notification', {
      detail: {
        message: `Successfully ${action}d ${count} LoRA(s).`,
        type: 'success',
      },
    });
  } catch (error) {
    windowExtras.DevLogger?.error?.(`Error performing bulk ${action}:`, error);

    windowExtras.htmx?.trigger(document.body, 'show-notification', {
      detail: { message: `Error performing bulk ${action}.`, type: 'error' },
    });
  }
};

const handleLoraUpdate = (detail: LoraUpdatePayload) => {
  const { id, type } = detail;
  const lora = loras.value.find(item => item.id === id);

  if (!lora) {
    return;
  }

  if (type === 'weight' && detail.weight !== undefined) {
    lora.weight = detail.weight;
  }

  if (type === 'active' && detail.active !== undefined) {
    lora.active = detail.active;
  }
};

const handleLoraDelete = (id: string) => {
  const index = loras.value.findIndex(item => item.id === id);
  if (index !== -1) {
    loras.value.splice(index, 1);
  }

  const selectionIndex = selectedLoras.value.indexOf(id);
  if (selectionIndex !== -1) {
    selectedLoras.value.splice(selectionIndex, 1);
  }
};

onMounted(async () => {
  initializeSelection();
  await initialize();
});
</script>
