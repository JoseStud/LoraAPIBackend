import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { useAdapterListApi } from '@/composables/shared';

import type { AdapterListQuery, AdapterSummary, LoraListItem } from '@/types';

const DEFAULT_QUERY: AdapterListQuery = { page: 1, perPage: 200 };

const toSummary = (item: LoraListItem): AdapterSummary => ({
  id: item.id,
  name: item.name,
  description: item.description,
  active: item.active ?? true,
});

const hasQueryChanged = (current: AdapterListQuery, next: AdapterListQuery): boolean =>
  Object.entries(next).some(([key, value]) => {
    if (value == null) {
      return false;
    }
    const typedKey = key as keyof AdapterListQuery;
    return current[typedKey] !== value;
  });

export const useAdapterCatalogStore = defineStore('adapterCatalog', () => {
  const pendingFetch = ref<Promise<AdapterSummary[]> | null>(null);
  const lastFetchedAt = ref<number | null>(null);

  const api = useAdapterListApi({ ...DEFAULT_QUERY });

  const query = api.query;
  const adapters = computed<AdapterSummary[]>(() => api.adapters.value.map(toSummary));
  const error = api.error;
  const isLoading = api.isLoading;

  const runFetch = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> => {
    if (pendingFetch.value) {
      return pendingFetch.value;
    }

    const request = (async () => {
      try {
        await api.fetchData(overrides);
        lastFetchedAt.value = Date.now();
      } finally {
        pendingFetch.value = null;
      }

      return adapters.value;
    })();

    pendingFetch.value = request;
    return request;
  };

  const ensureLoaded = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> => {
    if (pendingFetch.value) {
      await pendingFetch.value;
      return adapters.value;
    }

    const shouldReload = lastFetchedAt.value == null || hasQueryChanged(query, overrides);

    if (!shouldReload) {
      return adapters.value;
    }

    await runFetch(overrides);
    return adapters.value;
  };

  const refresh = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> => {
    await runFetch(overrides);
    return adapters.value;
  };

  const reset = () => {
    pendingFetch.value = null;
    lastFetchedAt.value = null;
    api.data.value = null;
    api.error.value = null;
    api.isLoading.value = false;
  };

  return {
    adapters,
    error,
    isLoading,
    query,
    lastFetchedAt,
    ensureLoaded,
    refresh,
    reset,
  };
});

export type AdapterCatalogStore = ReturnType<typeof useAdapterCatalogStore>;
