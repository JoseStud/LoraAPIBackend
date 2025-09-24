import { computed, reactive, unref, isRef } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { useApi } from '@/composables/shared';
import { DEFAULT_BACKEND_BASE } from '@/config/runtime';
import { resolveBackendUrl } from '@/utils/backend';

import type {
  AdapterListQuery,
  AdapterListResponse,
  AdapterRead,
  AdapterStats,
  AdapterStatsMetric,
  GalleryLora,
  LoraBulkActionRequest,
  LoraGalleryFilters,
  LoraGalleryState,
  LoraGallerySelectionState,
  LoraListItem,
  LoraTagListResponse,
  TopLoraPerformance,
} from '@/types';

const DEFAULT_ADAPTER_LIST_QUERY: AdapterListQuery = { page: 1, perPage: 100 };

const ADAPTER_STATS_KEYS: readonly AdapterStatsMetric[] = [
  'downloadCount',
  'favoriteCount',
  'commentCount',
  'thumbsUpCount',
  'rating',
  'ratingCount',
  'usage_count',
  'generations',
  'activations',
  'success_rate',
  'avg_time',
  'avg_generation_time',
];

const coerceFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const normalizeAdapterStats = (stats: AdapterRead['stats']): AdapterStats => {
  if (!stats || typeof stats !== 'object') {
    return {};
  }

  const normalized: AdapterStats = {};
  const rawStats = stats as Record<string, unknown>;

  for (const metric of ADAPTER_STATS_KEYS) {
    const coerced = coerceFiniteNumber(rawStats[metric]);
    if (typeof coerced === 'number') {
      normalized[metric] = coerced;
    }
  }

  return normalized;
};

const isBaseUrlInput = (value: unknown): value is MaybeRefOrGetter<string> => {
  if (typeof value === 'string' || typeof value === 'function') {
    return true;
  }

  return isRef(value);
};

const sanitizeBaseUrl = (value?: string): string => {
  if (!value) {
    return DEFAULT_BACKEND_BASE;
  }
  return value.replace(/\/+$/, '') || DEFAULT_BACKEND_BASE;
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

export const fetchAdapterTags = async (baseUrl: string): Promise<string[]> => {
  const base = sanitizeBaseUrl(baseUrl);
  const api = useApi<LoraTagListResponse>(() => `${base}/adapters/tags`, {
    credentials: 'same-origin',
  });
  const payload = await api.fetchData();
  return payload?.tags ?? [];
};

export const fetchAdapters = async (
  baseUrl: string,
  query: AdapterListQuery = {},
): Promise<LoraListItem[]> => {
  const base = sanitizeBaseUrl(baseUrl);
  const targetUrl = `${base}/adapters${buildAdapterListQuery(query)}`;
  const api = useApi<AdapterListResponse | AdapterRead[]>(() => targetUrl, {
    credentials: 'same-origin',
  });
  const payload = await api.fetchData();

  if (!payload) {
    return [];
  }

  const adapters = Array.isArray(payload) ? payload : payload.items ?? [];
  return adapters.map((item) => ({ ...item })) as LoraListItem[];
};

export const fetchTopAdapters = async (
  baseUrl: string,
  limit = 10,
): Promise<TopLoraPerformance[]> => {
  const base = sanitizeBaseUrl(baseUrl);
  const api = useApi<AdapterListResponse | AdapterRead[]>(
    () => `${base}/adapters${buildAdapterListQuery({ perPage: limit })}`,
    { credentials: 'same-origin' },
  );
  const payload = await api.fetchData();

  if (!payload) {
    return [];
  }

  const list = Array.isArray(payload) ? payload : payload.items ?? [];

  return list.slice(0, limit).map((item) => {
    const stats = normalizeAdapterStats(item.stats);

    return {
      id: item.id,
      name: item.name,
      version: item.version ?? null,
      usage_count: stats.usage_count ?? stats.generations ?? stats.activations ?? 0,
      success_rate: stats.success_rate ?? 0,
      avg_time: stats.avg_time ?? stats.avg_generation_time ?? 0,
    } satisfies TopLoraPerformance;
  });
};

export const performBulkLoraAction = async (
  baseUrl: string,
  payload: LoraBulkActionRequest,
): Promise<void> => {
  const base = sanitizeBaseUrl(baseUrl);
  const api = useApi<unknown>(() => `${base}/adapters/bulk`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  await api.fetchData({
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const updateLoraWeight = async (
  baseUrl: string,
  loraId: string,
  weight: number,
): Promise<GalleryLora | null> => {
  const base = sanitizeBaseUrl(baseUrl);
  const api = useApi<AdapterRead>(() => `${base}/adapters/${encodeURIComponent(loraId)}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const payload = await api.fetchData({
    method: 'PATCH',
    body: JSON.stringify({ weight }),
  });
  return (payload ? { ...payload } : null) as GalleryLora | null;
};

export const toggleLoraActiveState = async (
  baseUrl: string,
  loraId: string,
  activate: boolean,
): Promise<GalleryLora | null> => {
  const base = sanitizeBaseUrl(baseUrl);
  const endpoint = activate ? 'activate' : 'deactivate';
  const api = useApi<AdapterRead>(() => `${base}/adapters/${encodeURIComponent(loraId)}/${endpoint}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const payload = await api.fetchData({ method: 'POST' });
  return (payload ? { ...payload } : null) as GalleryLora | null;
};

export const deleteLora = async (baseUrl: string, loraId: string): Promise<void> => {
  const base = sanitizeBaseUrl(baseUrl);
  const api = useApi<void>(() => `${base}/adapters/${encodeURIComponent(loraId)}`, {
    credentials: 'same-origin',
  });
  await api.fetchData({
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

export const buildRecommendationsUrl = (loraId: string): string => {
  return `/recommendations?lora_id=${encodeURIComponent(loraId)}`;
};

export const triggerPreviewGeneration = async (
  baseUrl: string,
  loraId: string,
): Promise<unknown> => {
  const base = sanitizeBaseUrl(baseUrl);
  const api = useApi<unknown>(() => `${base}/adapters/${encodeURIComponent(loraId)}/preview`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return api.fetchData({ method: 'POST' });
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
