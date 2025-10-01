import { z } from 'zod';

import type { GenerationJobStatus } from '@/types/generation';
import type { GenerationRequestPayload, GenerationResult } from '@/types';
import { normalizeJobStatus } from '@/utils/status';

import { JsonObjectSchema } from './json';

const NormalizedStatusSchema = z.string();

const NullableString = z.union([z.string(), z.null()]).optional();

const NullableIsoString = z.union([z.string(), z.null()]).optional();

const RequiredIdSchema = z
  .union([z.string(), z.number()])
  .transform((value): string => String(value));

const OptionalJobIdSchema = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value): string | null | undefined => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    return String(value);
  });

const GenerationJobStatusObject = z
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
  .passthrough();

export const GenerationJobStatusSchema = GenerationJobStatusObject.transform(
  (value): GenerationJobStatus => ({
    ...value,
    status: normalizeJobStatus(value.status),
    jobId: value.jobId ?? undefined,
    prompt: value.prompt ?? null,
    name: value.name ?? null,
    message: value.message ?? null,
    error: value.error ?? null,
    params: value.params ?? null,
    startTime: value.startTime ?? null,
    finished_at: value.finished_at ?? null,
    result: value.result ?? null,
    cfg_scale: typeof value.cfg_scale === 'number' ? value.cfg_scale : null,
    seed: typeof value.seed === 'number' ? value.seed : null,
  }),
);

const OptionalJobIdStringSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value): string | undefined => {
    if (value === undefined) {
      return undefined;
    }
    return String(value);
  });

const GenerationResultObject = z
  .object({
    id: z.union([z.string(), z.number()]),
    job_id: OptionalJobIdStringSchema,
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
  .passthrough();

export const GenerationResultSchema = GenerationResultObject.transform(
  (value): GenerationResult => ({
    ...value,
    status: value.status ? normalizeJobStatus(value.status) : undefined,
    negative_prompt: value.negative_prompt ?? null,
    image_url: value.image_url ?? null,
    thumbnail_url: value.thumbnail_url ?? null,
    seed: value.seed ?? null,
    finished_at: value.finished_at ?? null,
    generation_info: value.generation_info ?? null,
    created_at: value.created_at ?? new Date().toISOString(),
  }),
);

const NegativePromptSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value): string | null => {
    if (typeof value !== 'string') {
      return value ?? null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const NullableNumberSchema = z.union([z.number().finite(), z.null(), z.undefined()]).transform((value) => value ?? null);

export const GenerationRequestPayloadSchema: z.ZodType<GenerationRequestPayload> = z
  .object({
    prompt: z.string(),
    negative_prompt: NegativePromptSchema,
    steps: z.number().finite(),
    sampler_name: z.string(),
    cfg_scale: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
    seed: z.number().finite(),
    batch_size: z.number().finite(),
    n_iter: z.number().finite(),
    denoising_strength: NullableNumberSchema,
  })
  .passthrough()
  .transform((value) => ({
    ...value,
    negative_prompt: value.negative_prompt,
    denoising_strength: value.denoising_strength,
  }));
