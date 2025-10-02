import { z, type ZodIssue } from 'zod';

import { JsonObjectSchema } from '@/schemas/json';
import type { RecommendationItem, RecommendationResponse } from '@/types';

export class RecommendationsServiceParseError extends Error {
  public readonly issues?: readonly ZodIssue[];

  constructor(message: string, options?: { cause?: unknown; issues?: readonly ZodIssue[] }) {
    super(message);
    this.name = 'RecommendationsServiceParseError';
    if (options?.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
    this.issues = options?.issues;
  }
}

const NullableString = z.union([z.string(), z.null()]).optional();
const NullableNumber = z.number().finite().nullable().optional();

export const RecommendationItemSchema: z.ZodType<RecommendationItem> = z
  .object({
    lora_id: z.string(),
    lora_name: z.string(),
    lora_description: NullableString,
    similarity_score: z.number().finite(),
    final_score: z.number().finite(),
    explanation: z.string(),
    semantic_similarity: NullableNumber,
    artistic_similarity: NullableNumber,
    technical_similarity: NullableNumber,
    quality_boost: NullableNumber,
    popularity_boost: NullableNumber,
    recency_boost: NullableNumber,
    metadata: JsonObjectSchema.nullish(),
  })
  .passthrough();

export const RecommendationResponseSchema: z.ZodType<RecommendationResponse> = z
  .object({
    target_lora_id: NullableString,
    prompt: NullableString,
    recommendations: z.array(RecommendationItemSchema),
    total_candidates: z.number().int(),
    processing_time_ms: z.number().finite(),
    recommendation_config: JsonObjectSchema,
    generated_at: z.string(),
  })
  .passthrough()
  .transform((payload) => ({
    ...payload,
    recommendation_config: payload.recommendation_config ?? {},
    recommendations: Array.isArray(payload.recommendations) ? payload.recommendations : [],
  }));

const formatIssues = (issues: readonly ZodIssue[]): string =>
  issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

const createParseError = (context: string, error: unknown): RecommendationsServiceParseError => {
  if (error instanceof z.ZodError) {
    const message = `${context} validation failed: ${formatIssues(error.issues)}`;
    if (import.meta.env.DEV) {
      console.warn('[recommendations] schema validation failed', { context, issues: error.issues });
    }
    return new RecommendationsServiceParseError(message, { cause: error, issues: error.issues });
  }

  if (import.meta.env.DEV) {
    console.warn('[recommendations] schema validation failed', { context, error });
  }
  return new RecommendationsServiceParseError(`${context} validation failed`, { cause: error });
};

export const parseRecommendationItem = (
  value: unknown,
  context = 'recommendation item',
): RecommendationItem => {
  const result = RecommendationItemSchema.safeParse(value);
  if (!result.success) {
    throw createParseError(context, result.error);
  }
  return result.data;
};

export const parseRecommendationResponse = (
  value: unknown,
  context = 'recommendation response',
): RecommendationResponse => {
  const result = RecommendationResponseSchema.safeParse(value);
  if (!result.success) {
    throw createParseError(context, result.error);
  }
  return result.data;
};
