import { computed, ref } from 'vue';
import type { Ref } from 'vue';

import type { GalleryLora, LoraGallerySortOption } from '@/types';
import { useSyncedQueryParam } from '@/composables/shared';
import { getLoraLibraryMeta, type LoraLibraryMeta } from '../../utils/libraryMeta';

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
  const selectedTags = ref<string[]>([]);
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

    if (selectedTags.value.length > 0) {
      filtered = filtered.filter((lora: GalleryLora) =>
        lora.tags?.some((tag: string) => selectedTags.value.includes(tag))
      );
    }

    if (selectedArchetype.value) {
      filtered = filtered.filter((lora) => metaFor(lora).archetype === selectedArchetype.value);
    }

    if (selectedSeries.value) {
      filtered = filtered.filter((lora) => metaFor(lora).series === selectedSeries.value);
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
    selectedTags.value = [];
    selectedArchetype.value = '';
    selectedSeries.value = '';
    sortBy.value = 'name_asc';
  };

  return {
    searchTerm,
    activeOnly,
    selectedTags,
    selectedArchetype,
    selectedSeries,
    availableArchetypes,
    availableSeries,
    sortBy,
    filteredLoras,
    clearFilters,
  };
}
