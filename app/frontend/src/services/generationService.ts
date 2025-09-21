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
import { useSettingsStore } from '@/stores/settings';
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

const DEFAULT_BACKEND_BASE = '/api/v1';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, '');

const splitPathSuffix = (input: string): { pathname: string; suffix: string } => {
  const match = input.match(/^([^?#]*)(.*)$/);
  if (!match) {
    return { pathname: input, suffix: '' };
  }
  return { pathname: match[1] ?? '', suffix: match[2] ?? '' };
};

const selectBackendBase = (override?: string | null): string => {
  const overrideValue = typeof override === 'string' ? override.trim() : '';
  if (overrideValue.length > 0) {
    return overrideValue;
  }

  const settingsStore = useSettingsStore();
  const configured = settingsStore.backendUrl.trim();
  if (configured.length > 0) {
    return configured;
  }

  return DEFAULT_BACKEND_BASE;
};

const normaliseBackendBase = (base: string): string => {
  if (/^https?:\/\//i.test(base)) {
    return trimTrailingSlash(base);
  }

  const withoutTrailing = trimTrailingSlash(base);
  if (!withoutTrailing) {
    return DEFAULT_BACKEND_BASE;
  }

  return withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;
};

const joinBackendPath = (base: string, path: string): string => {
  const { pathname, suffix } = splitPathSuffix(path);
  const normalisedBase = trimTrailingSlash(base);
  const normalisedPathname = trimLeadingSlash(pathname);

  if (!normalisedPathname) {
    return normalisedBase || DEFAULT_BACKEND_BASE;
  }

  if (!normalisedBase) {
    return `/${normalisedPathname}${suffix}`;
  }

  const combined = /^https?:\/\//i.test(normalisedBase)
    ? `${normalisedBase}/${normalisedPathname}`
    : `${normalisedBase}/${normalisedPathname}`.replace(/^\/+/, '/');

  return `${combined}${suffix}`;
};

export const resolveGenerationBaseUrl = (baseOverride?: string | null): string => {
  const base = selectBackendBase(baseOverride);
  return normaliseBackendBase(base);
};

export const resolveBackendUrl = (path = '', baseOverride?: string | null): string => {
  const base = resolveGenerationBaseUrl(baseOverride);
  if (!path) {
    return base;
  }
  return joinBackendPath(base, path);
};

const resolveGenerationRoute = (path: string, baseOverride?: string | null): string =>
  resolveBackendUrl(`/generation/${trimLeadingSlash(path)}`, baseOverride);

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
  baseUrl?: string | null,
): Promise<SDNextGenerationResult | null> => {
  const { data } = await postJson<SDNextGenerationResult, GenerationRequestBody>(
    resolveGenerationRoute('generate', baseUrl),
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
  baseUrl?: string | null,
): Promise<GenerationStartResponse> => {
  const result = await postJson<GenerationStartResponse, GenerationRequestPayload>(
    resolveGenerationRoute('generate', baseUrl),
    payload,
    { credentials: 'same-origin' },
  );
  return ensureData(result);
};

export const cancelGenerationJob = async (
  jobId: string,
  baseUrl?: string | null,
): Promise<GenerationCancelResponse | null> => {
  const { data } = await requestJson<GenerationCancelResponse>(
    resolveGenerationRoute(`jobs/${encodeURIComponent(jobId)}/cancel`, baseUrl),
    {
      method: 'POST',
      credentials: 'same-origin',
    },
  );
  return data ?? null;
};

export const deleteGenerationResult = async (
  resultId: string | number,
  baseUrl?: string | null,
): Promise<void> => {
  await deleteRequest<unknown>(resolveGenerationRoute(`results/${resultId}`, baseUrl), {
    credentials: 'same-origin',
  });
};

export const downloadGenerationResult = async (
  resultId: string | number,
  fallbackName = `generation-${resultId}`,
  baseUrl?: string | null,
): Promise<GenerationDownloadMetadata> => {
  const { blob, response } = await requestBlob(
    resolveGenerationRoute(`results/${resultId}/download`, baseUrl),
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

