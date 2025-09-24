import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computed, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import { useGenerationResultsStore } from '../../app/frontend/src/stores/generation/results';
import { useHistoryShortcuts } from '../../app/frontend/src/composables/history/useHistoryShortcuts';

describe('useHistoryShortcuts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('selects all items when ctrl+a is pressed for large result sets', () => {
    const store = useGenerationResultsStore();
    const results = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
      prompt: `item-${index + 1}`,
      image_url: `/image-${index + 1}.png`,
      created_at: '2024-01-01T00:00:00Z',
    }));

    store.setResults(results);

    const selectedItems = ref(new Set<number>());
    const shortcuts = useHistoryShortcuts({
      isModalOpen: ref(false),
      selectedItems,
      selectableIds: computed(() => results.map((result) => result.id as number)),
      onDeleteSelected: vi.fn(),
      onClearSelection: vi.fn(),
    });

    shortcuts.handleKeydown(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));

    expect(selectedItems.value.size).toBe(results.length);
    expect(selectedItems.value.has(1)).toBe(true);
    expect(selectedItems.value.has(results.length)).toBe(true);
  });

  it('clears selection when escape is pressed without modal', () => {
    const clearSelection = vi.fn();
    const shortcuts = useHistoryShortcuts({
      isModalOpen: ref(false),
      selectedItems: ref(new Set<number>([1, 2])),
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
      selectedItems: ref(new Set<number>([1])),
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
      selectedItems: ref(new Set<number>([1, 2, 3])),
      selectableIds: computed(() => [1, 2, 3]),
      onDeleteSelected: deleteSelected,
      onClearSelection: vi.fn(),
    });

    shortcuts.handleKeydown(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(deleteSelected).toHaveBeenCalledTimes(1);
  });
});
