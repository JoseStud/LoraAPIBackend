import { computed, ref } from 'vue';

import type { GenerationHistoryResult } from '@/types';

export type HistorySelectionChangePayload = {
  id: GenerationHistoryResult['id'];
  selected: boolean;
};

const cloneSelection = (current: Set<GenerationHistoryResult['id']>): Set<GenerationHistoryResult['id']> =>
  new Set(current);

export const useHistorySelection = () => {
  const selectedItems = ref<Set<GenerationHistoryResult['id']>>(new Set());

  const selectedSet = computed(() => selectedItems.value);
  const selectedCount = computed(() => selectedItems.value.size);
  const selectedIds = computed(() => Array.from(selectedItems.value));

  const withUpdatedSelection = (
    updater: (next: Set<GenerationHistoryResult['id']>) => void,
  ): void => {
    const next = cloneSelection(selectedItems.value);
    updater(next);
    selectedItems.value = next;
  };

  const onSelectionChange = ({ id, selected }: HistorySelectionChangePayload): void => {
    withUpdatedSelection((next) => {
      if (selected) {
        next.add(id);
        return;
      }

      next.delete(id);
    });
  };

  const clearSelection = (): void => {
    selectedItems.value = new Set();
  };

  const setSelection = (ids: Iterable<GenerationHistoryResult['id']>): void => {
    selectedItems.value = new Set(ids);
  };

  const isSelected = (id: GenerationHistoryResult['id']): boolean => selectedItems.value.has(id);

  return {
    selectedItems,
    selectedSet,
    selectedCount,
    selectedIds,
    withUpdatedSelection,
    onSelectionChange,
    clearSelection,
    setSelection,
    isSelected,
  } as const;
};
