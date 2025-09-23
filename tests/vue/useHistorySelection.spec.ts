import { describe, it, expect } from 'vitest';

import { useHistorySelection } from '../../app/frontend/src/composables/useHistorySelection';

describe('useHistorySelection', () => {
  it('adds and removes ids from the selection set', () => {
    const selection = useHistorySelection();

    selection.onSelectionChange({ id: 1, selected: true });
    expect(selection.selectedCount.value).toBe(1);
    expect(selection.selectedSet.value.has(1)).toBe(true);

    selection.onSelectionChange({ id: 2, selected: true });
    expect(selection.selectedCount.value).toBe(2);
    expect(selection.selectedIds.value).toEqual([1, 2]);

    selection.onSelectionChange({ id: 1, selected: false });
    expect(selection.selectedCount.value).toBe(1);
    expect(selection.isSelected(1)).toBe(false);
    expect(selection.isSelected(2)).toBe(true);
  });

  it('clears and replaces selection using helpers', () => {
    const selection = useHistorySelection();

    selection.setSelection([3, 4, 5]);
    expect(selection.selectedCount.value).toBe(3);

    selection.clearSelection();
    expect(selection.selectedCount.value).toBe(0);
    expect(selection.selectedIds.value).toEqual([]);

    selection.withUpdatedSelection((next) => {
      next.add(6);
      next.add(7);
    });

    expect(selection.selectedIds.value).toEqual([6, 7]);
  });
});
