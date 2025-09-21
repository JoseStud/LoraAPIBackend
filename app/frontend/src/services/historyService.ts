import { computed, reactive, unref } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { useApi } from '@/composables/useApi';
import {
  deleteRequest,
  getFilenameFromContentDisposition,
  getJson,
  putJson,
  requestBlob,
} from '@/utils/api';

import type {
  GenerationBulkDeleteRequest,
  GenerationBulkFavoriteRequest,
  GenerationDownloadMetadata,
  GenerationExportRequest,
  GenerationFavoriteUpdate,
  GenerationHistoryEntry,
  GenerationHistoryPayload,
  GenerationHistoryQuery,
  GenerationHistoryResponse,
  GenerationRatingUpdate,
} from '@/types';

const DEFAULT_BASE = '/api/v1';

const sanitizeBaseUrl = (value?: string): string => {
  if (!value) {
    return DEFAULT_BASE;
  }
  return value.replace(/\/+$/, '') || DEFAULT_BASE;
};

const resolveBaseUrl = (value: MaybeRefOrGetter<string>): string => {
  const raw = typeof value === 'function' ? (value as () => string)() : unref(value);
  return sanitizeBaseUrl(raw);
};

export const buildHistoryQuery = (query: GenerationHistoryQuery = {}): string => {
  const params = new URLSearchParams();

  if (typeof query.page === 'number') {
    params.set('page', String(query.page));
  }

  if (typeof query.page_size === 'number') {
    params.set('page_size', String(query.page_size));
  }

  if (query.search) {
    params.set('search', query.search);
  }

  if (query.sort) {
    params.set('sort', query.sort);
  }

  if (typeof query.min_rating === 'number') {
    params.set('min_rating', String(query.min_rating));
  }

  if (typeof query.width === 'number') {
    params.set('width', String(query.width));
  }

  if (typeof query.height === 'number') {
    params.set('height', String(query.height));
  }

  if (query.start_date) {
    params.set('start_date', query.start_date);
  }

  if (query.end_date) {
    params.set('end_date', query.end_date);
  }

  Array.from(Object.entries(query)).forEach(([key, value]) => {
    if (['page', 'page_size', 'search', 'sort', 'min_rating', 'width', 'height', 'start_date', 'end_date'].includes(key)) {
      return;
    }
    if (value == null) {
      return;
    }
    params.set(key, String(value));
  });

  const search = params.toString();
  return search ? `?${search}` : '';
};

export const useGenerationHistoryApi = (
  baseUrl: MaybeRefOrGetter<string>,
  initialQuery: GenerationHistoryQuery = {},
) => {
  const query = reactive<GenerationHistoryQuery>({ ...initialQuery });
  const api = useApi<GenerationHistoryPayload>(
    () => {
      const base = resolveBaseUrl(baseUrl);
      const suffix = buildHistoryQuery(query);
      return `${base}/results${suffix}`;
    },
    { credentials: 'same-origin' },
  );

  const fetchPage = async (overrides: GenerationHistoryQuery = {}) => {
    Object.assign(query, overrides);
    await api.fetchData();
    return api.data.value;
  };

  const results = computed<GenerationHistoryEntry[]>(() => {
    const payload = api.data.value;
    if (!payload) {
      return [];
    }
    return Array.isArray(payload) ? payload : payload.results ?? [];
  });

  const pageInfo = computed<GenerationHistoryResponse | null>(() => {
    const payload = api.data.value;
    if (!payload || Array.isArray(payload)) {
      return null;
    }
    return payload;
  });

  return {
    ...api,
    query,
    fetchPage,
    results,
    pageInfo,
  };
};

export const fetchGenerationHistory = async (
  baseUrl: string,
  query: GenerationHistoryQuery = {},
): Promise<GenerationHistoryPayload | null> => {
  const base = sanitizeBaseUrl(baseUrl);
  const { data } = await getJson<GenerationHistoryPayload>(
    `${base}/results${buildHistoryQuery(query)}`,
    { credentials: 'same-origin' },
  );
  return data;
};

export const updateGenerationRating = async (
  baseUrl: string,
  resultId: string | number,
  payload: GenerationRatingUpdate,
) => {
  const base = sanitizeBaseUrl(baseUrl);
  await putJson<unknown, GenerationRatingUpdate>(
    `${base}/results/${resultId}/rating`,
    payload,
    { credentials: 'same-origin' },
  );
};

export const updateGenerationFavorite = async (
  baseUrl: string,
  resultId: string | number,
  payload: GenerationFavoriteUpdate,
) => {
  const base = sanitizeBaseUrl(baseUrl);
  await putJson<unknown, GenerationFavoriteUpdate>(
    `${base}/results/${resultId}/favorite`,
    payload,
    { credentials: 'same-origin' },
  );
};

export const bulkFavoriteGenerations = async (
  baseUrl: string,
  payload: GenerationBulkFavoriteRequest,
) => {
  const base = sanitizeBaseUrl(baseUrl);
  await putJson<unknown, GenerationBulkFavoriteRequest>(
    `${base}/results/bulk-favorite`,
    payload,
    { credentials: 'same-origin' },
  );
};

export const bulkDeleteGenerations = async (
  baseUrl: string,
  payload: GenerationBulkDeleteRequest,
) => {
  const base = sanitizeBaseUrl(baseUrl);
  await deleteRequest<unknown>(
    `${base}/results/bulk-delete`,
    {
      credentials: 'same-origin',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

export const deleteGeneration = async (baseUrl: string, resultId: string | number) => {
  const base = sanitizeBaseUrl(baseUrl);
  await deleteRequest<unknown>(`${base}/results/${resultId}`, {
    credentials: 'same-origin',
  });
};

const toDownloadMetadata = (
  blob: Blob,
  response: Response,
  fallbackName: string,
): GenerationDownloadMetadata => ({
  blob,
  filename:
    getFilenameFromContentDisposition(response.headers?.get('content-disposition')) ?? fallbackName,
  contentType: response.headers?.get('content-type'),
  size: blob.size,
});

export const exportGenerations = async (
  baseUrl: string,
  payload: GenerationExportRequest,
): Promise<GenerationDownloadMetadata> => {
  const base = sanitizeBaseUrl(baseUrl);
  const { blob, response } = await requestBlob(`${base}/results/export`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return toDownloadMetadata(blob, response, `generation-export-${Date.now()}.zip`);
};

export const downloadGenerationImage = async (
  url: string,
  filename: string,
): Promise<GenerationDownloadMetadata> => {
  const { blob, response } = await requestBlob(url, { credentials: 'same-origin' });
  return toDownloadMetadata(blob, response, filename);
};
