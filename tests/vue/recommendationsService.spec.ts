import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildSimilarRecommendationsPath,
  getRecommendations,
  parseRecommendationResponse,
  RecommendationsServiceParseError,
} from '@/features/recommendations/services';
import { createHttpClient, type HttpClient } from '@/services/shared/http';
import type { RecommendationItem, RecommendationResponse } from '@/types';

const originalFetch = global.fetch;

const createTestClient = (fetchImpl: typeof fetch): HttpClient =>
  createHttpClient({
    baseUrl: () => '/api/v1',
    credentials: 'same-origin',
    fetch: fetchImpl,
    retry: { attempts: 1, retryOnNetworkError: false },
    trace: false,
  });

const createRecommendationItem = (
  overrides: Partial<RecommendationItem> = {},
): RecommendationItem => ({
  lora_id: 'recommended-lora',
  lora_name: 'Recommended LoRA',
  lora_description: 'A recommended adapter',
  similarity_score: 0.92,
  final_score: 0.87,
  explanation: 'High semantic similarity',
  semantic_similarity: 0.91,
  artistic_similarity: 0.82,
  technical_similarity: 0.78,
  quality_boost: 0.05,
  popularity_boost: 0.04,
  recency_boost: 0.02,
  metadata: { preview_image_url: 'https://example.com/preview.png' },
  ...overrides,
});

const createRecommendationPayload = (
  overrides: Partial<RecommendationResponse> = {},
): RecommendationResponse => ({
  target_lora_id: 'target-lora',
  prompt: null,
  recommendations: [createRecommendationItem()],
  total_candidates: 10,
  processing_time_ms: 120,
  recommendation_config: { weights: { semantic: 0.6, artistic: 0.3, technical: 0.1 } },
  ...overrides,
});

afterEach(() => {
  if (originalFetch) {
    global.fetch = originalFetch;
  }
  vi.restoreAllMocks();
});

describe('recommendationsService', () => {
  it('builds recommendation paths with query parameters', () => {
    const path = buildSimilarRecommendationsPath('lora-123', {
      limit: 25,
      similarityThreshold: 0.45,
      includeExplanations: true,
      weights: { semantic: 0.7, artistic: 0.2 },
    });

    expect(path).toBe(
      '/recommendations/similar/lora-123?limit=25&similarity_threshold=0.45&include_explanations=true&weight_semantic=0.7&weight_artistic=0.2',
    );
  });

  it('fetches and parses recommendations using the shared HTTP client', async () => {
    const payload = createRecommendationPayload();
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      url: '/api/v1/recommendations/similar/lora-123',
      json: vi.fn().mockResolvedValue(payload),
      text: vi.fn(),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    const client = createTestClient(fetchMock);

    const result = await getRecommendations({
      loraId: 'lora-123',
      limit: 20,
      similarityThreshold: 0.5,
      weights: { semantic: 0.75 },
      client,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/recommendations/similar/lora-123?limit=20&similarity_threshold=0.5&weight_semantic=0.75',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({
      lora_id: 'recommended-lora',
      final_score: 0.87,
    });
    expect(result.total_candidates).toBe(10);
  });

  it('throws when the response payload fails schema validation', async () => {
    const payload = createRecommendationPayload({
      recommendations: null as unknown as RecommendationItem[],
    });

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      url: '/api/v1/recommendations/similar/lora-456',
      json: vi.fn().mockResolvedValue(payload),
      text: vi.fn(),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    const client = createTestClient(fetchMock);

    await expect(getRecommendations({ loraId: 'lora-456', client })).rejects.toBeInstanceOf(
      RecommendationsServiceParseError,
    );
    expect(fetchMock).toHaveBeenCalled();
  });

  it('round-trips recommendation responses through the schema parser', () => {
    const payload = createRecommendationPayload();
    const parsed = parseRecommendationResponse(payload);
    const roundTripped = parseRecommendationResponse(JSON.parse(JSON.stringify(parsed)));

    expect(roundTripped).toEqual(parsed);
  });
});
