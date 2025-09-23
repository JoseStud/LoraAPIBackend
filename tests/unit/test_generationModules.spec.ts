import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia, storeToRefs } from 'pinia';

import { useGenerationQueueStore } from '../../app/frontend/src/stores/generation/queue';
import { useGenerationResultsStore } from '../../app/frontend/src/stores/generation/results';
import { useGenerationConnectionStore } from '../../app/frontend/src/stores/generation/connection';
import { useGenerationTransport } from '../../app/frontend/src/composables/useGenerationTransport';
import { createGenerationOrchestrator } from '../../app/frontend/src/services/generationOrchestrator';
import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '../../app/frontend/src/services/generationUpdates';
import type { GenerationProgressMessage, GenerationCompleteMessage } from '../../app/frontend/src/types';

const createQueueClientMock = (): GenerationQueueClient => ({
  startGeneration: vi.fn(),
  cancelJob: vi.fn().mockResolvedValue(undefined),
  deleteResult: vi.fn().mockResolvedValue(undefined),
  fetchSystemStatus: vi.fn().mockResolvedValue(null),
  fetchActiveJobs: vi.fn().mockResolvedValue([]),
  fetchRecentResults: vi.fn().mockResolvedValue([]),
});

const createWebsocketManagerMock = (): GenerationWebSocketManager => ({
  start: vi.fn(),
  stop: vi.fn(),
  reconnect: vi.fn(),
});

describe('generation queue store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('handles progress updates for new jobs', () => {
    const store = useGenerationQueueStore();
    const message: GenerationProgressMessage = {
      type: 'generation_progress',
      job_id: 'job-1',
      status: 'processing',
      progress: 45,
      current_step: 4,
      total_steps: 10,
    } as GenerationProgressMessage;

    store.handleProgressMessage(message);

    expect(store.activeJobs).toHaveLength(1);
    expect(store.activeJobs[0]).toMatchObject({ id: 'job-1', status: 'processing', progress: 45 });
  });

  it('removes jobs on completion and returns a result payload', () => {
    const store = useGenerationQueueStore();
    store.enqueueJob({ id: 'job-2', status: 'processing' });

    const message: GenerationCompleteMessage = {
      type: 'generation_complete',
      job_id: 'job-2',
      result_id: 'result-2',
      prompt: 'prompt',
      negative_prompt: null,
      image_url: 'http://example.com/image.png',
      width: 256,
      height: 256,
      steps: 20,
      cfg_scale: 7,
      seed: 1,
    } as GenerationCompleteMessage;

    const result = store.handleCompletionMessage(message);

    expect(store.activeJobs).toHaveLength(0);
    expect(result).toMatchObject({ id: 'result-2', job_id: 'job-2', image_url: 'http://example.com/image.png' });
  });
});

describe('generation transport hooks', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('invokes websocket reconnect when requested', () => {
    const queueClient = createQueueClientMock();
    const websocketManager = createWebsocketManagerMock();
    const transport = useGenerationTransport(
      {
        getBackendUrl: () => null,
        queueClient,
        websocketManager,
      },
      {
        onSystemStatus: vi.fn(),
        onQueueUpdate: vi.fn(),
        onProgress: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
        onRecentResults: vi.fn(),
        onConnectionChange: vi.fn(),
        shouldPollQueue: vi.fn().mockReturnValue(false),
        onNotify: vi.fn(),
      },
    );

    transport.reconnectUpdates();

    expect(websocketManager.reconnect).toHaveBeenCalledTimes(1);
  });

  it('emits notification hooks for cancellation and result deletion', async () => {
    const queueClient = createQueueClientMock();
    const websocketManager = createWebsocketManagerMock();
    const notify = vi.fn();
    const recentResults = vi.fn();

    const transport = useGenerationTransport(
      {
        getBackendUrl: () => null,
        queueClient,
        websocketManager,
      },
      {
        onSystemStatus: vi.fn(),
        onQueueUpdate: vi.fn(),
        onProgress: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
        onRecentResults: recentResults,
        onConnectionChange: vi.fn(),
        shouldPollQueue: vi.fn().mockReturnValue(false),
        onNotify: notify,
      },
    );

    await transport.cancelJob('job-3');
    await transport.deleteResult('result-3');
    await transport.refreshRecentResults(10, true);

    expect(notify).toHaveBeenCalledWith('Generation cancelled', 'success');
    expect(notify).toHaveBeenCalledWith('Result deleted', 'success');
    expect(notify).toHaveBeenCalledWith('Results refreshed', 'success');
    expect(recentResults).toHaveBeenCalledWith([]);
  });
});

describe('generation orchestrator notifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('notifies when startGeneration succeeds', async () => {
    const queueClient = {
      startGeneration: vi.fn().mockResolvedValue({ job_id: 'job-9', status: 'queued', progress: 0 }),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      deleteResult: vi.fn().mockResolvedValue(undefined),
      fetchSystemStatus: vi.fn().mockResolvedValue(null),
      fetchActiveJobs: vi.fn().mockResolvedValue([]),
      fetchRecentResults: vi.fn().mockResolvedValue([]),
    } as unknown as GenerationQueueClient;

    const websocketManager = createWebsocketManagerMock();
    const notify = vi.fn();

    const showHistory = ref(false);
    const configuredBackendUrl = ref<string | null>(null);

    const queueStore = useGenerationQueueStore();
    const resultsStore = useGenerationResultsStore();
    const connectionStore = useGenerationConnectionStore();

    const { historyLimit } = storeToRefs(resultsStore);
    const { pollIntervalMs } = storeToRefs(connectionStore);

    const orchestrator = createGenerationOrchestrator({
      showHistory,
      configuredBackendUrl,
      notificationAdapter: {
        notify,
        debug: vi.fn(),
      },
      queueStore,
      resultsStore,
      connectionStore,
      historyLimit,
      pollIntervalMs,
      queueClient,
      websocketManager,
    });

    const payload = { prompt: 'hello', width: 512, height: 512, steps: 20 } as unknown as Parameters<typeof orchestrator.startGeneration>[0];
    await orchestrator.startGeneration(payload);

    expect(queueClient.startGeneration).toHaveBeenCalledWith(payload);
    expect(notify).toHaveBeenCalledWith('Generation started successfully', 'success');

    orchestrator.cleanup();
  });
});
