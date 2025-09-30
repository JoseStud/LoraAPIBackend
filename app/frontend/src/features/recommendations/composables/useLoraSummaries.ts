import { computed, ref } from 'vue';

import { fetchAdapterList } from '@/features/lora/services/lora/loraService';
import { useBackendClient, useBackendEnvironmentSubscription } from '@/services';
import type { AdapterListQuery, AdapterListResponse, AdapterSummary } from '@/types';

export interface UseLoraSummariesOptions {
  /**
   * Query parameters applied when fetching adapter summaries.
   * Defaults to a single page of results sized for recommendation usage.
   */
  initialQuery?: AdapterListQuery;
  /**
   * When false, the helper will not load data automatically on creation.
   */
  autoLoad?: boolean;
}

const SUMMARY_QUERY_DEFAULTS: AdapterListQuery = {
  page: 1,
  perPage: 200,
};

const mergeQuery = (base: AdapterListQuery, overrides: AdapterListQuery = {}): AdapterListQuery => ({
  ...base,
  ...overrides,
});

const mapToSummaries = (payload: AdapterListResponse | null | undefined): AdapterSummary[] => {
  if (!payload || !Array.isArray(payload.items)) {
    return [];
  }

  return payload.items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description ?? undefined,
    active: item.active ?? true,
  }));
};

export const useLoraSummaries = (options: UseLoraSummariesOptions = {}) => {
  const backendClient = useBackendClient();

  const items = ref<AdapterSummary[]>([]);
  const error = ref<unknown>(null);
  const isLoading = ref(false);
  const hasLoaded = ref(false);
  const pending = ref<Promise<AdapterSummary[]> | null>(null);

  const baseQuery: AdapterListQuery = { ...SUMMARY_QUERY_DEFAULTS, ...(options.initialQuery ?? {}) };
  const lastQuery = ref<AdapterListQuery>({ ...baseQuery });

  const runFetch = async (query: AdapterListQuery): Promise<AdapterSummary[]> => {
    if (pending.value) {
      return pending.value;
    }

    const request = (async () => {
      isLoading.value = true;
      error.value = null;

      try {
        const payload = await fetchAdapterList(query, backendClient);
        items.value = mapToSummaries(payload);
        lastQuery.value = { ...query };
        hasLoaded.value = true;
        return items.value;
      } catch (err) {
        error.value = err;
        items.value = [];
        throw err;
      } finally {
        isLoading.value = false;
        pending.value = null;
      }
    })();

    pending.value = request;
    return request;
  };

  const load = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> =>
    runFetch(mergeQuery(baseQuery, overrides));

  const ensureLoaded = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> => {
    if (!hasLoaded.value || Object.keys(overrides).length > 0) {
      return load(overrides);
    }
    return items.value;
  };

  const refresh = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> =>
    runFetch(mergeQuery(lastQuery.value, overrides));

  useBackendEnvironmentSubscription(() => {
    hasLoaded.value = false;
    items.value = [];
    error.value = null;
    pending.value = null;

    if (options.autoLoad !== false) {
      void refresh();
    }
  });

  if (options.autoLoad !== false) {
    void load();
  }

  return {
    loras: computed(() => items.value),
    error: computed(() => error.value),
    isLoading: computed(() => isLoading.value),
    load,
    ensureLoaded,
    refresh,
  };
};
