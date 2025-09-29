import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { useAdapterListApi } from '@/composables/shared';
import { fetchAdapterTags, performBulkLoraAction } from '@/services/lora/loraService';
import { useBackendBase } from '@/utils/backend';

import type {
  AdapterListQuery,
  AdapterSummary,
  GalleryLora,
  LoraBulkAction,
  LoraListItem,
  LoraUpdatePayload,
} from '@/types';

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
  const pendingTagFetch = ref<Promise<string[]> | null>(null);
  const isInitialized = ref(false);
  const availableTags = ref<string[]>([]);
  const tagError = ref<unknown>(null);

  const api = useAdapterListApi({ ...DEFAULT_QUERY });
  const backendBase = useBackendBase();

  const query = api.query;
  const loras = computed<GalleryLora[]>(() => api.adapters.value as GalleryLora[]);
  const adapters = computed<AdapterSummary[]>(() => loras.value.map(toSummary));
  const error = api.error;
  const isLoading = api.isLoading;
  const areTagsLoading = computed(() => pendingTagFetch.value !== null);

  const updateListData = (mutator: (draft: GalleryLora[]) => boolean): boolean => {
    const payload = api.data.value;
    if (!payload) {
      return false;
    }

    if (Array.isArray(payload)) {
      const draft = [...(payload as GalleryLora[])];
      const changed = mutator(draft);
      if (!changed) {
        return false;
      }
      api.data.value = draft as typeof payload;
      return true;
    }

    const items = Array.isArray(payload.items) ? [...(payload.items as GalleryLora[])] : [];
    const changed = mutator(items);
    if (!changed) {
      return false;
    }
    api.data.value = { ...payload, items } as typeof payload;
    return true;
  };

  const applyLoraUpdate = (payload: LoraUpdatePayload): boolean => {
    const { id, type } = payload;
    if (!id) {
      return false;
    }

    if (type === 'weight' && payload.weight !== undefined) {
      return updateListData((draft) => {
        const index = draft.findIndex((item) => item.id === id);
        if (index === -1) {
          return false;
        }
        draft[index] = { ...draft[index], weight: payload.weight };
        return true;
      });
    }

    if (type === 'active' && payload.active !== undefined) {
      return updateListData((draft) => {
        const index = draft.findIndex((item) => item.id === id);
        if (index === -1) {
          return false;
        }
        draft[index] = { ...draft[index], active: payload.active };
        return true;
      });
    }

    return false;
  };

  const removeLora = (id: string): boolean =>
    updateListData((draft) => {
      const index = draft.findIndex((item) => item.id === id);
      if (index === -1) {
        return false;
      }
      draft.splice(index, 1);
      return true;
    });

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

  const loadLoras = async (overrides: AdapterListQuery = {}): Promise<GalleryLora[]> => {
    await ensureLoaded(overrides);
    return loras.value;
  };

  const refresh = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> => {
    await runFetch(overrides);
    return adapters.value;
  };

  const fetchTags = async (): Promise<string[]> => {
    if (pendingTagFetch.value) {
      return pendingTagFetch.value;
    }

    const request = (async () => {
      try {
        const tags = await fetchAdapterTags(backendBase.value);
        availableTags.value = tags;
        tagError.value = null;
        return tags;
      } catch (err) {
        console.error('Error fetching adapter tags:', err);
        availableTags.value = [];
        tagError.value = err;
        return [];
      } finally {
        pendingTagFetch.value = null;
      }
    })();

    pendingTagFetch.value = request;
    return request;
  };

  const initialize = async (overrides: AdapterListQuery = {}): Promise<void> => {
    try {
      await Promise.all([
        ensureLoaded(overrides).catch(() => adapters.value),
        fetchTags(),
      ]);
    } finally {
      isInitialized.value = true;
    }
  };

  const performBulkAction = async (action: LoraBulkAction, loraIds: string[]): Promise<void> => {
    if (!loraIds.length) {
      return;
    }

    await performBulkLoraAction(backendBase.value, {
      action,
      lora_ids: loraIds,
    });

    await refresh();
    await fetchTags();
  };

  const reset = () => {
    api.cancelActiveRequest();
    pendingFetch.value = null;
    lastFetchedAt.value = null;
    pendingTagFetch.value = null;
    isInitialized.value = false;
    api.data.value = null;
    api.error.value = null;
    api.isLoading.value = false;
    availableTags.value = [];
    tagError.value = null;
  };

  return {
    isInitialized,
    adapters,
    loras,
    error,
    isLoading,
    query,
    lastFetchedAt,
    ensureLoaded,
    loadLoras,
    refresh,
    initialize,
    availableTags,
    areTagsLoading,
    tagError,
    fetchTags,
    performBulkAction,
    applyLoraUpdate,
    removeLora,
    reset,
  };
});

export type AdapterCatalogStore = ReturnType<typeof useAdapterCatalogStore>;
