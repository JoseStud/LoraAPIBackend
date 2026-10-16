/**
 * The generation feature's HTTP surface: payload builders, URL resolvers and every generation
 * request, validated with Zod before it is returned. `createGenerationQueueClient` binds these
 * requests to a backend URL getter; it is the one typed client the orchestrator transport
 * (`stores/orchestrator/transportAdapter.ts`) talks to. `/system/status` is not here: the
 * shared `stores/systemStatusController.ts` owns it.
 */
import type {
  CompositionEntry,
  DeliveryCreateResponse,
  GenerationCancelResponse,
  GenerationDownloadMetadata,
  GenerationFormState,
  GenerationJobStatus,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  SDNextGenerationParams,
  SDNextGenerationResult,
} from '@/types';
import {
  createBackendPathResolver,
  ensureData,
  getFilenameFromContentDisposition,
  resolveBackendClient as resolveClient,
  resolveBackendPath,
  type BackendHttpClient,
  type BackendHttpClientInput,
} from '@/services/shared/http';
import { withSameOrigin } from '@/utils/backend';
import { DeliveryCreateResponseSchema, GenerationRequestPayloadSchema } from '@/schemas';
import { parseGenerationJobStatuses, parseGenerationResults } from './validation';

export type GenerationParamOverrides =
  & Pick<SDNextGenerationParams, 'prompt'>
  & Partial<Omit<SDNextGenerationParams, 'prompt'>>;

export type GenerationRequestBody = SDNextGenerationParams & {
  loras?: CompositionEntry[];
};

type GenerationClientInput = BackendHttpClientInput;

const generationPaths = createBackendPathResolver('generation');
const generationPath = generationPaths.path;

export const resolveGenerationBaseUrl = (input?: GenerationClientInput): string =>
  generationPaths.resolve('', input);

export const resolveBackendUrl = (path: string, input?: GenerationClientInput): string =>
  resolveBackendPath(path, input);

export const resolveGenerationRoute = (path: string, input?: GenerationClientInput): string =>
  generationPaths.resolve(path, input);

export const createGenerationParams = (
  overrides: GenerationParamOverrides,
): SDNextGenerationParams =>
  GenerationRequestPayloadSchema.parse({
    prompt: overrides.prompt,
    negative_prompt: overrides.negative_prompt,
    steps: overrides.steps ?? 20,
    sampler_name: overrides.sampler_name ?? 'DPM++ 2M',
    cfg_scale: overrides.cfg_scale ?? 7.0,
    width: overrides.width ?? 512,
    height: overrides.height ?? 512,
    seed: overrides.seed ?? -1,
    batch_size: overrides.batch_size ?? 1,
    n_iter: overrides.n_iter ?? 1,
    denoising_strength: overrides.denoising_strength,
  });

export const requestGeneration = async (
  payload: GenerationRequestBody,
  input?: GenerationClientInput,
): Promise<SDNextGenerationResult | null> => {
  const backend = resolveClient(input);
  const normalizedPayload = {
    ...payload,
    ...GenerationRequestPayloadSchema.parse(payload),
  };
  const { data } = await backend.postJson<SDNextGenerationResult, GenerationRequestBody>(
    generationPath('generate'),
    normalizedPayload,
    withSameOrigin(),
  );
  return data ?? null;
};

/** `GET /generation/jobs/active`; malformed records are logged and dropped. */
export const fetchActiveGenerationJobs = async (
  input?: GenerationClientInput,
): Promise<GenerationJobStatus[]> => {
  const backend = resolveClient(input);
  const result = await backend.requestJson<unknown>(
    generationPath('jobs/active'),
    withSameOrigin(),
  );
  return parseGenerationJobStatuses(result.data, 'active job');
};

/** `GET /generation/results?limit=…`; malformed records are logged and dropped. */
export const fetchRecentGenerationResults = async (
  limit: number,
  input?: GenerationClientInput,
): Promise<GenerationResult[]> => {
  const backend = resolveClient(input);
  const normalizedLimit = Math.max(1, Number(limit) || 1);
  const result = await backend.requestJson<unknown>(
    generationPath(`results?limit=${normalizedLimit}`),
    withSameOrigin(),
  );
  return parseGenerationResults(result.data, 'recent result');
};

export const toGenerationRequestPayload = (
  state: GenerationFormState,
): GenerationRequestPayload =>
  GenerationRequestPayloadSchema.parse({
    prompt: state.prompt,
    negative_prompt: state.negative_prompt,
    steps: state.steps,
    sampler_name: state.sampler_name,
    cfg_scale: state.cfg_scale,
    width: state.width,
    height: state.height,
    seed: state.seed,
    batch_size: state.batch_size,
    n_iter: state.batch_count,
    denoising_strength: state.denoising_strength,
  });

/**
 * Queue a generation on the backend worker. Progress and the finished result
 * arrive through the transport (WebSocket and active-job polling), so the
 * returned job always starts out queued.
 */
export const startGeneration = async (
  payload: GenerationRequestPayload,
  input?: GenerationClientInput,
): Promise<GenerationStartResponse> => {
  const backend = resolveClient(input);
  const normalizedPayload = GenerationRequestPayloadSchema.parse(payload);
  const result = await backend.postJson<DeliveryCreateResponse, GenerationRequestPayload>(
    generationPath('queue-generation'),
    normalizedPayload,
    withSameOrigin(),
  );
  const { delivery_id: jobId } = DeliveryCreateResponseSchema.parse(ensureData(result));
  return { job_id: jobId, status: 'queued', progress: 0 };
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

/** The generation requests the orchestrator transport needs, bound to one backend. */
export interface GenerationQueueClient {
  startGeneration(payload: GenerationRequestPayload): Promise<GenerationStartResponse>;
  cancelJob(jobId: string): Promise<void>;
  deleteResult(resultId: string | number): Promise<void>;
  fetchActiveJobs(): Promise<GenerationJobStatus[]>;
  fetchRecentResults(limit: number): Promise<GenerationResult[]>;
}

export interface GenerationQueueClientOptions {
  /** A fixed client; takes precedence over `getBackendUrl`. */
  client?: BackendHttpClient | null;
  /** Read on every request, so backend URL changes apply without recreating the client. */
  getBackendUrl?: () => string | null | undefined;
}

export const createGenerationQueueClient = (
  options: GenerationQueueClientOptions = {},
): GenerationQueueClient => {
  const backend = (): GenerationClientInput => options.client ?? (options.getBackendUrl?.() || undefined);

  return {
    startGeneration: (payload) => startGeneration(payload, backend()),
    cancelJob: async (jobId) => {
      await cancelGenerationJob(jobId, backend());
    },
    deleteResult: (resultId) => deleteGenerationResult(resultId, backend()),
    fetchActiveJobs: () => fetchActiveGenerationJobs(backend()),
    fetchRecentResults: (limit) => fetchRecentGenerationResults(limit, backend()),
  };
};
