import type {
  GenerationHistoryResult,
  GenerationLoraReference,
  GenerationResult,
  JsonObject,
} from '@/types';
import type { DeepReadonly } from '@/utils/freezeDeep';

const ensureCreatedAt = (timestamp?: string): string => {
  if (typeof timestamp === 'string' && timestamp.trim()) {
    return timestamp;
  }
  return new Date().toISOString();
};

export const toHistoryResult = (
  result: DeepReadonly<GenerationResult> | GenerationResult,
): GenerationHistoryResult => ({
  id: result.id,
  job_id: result.job_id ?? undefined,
  prompt: result.prompt ?? null,
  negative_prompt: result.negative_prompt ?? null,
  status: result.status ?? null,
  image_url: result.image_url ?? null,
  thumbnail_url: result.thumbnail_url ?? null,
  created_at: ensureCreatedAt(result.created_at),
  finished_at: result.finished_at ?? null,
  width: result.width ?? null,
  height: result.height ?? null,
  steps: result.steps ?? null,
  cfg_scale: result.cfg_scale ?? null,
  seed: result.seed ?? null,
  generation_info: (result.generation_info ?? null) as JsonObject | null,
  metadata: (result.metadata ?? null) as JsonObject | null,
  loras: Array.isArray(result.loras)
    ? [...result.loras] as GenerationLoraReference[]
    : null,
});

export const toGenerationResult = (result: GenerationHistoryResult): GenerationResult => ({
  id: result.id,
  job_id: result.job_id ?? undefined,
  prompt: result.prompt ?? undefined,
  negative_prompt: result.negative_prompt ?? null,
  image_url: result.image_url ?? null,
  thumbnail_url: result.thumbnail_url ?? null,
  width: result.width ?? undefined,
  height: result.height ?? undefined,
  steps: result.steps ?? undefined,
  cfg_scale: result.cfg_scale ?? undefined,
  seed: result.seed ?? null,
  created_at: result.created_at,
  finished_at: result.finished_at ?? null,
  status: result.status ?? undefined,
  generation_info: (result.generation_info ?? null) as JsonObject | null,
  metadata: (result.metadata ?? null) as JsonObject | null,
  loras: Array.isArray(result.loras)
    ? [...result.loras] as GenerationLoraReference[]
    : null,
});

export const mapGenerationResultsToHistory = (
  results: readonly (DeepReadonly<GenerationResult> | GenerationResult)[],
): GenerationHistoryResult[] => results.map((result) => toHistoryResult(result));

export const mapHistoryResultsToGeneration = (
  results: readonly GenerationHistoryResult[],
): GenerationResult[] => results.map((result) => toGenerationResult(result));
