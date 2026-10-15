import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import {
  filtersFromQuery,
  filtersToQuery,
  useLoraGalleryRouteSync,
} from '@/features/lora/composables/lora-gallery/useLoraGalleryRouteSync';
import type { FacetSelection } from '@/features/lora/composables/lora-gallery/useLoraGalleryFilters';
import type { LoraGallerySortOption } from '@/types';

const makeFilters = () => ({
  searchTerm: ref(''),
  activeOnly: ref(false),
  selectedArchetype: ref(''),
  selectedSeries: ref(''),
  sortBy: ref<LoraGallerySortOption>('name_asc'),
  selectedFacets: ref<FacetSelection>({}),
});

const setup = async (initialUrl: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/loras', component: { render: () => null } },
      { path: '/loras/:id', component: { render: () => null } },
    ],
  });
  await router.push(initialUrl);
  await router.isReady();

  const filters = makeFilters();
  const Host = defineComponent({
    setup() {
      useLoraGalleryRouteSync(filters);
      return () => h('div');
    },
  });
  mount(Host, { global: { plugins: [router] } });
  await flushPromises();
  return { router, filters };
};

describe('gallery filter query encoding', () => {
  it('round-trips every filter and leaves defaults out', () => {
    const state = {
      search: 'gojo',
      activeOnly: true,
      archetype: 'Cool-Sharp-Rival',
      series: 'Jujutsu Kaisen',
      sortBy: 'created_at_desc' as const,
      facets: { 'hair-color': ['white/silver', 'black'], outfit: ['school uniform'] },
    };

    const query = filtersToQuery(state);
    expect(query).toEqual({
      q: 'gojo',
      active: '1',
      archetype: 'Cool-Sharp-Rival',
      series: 'Jujutsu Kaisen',
      sort: 'created_at_desc',
      'hair-color': ['white/silver', 'black'],
      outfit: ['school uniform'],
    });
    expect(filtersFromQuery(query as never)).toEqual(state);

    expect(
      filtersToQuery({ ...state, search: '', activeOnly: false, archetype: '', series: '', sortBy: 'name_asc', facets: {} }),
    ).toEqual({});
  });

  it('ignores an unknown sort and empty facet values', () => {
    const state = filtersFromQuery({ sort: 'nonsense', build: ['', 'slim', 'slim'] });

    expect(state.sortBy).toBe('name_asc');
    expect(state.facets).toEqual({ build: ['slim'] });
  });
});

describe('useLoraGalleryRouteSync', () => {
  it('restores filters from the URL on load', async () => {
    const { filters } = await setup('/loras?q=naruto&hair-style=spiky&hair-style=short&series=Naruto');

    expect(filters.searchTerm.value).toBe('naruto');
    expect(filters.selectedSeries.value).toBe('Naruto');
    expect(filters.selectedFacets.value).toEqual({ 'hair-style': ['spiky', 'short'] });
  });

  it('writes filter changes to the URL and keeps unrelated params', async () => {
    const { router, filters } = await setup('/loras?ref=dashboard');

    filters.searchTerm.value = 'gojo';
    filters.selectedFacets.value = { build: ['tall'] };
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/loras?ref=dashboard&q=gojo&build=tall');
  });

  it('clears every filter param when all filters reset in one tick', async () => {
    const { router, filters } = await setup('/loras?q=a&archetype=X&series=Y&active=1&build=slim&ref=keep');

    // What "Clear Filters" does: separate per-key writers would race here.
    filters.searchTerm.value = '';
    filters.activeOnly.value = false;
    filters.selectedArchetype.value = '';
    filters.selectedSeries.value = '';
    filters.selectedFacets.value = {};
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ ref: 'keep' });
  });

  it('follows back navigation to an earlier filter state', async () => {
    const { router, filters } = await setup('/loras?q=first');

    await router.push('/loras?q=second&outfit=casual');
    await flushPromises();
    expect(filters.selectedFacets.value).toEqual({ outfit: ['casual'] });

    router.back();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    expect(filters.searchTerm.value).toBe('first');
    expect(filters.selectedFacets.value).toEqual({});
  });

  it('does not touch the URL of another page', async () => {
    const { router, filters } = await setup('/loras?q=gojo');

    await router.push('/loras/abc');
    filters.searchTerm.value = 'changed after leaving';
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/loras/abc');
  });
});
