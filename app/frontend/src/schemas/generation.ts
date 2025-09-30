import { z } from 'zod';

import type { GenerationJobStatus } from '@/types/generation';
import type { GenerationResult } from '@/types/app';

import { JsonObjectSchema } from './json';

const NormalizedStatusSchema = z.string();

const NullableString = z.union([z.string(), z.null()]).optional();

const NullableIsoString = z.union([z.string(), z.null()]).optional();

const RequiredIdSchema = z.preprocess(
  (value) => {
    if (typeof value === 'number' || typeof value === 'string') {
      return String(value);
    }
    return value;
  },
  z.string(),
);

const OptionalJobIdSchema = z.preprocess(
  (value) => {
    if (value == null) {
      return null;
    }
    if (typeof value === 'number' || typeof value === 'string') {
      return String(value);
    }
    return value;
  },
  z.union([z.string(), z.null()]).optional(),
);

export const GenerationJobStatusSchema = z
  .object({
    id: RequiredIdSchema,
    jobId: OptionalJobIdSchema,
    prompt: NullableString,
    name: NullableString,
    status: NormalizedStatusSchema,
    progress: z.coerce.number().finite().min(0),
    message: NullableString,
    error: NullableString,
    params: JsonObjectSchema.nullish(),
    created_at: z.string(),
    startTime: NullableIsoString,
    finished_at: NullableIsoString,
    result: JsonObjectSchema.nullish(),
  })
  .passthrough()
  .transform((value) => ({
    ...value,
    jobId: value.jobId ?? null,
    prompt: value.prompt ?? null,
    name: value.name ?? null,
    message: value.message ?? null,
    error: value.error ?? null,
    params: value.params ?? null,
    startTime: value.startTime ?? null,
    finished_at: value.finished_at ?? null,
    result: value.result ?? null,
  })) satisfies z.ZodType<GenerationJobStatus>;

export const GenerationResultSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    job_id: z
      .preprocess((value) => {
        if (value == null) {
          return undefined;
        }
        if (typeof value === 'number' || typeof value === 'string') {
          return String(value);
        }
        return value;
      }, z.string().optional()),
    result_id: z.union([z.string(), z.number()]).optional(),
    prompt: z.string().optional(),
    negative_prompt: NullableString,
    image_url: NullableString,
    thumbnail_url: NullableString,
    width: z.number().finite().optional(),
    height: z.number().finite().optional(),
    steps: z.number().finite().optional(),
    cfg_scale: z.number().finite().optional(),
    seed: z.number().finite().nullable().optional(),
    created_at: z.string().optional(),
    finished_at: NullableIsoString,
    status: NormalizedStatusSchema.optional(),
    generation_info: JsonObjectSchema.nullish(),
  })
  .passthrough()
  .transform((value) => ({
    ...value,
    negative_prompt: value.negative_prompt ?? null,
    image_url: value.image_url ?? null,
    thumbnail_url: value.thumbnail_url ?? null,
    seed: value.seed ?? null,
    finished_at: value.finished_at ?? null,
    generation_info: value.generation_info ?? null,
  })) satisfies z.ZodType<GenerationResult>;
