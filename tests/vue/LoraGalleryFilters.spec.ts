import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import LoraGalleryFilters from '@/features/lora/components/lora-gallery/LoraGalleryFilters.vue';

const baseProps = {
  searchTerm: 'gojo',
  activeOnly: false,
  sortBy: 'name_asc' as const,
  facetOptions: {
    'hair-color': [
      { value: 'black', count: 3 },
      { value: 'blond', count: 0 },
      { value: 'white/silver', count: 0 },
    ],
  },
  selectedFacets: { 'hair-color': ['white/silver'] },
};

const stubMatchMedia = (matches: boolean) => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
};

describe('LoraGalleryFilters', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables chips that would leave no results, unless already selected', () => {
    stubMatchMedia(true);
    const wrapper = mount(LoraGalleryFilters, { props: baseProps });

    const chip = (facet: string) => wrapper.find(`[data-facet="${facet}"]`);
    expect(chip('hair-color:black').attributes('disabled')).toBeUndefined();
    expect(chip('hair-color:blond').attributes('disabled')).toBeDefined();
    // a selected value stays clickable so it can be turned off
    expect(chip('hair-color:white/silver').attributes('disabled')).toBeUndefined();
    expect(chip('hair-color:white/silver').attributes('aria-pressed')).toBe('true');
  });

  it('opens the appearance panel on wide screens', () => {
    stubMatchMedia(true);
    const wrapper = mount(LoraGalleryFilters, { props: baseProps });

    expect((wrapper.find('[data-testid="facet-panel"]').element as HTMLDetailsElement).open).toBe(true);
  });

  it('starts the appearance panel collapsed on a phone', async () => {
    stubMatchMedia(false);
    const wrapper = mount(LoraGalleryFilters, { props: baseProps });
    const panel = wrapper.find('[data-testid="facet-panel"]');

    expect((panel.element as HTMLDetailsElement).open).toBe(false);
    // the selection count still shows on the collapsed summary
    expect(panel.find('summary').text()).toContain('1 selected');

    (panel.element as HTMLDetailsElement).open = true;
    await panel.trigger('toggle');
    await wrapper.setProps({ searchTerm: 'gojo satoru' });
    expect((panel.element as HTMLDetailsElement).open).toBe(true);
  });

  it('labels the clear-search button', async () => {
    stubMatchMedia(true);
    const wrapper = mount(LoraGalleryFilters, { props: baseProps });

    const clear = wrapper.find('button[aria-label="Clear search"]');
    expect(clear.exists()).toBe(true);
    await clear.trigger('click');
    expect(wrapper.emitted('update:search-term')).toEqual([['']]);
  });
});
