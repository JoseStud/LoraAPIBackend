import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import { useLoraGalleryFilters } from '@/features/lora/composables/lora-gallery/useLoraGalleryFilters';
import type { GalleryLora } from '@/types';
import { createAdapterFixture } from '../fixtures/adapters';

const make = (id: string, name: string, tags: string[], trained_words: string[] = []) =>
  createAdapterFixture({ id, name, tags, trained_words, triggers: [] }) as unknown as GalleryLora;

const loras = ref<GalleryLora[]>([
  make('1', 'Naruto', ['archetype:Spiky-Hothead', 'series:Naruto', 'hair-color:blond', 'build:slim', 'outfit:hero suit'], ['naruto_uzumaki']),
  make('2', 'Sasuke', ['archetype:Cool-Sharp-Rival', 'series:Naruto', 'hair-color:black', 'build:slim', 'outfit:robe/kimono'], ['sasuke_uchiha']),
  make('3', 'Killua', ['archetype:Cool-Sharp-Rival', 'series:Hunter x Hunter', 'hair-color:white/silver', 'build:slim', 'outfit:casual'], ['killua_zoldyck']),
  make('4', 'Untagged', []),
]);

describe('useLoraGalleryFilters library filters', () => {
  it('lists the archetypes and series present in the catalog', () => {
    const filters = useLoraGalleryFilters(loras, ref(''));

    expect(filters.availableArchetypes.value).toEqual(['Cool-Sharp-Rival', 'Spiky-Hothead']);
    expect(filters.availableSeries.value).toEqual(['Hunter x Hunter', 'Naruto']);
  });

  it('filters by archetype and series together', () => {
    const filters = useLoraGalleryFilters(loras, ref(''));

    filters.selectedArchetype.value = 'Cool-Sharp-Rival';
    expect(filters.filteredLoras.value.map((l) => l.name)).toEqual(['Killua', 'Sasuke']);

    filters.selectedSeries.value = 'Naruto';
    expect(filters.filteredLoras.value.map((l) => l.name)).toEqual(['Sasuke']);

    filters.clearFilters();
    expect(filters.selectedArchetype.value).toBe('');
    expect(filters.selectedSeries.value).toBe('');
    expect(filters.filteredLoras.value).toHaveLength(4);
  });

  it('finds LoRAs by trigger word and series in the search box', () => {
    const search = ref('zoldyck');
    const filters = useLoraGalleryFilters(loras, search);
    expect(filters.filteredLoras.value.map((l) => l.name)).toEqual(['Killua']);

    search.value = 'hunter x';
    expect(filters.filteredLoras.value.map((l) => l.name)).toEqual(['Killua']);
  });

  it('counts facet values, most common first', () => {
    const filters = useLoraGalleryFilters(loras, ref(''));

    expect(filters.facetOptions.value.build).toEqual([{ value: 'slim', count: 3 }]);
    expect(filters.facetOptions.value['hair-color'].map((o) => o.value)).toEqual([
      'black',
      'blond',
      'white/silver',
    ]);
    expect(filters.facetOptions.value['hair-style']).toEqual([]);
  });

  it('matches any value within a facet and every selected facet', () => {
    const filters = useLoraGalleryFilters(loras, ref(''));

    filters.toggleFacet('hair-color', 'black');
    filters.toggleFacet('hair-color', 'white/silver');
    expect(filters.filteredLoras.value.map((l) => l.name)).toEqual(['Killua', 'Sasuke']);

    filters.toggleFacet('outfit', 'casual');
    expect(filters.filteredLoras.value.map((l) => l.name)).toEqual(['Killua']);

    // toggling again removes the value
    filters.toggleFacet('outfit', 'casual');
    expect(filters.filteredLoras.value).toHaveLength(2);

    filters.clearFilters();
    expect(filters.selectedFacets.value).toEqual({});
  });

  it('counts facet values within the other active filters', () => {
    const search = ref('');
    const filters = useLoraGalleryFilters(loras, search);

    filters.selectedSeries.value = 'Naruto';
    const hair = filters.facetOptions.value['hair-color'];
    // every catalog value stays listed, in catalog order, with in-context counts
    expect(hair).toEqual([
      { value: 'black', count: 1 },
      { value: 'blond', count: 1 },
      { value: 'white/silver', count: 0 },
    ]);

    // a facet's own selection doesn't shrink its counts; other facets do
    filters.toggleFacet('hair-color', 'black');
    expect(filters.facetOptions.value['hair-color'].map((o) => o.count)).toEqual([1, 1, 0]);
    expect(filters.facetOptions.value.outfit).toEqual([
      { value: 'casual', count: 0 },
      { value: 'hero suit', count: 0 },
      { value: 'robe/kimono', count: 1 },
    ]);

    search.value = 'zoldyck';
    expect(filters.facetOptions.value.build).toEqual([{ value: 'slim', count: 0 }]);
  });
});
