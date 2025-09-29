import { fetchJson, fetchParsed, fetchVoid } from '@/services/apiClient';
import { sanitizeBackendBaseUrl } from '@/utils/backend';

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

export const fetchAdapterTags = async (baseUrl: string): Promise<string[]> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const payload = await fetchJson<LoraTagListResponse>(`${base}/adapters/tags`);
  return payload?.tags ?? [];
};

const getFallbackPerPage = (query: AdapterListQuery, items: AdapterRead[]): number => {
  if (typeof query.perPage === 'number' && Number.isFinite(query.perPage)) {
    return query.perPage;
  }

  if (items.length > 0) {
    return items.length;
  }

  return 0;
};

const normalizeAdapterListResponse = (
  payload: AdapterListResponse | AdapterRead[] | null | undefined,
  query: AdapterListQuery,
): AdapterListResponse => {
  const fallbackPage = typeof query.page === 'number' ? query.page : 1;

  if (!payload) {
    const perPage = typeof query.perPage === 'number' ? query.perPage : 0;
    return {
      items: [],
      total: 0,
      filtered: 0,
      page: fallbackPage,
      pages: 0,
      per_page: perPage,
    } satisfies AdapterListResponse;
  }

  if (Array.isArray(payload)) {
    const items = payload ?? [];
    const perPage = getFallbackPerPage(query, items);
    const total = items.length;
    const pages = perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : total > 0 ? 1 : 0;

    return {
      items,
      total,
      filtered: total,
      page: fallbackPage,
      pages,
      per_page: perPage,
    } satisfies AdapterListResponse;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const total = typeof payload.total === 'number' ? payload.total : items.length;
  const filtered = typeof payload.filtered === 'number' ? payload.filtered : total;
  const perPage = typeof payload.per_page === 'number' ? payload.per_page : getFallbackPerPage(query, items);
  const page = typeof payload.page === 'number' ? payload.page : fallbackPage;
  const pages = typeof payload.pages === 'number'
    ? payload.pages
    : perPage > 0
      ? Math.max(1, Math.ceil(filtered / perPage))
      : filtered > 0
        ? 1
        : 0;

  return {
    items,
    total,
    filtered,
    page,
    pages,
    per_page: perPage,
  } satisfies AdapterListResponse;
};

export const fetchAdapterList = async (
  baseUrl: string,
  query: AdapterListQuery = {},
): Promise<AdapterListResponse> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const targetUrl = `${base}/adapters${buildAdapterListQuery(query)}`;
  const payload = await fetchJson<AdapterListResponse | AdapterRead[]>(targetUrl);
  const normalised = normalizeAdapterListResponse(payload, query);

  return {
    ...normalised,
    items: normalised.items.map((item) => ({ ...item })),
  } satisfies AdapterListResponse;
};

export const fetchAdapters = async (
  baseUrl: string,
  query: AdapterListQuery = {},
): Promise<LoraListItem[]> => {
  const response = await fetchAdapterList(baseUrl, query);
  return response.items.map((item) => ({ ...item })) as LoraListItem[];
};

export const fetchTopAdapters = async (
  baseUrl: string,
  limit = 10,
): Promise<TopLoraPerformance[]> => {
  const { items } = await fetchAdapterList(baseUrl, { perPage: limit });

  return items.slice(0, limit).map((item) => {
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
  const base = sanitizeBackendBaseUrl(baseUrl);
  await fetchVoid(`${base}/adapters/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
};

export const updateLoraWeight = async (
  baseUrl: string,
  loraId: string,
  weight: number,
): Promise<GalleryLora | null> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const payload = await fetchJson<AdapterRead>(`${base}/adapters/${encodeURIComponent(loraId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ weight }),
  });
  return (payload ? { ...payload } : null) as GalleryLora | null;
};

export const toggleLoraActiveState = async (
  baseUrl: string,
  loraId: string,
  activate: boolean,
): Promise<GalleryLora | null> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const endpoint = activate ? 'activate' : 'deactivate';
  const payload = await fetchJson<AdapterRead>(
    `${base}/adapters/${encodeURIComponent(loraId)}/${endpoint}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  return (payload ? { ...payload } : null) as GalleryLora | null;
};

export const deleteLora = async (baseUrl: string, loraId: string): Promise<void> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  await fetchVoid(`${base}/adapters/${encodeURIComponent(loraId)}`, {
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
  const base = sanitizeBackendBaseUrl(baseUrl);
  return fetchParsed(
    `${base}/adapters/${encodeURIComponent(loraId)}/preview`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    },
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
