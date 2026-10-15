import { z } from 'zod';

import type { GenerationJobStatus } from '@/types/generation';
import type { GenerationRequestPayload, GenerationResult, ProgressUpdate } from '@/types';
import { normalizeJobStatus } from '@/utils/status';

import { JsonObjectSchema } from './json';

const NormalizedStatusSchema = z.string();

const NullableString = z.union([z.string(), z.null()]).optional();

const NullableIsoString = z.union([z.string(), z.null()]).optional();
// The backend sends null for unset image settings; treat it as absent.
const OptionalNumber = z
  .number()
  .finite()
  .nullish()
  .transform((value) => value ?? undefined);

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
    width: OptionalNumber,
    height: OptionalNumber,
    steps: OptionalNumber,
    cfg_scale: OptionalNumber,
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

/** Response from `POST /generation/queue-generation`. */
export const DeliveryCreateResponseSchema = z.object({
  delivery_id: z.string().min(1),
});

// Progress WebSocket (`/ws/progress`). Every message is a `WebSocketMessage`
// envelope (backend/schemas/common.py) whose payload sits in `data`.

export const GenerationSocketEnvelopeSchema = z.object({
  type: z.string(),
  timestamp: z.string(),
  data: JsonObjectSchema,
});

const NullableFiniteNumber = z.number().finite().nullish();

/** `data` of a `progress_update` message (`ProgressUpdate`). */
export const ProgressUpdateSchema = z
  .object({
    job_id: RequiredIdSchema,
    progress: z.number().finite(),
    status: z.string(),
    current_step: NullableFiniteNumber,
    total_steps: NullableFiniteNumber,
    eta_seconds: NullableFiniteNumber,
    preview_image: NullableString,
    error_message: NullableString,
  })
  .transform((value): ProgressUpdate => ({
    ...value,
    status: normalizeJobStatus(value.status),
  }));

/** `data` of a `generation_complete` message (`GenerationComplete`). */
export const GenerationCompletePayloadSchema = z.object({
  job_id: RequiredIdSchema,
  status: z.string(),
  images: z.array(z.string()).nullish(),
  error_message: NullableString,
  total_duration: NullableFiniteNumber,
  generation_info: JsonObjectSchema.nullish(),
});

/** `data` of a `generation_started` message (`GenerationStarted`). */
export const GenerationStartedPayloadSchema = z.object({
  job_id: RequiredIdSchema,
  params: JsonObjectSchema,
  estimated_duration: NullableFiniteNumber,
});
