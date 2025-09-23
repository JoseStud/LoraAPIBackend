import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';

import { useLoraSelection } from './useLoraSelection';
import type { GalleryLora, LoraGallerySelectionState } from '@/types';

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
    localStorage.setItem('loraViewMode', mode);
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
    const savedViewMode = localStorage.getItem('loraViewMode');
    if (savedViewMode === 'grid' || savedViewMode === 'list') {
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
