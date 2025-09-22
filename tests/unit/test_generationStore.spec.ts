import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { useGenerationStore, type GenerationNotificationAdapter } from '../../app/frontend/src/stores/generation';
import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '../../app/frontend/src/services/generationUpdates';
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

describe('generation store actions', () => {
  let store: ReturnType<typeof useGenerationStore>;
  let queueClient: ReturnType<typeof createQueueClientMock>;
  let websocketManager: ReturnType<typeof createWebSocketManagerMock>;
  let notifications: GenerationNotificationAdapter;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useGenerationStore();
    queueClient = createQueueClientMock();
    websocketManager = createWebSocketManagerMock();
    notifications = {
      notify: vi.fn(),
      debug: vi.fn(),
    };

    store.configureGenerationServices({
      getBackendUrl: () => null,
      queueClient,
      websocketManager,
      notificationAdapter: notifications,
    });
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

    await store.startGeneration(payload);

    expect(queueClient.startGeneration).toHaveBeenCalledWith(payload);
    expect(store.activeJobs).toHaveLength(1);
    expect(store.activeJobs[0]).toMatchObject({ id: 'job-1', status: 'queued' });
    expect(notifications.notify).toHaveBeenCalledWith('Generation started successfully', 'success');
  });

  it('cancelJob removes job and notifies', async () => {
    store.enqueueJob({ id: 'job-2', status: 'queued' });
    queueClient.cancelJob.mockResolvedValue();

    await store.cancelJob('job-2');

    expect(queueClient.cancelJob).toHaveBeenCalledWith('job-2');
    expect(store.activeJobs).toHaveLength(0);
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

    await store.refreshRecentResults(true);

    expect(queueClient.fetchRecentResults).toHaveBeenCalledWith(store.historyLimit);
    expect(store.recentResults).toHaveLength(1);
    expect(store.recentResults[0].id).toBe('result-1');
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

    await store.initializeUpdates();

    expect(queueClient.fetchSystemStatus).toHaveBeenCalled();
    expect(queueClient.fetchActiveJobs).toHaveBeenCalled();
    expect(queueClient.fetchRecentResults).toHaveBeenCalled();
    expect(websocketManager.start).toHaveBeenCalled();
  });
});
