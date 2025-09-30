import {
  cancelGenerationJob,
  deleteGenerationResult,
  resolveBackendUrl,
  resolveGenerationRoute,
  startGeneration,
} from './generationService';
import { requestJson } from '@/services/apiClient';
import { normalizeJobStatus } from '@/utils/status';
import {
  logValidationIssues,
  parseGenerationJobStatuses,
  parseGenerationResults,
} from './validation';
import { SystemStatusPayloadSchema } from '@/schemas';
import type {
  GenerationJobStatus,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  SystemStatusPayload,
} from '@/types';

const withCredentials = (init: RequestInit = {}): RequestInit => ({
  credentials: 'same-origin',
  ...init,
});

export interface GenerationQueueClientOptions {
  getBackendUrl: () => string | null | undefined;
}

export interface GenerationQueueClient {
  startGeneration(payload: GenerationRequestPayload): Promise<GenerationStartResponse>;
  cancelJob(jobId: string): Promise<void>;
  deleteResult(resultId: string | number): Promise<void>;
  fetchSystemStatus(): Promise<SystemStatusPayload | null>;
  fetchActiveJobs(): Promise<GenerationJobStatus[]>;
  fetchRecentResults(limit: number): Promise<GenerationResult[]>;
}

export const createGenerationQueueClient = (
  options: GenerationQueueClientOptions,
): GenerationQueueClient => {
  const resolveBackend = () => options.getBackendUrl?.() ?? null;

  const buildUrl = (path: string): string => resolveBackendUrl(path, resolveBackend() ?? undefined);

  const buildGenerationUrl = (path: string): string =>
    resolveGenerationRoute(path, resolveBackend() ?? undefined);

  const fetchSystemStatus = async (): Promise<SystemStatusPayload | null> => {
    try {
      const result = await requestJson<unknown>(buildUrl('/system/status'), withCredentials());
      if (result.data == null) {
        return null;
      }
      const parsed = SystemStatusPayloadSchema.safeParse(result.data);
      if (parsed.success) {
        return parsed.data;
      }
      logValidationIssues('system status', parsed.error, result.data);
      return null;
    } catch (error) {
      console.error('Failed to load system status:', error);
      throw error;
    }
  };

  const fetchActiveJobs = async (): Promise<GenerationJobStatus[]> => {
    try {
      const result = await requestJson<unknown>(
        buildGenerationUrl('jobs/active'),
        withCredentials(),
      );
      const parsed = parseGenerationJobStatuses(result.data, 'active job');
      return parsed.map((status) => ({
        ...status,
        status: normalizeJobStatus(status.status),
      }));
    } catch (error) {
      console.error('Failed to load active jobs:', error);
      throw error;
    }
  };

  const fetchRecentResults = async (limit: number): Promise<GenerationResult[]> => {
    const normalizedLimit = Math.max(1, Number(limit) || 1);
    try {
      const result = await requestJson<unknown>(
        buildGenerationUrl(`results?limit=${normalizedLimit}`),
        withCredentials(),
      );
      return parseGenerationResults(result.data, 'recent result');
    } catch (error) {
      console.error('Failed to load recent results:', error);
      throw error;
    }
  };

  return {
    startGeneration: async (payload: GenerationRequestPayload) =>
      startGeneration(payload, resolveBackend() ?? undefined),
    cancelJob: async (jobId: string) => {
      await cancelGenerationJob(jobId, resolveBackend() ?? undefined);
    },
    deleteResult: async (resultId: string | number) => {
      await deleteGenerationResult(resultId, resolveBackend() ?? undefined);
    },
    fetchSystemStatus,
    fetchActiveJobs,
    fetchRecentResults,
  };
};

