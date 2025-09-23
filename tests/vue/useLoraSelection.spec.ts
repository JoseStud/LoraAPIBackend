import { describe, it, expect } from 'vitest';

import { useLoraSelection } from '../../app/frontend/src/composables/useLoraSelection';

describe('useLoraSelection', () => {
  it('adds and removes ids using payload helper', () => {
    const selection = useLoraSelection();

    selection.onSelectionChange({ id: 'lora-1', selected: true });
    expect(selection.selectedCount.value).toBe(1);
    expect(selection.isSelected('lora-1')).toBe(true);

    selection.onSelectionChange({ id: 'lora-2', selected: true });
    expect(selection.selectedIds.value).toEqual(['lora-1', 'lora-2']);

    selection.onSelectionChange({ id: 'lora-1', selected: false });
    expect(selection.selectedCount.value).toBe(1);
    expect(selection.isSelected('lora-1')).toBe(false);
    expect(selection.isSelected('lora-2')).toBe(true);
  });

  it('supports toggle, clear, and bulk updates', () => {
    const selection = useLoraSelection();

    selection.toggleSelection('a');
    selection.toggleSelection('b');
    expect(selection.selectedIds.value).toEqual(['a', 'b']);

    selection.toggleSelection('a');
    expect(selection.selectedIds.value).toEqual(['b']);

    selection.setSelection(['x', 'y', 'z']);
    expect(selection.selectedIds.value).toEqual(['x', 'y', 'z']);

    selection.clearSelection();
    expect(selection.selectedCount.value).toBe(0);

    selection.withUpdatedSelection((next) => {
      next.add('1');
      next.add('2');
      next.delete('1');
    });

    expect(selection.selectedIds.value).toEqual(['2']);
  });
});
