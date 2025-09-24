import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import PromptComposerAvailableList from '../../app/frontend/src/components/compose/PromptComposerAvailableList.vue';

describe('PromptComposerAvailableList', () => {
  const baseProps = {
    loras: [
      { id: '1', name: 'Alpha', description: 'First', active: true },
      { id: '2', name: 'Beta', description: 'Second', active: false },
    ],
    searchTerm: '',
    activeOnly: false,
    isLoading: false,
    error: null,
    isInComposition: vi.fn(() => false),
  };

  it('emits search and toggle events', async () => {
    const wrapper = mount(PromptComposerAvailableList, { props: baseProps });

    const search = wrapper.find('input[placeholder="Search LoRAs..."]');
    await search.setValue('beta');
    expect(wrapper.emitted('update:searchTerm')?.[0]).toEqual(['beta']);

    const toggle = wrapper.find('input[type="checkbox"]');
    await toggle.setValue(true);
    expect(wrapper.emitted('update:activeOnly')?.[0]).toEqual([true]);
  });

  it('emits select when a lora is clicked', async () => {
    const wrapper = mount(PromptComposerAvailableList, { props: baseProps });

    const first = wrapper.find('[data-testid="lora-list"] button');
    await first.trigger('click');

    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ id: '1', name: 'Alpha' });
  });

  it('shows loading and error states', () => {
    const wrapper = mount(PromptComposerAvailableList, {
      props: {
        ...baseProps,
        loras: [],
        isLoading: true,
        error: 'boom',
      },
    });

    expect(wrapper.text()).toContain('Loading…');
    expect(wrapper.text()).toContain('Failed to load LoRAs');
  });

  it('marks entries already in composition', () => {
    const wrapper = mount(PromptComposerAvailableList, {
      props: {
        ...baseProps,
        isInComposition: vi.fn((id: string) => id === '1'),
      },
    });

    const first = wrapper.find('[data-testid="lora-list"] button');
    expect(first.classes()).toContain('opacity-50');
  });
});

