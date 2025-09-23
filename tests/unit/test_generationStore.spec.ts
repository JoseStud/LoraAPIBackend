import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { setActivePinia, createPinia, storeToRefs } from 'pinia';

import {
  useGenerationConnectionStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
} from '../../app/frontend/src/stores/generation';
import { createGenerationOrchestrator } from '../../app/frontend/src/services/generationOrchestrator';
import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '../../app/frontend/src/services/generationUpdates';
import type {
  GenerationNotificationAdapter,
} from '../../app/frontend/src/composables/useGenerationTransport';
import type { GenerationRequestPayload, GenerationResult } from '../../app/frontend/src/types';

const createQueueClientMock = (): GenerationQueueClient => ({
  startGeneration: vi.fn(),
  cancelJob: vi.fn(),
  deleteResult: vi.fn(),
  fetchSystemStatus: vi.fn(),
  fetchActiveJobs: vi.fn(),
  fetchRecentResults: vi.fn(),
});

const createWebSocketManagerMock = (): GenerationWebSocketManager => ({
  start: vi.fn(),
  stop: vi.fn(),
  reconnect: vi.fn(),
});

describe('generation orchestrator actions', () => {
  let queueStore: ReturnType<typeof useGenerationQueueStore>;
  let resultsStore: ReturnType<typeof useGenerationResultsStore>;
  let connectionStore: ReturnType<typeof useGenerationConnectionStore>;
  let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
  let queueClient: ReturnType<typeof createQueueClientMock>;
  let websocketManager: ReturnType<typeof createWebSocketManagerMock>;
  let notifications: GenerationNotificationAdapter;
  let showHistory: ReturnType<typeof ref<boolean>>;
  let configuredBackendUrl: ReturnType<typeof ref<string | null>>;

  beforeEach(() => {
    setActivePinia(createPinia());
    queueStore = useGenerationQueueStore();
    resultsStore = useGenerationResultsStore();
    connectionStore = useGenerationConnectionStore();
    queueClient = createQueueClientMock();
    websocketManager = createWebSocketManagerMock();
    notifications = {
      notify: vi.fn(),
      debug: vi.fn(),
    };

    showHistory = ref(false);
    configuredBackendUrl = ref(null);

    const { historyLimit } = storeToRefs(resultsStore);
    const { pollIntervalMs } = storeToRefs(connectionStore);

    orchestrator = createGenerationOrchestrator({
      showHistory,
      configuredBackendUrl,
      notificationAdapter: notifications,
      queueStore,
      resultsStore,
      connectionStore,
      historyLimit,
      pollIntervalMs,
      queueClient,
      websocketManager,
    });
  });

  afterEach(() => {
    orchestrator.cleanup();
  });

  it('startGeneration enqueues job and emits success notification', async () => {
    const payload: GenerationRequestPayload = {
      prompt: 'test prompt',
      negative_prompt: null,
      steps: 20,
      sampler_name: 'DPM++ 2M',
      cfg_scale: 7,
      width: 512,
      height: 512,
      seed: 42,
      batch_size: 1,
      n_iter: 1,
      denoising_strength: null,
    };

    queueClient.startGeneration.mockResolvedValue({
      job_id: 'job-1',
      status: 'queued',
      progress: 0,
    });

    await orchestrator.startGeneration(payload);

    expect(queueClient.startGeneration).toHaveBeenCalledWith(payload);
    expect(queueStore.activeJobs).toHaveLength(1);
    expect(queueStore.activeJobs[0]).toMatchObject({ id: 'job-1', status: 'queued' });
    expect(notifications.notify).toHaveBeenCalledWith('Generation started successfully', 'success');
  });

  it('cancelJob removes job and notifies', async () => {
    queueStore.enqueueJob({ id: 'job-2', status: 'queued' });
    queueClient.cancelJob.mockResolvedValue();

    await orchestrator.cancelJob('job-2');

    expect(queueClient.cancelJob).toHaveBeenCalledWith('job-2');
    expect(queueStore.activeJobs).toHaveLength(0);
    expect(notifications.notify).toHaveBeenCalledWith('Generation cancelled', 'success');
  });

  it('refreshRecentResults updates results and can emit success toast', async () => {
    const result: GenerationResult = {
      id: 'result-1',
      job_id: 'job-3',
      result_id: 'result-1',
      prompt: 'prompt',
      negative_prompt: null,
      image_url: 'http://example.com/image.png',
      width: 512,
      height: 512,
      steps: 20,
      cfg_scale: 7,
      seed: null,
      created_at: new Date().toISOString(),
    };

    queueClient.fetchRecentResults.mockResolvedValue([result]);

    await orchestrator.loadRecentResultsData(true);

    const { historyLimit } = storeToRefs(resultsStore);
    expect(queueClient.fetchRecentResults).toHaveBeenCalledWith(historyLimit.value);
    expect(resultsStore.recentResults).toHaveLength(1);
    expect(resultsStore.recentResults[0].id).toBe('result-1');
    expect(notifications.notify).toHaveBeenCalledWith('Results refreshed', 'success');
  });

  it('initializeUpdates pulls data and starts websocket manager', async () => {
    queueClient.fetchSystemStatus.mockResolvedValue({
      status: 'healthy',
      queue_length: 0,
      gpu_available: true,
      gpu_status: 'Available',
      memory_total: 8192,
      memory_used: 0,
    } as never);
    queueClient.fetchActiveJobs.mockResolvedValue([{ id: 'job-9', status: 'queued' }]);
    queueClient.fetchRecentResults.mockResolvedValue([]);

    await orchestrator.initialize();

    expect(queueClient.fetchSystemStatus).toHaveBeenCalled();
    expect(queueClient.fetchActiveJobs).toHaveBeenCalled();
    expect(queueClient.fetchRecentResults).toHaveBeenCalled();
    expect(websocketManager.start).toHaveBeenCalled();
  });
});
