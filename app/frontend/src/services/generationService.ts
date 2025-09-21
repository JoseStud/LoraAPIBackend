import type { CompositionEntry, SDNextGenerationParams, SDNextGenerationResult } from '@/types';
import { postJson } from '@/utils/api';

export type GenerationParamOverrides =
  & Pick<SDNextGenerationParams, 'prompt'>
  & Partial<Omit<SDNextGenerationParams, 'prompt'>>;

export type GenerationRequestBody = SDNextGenerationParams & {
  loras?: CompositionEntry[];
};

export const createGenerationParams = (
  overrides: GenerationParamOverrides,
): SDNextGenerationParams => ({
  prompt: overrides.prompt,
  negative_prompt: overrides.negative_prompt ?? null,
  steps: overrides.steps ?? 20,
  sampler_name: overrides.sampler_name ?? 'DPM++ 2M',
  cfg_scale: overrides.cfg_scale ?? 7.0,
  width: overrides.width ?? 512,
  height: overrides.height ?? 512,
  seed: overrides.seed ?? -1,
  batch_size: overrides.batch_size ?? 1,
  n_iter: overrides.n_iter ?? 1,
  denoising_strength: overrides.denoising_strength ?? null,
});

export const requestGeneration = async (
  payload: GenerationRequestBody,
): Promise<SDNextGenerationResult | null> => {
  const { data } = await postJson<SDNextGenerationResult, GenerationRequestBody>(
    '/api/v1/generation/generate',
    payload,
    { credentials: 'same-origin' },
  );
  return data;
};

