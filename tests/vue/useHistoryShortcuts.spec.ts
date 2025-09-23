import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computed, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import { useGenerationResultsStore } from '../../app/frontend/src/stores/generation/results';
import { useHistoryShortcuts } from '../../app/frontend/src/composables/useHistoryShortcuts';

describe('useHistoryShortcuts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('selects all items when ctrl+a is pressed', () => {
    const store = useGenerationResultsStore();
    store.setResults([
      {
        id: 1,
        prompt: 'first',
        image_url: '/image-1.png',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 2,
        prompt: 'second',
        image_url: '/image-2.png',
        created_at: '2024-01-02T00:00:00Z',
      },
    ]);

    const selectedItems = ref<number[]>([]);
    const shortcuts = useHistoryShortcuts({
      isModalOpen: ref(false),
      selectedItems,
      selectableIds: computed(() => store.recentResults.map((result) => result.id as number)),
      onDeleteSelected: vi.fn(),
      onClearSelection: vi.fn(),
    });

    shortcuts.handleKeydown(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));

    expect(selectedItems.value).toEqual([1, 2]);
  });

  it('clears selection when escape is pressed without modal', () => {
    const clearSelection = vi.fn();
    const shortcuts = useHistoryShortcuts({
      isModalOpen: ref(false),
      selectedItems: ref<number[]>([1, 2]),
      selectableIds: computed(() => [1, 2]),
      onDeleteSelected: vi.fn(),
      onClearSelection: clearSelection,
    });

    shortcuts.handleKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(clearSelection).toHaveBeenCalledTimes(1);
  });

  it('closes the modal when escape is pressed with modal open', () => {
    const isModalOpen = ref(true);
    const closeModal = vi.fn();
    const clearSelection = vi.fn();
    const shortcuts = useHistoryShortcuts({
      isModalOpen,
      selectedItems: ref<number[]>([1]),
      selectableIds: computed(() => [1]),
      onDeleteSelected: vi.fn(),
      onClearSelection: clearSelection,
      onCloseModal: closeModal,
    });

    shortcuts.handleKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(clearSelection).not.toHaveBeenCalled();
  });

  it('invokes delete when delete key is pressed with selected items', () => {
    const deleteSelected = vi.fn();
    const shortcuts = useHistoryShortcuts({
      isModalOpen: ref(false),
      selectedItems: ref<number[]>([1, 2, 3]),
      selectableIds: computed(() => [1, 2, 3]),
      onDeleteSelected: deleteSelected,
      onClearSelection: vi.fn(),
    });

    shortcuts.handleKeydown(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(deleteSelected).toHaveBeenCalledTimes(1);
  });
});
