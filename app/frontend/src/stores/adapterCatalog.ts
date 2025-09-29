import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';

import { ApiError } from '@/composables/shared';
import { fetchAdapterList, fetchAdapterTags, performBulkLoraAction } from '@/services/lora/loraService';
import { useBackendBase } from '@/utils/backend';

import type {
  AdapterListQuery,
  AdapterListResponse,
  AdapterSummary,
  GalleryLora,
  LoraBulkAction,
  LoraListItem,
  LoraUpdatePayload,
} from '@/types';

const DEFAULT_QUERY: AdapterListQuery = { page: 1, perPage: 200 };

const extractGalleryItems = (
  payload: AdapterListResponse | null | undefined,
): GalleryLora[] => {
  if (!payload) {
    return [];
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((item) => ({ ...item }));
};

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
  const loraItems = ref<GalleryLora[]>([]);
  const lastError = ref<ApiError | unknown | null>(null);
  const isLoading = ref(false);

  const backendBase = useBackendBase();
  const query = reactive<AdapterListQuery>({ ...DEFAULT_QUERY });
  const loras = computed<GalleryLora[]>(() => loraItems.value.map((item) => ({ ...item })));
  const adapters = computed<AdapterSummary[]>(() => loraItems.value.map(toSummary));
  const error = computed(() => lastError.value);
  const areTagsLoading = computed(() => pendingTagFetch.value !== null);

  const updateListData = (mutator: (draft: GalleryLora[]) => boolean): boolean => {
    const draft = [...loraItems.value];
    const changed = mutator(draft);
    if (!changed) {
      return false;
    }

    loraItems.value = draft;
    lastError.value = null;
    isLoading.value = false;
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

    const requestQuery: AdapterListQuery = { ...query, ...overrides };

    const request = (async () => {
      isLoading.value = true;
      lastError.value = null;

      try {
        const payload = await fetchAdapterList(backendBase.value, requestQuery);
        loraItems.value = extractGalleryItems(payload);
        Object.assign(query, requestQuery);
        lastFetchedAt.value = Date.now();
        return adapters.value;
      } catch (err) {
        lastError.value = err;
        throw err;
      } finally {
        isLoading.value = false;
        pendingFetch.value = null;
      }
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
    pendingFetch.value = null;
    lastFetchedAt.value = null;
    pendingTagFetch.value = null;
    isInitialized.value = false;
    loraItems.value = [];
    lastError.value = null;
    isLoading.value = false;
    availableTags.value = [];
    tagError.value = null;
    Object.assign(query, { ...DEFAULT_QUERY });
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
