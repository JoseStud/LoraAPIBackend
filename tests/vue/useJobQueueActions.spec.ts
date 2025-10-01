import { computed, effectScope, ref } from 'vue';

import { useJobQueueActions } from '@/composables/generation/useJobQueueActions';
import type {
  GenerationOrchestratorBinding,
  UseGenerationOrchestratorManagerReturn,
} from '@/composables/generation/useGenerationOrchestratorManager';
import type { GenerationJob } from '@/types';

const activeJobs = ref<ReadonlyArray<GenerationJob>>([]);
const queueManagerActive = ref(true);

const generationFacade = {
  activeJobs: computed(() => activeJobs.value),
  sortedActiveJobs: computed(() => activeJobs.value),
  queueManagerActive,
  cancelJob: vi.fn(async (jobId: string) => cancelJobImpl(jobId)),
  clearCompletedJobs: vi.fn(),
  removeJob: vi.fn(),
};

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

vi.mock('@/features/generation/orchestrator', () => ({
  useGenerationOrchestratorFacade: () => generationFacade,
}));

vi.mock('@/composables/shared', async () => {
  const actual = await vi.importActual('@/composables/shared');
  return {
    ...actual,
    useNotifications: () => notificationMocks,
  };
});

const createManagerMock = (): UseGenerationOrchestratorManagerReturn => {
  return {
    activeJobs: computed(() => generationFacade.activeJobs.value),
    sortedActiveJobs: computed(() => generationFacade.sortedActiveJobs.value),
    recentResults: ref([]),
    systemStatus: ref({ status: 'healthy' } as const),
    isConnected: ref(true),
    queueManagerActive: ref(true),
    isInitialized: ref(true),
    acquire: vi.fn(() => orchestratorMocks.binding),
  } as unknown as UseGenerationOrchestratorManagerReturn;
};

const createBindingMock = (): GenerationOrchestratorBinding => {
  return {
    activeJobs: computed(() => generationFacade.activeJobs.value),
    sortedActiveJobs: computed(() => generationFacade.sortedActiveJobs.value),
    recentResults: ref([]),
    systemStatus: ref({ status: 'healthy' } as const),
    isConnected: ref(true),
    initialize: vi.fn(),
    cleanup: vi.fn(),
    loadSystemStatusData: vi.fn(),
    loadActiveJobsData: vi.fn(),
    loadRecentResultsData: vi.fn(),
    startGeneration: vi.fn(),
    cancelJob: vi.fn(),
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

    activeJobs.value = [];
    queueManagerActive.value = true;

    orchestratorMocks.binding = createBindingMock();
    orchestratorMocks.manager = createManagerMock();

    notificationMocks.showToast.mockClear();
    notificationMocks.showToastError.mockClear();
    notificationMocks.showToastInfo.mockClear();
    notificationMocks.showToastSuccess.mockClear();
    notificationMocks.notify.mockClear();
    generationFacade.cancelJob.mockClear();
    generationFacade.clearCompletedJobs.mockClear();
    generationFacade.removeJob.mockClear();
  });

  it('cancels a job via the orchestrator binding', async () => {
    await withActions(async (actions) => {
      activeJobs.value = [
        {
          id: 'job-1',
          jobId: 'backend-1',
          status: 'processing',
        } as GenerationJob,
      ];
      cancelJobImpl = async (jobId) => {
        activeJobs.value = activeJobs.value.filter(
          (item) => item.id !== jobId,
        );
      };

      const result = await actions.cancelJob('job-1');

      expect(result).toBe(true);
      expect(generationFacade.cancelJob).toHaveBeenCalledWith('job-1');
      expect(activeJobs.value).toHaveLength(0);
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
      activeJobs.value = [
        {
          id: 'job-3',
          jobId: 'backend-3',
          status: 'queued',
        } as GenerationJob,
      ];

      const result = await actions.cancelJob('job-3');

      expect(result).toBe(false);
      expect(notificationMocks.showToast).toHaveBeenCalledWith('Failed to cancel job', 'error');
      expect(activeJobs.value).toHaveLength(1);
    });
  });
});
