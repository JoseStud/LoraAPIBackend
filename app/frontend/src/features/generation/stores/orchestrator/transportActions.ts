import type { QueueModule } from './queueModule';
import type { ResultsModule } from './resultsModule';
import type { TransportModule } from './transportModule';
import type {
  GenerationRequestPayload,
  GenerationStartResponse,
} from '@/types';

export interface TransportActionDependencies {
  queue: QueueModule;
  results: ResultsModule;
  transport: TransportModule;
}

export const createTransportActions = ({
  queue,
  results,
  transport,
}: TransportActionDependencies) => {
  const ensureTransport = () => transport.ensureTransport();

  const loadSystemStatusData = async (): Promise<void> => {
    await transport.withTransport((instance) => instance.refreshSystemStatus());
  };

  const loadActiveJobsData = async (): Promise<void> => {
    await transport.withTransport((instance) => instance.refreshActiveJobs());
  };

  const loadRecentResults = async (notifySuccess = false): Promise<void> => {
    await transport.withTransport((instance) =>
      instance.refreshRecentResults(results.historyLimit.value, notifySuccess),
    );
  };

  const refreshAllData = async (): Promise<void> => {
    await transport.withTransport((instance) =>
      instance.refreshAll(results.historyLimit.value),
    );
  };

  const handleBackendUrlChange = async (): Promise<void> => {
    transport.reconnect();
    await refreshAllData();
  };

  const startGeneration = async (
    payload: GenerationRequestPayload,
  ): Promise<GenerationStartResponse> => {
    const adapter = ensureTransport();
    const response = await adapter.startGeneration(payload);

    if (response.job_id) {
      const createdAt = new Date().toISOString();
      queue.enqueueJob({
        id: response.job_id,
        prompt: payload.prompt,
        status: response.status,
        progress: response.progress ?? 0,
        startTime: createdAt,
        created_at: createdAt,
        width: payload.width,
        height: payload.height,
        steps: payload.steps,
        total_steps: payload.steps,
        cfg_scale: payload.cfg_scale,
        seed: payload.seed,
      });
    }

    return response;
  };

  const cancelJob = async (jobId: string): Promise<void> => {
    const adapter = ensureTransport();
    await adapter.cancelJob(jobId);
    queue.removeJob(jobId);
  };

  const clearQueue = async (): Promise<void> => {
    const cancellableJobs = queue.getCancellableJobs();
    if (cancellableJobs.length === 0) {
      return;
    }

    await Promise.allSettled(cancellableJobs.map((job) => cancelJob(job.id)));
  };

  const deleteResult = async (resultId: string | number): Promise<void> => {
    const adapter = ensureTransport();
    await adapter.deleteResult(resultId);
    results.removeResult(resultId);
  };

  return {
    loadSystemStatusData,
    loadActiveJobsData,
    loadRecentResults,
    refreshAllData,
    handleBackendUrlChange,
    startGeneration,
    cancelJob,
    clearQueue,
    deleteResult,
  };
};

export type TransportActions = ReturnType<typeof createTransportActions>;
