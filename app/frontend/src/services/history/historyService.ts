
import { useApi } from '@/composables/shared';
import { getFilenameFromContentDisposition, requestBlob } from '@/services/apiClient';

import {
  getFilenameFromContentDisposition,
  performConfiguredRequest,
  requestBlob,
  requestConfiguredJson,
  type ApiRequestConfig,
  type ApiRequestInit,
} from '@/services/apiClient';
import { resolveGenerationRoute } from '@/services/generation/generationService';

import { sanitizeBackendBaseUrl } from '@/utils/backend';

import type {
  GenerationBulkDeleteRequest,
  GenerationBulkFavoriteRequest,
  GenerationDownloadMetadata,
  GenerationExportRequest,
  GenerationHistoryListPayload,
  GenerationHistoryListResponse,
  GenerationHistoryQuery,
  GenerationHistoryResult,
  GenerationHistoryStats,
  GenerationHistoryPayload,
  GenerationRatingUpdate,
} from '@/types';

const resolveHistoryEndpoint = (base: string, path: string): string =>
  resolveGenerationRoute(path, base);

const withSameOrigin = (init: ApiRequestInit = {}): ApiRequestInit => ({
  credentials: 'same-origin',
  ...init,
});

const createHistoryRequestConfig = (
  base: string,
  path: string,
  init: ApiRequestInit = {},
): ApiRequestConfig => ({
  target: resolveHistoryEndpoint(base, path),
  init: withSameOrigin(init),
});

const toStats = (stats?: GenerationHistoryStats | null): GenerationHistoryStats => ({
  total_results: stats?.total_results ?? 0,
  avg_rating: stats?.avg_rating ?? 0,
  total_favorites: stats?.total_favorites ?? 0,
  total_size: stats?.total_size ?? 0,
});

export interface ListResultsOutput {
  payload: GenerationHistoryListPayload | null;
  results: GenerationHistoryResult[];
  stats: GenerationHistoryStats;
  response: GenerationHistoryListResponse | null;
}

export interface ListResultsOptions {
  signal?: AbortSignal;
}

const toListOutput = (payload: GenerationHistoryListPayload | null): ListResultsOutput => {
  if (!payload) {
    return {
      payload: null,
      results: [],
      stats: toStats(),
      response: null,
    };
  }

  if (Array.isArray(payload)) {
    return {
      payload,
      results: payload,
      stats: toStats(),
      response: null,
    };
  }

  const response = payload ?? null;
  return {
    payload,
    results: Array.isArray(payload.results) ? payload.results : [],
    stats: toStats(payload.stats),
    response,
  };
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

  for (const [key, value] of Object.entries(query)) {
    if (['page', 'page_size', 'search', 'sort', 'min_rating', 'width', 'height', 'start_date', 'end_date'].includes(key)) {
      continue;
    }
    if (value == null) {
      continue;
    }
    params.set(key, String(value));
  }

  const search = params.toString();
  return search ? `?${search}` : '';
};

export const listResults = async (
  baseUrl: string,
  query: GenerationHistoryQuery = {},
  options: ListResultsOptions = {},
): Promise<ListResultsOutput> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const queryString = buildHistoryQuery(query);
  const targetUrl = resolveHistoryEndpoint(base, `/results${queryString}`);
  const result = await requestConfiguredJson<GenerationHistoryListPayload>(
    { target: targetUrl, init: withSameOrigin() },
    { signal: options.signal },
  );
  return toListOutput((result.data as GenerationHistoryListPayload | null) ?? null);
};

export const rateResult = async (
  baseUrl: string,
  resultId: GenerationHistoryResult['id'],
  rating: number,
): Promise<GenerationHistoryResult | null> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const config = createHistoryRequestConfig(
    base,
    `/results/${encodeURIComponent(String(resultId))}/rating`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  const result = await requestConfiguredJson<GenerationHistoryResult | null>(config, {
    method: 'PUT',
    body: JSON.stringify({ rating } satisfies GenerationRatingUpdate),
  });
  return (result.data as GenerationHistoryResult | null) ?? null;
};

export const favoriteResult = async (
  baseUrl: string,
  resultId: GenerationHistoryResult['id'],
  isFavorite: boolean,
): Promise<GenerationHistoryResult | null> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const config = createHistoryRequestConfig(
    base,
    `/results/${encodeURIComponent(String(resultId))}/favorite`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  const result = await requestConfiguredJson<GenerationHistoryResult | null>(config, {
    method: 'PUT',
    body: JSON.stringify({ is_favorite: isFavorite }),
  });
  return (result.data as GenerationHistoryResult | null) ?? null;
};

export const favoriteResults = async (
  baseUrl: string,
  payload: GenerationBulkFavoriteRequest,
): Promise<void> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const config = createHistoryRequestConfig(base, '/results/bulk-favorite', {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  await performConfiguredRequest<void>(config, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
};

export const deleteResult = async (
  baseUrl: string,
  resultId: GenerationHistoryResult['id'],
): Promise<void> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const config = createHistoryRequestConfig(
    base,
    `/results/${encodeURIComponent(String(resultId))}`,
  );
  await performConfiguredRequest<void>(config, { method: 'DELETE' });
};

export const deleteResults = async (
  baseUrl: string,
  payload: GenerationBulkDeleteRequest,
): Promise<void> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const config = createHistoryRequestConfig(base, '/results/bulk-delete', {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  await performConfiguredRequest<void>(config, {
    method: 'DELETE',
    body: JSON.stringify(payload),
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

export const exportResults = async (
  baseUrl: string,
  payload: GenerationExportRequest,
): Promise<GenerationDownloadMetadata> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const { blob, response } = await requestBlob(
    resolveHistoryEndpoint(base, '/results/export'),
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return toDownloadMetadata(blob, response, `generation-export-${Date.now()}.zip`);
};

export const downloadResult = async (
  baseUrl: string,
  resultId: GenerationHistoryResult['id'],
  fallbackName = `generation-${resultId}.png`,
): Promise<GenerationDownloadMetadata> => {
  const base = sanitizeBackendBaseUrl(baseUrl);
  const { blob, response } = await requestBlob(
    resolveHistoryEndpoint(base, `/results/${encodeURIComponent(String(resultId))}/download`),
    {
      method: 'GET',
      credentials: 'same-origin',
    },
  );
  return toDownloadMetadata(blob, response, fallbackName);
};

export const fetchGenerationHistory = async (
  baseUrl: string,
  query: GenerationHistoryQuery = {},
): Promise<GenerationHistoryPayload | null> => {
  const result = await listResults(baseUrl, query);
  return result.payload;
};
