import type { BackendClient } from '@/services/backendClient';
import {
  createBackendPathResolver,
  resolveClient,
  withSameOrigin,
  type BackendClientInput,
} from '@/services/shared/backendHelpers';
import { SystemStatusPayloadSchema } from '@/schemas';
import type {
  GenerationJobStatus,
  GenerationResult,
  SystemStatusPayload,
} from '@/types';
import { logValidationIssues, parseGenerationJobStatuses, parseGenerationResults } from './validation';

const systemPaths = createBackendPathResolver('system');
const generationPaths = createBackendPathResolver('generation');
const systemPath = systemPaths.path;
const generationPath = generationPaths.path;

const resolveBackendInput = (
  options: GenerationBackendClientOptions,
): BackendClientInput => {
  const resolvedClient = options.resolveBackendClient?.();
  if (resolvedClient) {
    return resolvedClient;
  }

  if (options.client) {
    return options.client;
  }

  const backendUrl = options.getBackendUrl?.();
  if (backendUrl) {
    return backendUrl;
  }

  return undefined;
};

export interface GenerationBackendClientOptions {
  client?: BackendClient | null;
  resolveBackendClient?: () => BackendClient | null | undefined;
  getBackendUrl?: () => string | null | undefined;
}

export interface GenerationBackendClient {
  resolveClient: () => BackendClient;
  fetchSystemStatus: () => Promise<SystemStatusPayload | null>;
  fetchActiveJobs: () => Promise<GenerationJobStatus[]>;
  fetchRecentResults: (limit: number) => Promise<GenerationResult[]>;
}

export const createGenerationBackendClient = (
  options: GenerationBackendClientOptions = {},
): GenerationBackendClient => {
  const resolveBackendClient = (): BackendClient => {
    const input = resolveBackendInput(options);
    return resolveClient(input);
  };

  const fetchSystemStatus = async (): Promise<SystemStatusPayload | null> => {
    const backend = resolveBackendClient();
    const result = await backend.requestJson<unknown>(
      systemPath('status'),
      withSameOrigin(),
    );

    if (result.data == null) {
      return null;
    }

    const parsed = SystemStatusPayloadSchema.safeParse(result.data);
    if (!parsed.success) {
      logValidationIssues('system status', parsed.error, result.data);
      return null;
    }

    return parsed.data;
  };

  const fetchActiveJobs = async (): Promise<GenerationJobStatus[]> => {
    const backend = resolveBackendClient();
    const result = await backend.requestJson<unknown>(
      generationPath('jobs/active'),
      withSameOrigin(),
    );
    return parseGenerationJobStatuses(result.data, 'active job');
  };

  const fetchRecentResults = async (limit: number): Promise<GenerationResult[]> => {
    const backend = resolveBackendClient();
    const normalizedLimit = Math.max(1, Number(limit) || 1);
    const result = await backend.requestJson<unknown>(
      generationPath(`results?limit=${normalizedLimit}`),
      withSameOrigin(),
    );
    return parseGenerationResults(result.data, 'recent result');
  };

  return {
    resolveClient: resolveBackendClient,
    fetchSystemStatus,
    fetchActiveJobs,
    fetchRecentResults,
  };
};

