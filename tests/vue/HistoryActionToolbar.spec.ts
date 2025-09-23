import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import HistoryActionToolbar from '../../app/frontend/src/components/HistoryActionToolbar.vue';

describe('HistoryActionToolbar', () => {
  it('emits update:viewMode when toggling view mode', async () => {
    const wrapper = mount(HistoryActionToolbar, {
      props: {
        viewMode: 'grid',
        sortBy: 'created_at',
        selectedCount: 0,
      },
    });

    await wrapper.findAll('button')[1].trigger('click');

    expect(wrapper.emitted()['update:viewMode']).toBeTruthy();
    expect(wrapper.emitted()['update:viewMode']?.[0]).toEqual(['list']);
  });

  it('emits sort updates and sort-change when selection changes', async () => {
    const wrapper = mount(HistoryActionToolbar, {
      props: {
        viewMode: 'grid',
        sortBy: 'created_at',
        selectedCount: 0,
      },
    });

    const select = wrapper.find('select');
    await select.setValue('prompt');

    expect(wrapper.emitted()['update:sortBy']).toBeTruthy();
    expect(wrapper.emitted()['update:sortBy']?.[0]).toEqual(['prompt']);
    expect(wrapper.emitted()['sort-change']).toBeTruthy();

    await select.setValue('prompt');
    expect(wrapper.emitted()['sort-change']).toHaveLength(2);
  });

  it('emits delete-selected when delete button is pressed', async () => {
    const wrapper = mount(HistoryActionToolbar, {
      props: {
        viewMode: 'grid',
        sortBy: 'created_at',
        selectedCount: 3,
      },
    });

    const deleteButton = wrapper.findAll('button').at(-1);
    await deleteButton?.trigger('click');

    expect(wrapper.emitted()['delete-selected']).toBeTruthy();
  });
});
