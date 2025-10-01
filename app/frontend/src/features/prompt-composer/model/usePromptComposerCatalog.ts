import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useAdapterCatalogStore } from '@/features/lora/public';

import type { AdapterSummary } from '@/types';

type AdapterCatalogQuery = {
  page?: number;
  perPage?: number;
};

export interface PromptComposerCatalogState {
  searchTerm: Ref<string>;
  activeOnly: Ref<boolean>;
  adapters: ComputedRef<AdapterSummary[]>;
  filteredAdapters: ComputedRef<AdapterSummary[]>;
  isLoading: Ref<boolean>;
  error: Ref<unknown>;
}

export interface PromptComposerCatalogActions {
  setSearchTerm: (value: string) => void;
  setActiveOnly: (value: boolean) => void;
  refresh: () => Promise<void>;
}

export type PromptComposerCatalogApi = PromptComposerCatalogState & PromptComposerCatalogActions;

export const usePromptComposerCatalog = (
  query: AdapterCatalogQuery = {},
): PromptComposerCatalogApi => {
  const searchTerm = ref('');
  const activeOnly = ref(false);

  const store = useAdapterCatalogStore();
  const { adapters: storeAdapters, error, isLoading } = storeToRefs(store);

  void store.ensureLoaded({
    page: query.page ?? store.query.page,
    perPage: query.perPage ?? store.query.perPage,
  });

  const adapters = computed<AdapterSummary[]>(() => storeAdapters.value);

  const filteredAdapters = computed<AdapterSummary[]>(() => {
    const term = searchTerm.value.trim().toLowerCase();
    let result = adapters.value;

    if (activeOnly.value) {
      result = result.filter((item) => item.active);
    }

    if (term) {
      result = result.filter((item) => item.name.toLowerCase().includes(term));
    }

    return result;
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
    adapters,
    filteredAdapters,
    isLoading,
    error,
    setSearchTerm,
    setActiveOnly,
    refresh: async () => {
      await store.refresh({
        page: query.page ?? store.query.page,
        perPage: query.perPage ?? store.query.perPage,
      });
    },
  };
};
