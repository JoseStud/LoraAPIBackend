import { computed, ref } from 'vue';
import type { Ref } from 'vue';

import type { GalleryLora, LoraGallerySortOption } from '@/types';
import { useSyncedQueryParam } from '@/composables/shared';
import {
  FACET_KEYS,
  getLoraLibraryMeta,
  type FacetKey,
  type LoraLibraryMeta,
} from '../../utils/libraryMeta';

export type FacetSelection = Partial<Record<FacetKey, string[]>>;
export interface FacetOption {
  value: string;
  count: number;
}

const sortedUnique = (values: Array<string | null>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b),
  );

export function useLoraGalleryFilters(
  loras: Ref<GalleryLora[]>,
  searchTermRef?: Ref<string>
) {
  const searchTerm = searchTermRef ?? useSyncedQueryParam();
  const activeOnly = ref(false);
  const selectedFacets = ref<FacetSelection>({});
  const selectedArchetype = ref('');
  const selectedSeries = ref('');
  const sortBy = ref<LoraGallerySortOption>('name_asc');

  const metaById = computed(() => {
    const map = new Map<string, LoraLibraryMeta>();
    for (const lora of loras.value) {
      map.set(lora.id, getLoraLibraryMeta(lora));
    }
    return map;
  });

  const metaFor = (lora: GalleryLora): LoraLibraryMeta =>
    metaById.value.get(lora.id) ?? getLoraLibraryMeta(lora);

  const availableArchetypes = computed(() =>
    sortedUnique(loras.value.map((lora) => metaFor(lora).archetype)),
  );
  const availableSeries = computed(() =>
    sortedUnique(loras.value.map((lora) => metaFor(lora).series)),
  );

  const matchesSearch = (lora: GalleryLora, query: string): boolean => {
    const meta = metaFor(lora);
    return (
      lora.name.toLowerCase().includes(query)
      || Boolean(lora.description?.toLowerCase().includes(query))
      || Boolean(lora.tags?.some((tag: string) => tag.toLowerCase().includes(query)))
      || meta.triggers.some((trigger) => trigger.toLowerCase().includes(query))
      || Boolean(meta.series?.toLowerCase().includes(query))
    );
  };

  /** LoRAs passing every filter except the appearance facets. */
  const baseFiltered = computed<GalleryLora[]>(() => {
    const query = searchTerm.value.toLowerCase();
    return loras.value.filter((lora) => {
      if (query && !matchesSearch(lora, query)) {
        return false;
      }
      if (activeOnly.value && !lora.active) {
        return false;
      }
      const meta = metaFor(lora);
      if (selectedArchetype.value && meta.archetype !== selectedArchetype.value) {
        return false;
      }
      return !selectedSeries.value || meta.series === selectedSeries.value;
    });
  });

  // Any selected value within a facet; every facet with a selection.
  const matchesFacets = (lora: GalleryLora, skip?: FacetKey): boolean =>
    FACET_KEYS.every((key) => {
      const wanted = selectedFacets.value[key] ?? [];
      return (
        key === skip
        || wanted.length === 0
        || (metaFor(lora).facets[key] ?? []).some((value) => wanted.includes(value))
      );
    });

  /**
   * Facet values present in the catalog, most common first. ``count`` is how
   * many LoRAs the gallery would show if the value were added to the current
   * filters (other facets' selections apply, this facet's own do not), so a
   * zero means picking it leads nowhere. Order follows catalog-wide frequency
   * so chips don't jump around while filtering.
   */
  const facetOptions = computed(() => {
    const options = {} as Record<FacetKey, FacetOption[]>;
    for (const key of FACET_KEYS) {
      const totals = new Map<string, number>();
      for (const lora of loras.value) {
        for (const value of metaFor(lora).facets[key] ?? []) {
          totals.set(value, (totals.get(value) ?? 0) + 1);
        }
      }
      const counts = new Map<string, number>();
      for (const lora of baseFiltered.value) {
        if (!matchesFacets(lora, key)) {
          continue;
        }
        for (const value of metaFor(lora).facets[key] ?? []) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      options[key] = Array.from(totals, ([value, total]) => ({ value, total }))
        .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value))
        .map(({ value }) => ({ value, count: counts.get(value) ?? 0 }));
    }
    return options;
  });

  const toggleFacet = (key: FacetKey, value: string) => {
    const current = selectedFacets.value[key] ?? [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    selectedFacets.value = { ...selectedFacets.value, [key]: next };
  };

  const filteredLoras = computed<GalleryLora[]>(() => {
    const filtered = baseFiltered.value.filter((lora) => matchesFacets(lora));

    filtered.sort((a, b) => {
      switch (sortBy.value) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'created_at_desc':
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case 'created_at_asc':
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case 'last_updated_desc': {
          const bDate = new Date(b.last_updated ?? b.updated_at ?? b.created_at);
          const aDate = new Date(a.last_updated ?? a.updated_at ?? a.created_at);
          return bDate.getTime() - aDate.getTime();
        }
        default:
          return 0;
      }
    });

    return filtered;
  });

  const clearFilters = () => {
    searchTerm.value = '';
    activeOnly.value = false;
    selectedArchetype.value = '';
    selectedSeries.value = '';
    selectedFacets.value = {};
    sortBy.value = 'name_asc';
  };

  return {
    searchTerm,
    activeOnly,
    selectedArchetype,
    selectedSeries,
    availableArchetypes,
    availableSeries,
    selectedFacets,
    facetOptions,
    toggleFacet,
    sortBy,
    filteredLoras,
    clearFilters,
  };
}
