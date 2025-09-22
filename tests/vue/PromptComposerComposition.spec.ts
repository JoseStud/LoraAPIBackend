import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import PromptComposerComposition from '../../app/frontend/src/components/PromptComposerComposition.vue';

describe('PromptComposerComposition', () => {
  const items = [
    { id: '1', name: 'Alpha', weight: 1 },
    { id: '2', name: 'Beta', weight: 0.5 },
  ];

  it('emits events for entry controls', async () => {
    const wrapper = mount(PromptComposerComposition, { props: { items } });

    const weight = wrapper.find('[data-testid="weight-slider"]');
    await weight.setValue('1.25');
    expect(wrapper.emitted('update-weight')?.[0]).toEqual([{ index: 0, weight: 1.25 }]);

    const moveDown = wrapper.find('[data-testid="move-down"]');
    await moveDown.trigger('click');
    expect(wrapper.emitted('move-down')?.[0]).toEqual([0]);

    const remove = wrapper.find('[data-testid="remove-entry"]');
    await remove.trigger('click');
    expect(wrapper.emitted('remove')?.[0]).toEqual([0]);
  });

  it('emits quick action events', async () => {
    const wrapper = mount(PromptComposerComposition, { props: { items } });

    const actions = wrapper.findAll('button.btn.btn-secondary.btn-sm');
    await actions[0].trigger('click');
    await actions[1].trigger('click');

    expect(wrapper.emitted('balance')).toBeTruthy();
    expect(wrapper.emitted('duplicate')).toBeTruthy();
  });

  it('shows placeholder when no items exist', () => {
    const wrapper = mount(PromptComposerComposition, { props: { items: [] } });
    expect(wrapper.text()).toContain('No LoRAs in composition');
  });
});

