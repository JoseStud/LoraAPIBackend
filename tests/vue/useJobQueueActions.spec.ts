import { computed, effectScope, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useJobQueueActions } from '@/composables/generation/useJobQueueActions';
import type {
  GenerationOrchestratorBinding,
  UseGenerationOrchestratorManagerReturn,
} from '@/composables/generation/useGenerationOrchestratorManager';
import { useGenerationQueueStore } from '@/features/generation/stores/queue';

const notificationMocks = vi.hoisted(() => ({
  notifications: { value: [] },
  toastVisible: { value: false },
  toastMessage: { value: '' },
  toastType: { value: 'info' },
  toastDuration: { value: 0 },
  showToast: vi.fn(),
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
  showToastInfo: vi.fn(),
  showToastWarning: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showWarning: vi.fn(),
  addNotification: vi.fn(),
  notify: vi.fn(),
  removeNotification: vi.fn(),
  clearAll: vi.fn(),
  hideToast: vi.fn(),
  clearToastTimer: vi.fn(),
}));

const orchestratorMocks = vi.hoisted(() => ({
  binding: null as unknown as GenerationOrchestratorBinding,
  manager: null as UseGenerationOrchestratorManagerReturn | null,
}));

let cancelJobImpl: (jobId: string) => Promise<void>;

vi.mock('@/composables/generation/useGenerationOrchestratorManager', () => ({
  useGenerationOrchestratorManager: () => orchestratorMocks.manager!,
}));

vi.mock('@/composables/shared', async () => {
  const actual = await vi.importActual('@/composables/shared');
  return {
    ...actual,
    useNotifications: () => notificationMocks,
  };
});

const createManagerMock = (): UseGenerationOrchestratorManagerReturn => {
  const queueStore = useGenerationQueueStore();
  const { activeJobs, sortedActiveJobs } = storeToRefs(queueStore);

  return {
    activeJobs: computed(() => activeJobs.value),
    sortedActiveJobs: computed(() => sortedActiveJobs.value),
    recentResults: ref([]),
    systemStatus: ref({ status: 'healthy' } as const),
    isConnected: ref(true),
    queueManagerActive: ref(true),
    isInitialized: ref(true),
    acquire: vi.fn(() => orchestratorMocks.binding),
  } as unknown as UseGenerationOrchestratorManagerReturn;
};

const createBindingMock = (): GenerationOrchestratorBinding => {
  const queueStore = useGenerationQueueStore();
  const { activeJobs, sortedActiveJobs, recentResults } = storeToRefs(queueStore);
  const systemStatus = ref({ status: 'healthy' } as const);
  const isConnected = ref(true);

  return {
    activeJobs,
    sortedActiveJobs,
    recentResults,
    systemStatus,
    isConnected,
    initialize: vi.fn(),
    cleanup: vi.fn(),
    loadSystemStatusData: vi.fn(),
    loadActiveJobsData: vi.fn(),
    loadRecentResultsData: vi.fn(),
    startGeneration: vi.fn(),
    cancelJob: vi.fn((jobId: string) => cancelJobImpl(jobId)),
    clearQueue: vi.fn(),
    deleteResult: vi.fn(),
    refreshResults: vi.fn(),
    canCancelJob: vi.fn(() => true),
    setHistoryLimit: vi.fn(),
    handleBackendUrlChange: vi.fn(),
    release: vi.fn(),
  } as unknown as GenerationOrchestratorBinding;
};

const withActions = async (
  run: (actions: ReturnType<typeof useJobQueueActions>) => Promise<void>,
) => {
  const scope = effectScope();
  let actionsInstance: ReturnType<typeof useJobQueueActions>;

  scope.run(() => {
    actionsInstance = useJobQueueActions();
  });

  try {
    await run(actionsInstance!);
  } finally {
    scope.stop();
  }
};

describe('useJobQueueActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelJobImpl = async () => {};

    const queueStore = useGenerationQueueStore();
    queueStore.resetQueue();

    orchestratorMocks.binding = createBindingMock();
    orchestratorMocks.manager = createManagerMock();

    notificationMocks.showToast.mockClear();
    notificationMocks.showToastError.mockClear();
    notificationMocks.showToastInfo.mockClear();
    notificationMocks.showToastSuccess.mockClear();
    notificationMocks.notify.mockClear();
  });

  it('cancels a job via the orchestrator binding', async () => {
    await withActions(async (actions) => {
      const queueStore = useGenerationQueueStore();
      const { jobs } = storeToRefs(queueStore);

      queueStore.enqueueJob({ id: 'job-1', jobId: 'backend-1', status: 'processing' });
      cancelJobImpl = async (jobId) => {
        queueStore.removeJob(jobId);
      };

      const result = await actions.cancelJob('job-1');

      expect(result).toBe(true);
      expect(orchestratorMocks.binding.cancelJob).toHaveBeenCalledWith('job-1');
      expect(jobs.value).toHaveLength(0);
    });
  });

  it('shows an error when the job cannot be found', async () => {
    await withActions(async (actions) => {
      const result = await actions.cancelJob('missing');

      expect(result).toBe(false);
      expect(notificationMocks.showToast).toHaveBeenCalledWith('Job not found', 'error');
    });
  });

  it('notifies when cancellation fails', async () => {
    cancelJobImpl = async () => {
      throw new Error('primary failed');
    };

    await withActions(async (actions) => {
      const queueStore = useGenerationQueueStore();
      const { jobs } = storeToRefs(queueStore);
      queueStore.enqueueJob({ id: 'job-3', jobId: 'backend-3', status: 'queued' });

      const result = await actions.cancelJob('job-3');

      expect(result).toBe(false);
      expect(notificationMocks.showToast).toHaveBeenCalledWith('Failed to cancel job', 'error');
      expect(jobs.value).toHaveLength(1);
    });
  });
});
