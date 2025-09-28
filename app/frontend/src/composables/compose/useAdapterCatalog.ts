import { computed, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';

import { useAdapterListApi } from '@/composables/shared';

import type { AdapterSummary, LoraListItem } from '@/types';

type AdapterCatalogQuery = {
  page?: number;
  perPage?: number;
};

export interface AdapterCatalogState {
  searchTerm: Ref<string>;
  activeOnly: Ref<boolean>;
  adapters: ComputedRef<AdapterSummary[]>;
  filteredAdapters: ComputedRef<AdapterSummary[]>;
  isLoading: Ref<boolean>;
  error: Ref<unknown>;
}

export interface AdapterCatalogActions {
  setSearchTerm: (value: string) => void;
  setActiveOnly: (value: boolean) => void;
  refresh: () => Promise<void>;
}

export type AdapterCatalogApi = AdapterCatalogState & AdapterCatalogActions;

const toSummary = (item: LoraListItem): AdapterSummary => ({
  id: item.id,
  name: item.name,
  description: item.description,
  active: item.active ?? true,
});

export const useAdapterCatalog = (query: AdapterCatalogQuery = {}): AdapterCatalogApi => {
  const searchTerm = ref('');
  const activeOnly = ref(false);
  const summaries = ref<AdapterSummary[]>([]);

  const { adapters, error, isLoading, fetchData } = useAdapterListApi({
    page: query.page ?? 1,
    perPage: query.perPage ?? 200,
  });

  const refresh = async () => {
    await fetchData();
  };

  const items = computed<AdapterSummary[]>(() => summaries.value);

  const filteredAdapters = computed<AdapterSummary[]>(() => {
    const term = searchTerm.value.trim().toLowerCase();
    let result = items.value;

    if (activeOnly.value) {
      result = result.filter((item) => item.active);
    }

    if (term) {
      result = result.filter((item) => item.name.toLowerCase().includes(term));
    }

    return result;
  });

  watch(
    adapters,
    (next) => {
      const payload = Array.isArray(next) ? next : [];
      summaries.value = payload.map(toSummary);
    },
    { immediate: true },
  );

  onMounted(async () => {
    await refresh();
  });

  const setSearchTerm = (value: string) => {
    searchTerm.value = value;
  };

  const setActiveOnly = (value: boolean) => {
    activeOnly.value = value;
  };

  return {
    searchTerm,
    activeOnly,
    adapters: items,
    filteredAdapters,
    isLoading,
    error,
    setSearchTerm,
    setActiveOnly,
    refresh,
  };
};
