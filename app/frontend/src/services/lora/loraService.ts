import type { BackendClient } from '@/services/backendClient';
import { createBackendPathResolver, resolveClient } from '@/services/shared/backendHelpers';

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

const adaptersPaths = createBackendPathResolver('adapters');
const adaptersPath = adaptersPaths.path;

export const fetchAdapterTags = async (client?: BackendClient | null): Promise<string[]> => {
  const backend = resolveClient(client);
  const payload = await backend.getJson<LoraTagListResponse>(adaptersPath('/tags'));
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
  query: AdapterListQuery = {},
  client?: BackendClient | null,
): Promise<AdapterListResponse> => {
  const backend = resolveClient(client);
  const payload = await backend.getJson<AdapterListResponse | AdapterRead[]>(
    adaptersPath(buildAdapterListQuery(query)),
  );
  const normalised = normalizeAdapterListResponse(payload, query);

  return {
    ...normalised,
    items: normalised.items.map((item) => ({ ...item })),
  } satisfies AdapterListResponse;
};

export const fetchAdapters = async (
  query: AdapterListQuery = {},
  client?: BackendClient | null,
): Promise<LoraListItem[]> => {
  const response = await fetchAdapterList(query, client);
  return response.items.map((item) => ({ ...item })) as LoraListItem[];
};

export const fetchTopAdapters = async (
  limit = 10,
  client?: BackendClient | null,
): Promise<TopLoraPerformance[]> => {
  const { items } = await fetchAdapterList({ perPage: limit }, client);

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
  payload: LoraBulkActionRequest,
  client?: BackendClient | null,
): Promise<void> => {
  const backend = resolveClient(client);
  await backend.postJson<unknown, LoraBulkActionRequest>(adaptersPath('/bulk'), payload);
};

export const updateLoraWeight = async (
  loraId: string,
  weight: number,
  client?: BackendClient | null,
): Promise<GalleryLora | null> => {
  const backend = resolveClient(client);
  const { data } = await backend.patchJson<AdapterRead, { weight: number }>(
    adaptersPath(`/${encodeURIComponent(loraId)}`),
    { weight },
  );
  return (data ? { ...data } : null) as GalleryLora | null;
};

export const toggleLoraActiveState = async (
  loraId: string,
  activate: boolean,
  client?: BackendClient | null,
): Promise<GalleryLora | null> => {
  const backend = resolveClient(client);
  const endpoint = activate ? 'activate' : 'deactivate';
  const { data } = await backend.requestJson<AdapterRead>(
    adaptersPath(`/${encodeURIComponent(loraId)}/${endpoint}`),
    { method: 'POST' },
  );
  return (data ? { ...data } : null) as GalleryLora | null;
};

export const deleteLora = async (
  loraId: string,
  client?: BackendClient | null,
): Promise<void> => {
  const backend = resolveClient(client);
  await backend.delete(adaptersPath(`/${encodeURIComponent(loraId)}`));
};

export const buildRecommendationsUrl = (loraId: string): string => {
  return `/recommendations?lora_id=${encodeURIComponent(loraId)}`;
};

export const triggerPreviewGeneration = async (
  loraId: string,
  client?: BackendClient | null,
): Promise<unknown> => {
  const backend = resolveClient(client);
  const { data } = await backend.requestJson<unknown>(
    adaptersPath(`/${encodeURIComponent(loraId)}/preview`),
    { method: 'POST' },
  );
  return data ?? null;
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
