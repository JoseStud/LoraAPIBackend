import { getFilenameFromContentDisposition } from '@/services/apiClient';
import { resolveBackendClient, type ApiRequestInit, type BackendClient } from '@/services/backendClient';
import { trimLeadingSlash } from '@/utils/backend';

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

const withSameOrigin = (init: ApiRequestInit = {}): ApiRequestInit => ({
  credentials: 'same-origin',
  ...init,
});

const resolveClient = (client?: BackendClient | null): BackendClient => resolveBackendClient(client ?? undefined);

const historyPath = (path: string): string => {
  const trimmed = trimLeadingSlash(path);
  return `/generation${trimmed ? `/${trimmed}` : ''}`;
};

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
  query: GenerationHistoryQuery = {},
  options: ListResultsOptions = {},
  client?: BackendClient | null,
): Promise<ListResultsOutput> => {
  const backend = resolveClient(client);
  const queryString = buildHistoryQuery(query);
  const target = historyPath(`/results${queryString}`);
  const result = await backend.requestJson<GenerationHistoryListPayload>(
    target,
    withSameOrigin({ signal: options.signal }),
  );
  return toListOutput((result.data as GenerationHistoryListPayload | null) ?? null);
};

export const rateResult = async (
  resultId: GenerationHistoryResult['id'],
  rating: number,
  client?: BackendClient | null,
): Promise<GenerationHistoryResult | null> => {
  const backend = resolveClient(client);
  const result = await backend.putJson<GenerationHistoryResult | null, GenerationRatingUpdate>(
    historyPath(`/results/${encodeURIComponent(String(resultId))}/rating`),
    { rating },
    withSameOrigin(),
  );
  return (result.data as GenerationHistoryResult | null) ?? null;
};

export const favoriteResult = async (
  resultId: GenerationHistoryResult['id'],
  isFavorite: boolean,
  client?: BackendClient | null,
): Promise<GenerationHistoryResult | null> => {
  const backend = resolveClient(client);
  const result = await backend.putJson<GenerationHistoryResult | null, { is_favorite: boolean }>(
    historyPath(`/results/${encodeURIComponent(String(resultId))}/favorite`),
    { is_favorite: isFavorite },
    withSameOrigin(),
  );
  return (result.data as GenerationHistoryResult | null) ?? null;
};

export const favoriteResults = async (
  payload: GenerationBulkFavoriteRequest,
  client?: BackendClient | null,
): Promise<void> => {
  const backend = resolveClient(client);
  await backend.putJson<unknown, GenerationBulkFavoriteRequest>(
    historyPath('/results/bulk-favorite'),
    payload,
    withSameOrigin(),
  );
};

export const deleteResult = async (
  resultId: GenerationHistoryResult['id'],
  client?: BackendClient | null,
): Promise<void> => {
  const backend = resolveClient(client);
  await backend.delete(historyPath(`/results/${encodeURIComponent(String(resultId))}`), withSameOrigin());
};

export const deleteResults = async (
  payload: GenerationBulkDeleteRequest,
  client?: BackendClient | null,
): Promise<void> => {
  const backend = resolveClient(client);
  await backend.requestJson<unknown>(historyPath('/results/bulk-delete'), {
    ...withSameOrigin({ method: 'DELETE' }),
    headers: {
      'Content-Type': 'application/json',
    },
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
  payload: GenerationExportRequest,
  client?: BackendClient | null,
): Promise<GenerationDownloadMetadata> => {
  const backend = resolveClient(client);
  const { blob, response } = await backend.requestBlob(
    historyPath('/results/export'),
    withSameOrigin({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  return toDownloadMetadata(blob, response, `generation-export-${Date.now()}.zip`);
};

export const downloadResult = async (
  resultId: GenerationHistoryResult['id'],
  fallbackName = `generation-${resultId}.png`,
  client?: BackendClient | null,
): Promise<GenerationDownloadMetadata> => {
  const backend = resolveClient(client);
  const { blob, response } = await backend.requestBlob(
    historyPath(`/results/${encodeURIComponent(String(resultId))}/download`),
    withSameOrigin({ method: 'GET' }),
  );
  return toDownloadMetadata(blob, response, fallbackName);
};

export const fetchGenerationHistory = async (
  query: GenerationHistoryQuery = {},
  client?: BackendClient | null,
): Promise<GenerationHistoryPayload | null> => {
  const result = await listResults(query, {}, client);
  return result.payload;
};
