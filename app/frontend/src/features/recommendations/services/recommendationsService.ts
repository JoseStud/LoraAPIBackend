import { createHttpClient, ensureData, type HttpClient } from '@/services/apiClient';
import { createBackendPathResolver } from '@/services/shared/backendHelpers';
import { resolveBackendBaseUrl } from '@/utils/backend';
import type { RecommendationResponse } from '@/types';

import {
  parseRecommendationResponse,
  RecommendationsServiceParseError,
} from './recommendationsSchemas';

const recommendationsPaths = createBackendPathResolver('recommendations');
const recommendationsPath = recommendationsPaths.path;

const WEIGHT_PARAM_MAP = {
  semantic: 'weight_semantic',
  artistic: 'weight_artistic',
  technical: 'weight_technical',
} as const;

type WeightKey = keyof typeof WEIGHT_PARAM_MAP;

export type RecommendationWeights = Partial<Record<WeightKey, number>>;

export interface SimilarRecommendationsQuery {
  limit?: number;
  similarityThreshold?: number;
  includeExplanations?: boolean;
  diversifyResults?: boolean;
  weights?: RecommendationWeights;
}

export interface GetRecommendationsParams extends SimilarRecommendationsQuery {
  loraId: string;
  signal?: AbortSignal;
  client?: HttpClient | null;
}

const createRecommendationsHttpClient = (): HttpClient =>
  createHttpClient({
    baseUrl: () => resolveBackendBaseUrl(),
    credentials: 'same-origin',
    retry: {
      attempts: 2,
      baseDelayMs: 150,
      maxDelayMs: 1_200,
      retryOnMethods: ['GET'],
      retryOnNetworkError: true,
    },
    trace: import.meta.env.DEV,
  });

let cachedClient: HttpClient | null = null;

const resolveHttpClient = (override?: HttpClient | null): HttpClient => {
  if (override) {
    return override;
  }
  if (!cachedClient) {
    cachedClient = createRecommendationsHttpClient();
  }
  return cachedClient;
};

export const buildSimilarRecommendationsQuery = (
  query: SimilarRecommendationsQuery = {},
): string => {
  const params = new URLSearchParams();

  if (typeof query.limit === 'number') {
    params.set('limit', String(query.limit));
  }

  if (typeof query.similarityThreshold === 'number') {
    params.set('similarity_threshold', String(query.similarityThreshold));
  }

  if (typeof query.includeExplanations === 'boolean') {
    params.set('include_explanations', query.includeExplanations ? 'true' : 'false');
  }

  if (typeof query.diversifyResults === 'boolean') {
    params.set('diversify_results', query.diversifyResults ? 'true' : 'false');
  }

  if (query.weights) {
    for (const [key, value] of Object.entries(query.weights) as [WeightKey, number | undefined][]) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        params.set(WEIGHT_PARAM_MAP[key], String(value));
      }
    }
  }

  const search = params.toString();
  return search ? `?${search}` : '';
};

export const buildSimilarRecommendationsPath = (
  loraId: string,
  query: SimilarRecommendationsQuery = {},
): string => {
  const target = `similar/${encodeURIComponent(loraId)}${buildSimilarRecommendationsQuery(query)}`;
  return recommendationsPath(target);
};

export const getRecommendations = async (
  params: GetRecommendationsParams,
): Promise<RecommendationResponse> => {
  const { loraId, signal, client, ...query } = params;

  if (!loraId) {
    throw new RecommendationsServiceParseError('A target LoRA identifier is required');
  }

  const httpClient = resolveHttpClient(client ?? undefined);
  const target = buildSimilarRecommendationsPath(loraId, query);
  const result = await httpClient.getJson<unknown>(target, { signal });
  const payload = ensureData(result);
  const parsed = parseRecommendationResponse(payload, 'similar recommendations response');
  return parsed;
};

export type GetRecommendations = typeof getRecommendations;
export type BuildSimilarRecommendationsPath = typeof buildSimilarRecommendationsPath;
