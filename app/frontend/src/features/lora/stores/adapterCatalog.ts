import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';

import { ApiError, useAsyncResource } from '@/composables/shared';
import { fetchAdapterList, fetchAdapterTags, performBulkLoraAction } from '../services/lora/loraService';
import { useBackendClient } from '@/services/backendClient';

import type {
  AdapterRead,
  AdapterListQuery,
  AdapterListResponse,
  AdapterSummary,
  GalleryLora,
  LoraBulkAction,
  LoraListItem,
  LoraUpdatePayload,
} from '@/types';

const DEFAULT_QUERY: AdapterListQuery = { page: 1, perPage: 200 };

const normalizeQuery = (base: AdapterListQuery = {}): AdapterListQuery => ({
  ...DEFAULT_QUERY,
  ...base,
});

const extractGalleryItems = (
  payload: AdapterListResponse | null | undefined,
): GalleryLora[] => {
  if (!payload) {
    return [];
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((item: AdapterRead) => ({ ...item }));
};

const toSummary = (item: LoraListItem): AdapterSummary => ({
  id: item.id,
  name: item.name,
  description: item.description,
  active: item.active ?? true,
});

export const useAdapterCatalogStore = defineStore('adapterCatalog', () => {
  const backendClient = useBackendClient();

  const isInitialized = ref(false);
  const availableTags = ref<string[]>([]);
  const tagError = ref<unknown>(null);
  const pendingTagFetch = ref<Promise<string[]> | null>(null);
  const query = reactive<AdapterListQuery>({ ...DEFAULT_QUERY });

  const fetchTags = async (): Promise<string[]> => {
    if (pendingTagFetch.value) {
      return pendingTagFetch.value;
    }

    const request = (async () => {
      try {
        const tags = await fetchAdapterTags(backendClient);
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

  const listResource = useAsyncResource<GalleryLora[], AdapterListQuery>(
    async (requestQuery) => {
      const normalised = normalizeQuery(requestQuery);
      const payload = await fetchAdapterList(normalised, backendClient);
      return extractGalleryItems(payload);
    },
    {
      initialArgs: { ...DEFAULT_QUERY },
      initialValue: [],
      getKey: (args) => JSON.stringify(normalizeQuery(args)),
      backendRefresh: {
        getArgs: () => ({ ...query }),
      },
      onSuccess: (_, { args }) => {
        Object.assign(query, normalizeQuery(args));
        void fetchTags();
      },
      onError: (err) => {
        if (import.meta.env.DEV) {
          console.error('[adapterCatalog] Failed to load adapters', err);
        }
      },
    },
  );

  const loras = computed<GalleryLora[]>(() => {
    const items = listResource.data.value ?? [];
    return items.map((item) => ({ ...item }));
  });

  const adapters = computed<AdapterSummary[]>(() => loras.value.map(toSummary));

  const error = computed<ApiError | unknown | null>(() => listResource.error.value as ApiError | unknown | null);
  const isLoading = computed<boolean>(() => listResource.isLoading.value);
  const areTagsLoading = computed(() => pendingTagFetch.value !== null);
  const lastFetchedAt = computed(() => listResource.lastLoadedAt.value);

  const mutateList = (mutator: (draft: GalleryLora[]) => boolean): boolean => {
    const current = listResource.data.value ?? [];
    const draft = current.map((item) => ({ ...item }));
    const changed = mutator(draft);
    if (!changed) {
      return false;
    }

    listResource.setData(draft, { markLoaded: true, args: { ...query } });
    listResource.clearError();
    return true;
  };

  const applyLoraUpdate = (payload: LoraUpdatePayload): boolean => {
    const { id, type } = payload;
    if (!id) {
      return false;
    }

    if (type === 'weight' && payload.weight !== undefined) {
      return mutateList((draft) => {
        const index = draft.findIndex((item) => item.id === id);
        if (index === -1) {
          return false;
        }
        draft[index] = { ...draft[index], weight: payload.weight };
        return true;
      });
    }

      if (type === 'active') {
        const { active } = payload;
        if (active === undefined) {
          return false;
        }
        return mutateList((draft) => {
          const index = draft.findIndex((item) => item.id === id);
          if (index === -1) {
            return false;
          }
          draft[index] = { ...draft[index], active };
          return true;
        });
      }

    return false;
  };

  const removeLora = (id: string): boolean =>
    mutateList((draft) => {
      const index = draft.findIndex((item) => item.id === id);
      if (index === -1) {
        return false;
      }
      draft.splice(index, 1);
      return true;
    });

  const ensureLoaded = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> => {
    const requestQuery = normalizeQuery({ ...query, ...overrides });
    const result = await listResource.ensureLoaded(requestQuery);
    return (result ?? []).map(toSummary);
  };

  const loadLoras = async (overrides: AdapterListQuery = {}): Promise<GalleryLora[]> => {
    await ensureLoaded(overrides);
    return loras.value;
  };

  const refresh = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> => {
    const requestQuery = normalizeQuery({ ...query, ...overrides });
    const result = await listResource.refresh(requestQuery);
    return (result ?? []).map(toSummary);
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

    await performBulkLoraAction(
      {
        action,
        lora_ids: loraIds,
      },
      backendClient,
    );

    await refresh();
  };

  const reset = () => {
    listResource.reset();
    availableTags.value = [];
    tagError.value = null;
    pendingTagFetch.value = null;
    isInitialized.value = false;
    Object.assign(query, { ...DEFAULT_QUERY });
    listResource.backendRefresh?.restart?.();
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
