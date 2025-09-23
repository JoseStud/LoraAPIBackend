import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';

import type { GalleryLora, LoraGallerySelectionState } from '@/types';

export function useLoraGallerySelection(filteredLoras: Ref<GalleryLora[]>) {
  const selectedLoras = ref<string[]>([]);
  const viewMode = ref<LoraGallerySelectionState['viewMode']>('grid');
  const bulkMode = ref(false);

  const allSelected = computed(() =>
    filteredLoras.value.length > 0 &&
    selectedLoras.value.length === filteredLoras.value.length
  );

  const setViewMode = (mode: LoraGallerySelectionState['viewMode']) => {
    viewMode.value = mode;
    localStorage.setItem('loraViewMode', mode);
  };

  const toggleBulkMode = () => {
    bulkMode.value = !bulkMode.value;
  };

  const handleSelectionChange = (loraId: string) => {
    const index = selectedLoras.value.indexOf(loraId);
    if (index === -1) {
      selectedLoras.value.push(loraId);
    } else {
      selectedLoras.value.splice(index, 1);
    }
  };

  const toggleSelectAll = () => {
    if (allSelected.value) {
      selectedLoras.value = [];
    } else {
      selectedLoras.value = filteredLoras.value.map(lora => lora.id);
    }
  };

  const initializeSelection = () => {
    const savedViewMode = localStorage.getItem('loraViewMode');
    if (savedViewMode === 'grid' || savedViewMode === 'list') {
      viewMode.value = savedViewMode;
    }
  };

  watch(filteredLoras, newLoras => {
    const availableIds = new Set(newLoras.map(lora => lora.id));
    selectedLoras.value = selectedLoras.value.filter(id => availableIds.has(id));
  });

  return {
    selectedLoras,
    viewMode,
    bulkMode,
    allSelected,
    setViewMode,
    toggleBulkMode,
    handleSelectionChange,
    toggleSelectAll,
    initializeSelection,
  };
}
