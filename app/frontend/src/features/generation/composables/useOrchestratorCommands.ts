import type { GenerationRequestPayload, GenerationStartResponse } from '@/types';

import type { GenerationJobView } from '../orchestrator/facade';
import type { GenerationOrchestratorStore } from '../stores/useGenerationOrchestratorStore';

const normalizeCommandError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string' && error.trim()) {
    return new Error(error);
  }

  return new Error('Generation orchestrator command failed');
};

const wrapCommand = <Args extends unknown[], Result>(
  handler: (...args: Args) => Promise<Result> | Result,
): ((...args: Args) => Promise<Result>) => {
  return async (...args: Args): Promise<Result> => {
    try {
      return await Promise.resolve(handler(...args));
    } catch (error) {
      throw normalizeCommandError(error);
    }
  };
};

export interface OrchestratorCommandsOptions {
  getOrchestrator: () => GenerationOrchestratorStore;
}

export interface OrchestratorCommandsApi {
  loadSystemStatusData: () => Promise<void>;
  loadActiveJobsData: () => Promise<void>;
  loadRecentResultsData: (notifySuccess?: boolean) => Promise<void>;
  startGeneration: (payload: GenerationRequestPayload) => Promise<GenerationStartResponse>;
  cancelJob: (jobId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  deleteResult: (resultId: string | number) => Promise<void>;
  refreshResults: (notifySuccess?: boolean) => Promise<void>;
  canCancelJob: (job: GenerationJobView) => boolean;
  setHistoryLimit: (limit: number) => void;
  handleBackendUrlChange: () => Promise<void>;
}

export const useOrchestratorCommands = (
  options: OrchestratorCommandsOptions,
): OrchestratorCommandsApi => {
  const loadSystemStatusData = (): Promise<void> =>
    options.getOrchestrator().loadSystemStatusData();
  const loadActiveJobsData = (): Promise<void> => options.getOrchestrator().loadActiveJobsData();
  const loadRecentResultsData = (notifySuccess = false): Promise<void> =>
    options.getOrchestrator().loadRecentResults(notifySuccess);
  const startGeneration = (payload: GenerationRequestPayload): Promise<GenerationStartResponse> =>
    options.getOrchestrator().startGeneration(payload);

  const cancelJob = wrapCommand((jobId: string) => options.getOrchestrator().cancelJob(jobId));
  const clearQueue = wrapCommand(() => options.getOrchestrator().clearQueue());
  const deleteResult = wrapCommand((resultId: string | number) =>
    options.getOrchestrator().deleteResult(resultId),
  );
  const refreshResults = wrapCommand((notifySuccess: boolean = false) =>
    options.getOrchestrator().loadRecentResults(notifySuccess),
  );

  const canCancelJob = (job: GenerationJobView): boolean =>
    options.getOrchestrator().isJobCancellable(job);

  const setHistoryLimit = (limit: number): void => {
    options.getOrchestrator().setHistoryLimit(limit);
  };

  const handleBackendUrlChange = (): Promise<void> =>
    options.getOrchestrator().handleBackendUrlChange();

  return {
    loadSystemStatusData,
    loadActiveJobsData,
    loadRecentResultsData,
    startGeneration,
    cancelJob,
    clearQueue,
    deleteResult,
    refreshResults,
    canCancelJob,
    setHistoryLimit,
    handleBackendUrlChange,
  };
};

