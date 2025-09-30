import { computed } from 'vue';

import { useAdapterSummaries } from '@/features/lora/public';
import type { AdapterListQuery, AdapterSummary } from '@/types';

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

export const useLoraSummaries = (options: UseLoraSummariesOptions = {}) => {
  const baseQuery: AdapterListQuery = { ...SUMMARY_QUERY_DEFAULTS, ...(options.initialQuery ?? {}) };
  const catalog = useAdapterSummaries();

  const mergeWithBaseQuery = (overrides: AdapterListQuery = {}): AdapterListQuery => ({
    ...baseQuery,
    ...overrides,
  });

  const load = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> =>
    catalog.ensureLoaded(mergeWithBaseQuery(overrides));

  const ensureLoaded = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> =>
    catalog.ensureLoaded(mergeWithBaseQuery(overrides));

  const refresh = async (overrides: AdapterListQuery = {}): Promise<AdapterSummary[]> =>
    catalog.refresh(mergeWithBaseQuery(overrides));

  if (options.autoLoad !== false) {
    void load();
  }

  return {
    loras: computed(() => catalog.summaries.value),
    error: computed(() => catalog.error.value),
    isLoading: computed(() => catalog.isLoading.value),
    load,
    ensureLoaded,
    refresh,
  };
};
