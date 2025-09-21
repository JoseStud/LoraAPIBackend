import { computed, reactive, unref } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { useApi } from '@/composables/useApi';
import { getJson, postJson } from '@/utils/api';

import type {
  AdapterListQuery,
  AdapterListResponse,
  AdapterRead,
  LoraBulkActionRequest,
  LoraGalleryFilters,
  LoraGalleryState,
  LoraGallerySelectionState,
  LoraTagListResponse,
} from '@/types';

const DEFAULT_BASE = '/api/v1';

const sanitizeBaseUrl = (value?: string): string => {
  if (!value) {
    return DEFAULT_BASE;
  }
  return value.replace(/\/+$/, '') || DEFAULT_BASE;
};

const resolveBase = (baseUrl: MaybeRefOrGetter<string>) => {
  const raw = typeof baseUrl === 'function' ? (baseUrl as () => string)() : unref(baseUrl);
  return sanitizeBaseUrl(raw);
};

export const buildAdapterListQuery = (query: AdapterListQuery = {}): string => {
  const params = new URLSearchParams();

  if (typeof query.page === 'number') {
    params.set('page', String(query.page));
  }

  if (typeof query.perPage === 'number') {
    params.set('per_page', String(query.perPage));
  }

  if (query.search) {
    params.set('search', query.search);
  }

  if (typeof query.active === 'boolean') {
    params.set('active', query.active ? 'true' : 'false');
  }

  if (query.tags?.length) {
    params.set('tags', query.tags.join(','));
  }

  if (query.sort) {
    params.set('sort', query.sort);
  }

  const suffix = params.toString();
  return suffix ? `?${suffix}` : '';
};

export const useAdapterListApi = (
  baseUrl: MaybeRefOrGetter<string>,
  initialQuery: AdapterListQuery = { page: 1, perPage: 100 },
) => {
  const query = reactive<AdapterListQuery>({ ...initialQuery });
  const api = useApi<AdapterListResponse | AdapterRead[]>(
    () => `${resolveBase(baseUrl)}/adapters${buildAdapterListQuery(query)}`,
    { credentials: 'same-origin' },
  );

  const fetchData = async (overrides: AdapterListQuery = {}) => {
    Object.assign(query, overrides);
    await api.fetchData();
    return api.data.value;
  };

  const adapters = computed<AdapterRead[]>(() => {
    const payload = api.data.value;
    if (!payload) {
      return [];
    }
    return Array.isArray(payload) ? payload : payload.items ?? [];
  });

  return {
    ...api,
    query,
    adapters,
    fetchData,
  };
};

export const fetchAdapterTags = async (baseUrl: string): Promise<string[]> => {
  const base = sanitizeBaseUrl(baseUrl);
  const { data } = await getJson<LoraTagListResponse>(
    `${base}/adapters/tags`,
    { credentials: 'same-origin' },
  );
  return data?.tags ?? [];
};

export const fetchAdapters = async (
  baseUrl: string,
  query: AdapterListQuery = {},
): Promise<AdapterRead[]> => {
  const base = sanitizeBaseUrl(baseUrl);
  const { data } = await getJson<AdapterListResponse | AdapterRead[]>(
    `${base}/adapters${buildAdapterListQuery(query)}`,
    { credentials: 'same-origin' },
  );

  if (!data) {
    return [];
  }

  return Array.isArray(data) ? data : data.items ?? [];
};

export const performBulkLoraAction = async (
  baseUrl: string,
  payload: LoraBulkActionRequest,
): Promise<void> => {
  const base = sanitizeBaseUrl(baseUrl);
  await postJson<unknown, LoraBulkActionRequest>(
    `${base}/adapters/bulk`,
    payload,
    { credentials: 'same-origin' },
  );
};

export const createDefaultGalleryState = (): LoraGalleryState => {
  const filters: LoraGalleryFilters = {
    activeOnly: false,
    tags: [],
    sort: 'name_asc',
  };

  const selection: LoraGallerySelectionState = {
    bulkMode: false,
    selectedIds: [],
    viewMode: 'grid',
  };

  return {
    filters,
    availableTags: [],
    showAllTags: false,
    selection,
  };
};
