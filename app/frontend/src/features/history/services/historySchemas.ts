import { z, type ZodIssue } from 'zod';

import { JsonObjectSchema } from '@/schemas/json';
import type {
  GenerationHistoryListPayload,
  GenerationHistoryListResponse,
  GenerationHistoryResult,
  GenerationHistoryStats,
  GenerationLoraReference,
} from '@/types';

export class HistoryServiceParseError extends Error {
  public readonly issues?: readonly ZodIssue[];

  constructor(message: string, options?: { cause?: unknown; issues?: readonly ZodIssue[] }) {
    super(message);
    this.name = 'HistoryServiceParseError';
    if (options?.cause !== undefined) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error Node 16 does not yet define ErrorOptions in lib.dom.d.ts
      this.cause = options.cause;
    }
    this.issues = options?.issues;
  }
}

const NullableString = z.union([z.string(), z.null()]).optional();
const NullableNumber = z.number().finite().nullable().optional();

const GenerationLoraReferenceSchema: z.ZodType<GenerationLoraReference> = z
  .object({
    id: z.string(),
    name: NullableString,
    version: NullableString,
    weight: NullableNumber,
    adapter_id: NullableString,
    extra: JsonObjectSchema.nullish(),
  })
  .passthrough();

const GenerationHistoryStatsSchema: z.ZodType<GenerationHistoryStats> = z
  .object({
    total_results: z.number().finite(),
    avg_rating: z.number().finite(),
    total_favorites: z.number().finite(),
    total_size: z.number().finite(),
  })
  .transform((stats) => ({
    total_results: stats.total_results,
    avg_rating: stats.avg_rating,
    total_favorites: stats.total_favorites,
    total_size: stats.total_size,
  }));

const GenerationHistoryResultSchema: z.ZodType<GenerationHistoryResult> = z
  .object({
    id: z.union([z.string(), z.number()]),
    job_id: z.union([z.string(), z.number()]).optional(),
    jobId: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional().nullable(),
    prompt: z.string().optional(),
    negative_prompt: NullableString,
    image_url: NullableString,
    thumbnail_url: NullableString,
    width: z.number().finite().optional(),
    height: z.number().finite().optional(),
    steps: z.number().finite().optional(),
    cfg_scale: z.number().finite().optional(),
    seed: NullableNumber,
    created_at: z.string().optional(),
    finished_at: NullableString,
    updated_at: NullableString,
    sampler_name: NullableString,
    sampler: NullableString,
    model: NullableString,
    model_name: NullableString,
    clip_skip: NullableNumber,
    generation_info: JsonObjectSchema.nullish(),
    metadata: JsonObjectSchema.nullish(),
    loras: z.array(GenerationLoraReferenceSchema).nullish(),
    rating: NullableNumber,
    is_favorite: z.boolean().optional(),
    rating_updated_at: NullableString,
    favorite_updated_at: NullableString,
  })
  .passthrough();

const GenerationHistoryListResponseSchema: z.ZodType<GenerationHistoryListResponse> = z
  .object({
    results: z.array(GenerationHistoryResultSchema),
    stats: GenerationHistoryStatsSchema.optional(),
    page: z.number().int().optional(),
    page_size: z.number().int().optional(),
    total: z.number().int().optional(),
    pages: z.number().int().optional(),
    has_more: z.boolean().optional(),
    next_page: z.number().int().nullable().optional(),
    previous_page: z.number().int().nullable().optional(),
  })
  .passthrough();

const GenerationHistoryListPayloadSchema: z.ZodType<GenerationHistoryListPayload> = z.union([
  z.array(GenerationHistoryResultSchema),
  GenerationHistoryListResponseSchema,
]);

const formatIssues = (issues: readonly ZodIssue[]): string =>
  issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

const createParseError = (context: string, error: unknown): HistoryServiceParseError => {
  if (error instanceof z.ZodError) {
    const message = `${context} validation failed: ${formatIssues(error.issues)}`;
    console.warn(`[history] ${context} validation failed`, { issues: error.issues });
    return new HistoryServiceParseError(message, { cause: error, issues: error.issues });
  }

  console.warn(`[history] ${context} validation failed`, { error });
  return new HistoryServiceParseError(`${context} validation failed`, { cause: error });
};

export const parseHistoryResult = (value: unknown, context = 'history result'):
  | GenerationHistoryResult
  | null => {
  if (value == null) {
    return null;
  }

  const result = GenerationHistoryResultSchema.safeParse(value);
  if (!result.success) {
    throw createParseError(context, result.error);
  }

  return result.data;
};

export const parseHistoryListPayload = (
  value: unknown,
  context = 'history list response',
): GenerationHistoryListPayload | null => {
  if (value == null) {
    return null;
  }

  const result = GenerationHistoryListPayloadSchema.safeParse(value);
  if (!result.success) {
    throw createParseError(context, result.error);
  }

  return result.data;
};

export const parseHistoryStats = (
  value: unknown,
  context = 'history stats',
): GenerationHistoryStats | null => {
  if (value == null) {
    return null;
  }

  const result = GenerationHistoryStatsSchema.safeParse(value);
  if (!result.success) {
    throw createParseError(context, result.error);
  }

  return result.data;
};
