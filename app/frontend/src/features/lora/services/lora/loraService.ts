import { createBackendHttpClient, type BackendHttpClientInput } from '@/services/shared/http/backendClient';
import type { HttpClient } from '@/services/shared/http';
import { createBackendPathBuilder } from '@/utils/backend';
import { parseAdapterListPayload, parseAdapterRead, parseAdapterTags } from '@/schemas';

import type {
  AdapterListQuery,
  AdapterListResponse,
  AdapterRead,
  GalleryLora,
  LoraBulkActionRequest,
  LoraGalleryFilters,
  LoraGalleryState,
  LoraGallerySelectionState,
  LoraListItem,
  TopLoraPerformance,
} from '@/types';

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

const TRACE_OPTIONS = { trace: { enabled: true } } as const;

const defaultClient = createBackendHttpClient(TRACE_OPTIONS);

const resolveClient = (input?: BackendHttpClientInput): HttpClient => {
  if (typeof input === 'string') {
    return createBackendHttpClient({ ...TRACE_OPTIONS, baseURL: input });
  }

  if (input) {
    return input;
  }

  return defaultClient;
};

const adaptersPath = createBackendPathBuilder('adapters');

export const fetchAdapterTags = async (client?: BackendHttpClientInput): Promise<string[]> => {
  const backend = resolveClient(client);
  const payload = await backend.getJson<unknown>(adaptersPath('/tags'));
  return parseAdapterTags(payload, 'adapter tag list');
};

export const fetchAdapterList = async (
  query: AdapterListQuery = {},
  client?: BackendHttpClientInput,
): Promise<AdapterListResponse> => {
  const backend = resolveClient(client);
  const payload = await backend.getJson<unknown>(adaptersPath(buildAdapterListQuery(query)));
  const parsed = parseAdapterListPayload(payload, query);

  return {
    ...parsed,
    items: parsed.items.map((item: AdapterRead) => ({ ...item })),
  } satisfies AdapterListResponse;
};

export const fetchAdapters = async (
  query: AdapterListQuery = {},
  client?: BackendHttpClientInput,
): Promise<LoraListItem[]> => {
  const response = await fetchAdapterList(query, client);
  return response.items.map((item: AdapterRead) => ({ ...item })) as LoraListItem[];
};

export const fetchTopAdapters = async (
  limit = 10,
  client?: BackendHttpClientInput,
): Promise<TopLoraPerformance[]> => {
  const { items } = await fetchAdapterList({ perPage: limit }, client);

  return items.slice(0, limit).map((item: AdapterRead) => {
    const stats = item.stats ?? {};

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
  client?: BackendHttpClientInput,
): Promise<void> => {
  const backend = resolveClient(client);
  await backend.postJson<unknown, LoraBulkActionRequest>(adaptersPath('/bulk'), payload);
};

export const updateLoraWeight = async (
  loraId: string,
  weight: number,
  client?: BackendHttpClientInput,
): Promise<GalleryLora | null> => {
  const backend = resolveClient(client);
  const { data } = await backend.patchJson<AdapterRead, { weight: number }>(
    adaptersPath(`/${encodeURIComponent(loraId)}`),
    { weight },
  );
  if (!data) {
    return null;
  }
  const parsed = parseAdapterRead(data);
  return { ...parsed } as GalleryLora;
};

export const toggleLoraActiveState = async (
  loraId: string,
  activate: boolean,
  client?: BackendHttpClientInput,
): Promise<GalleryLora | null> => {
  const backend = resolveClient(client);
  const endpoint = activate ? 'activate' : 'deactivate';
  const { data } = await backend.requestJson<AdapterRead>(
    adaptersPath(`/${encodeURIComponent(loraId)}/${endpoint}`),
    { method: 'POST' },
  );
  if (!data) {
    return null;
  }
  const parsed = parseAdapterRead(data);
  return { ...parsed } as GalleryLora;
};

export const deleteLora = async (
  loraId: string,
  client?: BackendHttpClientInput,
): Promise<void> => {
  const backend = resolveClient(client);
  await backend.delete(adaptersPath(`/${encodeURIComponent(loraId)}`));
};

export const buildRecommendationsUrl = (loraId: string): string => {
  return `/recommendations?lora_id=${encodeURIComponent(loraId)}`;
};

export const triggerPreviewGeneration = async (
  loraId: string,
  client?: BackendHttpClientInput,
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
