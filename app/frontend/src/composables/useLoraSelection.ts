import { computed, ref } from 'vue';

export type LoraSelectionChangePayload = {
  id: string;
  selected: boolean;
};

const cloneSelection = (current: Set<string>): Set<string> => new Set(current);

export const useLoraSelection = () => {
  const selectedItems = ref<Set<string>>(new Set());

  const selectedSet = computed(() => selectedItems.value);
  const selectedCount = computed(() => selectedItems.value.size);
  const selectedIds = computed(() => Array.from(selectedItems.value));

  const withUpdatedSelection = (updater: (next: Set<string>) => void): void => {
    const next = cloneSelection(selectedItems.value);
    updater(next);
    selectedItems.value = next;
  };

  const select = (id: string): void => {
    withUpdatedSelection((next) => {
      next.add(id);
    });
  };

  const deselect = (id: string): void => {
    withUpdatedSelection((next) => {
      next.delete(id);
    });
  };

  const toggleSelection = (id: string): void => {
    withUpdatedSelection((next) => {
      if (next.has(id)) {
        next.delete(id);
        return;
      }

      next.add(id);
    });
  };

  const onSelectionChange = ({ id, selected }: LoraSelectionChangePayload): void => {
    if (selected) {
      select(id);
      return;
    }

    deselect(id);
  };

  const clearSelection = (): void => {
    selectedItems.value = new Set();
  };

  const setSelection = (ids: Iterable<string>): void => {
    selectedItems.value = new Set(ids);
  };

  const isSelected = (id: string): boolean => selectedItems.value.has(id);

  return {
    selectedItems,
    selectedSet,
    selectedCount,
    selectedIds,
    withUpdatedSelection,
    select,
    deselect,
    toggleSelection,
    onSelectionChange,
    clearSelection,
    setSelection,
    isSelected,
  } as const;
};
