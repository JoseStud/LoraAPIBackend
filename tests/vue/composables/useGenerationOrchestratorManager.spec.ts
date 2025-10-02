import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computed, ref, shallowRef, type Ref } from 'vue';

import {
  createUseGenerationOrchestratorManager,
  HISTORY_LIMIT_WHEN_SHOWING,
  type UseGenerationOrchestratorManagerDependencies,
} from '@/features/generation/composables/useGenerationOrchestratorManager';
import type { GenerationOrchestratorConsumer, GenerationOrchestratorManagerStore } from '@/features/generation/stores/orchestratorManagerStore';
import type { GenerationOrchestratorStore } from '@/features/generation/stores/useGenerationOrchestratorStore';
import { DEFAULT_HISTORY_LIMIT } from '@/features/generation/stores/useGenerationOrchestratorStore';
import { useBackendUrl } from '@/utils/backend';
import type {
  GenerationJob,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  SystemStatusState,
} from '@/types';

interface OrchestratorStoreMock
  extends Pick<
    GenerationOrchestratorStore,
    | 'initialize'
    | 'loadSystemStatusData'
    | 'loadActiveJobsData'
    | 'loadRecentResults'
    | 'startGeneration'
    | 'cancelJob'
    | 'clearQueue'
    | 'deleteResult'
    | 'isJobCancellable'
    | 'destroy'
  > {
  activeJobs: Ref<readonly GenerationJob[]>;
  sortedActiveJobs: Ref<readonly GenerationJob[]>;
  recentResults: Ref<readonly GenerationResult[]>;
  systemStatus: Ref<Readonly<SystemStatusState>>;
  isConnected: Ref<boolean>;
}

const createOrchestratorStoreMock = (): OrchestratorStoreMock => ({
  activeJobs: ref<GenerationJob[]>([]) as Ref<readonly GenerationJob[]>,
  sortedActiveJobs: ref<GenerationJob[]>([]) as Ref<readonly GenerationJob[]>,
  recentResults: ref<GenerationResult[]>([]) as Ref<readonly GenerationResult[]>,
  systemStatus: ref<SystemStatusState>({} as SystemStatusState) as Ref<Readonly<SystemStatusState>>,
  isConnected: ref(false),
  initialize: vi.fn(),
  loadSystemStatusData: vi.fn().mockResolvedValue(undefined),
  loadActiveJobsData: vi.fn().mockResolvedValue(undefined),
  loadRecentResults: vi.fn().mockResolvedValue(undefined),
  setHistoryLimit: vi.fn(),
  startGeneration: vi
    .fn<[GenerationRequestPayload], Promise<GenerationStartResponse>>()
    .mockResolvedValue({} as GenerationStartResponse),
  cancelJob: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
  clearQueue: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  deleteResult: vi.fn<[string | number], Promise<void>>().mockResolvedValue(undefined),
  isJobCancellable: vi.fn<(job: GenerationJob) => boolean>().mockReturnValue(true),
  destroy: vi.fn(),
});

const createDependencies = () => {
  const orchestratorStore = createOrchestratorStoreMock();

  const readOnlyConsumers = ref(new Set<symbol>());

  const orchestratorManagerStore = {
    orchestrator: shallowRef<GenerationOrchestratorStore | null>(null),
    initializationPromise: ref<Promise<void> | null>(null),
    isInitialized: ref(false),
    consumers: ref(new Map()),
    readOnlyConsumers,
    ensureOrchestrator: vi.fn((factory: () => GenerationOrchestratorStore) => {
      if (!orchestratorManagerStore.orchestrator.value) {
        orchestratorManagerStore.orchestrator.value = factory();
      }
      return orchestratorManagerStore.orchestrator.value as GenerationOrchestratorStore;
    }),
    destroyOrchestrator: vi.fn(() => {
      orchestratorStore.destroy();
      orchestratorManagerStore.orchestrator.value = null;
      orchestratorManagerStore.initializationPromise.value = null;
      orchestratorManagerStore.isInitialized.value = false;
      orchestratorManagerStore.readOnlyConsumers.value.clear();
    }),
    registerConsumer: vi.fn((consumer) => {
      orchestratorManagerStore.consumers.value.set(consumer.id, consumer);
    }),
    unregisterConsumer: vi.fn((id: symbol) => {
      orchestratorManagerStore.consumers.value.delete(id);
    }),
    registerReadOnlyConsumer: vi.fn((id: symbol) => {
      orchestratorManagerStore.readOnlyConsumers.value.add(id);
    }),
    unregisterReadOnlyConsumer: vi.fn((id: symbol) => {
      orchestratorManagerStore.readOnlyConsumers.value.delete(id);
    }),
    hasActiveConsumers: vi.fn(() =>
      orchestratorManagerStore.consumers.value.size > 0
        || orchestratorManagerStore.readOnlyConsumers.value.size > 0,
    ),
  } satisfies Partial<GenerationOrchestratorManagerStore> & {
    orchestrator: Ref<GenerationOrchestratorStore | null>;
    initializationPromise: Ref<Promise<void> | null>;
    isInitialized: Ref<boolean>;
    consumers: Ref<Map<symbol, GenerationOrchestratorConsumer>>;
    readOnlyConsumers: Ref<Set<symbol>>;
  };

  const backendUrl = ref('http://localhost');
  const backendUrlComputed = computed(() => backendUrl.value);

  const dependencies: UseGenerationOrchestratorManagerDependencies = {
    useGenerationOrchestratorManagerStore: () => orchestratorManagerStore as GenerationOrchestratorManagerStore,
    useGenerationOrchestratorStore: () => orchestratorStore as unknown as GenerationOrchestratorStore,
    useBackendUrl: (() => backendUrlComputed) as unknown as typeof useBackendUrl,
  };

  return { orchestratorStore, orchestratorManagerStore, backendUrl, dependencies };
};

describe('createUseGenerationOrchestratorManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes the orchestrator once and propagates notifications', async () => {
    const { dependencies, orchestratorStore } = createDependencies();
    orchestratorStore.initialize = vi.fn().mockResolvedValue(undefined);

    const managerFactory = createUseGenerationOrchestratorManager(dependencies);
    const manager = managerFactory();

    const notify = vi.fn();
    const debug = vi.fn();

    const historyVisibility = ref(false);
    const binding = manager.acquire({ notify, debug, historyVisibility });
    await binding.initialize();

    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(1);

    const initArgs = vi.mocked(orchestratorStore.initialize).mock.calls[0][0];
    expect(initArgs.notificationAdapter).toBeTruthy();

    initArgs.notificationAdapter.notify('hello');
    expect(notify).toHaveBeenCalledWith('hello', 'info');

    initArgs.notificationAdapter.debug?.('debug-message');
    expect(debug).toHaveBeenCalledWith('debug-message');
  });

  it('cleans up the orchestrator when the last consumer releases', () => {
    const { dependencies, orchestratorManagerStore, orchestratorStore } = createDependencies();
    const manager = createUseGenerationOrchestratorManager(dependencies)();

    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility: ref(false) });
    binding.release();

    expect(orchestratorManagerStore.destroyOrchestrator).toHaveBeenCalled();
    expect(orchestratorStore.destroy).toHaveBeenCalled();
  });

  it('resets initialization state when initialization fails', async () => {
    const { dependencies, orchestratorManagerStore, orchestratorStore } = createDependencies();
    const error = new Error('failed');
    orchestratorStore.initialize = vi.fn().mockRejectedValue(error);

    const manager = createUseGenerationOrchestratorManager(dependencies)();
    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility: ref(false) });

    await expect(binding.initialize()).rejects.toThrow(error);

    expect(orchestratorManagerStore.initializationPromise.value).toBeNull();
    expect(orchestratorManagerStore.isInitialized.value).toBe(false);
  });

  it('provides reactive job and status references from the orchestrator store', () => {
    const { dependencies, orchestratorStore } = createDependencies();
    const manager = createUseGenerationOrchestratorManager(dependencies)();
    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility: ref(false) });

    orchestratorStore.activeJobs.value = (
      [
        {
          id: '1',
          uiId: '1',
          backendId: 'backend-1',
        } as GenerationJob,
      ] as readonly GenerationJob[]
    );
    orchestratorStore.systemStatus.value = {
      status: 'ok',
    } as unknown as Readonly<SystemStatusState>;

    expect(binding.activeJobs.value).toHaveLength(1);
    expect(binding.systemStatus.value.status).toBe('ok');
  });

  it('updates history limit based on consumer history visibility', async () => {
    const { dependencies, orchestratorStore } = createDependencies();
    const manager = createUseGenerationOrchestratorManager(dependencies)();
    const historyVisibility = ref(false);

    orchestratorStore.initialize = vi.fn().mockResolvedValue(undefined);

    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility });
    await binding.initialize();

    historyVisibility.value = true;
    await Promise.resolve();
    await Promise.resolve();

    expect(orchestratorStore.setHistoryLimit).toHaveBeenCalledWith(HISTORY_LIMIT_WHEN_SHOWING);

    historyVisibility.value = false;
    await Promise.resolve();
    await Promise.resolve();

    expect(orchestratorStore.setHistoryLimit).toHaveBeenCalledWith(DEFAULT_HISTORY_LIMIT);
  });
});
