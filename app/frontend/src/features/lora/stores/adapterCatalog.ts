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
  LoraUpdatePayload,
} from '@/types';

const DEFAULT_QUERY: AdapterListQuery = { page: 1, perPage: 200 };

const normalizeQuery = (base: AdapterListQuery = {}): AdapterListQuery => ({
  ...DEFAULT_QUERY,
  ...base,
});

interface CatalogState {
  ids: string[];
  entities: Record<string, GalleryLora>;
}

const createEmptyCatalogState = (): CatalogState => ({
  ids: [],
  entities: {},
});

const createCatalogState = (
  payload: AdapterListResponse | null | undefined,
): CatalogState => {
  const state = createEmptyCatalogState();

  if (!payload || !Array.isArray(payload.items)) {
    return state;
  }

  for (const item of payload.items as AdapterRead[]) {
    if (!item?.id) {
      continue;
    }
    const lora = { ...item } as GalleryLora;
    state.ids.push(lora.id);
    state.entities[lora.id] = lora;
  }

  return state;
};

const toSummary = (item: GalleryLora): AdapterSummary => ({
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

  const summaryCache = new Map<string, { source: GalleryLora; value: AdapterSummary }>();

  const listResource = useAsyncResource<CatalogState, AdapterListQuery>(
    async (requestQuery) => {
      const normalised = normalizeQuery(requestQuery);
      const payload = await fetchAdapterList(normalised, backendClient);
      return createCatalogState(payload);
    },
    {
      initialArgs: { ...DEFAULT_QUERY },
      initialValue: createEmptyCatalogState(),
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
    const state = listResource.data.value ?? createEmptyCatalogState();
    const { ids, entities } = state;

    const result: GalleryLora[] = [];
    for (const id of ids) {
      const entry = entities[id];
      if (entry) {
        result.push(entry);
      }
    }

    return result;
  });

  const adapters = computed<AdapterSummary[]>(() => {
    const state = listResource.data.value ?? createEmptyCatalogState();
    const { ids, entities } = state;

    const seen = new Set<string>();
    const summaries: AdapterSummary[] = [];

    for (const id of ids) {
      const entry = entities[id];
      if (!entry) {
        continue;
      }

      seen.add(id);
      const cached = summaryCache.get(id);
      if (cached) {
        const active = entry.active ?? true;
        if (
          cached.value.name === entry.name
          && cached.value.description === entry.description
          && cached.value.active === active
        ) {
          summaryCache.set(id, { source: entry, value: cached.value });
          summaries.push(cached.value);
          continue;
        }
      }

      const summary = toSummary(entry);
      summaryCache.set(id, { source: entry, value: summary });
      summaries.push(summary);
    }

    for (const key of summaryCache.keys()) {
      if (!seen.has(key)) {
        summaryCache.delete(key);
      }
    }

    return summaries;
  });

  const error = computed<ApiError | unknown | null>(() => listResource.error.value as ApiError | unknown | null);
  const isLoading = computed<boolean>(() => listResource.isLoading.value);
  const areTagsLoading = computed(() => pendingTagFetch.value !== null);
  const lastFetchedAt = computed(() => listResource.lastLoadedAt.value);

  const mutateCatalog = (mutator: (state: CatalogState) => boolean): boolean => {
    let changed = false;

    listResource.mutate(
      (current) => {
        const state = current ?? createEmptyCatalogState();
        changed = mutator(state);
        return state;
      },
      { markLoaded: true, args: { ...query } },
    );

    if (!changed) {
      return false;
    }

    listResource.clearError();
    return true;
  };

  const applyLoraUpdate = (payload: LoraUpdatePayload): boolean => {
    const { id, type } = payload;
    if (!id) {
      return false;
    }

    if (type === 'weight' && payload.weight !== undefined) {
      return mutateCatalog((state) => {
        const existing = state.entities[id];
        if (!existing) {
          return false;
        }

        state.entities[id] = { ...existing, weight: payload.weight };
        return true;
      });
    }

    if (type === 'active') {
      const { active } = payload;
      if (active === undefined) {
        return false;
      }

      return mutateCatalog((state) => {
        const existing = state.entities[id];
        if (!existing) {
          return false;
        }

        state.entities[id] = { ...existing, active };
        return true;
      });
    }

    return false;
  };

  const removeLora = (id: string): boolean =>
    mutateCatalog((state) => {
      const index = state.ids.indexOf(id);
      if (index === -1) {
        return false;
      }

      state.ids.splice(index, 1);
      delete state.entities[id];
      summaryCache.delete(id);
      return true;
    });

  const ensureLoaded = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> => {
    const requestQuery = normalizeQuery({ ...query, ...overrides });
    await listResource.ensureLoaded(requestQuery);
    return adapters.value;
  };

  const loadLoras = async (overrides: AdapterListQuery = {}): Promise<GalleryLora[]> => {
    await ensureLoaded(overrides);
    return loras.value;
  };

  const refresh = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> => {
    const requestQuery = normalizeQuery({ ...query, ...overrides });
    await listResource.refresh(requestQuery);
    return adapters.value;
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
    listResource.setData(createEmptyCatalogState());
    availableTags.value = [];
    tagError.value = null;
    pendingTagFetch.value = null;
    isInitialized.value = false;
    Object.assign(query, { ...DEFAULT_QUERY });
    listResource.backendRefresh?.restart?.();
    summaryCache.clear();
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
