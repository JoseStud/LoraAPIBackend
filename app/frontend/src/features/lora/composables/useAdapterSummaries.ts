import { computed, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';

import { useAdapterCatalogStore } from '../stores/adapterCatalog';
import type { AdapterListQuery, AdapterSummary } from '@/types';

export interface AdapterSummaryCatalog {
  summaries: ComputedRef<AdapterSummary[]>;
  error: ComputedRef<unknown>;
  isLoading: ComputedRef<boolean>;
  ensureLoaded: (overrides?: AdapterListQuery) => Promise<AdapterSummary[]>;
  refresh: (overrides?: AdapterListQuery) => Promise<AdapterSummary[]>;
}

export const useAdapterSummaries = (): AdapterSummaryCatalog => {
  const catalogStore = useAdapterCatalogStore();
  const { adapters, error, isLoading } = storeToRefs(catalogStore);

  return {
    summaries: computed(() => adapters.value ?? []),
    error: computed(() => error.value),
    isLoading: computed(() => Boolean(isLoading.value)),
    ensureLoaded: catalogStore.ensureLoaded,
    refresh: catalogStore.refresh,
  };
};
