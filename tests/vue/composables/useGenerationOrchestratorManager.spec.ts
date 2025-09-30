import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, type Ref } from 'vue';

import { createUseGenerationOrchestratorManager } from '@/composables/generation/useGenerationOrchestratorManager';
import { createGenerationOrchestratorFactory } from '@/composables/generation/createGenerationOrchestrator';
import type { GenerationNotificationAdapter } from '@/composables/generation/useGenerationTransport';
import type {
  GenerationConnectionStore,
  GenerationFormStore,
  GenerationOrchestratorConsumer,
  GenerationOrchestratorManagerStore,
  GenerationQueueStore,
  GenerationResultsStore,
} from '@/stores/generation';
import type { SettingsStore } from '@/stores';
import type { GenerationOrchestrator } from '@/composables/generation/createGenerationOrchestrator';
import type {
  GenerationJob,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  SystemStatusState,
} from '@/types';

vi.mock('@/composables/generation/createGenerationOrchestrator', () => ({
  createGenerationOrchestratorFactory: vi.fn(),
}));

vi.mock('@/services', () => ({}));

const createOrchestratorMock = () => ({
  initialize: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  cleanup: vi.fn<[], void>(),
  loadSystemStatusData: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  loadActiveJobsData: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  loadRecentResultsData: vi
    .fn<[boolean?], Promise<void>>()
    .mockResolvedValue(undefined),
  startGeneration: vi
    .fn<[GenerationRequestPayload], Promise<GenerationStartResponse>>()
    .mockResolvedValue({} as GenerationStartResponse),
  cancelJob: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
  clearQueue: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  deleteResult: vi
    .fn<[string | number], Promise<void>>()
    .mockResolvedValue(undefined),
});

type OrchestratorMock = ReturnType<typeof createOrchestratorMock>;

const createDependencies = () => {
  const orchestratorManagerStore = {
    orchestrator: ref<GenerationOrchestrator | null>(null),
    initializationPromise: ref<Promise<void> | null>(null),
    isInitialized: ref(false),
    consumers: ref(new Map<symbol, GenerationOrchestratorConsumer>()),
    ensureOrchestrator: vi.fn((factory: () => GenerationOrchestrator) => {
      if (!orchestratorManagerStore.orchestrator.value) {
        orchestratorManagerStore.orchestrator.value = factory();
      }
      return orchestratorManagerStore.orchestrator.value as GenerationOrchestrator;
    }),
    destroyOrchestrator: vi.fn(() => {
      orchestratorManagerStore.orchestrator.value?.cleanup();
      orchestratorManagerStore.orchestrator.value = null;
      orchestratorManagerStore.initializationPromise.value = null;
      orchestratorManagerStore.isInitialized.value = false;
    }),
    registerConsumer: vi.fn((consumer: GenerationOrchestratorConsumer) => {
      orchestratorManagerStore.consumers.value.set(consumer.id, consumer);
    }),
    unregisterConsumer: vi.fn((id: symbol) => {
      orchestratorManagerStore.consumers.value.delete(id);
    }),
  } satisfies Partial<GenerationOrchestratorManagerStore> & {
    orchestrator: Ref<GenerationOrchestrator | null>;
    initializationPromise: Ref<Promise<void> | null>;
    isInitialized: Ref<boolean>;
    consumers: Ref<Map<symbol, GenerationOrchestratorConsumer>>;
  };

  const queueStore = {
    activeJobs: ref<GenerationJob[]>([]),
    sortedActiveJobs: ref<GenerationJob[]>([]),
    hasActiveJobs: ref(false),
    ingestQueue: vi.fn(),
    handleProgressMessage: vi.fn(),
    handleCompletionMessage: vi.fn<(message: unknown) => GenerationResult>().mockReturnValue({} as GenerationResult),
    handleErrorMessage: vi.fn(),
    enqueueJob: vi.fn(),
    removeJob: vi.fn(),
    getCancellableJobs: vi.fn<[], GenerationJob[]>().mockReturnValue([]),
    isJobCancellable: vi.fn<(job: GenerationJob) => boolean>().mockReturnValue(true),
  } satisfies Partial<GenerationQueueStore> & {
    activeJobs: Ref<GenerationJob[]>;
    sortedActiveJobs: Ref<GenerationJob[]>;
    hasActiveJobs: Ref<boolean>;
  };

  const resultsStore = {
    recentResults: ref<GenerationResult[]>([]),
    historyLimit: ref(5),
    addResult: vi.fn(),
    setResults: vi.fn(),
    removeResult: vi.fn(),
    setHistoryLimit: vi.fn(),
  } satisfies Partial<GenerationResultsStore> & {
    recentResults: Ref<GenerationResult[]>;
    historyLimit: Ref<number>;
  };

  const connectionStore = {
    systemStatus: ref<SystemStatusState>({} as SystemStatusState),
    isConnected: ref(false),
    pollIntervalMs: ref(1000),
    applySystemStatusPayload: vi.fn(),
    setConnectionState: vi.fn(),
    setQueueManagerActive: vi.fn(),
  } satisfies Partial<GenerationConnectionStore> & {
    systemStatus: Ref<SystemStatusState>;
    isConnected: Ref<boolean>;
    pollIntervalMs: Ref<number>;
  };

  const formStore = {
    showHistory: ref(false),
  } satisfies Partial<GenerationFormStore> & {
    showHistory: Ref<boolean>;
  };

  const settingsStore = {
    backendUrl: 'http://localhost',
  } satisfies Partial<SettingsStore> & { backendUrl: string };

  return {
    orchestratorManagerStore,
    queueStore,
    resultsStore,
    connectionStore,
    formStore,
    settingsStore,
    dependencies: {
      useGenerationOrchestratorManagerStore: () =>
        orchestratorManagerStore as GenerationOrchestratorManagerStore,
      useGenerationQueueStore: () => queueStore as GenerationQueueStore,
      useGenerationResultsStore: () => resultsStore as GenerationResultsStore,
      useGenerationConnectionStore: () =>
        connectionStore as GenerationConnectionStore,
      useGenerationFormStore: () => formStore as GenerationFormStore,
      useSettingsStore: () => settingsStore as SettingsStore,
    },
  };
};

const createBinding = () => {
  const orchestrator: OrchestratorMock = createOrchestratorMock();
  const createGenerationOrchestratorFactoryMock = vi.mocked(
    createGenerationOrchestratorFactory,
  );
  let notificationAdapter: GenerationNotificationAdapter | null = null;
  createGenerationOrchestratorFactoryMock.mockImplementation((options) => {
    notificationAdapter = options.notificationAdapter;
    return orchestrator as unknown as GenerationOrchestrator;
  });

  const stores = createDependencies();
  const useManager = createUseGenerationOrchestratorManager(stores.dependencies);
  const manager = useManager();
  const notify = vi.fn();
  const debug = vi.fn();
  const binding = manager.acquire({ notify, debug });

  return {
    orchestrator,
    binding,
    notify,
    debug,
    stores,
    notificationAdapter: notificationAdapter!,
    factoryMock: createGenerationOrchestratorFactoryMock,
  };
};

describe('createUseGenerationOrchestratorManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes orchestrator once and updates manager state', async () => {
    const { binding, orchestrator, stores } = createBinding();

    await binding.initialize();
    expect(orchestrator.initialize).toHaveBeenCalledTimes(1);
    expect(stores.orchestratorManagerStore.isInitialized.value).toBe(true);

    await binding.initialize();
    expect(orchestrator.initialize).toHaveBeenCalledTimes(1);
  });

  it('cleans up last consumer and destroys orchestrator', () => {
    const { binding, orchestrator, stores } = createBinding();

    expect(stores.orchestratorManagerStore.consumers.value.size).toBe(1);

    binding.cleanup();

    expect(stores.orchestratorManagerStore.unregisterConsumer).toHaveBeenCalled();
    expect(stores.orchestratorManagerStore.destroyOrchestrator).toHaveBeenCalled();
    expect(orchestrator.cleanup).toHaveBeenCalled();
    expect(stores.orchestratorManagerStore.consumers.value.size).toBe(0);
  });

  it('notifies all registered consumers through the aggregated adapter', () => {
    const { notificationAdapter, notify, debug } = createBinding();

    notificationAdapter.notify('hello', 'success');
    expect(notify).toHaveBeenCalledWith('hello', 'success');

    notificationAdapter.debug?.('details');
    expect(debug).toHaveBeenCalledWith('details');
  });
});
