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

  /** Facet values present in the catalog, most common first. */
  const facetOptions = computed(() => {
    const options = {} as Record<FacetKey, FacetOption[]>;
    for (const key of FACET_KEYS) {
      const counts = new Map<string, number>();
      for (const lora of loras.value) {
        for (const value of metaFor(lora).facets[key] ?? []) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      options[key] = Array.from(counts, ([value, count]) => ({ value, count })).sort(
        (a, b) => b.count - a.count || a.value.localeCompare(b.value),
      );
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
    let filtered = [...loras.value];

    if (searchTerm.value) {
      const query = searchTerm.value.toLowerCase();
      filtered = filtered.filter((lora: GalleryLora) => {
        const meta = metaFor(lora);
        const matchesName = lora.name.toLowerCase().includes(query);
        const matchesDescription = lora.description
          ?.toLowerCase()
          .includes(query);
        const matchesTags = lora.tags?.some((tag: string) =>
          tag.toLowerCase().includes(query)
        );
        const matchesTriggers = meta.triggers.some((trigger) =>
          trigger.toLowerCase().includes(query)
        );
        const matchesSeries = meta.series?.toLowerCase().includes(query);

        return (
          matchesName
          || matchesDescription
          || Boolean(matchesTags)
          || matchesTriggers
          || Boolean(matchesSeries)
        );
      });
    }

    if (activeOnly.value) {
      filtered = filtered.filter(lora => lora.active);
    }

    if (selectedArchetype.value) {
      filtered = filtered.filter((lora) => metaFor(lora).archetype === selectedArchetype.value);
    }

    if (selectedSeries.value) {
      filtered = filtered.filter((lora) => metaFor(lora).series === selectedSeries.value);
    }

    // Any selected value within a facet; every facet with a selection.
    for (const key of FACET_KEYS) {
      const wanted = selectedFacets.value[key] ?? [];
      if (wanted.length > 0) {
        filtered = filtered.filter((lora) =>
          (metaFor(lora).facets[key] ?? []).some((value) => wanted.includes(value)),
        );
      }
    }

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
