import type {
  CompositionEntry,
  GenerationCancelResponse,
  GenerationDownloadMetadata,
  GenerationFormState,
  GenerationJobStatus,
  GenerationRequestPayload,
  GenerationStartResponse,
  SDNextGenerationParams,
  SDNextGenerationResult,
} from '@/types';
import { ensureData, getFilenameFromContentDisposition } from '@/services/apiClient';
import {
  createBackendClient,
  resolveBackendClient,
  type ApiRequestInit,
  type BackendClient,
} from '@/services/backendClient';
import { resolveGenerationRoute as buildGenerationRoute } from '@/utils/backend';

export type GenerationParamOverrides =
  & Pick<SDNextGenerationParams, 'prompt'>
  & Partial<Omit<SDNextGenerationParams, 'prompt'>>;

export type GenerationRequestBody = SDNextGenerationParams & {
  loras?: CompositionEntry[];
};

type GenerationClientInput = BackendClient | string | null | undefined;

const generationPath = (path = ''): string => buildGenerationRoute(path);

const resolveClient = (input?: GenerationClientInput): BackendClient => {
  if (typeof input === 'string') {
    return createBackendClient(input);
  }

  if (input == null) {
    return resolveBackendClient();
  }

  return resolveBackendClient(input);
};

const withSameOrigin = (init: ApiRequestInit = {}): ApiRequestInit => ({
  credentials: 'same-origin',
  ...init,
});

export const resolveGenerationBaseUrl = (input?: GenerationClientInput): string =>
  resolveClient(input).resolve(generationPath());

export const resolveBackendUrl = (path: string, input?: GenerationClientInput): string =>
  resolveClient(input).resolve(path);

export const resolveGenerationRoute = (path: string, input?: GenerationClientInput): string =>
  resolveClient(input).resolve(generationPath(path));

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
  input?: GenerationClientInput,
): Promise<SDNextGenerationResult | null> => {
  const backend = resolveClient(input);
  const { data } = await backend.postJson<SDNextGenerationResult, GenerationRequestBody>(
    generationPath('generate'),
    payload,
    withSameOrigin(),
  );
  return data ?? null;
};

export const fetchActiveGenerationJobs = async (
  input?: GenerationClientInput,
): Promise<GenerationJobStatus[]> => {
  const backend = resolveClient(input);
  const result = await backend.requestJson<GenerationJobStatus[]>(
    generationPath('jobs/active'),
    withSameOrigin(),
  );
  return Array.isArray(result.data) ? result.data : [];
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
  input?: GenerationClientInput,
): Promise<GenerationStartResponse> => {
  const backend = resolveClient(input);
  const result = await backend.postJson<GenerationStartResponse, GenerationRequestPayload>(
    generationPath('generate'),
    payload,
    withSameOrigin(),
  );
  return ensureData(result);
};

export const cancelGenerationJob = async (
  jobId: string,
  input?: GenerationClientInput,
): Promise<GenerationCancelResponse | null> => {
  const backend = resolveClient(input);
  const { data } = await backend.requestJson<GenerationCancelResponse>(
    generationPath(`jobs/${encodeURIComponent(jobId)}/cancel`),
    withSameOrigin({ method: 'POST' }),
  );
  return data ?? null;
};

export const deleteGenerationResult = async (
  resultId: string | number,
  input?: GenerationClientInput,
): Promise<void> => {
  const backend = resolveClient(input);
  await backend.delete(generationPath(`results/${resultId}`), withSameOrigin());
};

export const downloadGenerationResult = async (
  resultId: string | number,
  fallbackName = `generation-${resultId}`,
  input?: GenerationClientInput,
): Promise<GenerationDownloadMetadata> => {
  const backend = resolveClient(input);
  const { blob, response } = await backend.requestBlob(
    generationPath(`results/${resultId}/download`),
    withSameOrigin({ method: 'GET' }),
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
