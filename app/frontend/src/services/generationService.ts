import type {
  CompositionEntry,
  GenerationCancelResponse,
  GenerationDownloadMetadata,
  GenerationFormState,
  GenerationRequestPayload,
  GenerationStartResponse,
  SDNextGenerationParams,
  SDNextGenerationResult,
} from '@/types';
import {
  deleteRequest,
  ensureData,
  getFilenameFromContentDisposition,
  postJson,
  requestBlob,
  requestJson,
} from '@/utils/api';

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

const sanitizeNegativePrompt = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const toGenerationRequestPayload = (
  state: GenerationFormState,
): GenerationRequestPayload => ({
  prompt: state.prompt,
  negative_prompt: sanitizeNegativePrompt(state.negative_prompt),
  steps: state.steps,
  sampler_name: state.sampler_name,
  cfg_scale: state.cfg_scale,
  width: state.width,
  height: state.height,
  seed: state.seed,
  batch_size: state.batch_size,
  n_iter: state.batch_count,
  denoising_strength: state.denoising_strength ?? null,
});

export const startGeneration = async (
  payload: GenerationRequestPayload,
): Promise<GenerationStartResponse> => {
  const result = await postJson<GenerationStartResponse, GenerationRequestPayload>(
    '/api/v1/generation/generate',
    payload,
    { credentials: 'same-origin' },
  );
  return ensureData(result);
};

export const cancelGenerationJob = async (
  jobId: string,
): Promise<GenerationCancelResponse | null> => {
  const { data } = await requestJson<GenerationCancelResponse>(
    `/api/v1/generation/jobs/${encodeURIComponent(jobId)}/cancel`,
    {
      method: 'POST',
      credentials: 'same-origin',
    },
  );
  return data ?? null;
};

export const deleteGenerationResult = async (
  resultId: string | number,
): Promise<void> => {
  await deleteRequest<unknown>(`/api/v1/generation/results/${resultId}`, {
    credentials: 'same-origin',
  });
};

export const downloadGenerationResult = async (
  resultId: string | number,
  fallbackName = `generation-${resultId}`,
): Promise<GenerationDownloadMetadata> => {
  const { blob, response } = await requestBlob(
    `/api/v1/generation/results/${resultId}/download`,
    { credentials: 'same-origin' },
  );
  return {
    blob,
    filename:
      getFilenameFromContentDisposition(response.headers.get('content-disposition'))
      ?? `${fallbackName}.png`,
    contentType: response.headers.get('content-type'),
    size: blob.size,
  };
};

