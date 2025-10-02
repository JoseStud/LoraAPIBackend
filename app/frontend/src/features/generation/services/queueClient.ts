import { cancelGenerationJob, deleteGenerationResult, startGeneration } from './generationService';
import {
  createGenerationBackendClient,
  type GenerationBackendClientOptions,
} from './generationBackendClient';
import type {
  GenerationJobStatus,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  SystemStatusPayload,
} from '@/types';

export interface GenerationQueueClientOptions extends GenerationBackendClientOptions {}

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
  const backendClient = createGenerationBackendClient(options);

  return {
    startGeneration: async (payload: GenerationRequestPayload) =>
      startGeneration(payload, backendClient.resolveClient()),
    cancelJob: async (jobId: string) => {
      await cancelGenerationJob(jobId, backendClient.resolveClient());
    },
    deleteResult: async (resultId: string | number) => {
      await deleteGenerationResult(resultId, backendClient.resolveClient());
    },
    fetchSystemStatus: async () => {
      try {
        return await backendClient.fetchSystemStatus();
      } catch (error) {
        console.error('Failed to load system status:', error);
        throw error;
      }
    },
    fetchActiveJobs: async (): Promise<GenerationJobStatus[]> => {
      try {
        return await backendClient.fetchActiveJobs();
      } catch (error) {
        console.error('Failed to load active jobs:', error);
        throw error;
      }
    },
    fetchRecentResults: async (limit: number): Promise<GenerationResult[]> => {
      try {
        return await backendClient.fetchRecentResults(limit);
      } catch (error) {
        console.error('Failed to load recent results:', error);
        throw error;
      }
    },
  };
};

