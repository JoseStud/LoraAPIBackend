import { computed, ref } from 'vue';
import type { Ref } from 'vue';

import type { GalleryLora, LoraGallerySortOption } from '@/types';
import { useSyncedQueryParam } from '@/composables/shared';

export function useLoraGalleryFilters(
  loras: Ref<GalleryLora[]>,
  searchTermRef?: Ref<string>
) {
  const searchTerm = searchTermRef ?? useSyncedQueryParam();
  const activeOnly = ref(false);
  const selectedTags = ref<string[]>([]);
  const sortBy = ref<LoraGallerySortOption>('name_asc');

  const filteredLoras = computed<GalleryLora[]>(() => {
    let filtered = [...loras.value];

    if (searchTerm.value) {
      const query = searchTerm.value.toLowerCase();
      filtered = filtered.filter(lora => {
        const matchesName = lora.name.toLowerCase().includes(query);
        const matchesDescription = lora.description
          ?.toLowerCase()
          .includes(query);
        const matchesTags = lora.tags?.some(tag =>
          tag.toLowerCase().includes(query)
        );

        return matchesName || matchesDescription || Boolean(matchesTags);
      });
    }

    if (activeOnly.value) {
      filtered = filtered.filter(lora => lora.active);
    }

    if (selectedTags.value.length > 0) {
      filtered = filtered.filter(lora =>
        lora.tags?.some(tag => selectedTags.value.includes(tag))
      );
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
    sortBy.value = 'name_asc';
  };

  return {
    searchTerm,
    activeOnly,
    selectedTags,
    sortBy,
    filteredLoras,
    clearFilters,
  };
}
