import { computed, reactive, unref, isRef, type MaybeRefOrGetter } from 'vue';

import { useApi } from './useApi';
import { buildAdapterListQuery } from '@/services/lora/loraService';
import { resolveBackendUrl, sanitizeBackendBaseUrl } from '@/utils/backend';
import type { AdapterListQuery, AdapterListResponse, AdapterRead, LoraListItem } from '@/types';

const DEFAULT_ADAPTER_LIST_QUERY: AdapterListQuery = { page: 1, perPage: 100 };

const isBaseUrlInput = (value: unknown): value is MaybeRefOrGetter<string> => {
  if (typeof value === 'string' || typeof value === 'function') {
    return true;
  }

  return isRef(value);
};

const resolveBase = (baseUrl: MaybeRefOrGetter<string>) => {
  const raw = typeof baseUrl === 'function' ? (baseUrl as () => string)() : unref(baseUrl);
  return sanitizeBackendBaseUrl(raw);
};

export const useAdapterListApi = (
  baseOrQuery: MaybeRefOrGetter<string> | AdapterListQuery = () => resolveBackendUrl(),
  maybeQuery: AdapterListQuery = DEFAULT_ADAPTER_LIST_QUERY,
) => {
  const hasExplicitBase = isBaseUrlInput(baseOrQuery);
  const baseUrl = hasExplicitBase ? (baseOrQuery as MaybeRefOrGetter<string>) : () => resolveBackendUrl();
  const initialQuery = hasExplicitBase
    ? maybeQuery ?? DEFAULT_ADAPTER_LIST_QUERY
    : (baseOrQuery as AdapterListQuery | undefined) ?? DEFAULT_ADAPTER_LIST_QUERY;

  const query = reactive<AdapterListQuery>({ ...DEFAULT_ADAPTER_LIST_QUERY, ...initialQuery });
  const api = useApi<AdapterListResponse | AdapterRead[]>(
    () => `${resolveBase(baseUrl)}/adapters${buildAdapterListQuery(query)}`,
    { credentials: 'same-origin' },
  );

  const fetchData = async (overrides: AdapterListQuery = {}) => {
    Object.assign(query, overrides);
    await api.fetchData();
    return api.data.value;
  };

  const adapters = computed<LoraListItem[]>(() => {
    const payload = api.data.value;
    if (!payload) {
      return [];
    }
    const list = Array.isArray(payload) ? payload : payload.items ?? [];
    return list.map((item) => ({ ...item })) as LoraListItem[];
  });

  return {
    ...api,
    query,
    adapters,
    fetchData,
  };
};

export type UseAdapterListApiReturn = ReturnType<typeof useAdapterListApi>;
