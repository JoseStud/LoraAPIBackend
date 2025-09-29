import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';

import { useLoraSelection } from './useLoraSelection';
import { PERSISTENCE_KEYS } from '@/constants/persistence';
import type { GalleryLora, LoraGallerySelectionState } from '@/types';

const storage = (() => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[useLoraGallerySelection] Failed to access localStorage', error);
    }
    return null;
  }
})();

const VIEW_MODE_KEY = PERSISTENCE_KEYS.loraGalleryViewMode;

const persistViewMode = (mode: LoraGallerySelectionState['viewMode']) => {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(VIEW_MODE_KEY, mode);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[useLoraGallerySelection] Failed to persist view mode', error);
    }
  }
};

const readPersistedViewMode = (): LoraGallerySelectionState['viewMode'] | null => {
  if (!storage) {
    return null;
  }

  try {
    const savedViewMode = storage.getItem(VIEW_MODE_KEY);
    if (savedViewMode === 'grid' || savedViewMode === 'list') {
      return savedViewMode;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[useLoraGallerySelection] Failed to read view mode', error);
    }
  }

  return null;
};

export function useLoraGallerySelection(filteredLoras: Ref<GalleryLora[]>) {
  const selection = useLoraSelection();
  const viewMode = ref<LoraGallerySelectionState['viewMode']>('grid');
  const bulkMode = ref(false);

  const allSelected = computed(() =>
    filteredLoras.value.length > 0 &&
    selection.selectedCount.value === filteredLoras.value.length
  );

  const setViewMode = (mode: LoraGallerySelectionState['viewMode']) => {
    viewMode.value = mode;
    persistViewMode(mode);
  };

  const toggleBulkMode = () => {
    bulkMode.value = !bulkMode.value;
  };

  const handleSelectionChange = (loraId: string) => {
    selection.toggleSelection(loraId);
  };

  const toggleSelectAll = () => {
    if (allSelected.value) {
      selection.clearSelection();
      return;
    }

    selection.setSelection(filteredLoras.value.map(lora => lora.id));
  };

  const initializeSelection = () => {
    const savedViewMode = readPersistedViewMode();
    if (savedViewMode) {
      viewMode.value = savedViewMode;
    }
  };

  watch(filteredLoras, newLoras => {
    const availableIds = new Set(newLoras.map(lora => lora.id));
    selection.withUpdatedSelection((next) => {
      next.forEach((id) => {
        if (!availableIds.has(id)) {
          next.delete(id);
        }
      });
    });
  });

  return {
    selectedItems: selection.selectedItems,
    selectedSet: selection.selectedSet,
    selectedCount: selection.selectedCount,
    selectedLoras: selection.selectedIds,
    viewMode,
    bulkMode,
    allSelected,
    setViewMode,
    toggleBulkMode,
    handleSelectionChange,
    toggleSelectAll,
    initializeSelection,
    clearSelection: selection.clearSelection,
    setSelection: selection.setSelection,
    isSelected: selection.isSelected,
    select: selection.select,
    deselect: selection.deselect,
    toggleSelection: selection.toggleSelection,
    onSelectionChange: selection.onSelectionChange,
    withUpdatedSelection: selection.withUpdatedSelection,
  };
}
