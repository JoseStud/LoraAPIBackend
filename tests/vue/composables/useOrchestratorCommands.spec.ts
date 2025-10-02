import { describe, it, expect, vi } from 'vitest';

import { useOrchestratorCommands } from '@/features/generation/composables/useOrchestratorCommands';
import type { GenerationOrchestratorStore } from '@/features/generation/stores/useGenerationOrchestratorStore';
import type { GenerationRequestPayload, GenerationStartResponse } from '@/types';
import type { GenerationJobView } from '@/features/generation/orchestrator';

const createOrchestrator = () => ({
  loadSystemStatusData: vi.fn().mockResolvedValue(undefined),
  loadActiveJobsData: vi.fn().mockResolvedValue(undefined),
  loadRecentResults: vi.fn().mockResolvedValue(undefined),
  startGeneration: vi
    .fn<[GenerationRequestPayload], Promise<GenerationStartResponse>>()
    .mockResolvedValue({} as GenerationStartResponse),
  cancelJob: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
  clearQueue: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  deleteResult: vi.fn<[string | number], Promise<void>>().mockResolvedValue(undefined),
  isJobCancellable: vi.fn().mockReturnValue(true),
  setHistoryLimit: vi.fn(),
  handleBackendUrlChange: vi.fn().mockResolvedValue(undefined),
} as unknown as Pick<
  GenerationOrchestratorStore,
  | 'loadSystemStatusData'
  | 'loadActiveJobsData'
  | 'loadRecentResults'
  | 'startGeneration'
  | 'cancelJob'
  | 'clearQueue'
  | 'deleteResult'
  | 'isJobCancellable'
  | 'setHistoryLimit'
  | 'handleBackendUrlChange'
>);

describe('useOrchestratorCommands', () => {
  it('wraps orchestrator commands and normalizes errors', async () => {
    const orchestrator = createOrchestrator();
    const commands = useOrchestratorCommands({
      getOrchestrator: () => orchestrator as GenerationOrchestratorStore,
    });

    await commands.loadSystemStatusData();
    await commands.loadActiveJobsData();
    await commands.loadRecentResultsData();
    await commands.startGeneration({} as GenerationRequestPayload);

    await commands.cancelJob('job-1');
    await commands.clearQueue();
    await commands.deleteResult('result-1');
    await commands.refreshResults();
    commands.setHistoryLimit(25);
    await commands.handleBackendUrlChange();

    expect(orchestrator.cancelJob).toHaveBeenCalledWith('job-1');
    expect(orchestrator.setHistoryLimit).toHaveBeenCalledWith(25);
    expect(commands.canCancelJob({} as GenerationJobView)).toBe(true);

    orchestrator.cancelJob.mockRejectedValueOnce('boom');
    await expect(commands.cancelJob('bad-job')).rejects.toThrow('boom');

    orchestrator.clearQueue.mockRejectedValueOnce({});
    await expect(commands.clearQueue()).rejects.toThrow('Generation orchestrator command failed');
  });
});

