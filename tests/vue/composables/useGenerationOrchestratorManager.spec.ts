import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computed, nextTick, ref, type Ref } from 'vue';

import {
  createUseGenerationOrchestratorManager,
  HISTORY_LIMIT_WHEN_SHOWING,
  type UseGenerationOrchestratorManagerDependencies,
} from '@/features/generation/composables/useGenerationOrchestratorManager';
import { useGenerationOrchestratorManagerStore } from '@/features/generation/stores/orchestratorManagerStore';
import type { GenerationOrchestratorStore } from '@/features/generation/stores/useGenerationOrchestratorStore';
import { DEFAULT_HISTORY_LIMIT } from '@/features/generation/stores/useGenerationOrchestratorStore';
import { useBackendUrl } from '@/utils/backend';
import type {
  GenerationRequestPayload,
  GenerationStartResponse,
  SystemStatusState,
} from '@/types';
import type {
  GenerationJobView,
  GenerationResultView,
  QueueItemView,
  ReadonlyQueue,
  ReadonlyResults,
} from '@/features/generation/orchestrator';
import type { GenerationTransportPauseReason } from '@/features/generation/types/transport';

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
    | 'setHistoryLimit'
    | 'handleBackendUrlChange'
    | 'pauseTransport'
    | 'resumeTransport'
    | 'destroy'
  > {
  activeJobs: Ref<ReadonlyQueue>;
  sortedActiveJobs: Ref<ReadonlyQueue>;
  recentResults: Ref<ReadonlyResults>;
  systemStatus: Ref<Readonly<SystemStatusState>>;
  isConnected: Ref<boolean>;
  queueManagerActive: Ref<boolean>;
  transportPaused: Ref<boolean>;
  transportPauseReasons: Ref<GenerationTransportPauseReason[]>;
  transportPauseSince: Ref<number | null>;
}

const createOrchestratorStoreMock = (): OrchestratorStoreMock => ({
  activeJobs: ref<ReadonlyQueue>(Object.freeze([] as GenerationJobView[])),
  sortedActiveJobs: ref<ReadonlyQueue>(Object.freeze([] as GenerationJobView[])),
  recentResults: ref<ReadonlyResults>(Object.freeze([] as GenerationResultView[])),
  systemStatus: ref<SystemStatusState>({} as SystemStatusState) as Ref<Readonly<SystemStatusState>>,
  isConnected: ref(false),
  queueManagerActive: ref(false),
  transportPaused: ref(false),
  transportPauseReasons: ref<GenerationTransportPauseReason[]>([]),
  transportPauseSince: ref<number | null>(null),
  initialize: vi.fn().mockResolvedValue(undefined),
  loadSystemStatusData: vi.fn().mockResolvedValue(undefined),
  loadActiveJobsData: vi.fn().mockResolvedValue(undefined),
  loadRecentResults: vi.fn().mockResolvedValue(undefined),
  setHistoryLimit: vi.fn(),
  handleBackendUrlChange: vi.fn().mockResolvedValue(undefined),
  startGeneration: vi
    .fn<[GenerationRequestPayload], Promise<GenerationStartResponse>>()
    .mockResolvedValue({} as GenerationStartResponse),
  cancelJob: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
  clearQueue: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  deleteResult: vi.fn<[string | number], Promise<void>>().mockResolvedValue(undefined),
  isJobCancellable: vi.fn<(job: QueueItemView) => boolean>().mockReturnValue(true),
  pauseTransport: vi.fn(),
  resumeTransport: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
});

const createDependencies = () => {
  const orchestratorStore = createOrchestratorStoreMock();
  const orchestratorManagerStore = useGenerationOrchestratorManagerStore();

  const backendUrl = ref('http://localhost');
  const backendUrlComputed = computed(() => backendUrl.value);

  const dependencies: UseGenerationOrchestratorManagerDependencies = {
    useGenerationOrchestratorManagerStore: () => orchestratorManagerStore,
    useGenerationOrchestratorStore: () => orchestratorStore as unknown as GenerationOrchestratorStore,
    useBackendUrl: (() => backendUrlComputed) as unknown as typeof useBackendUrl,
  };

  return { orchestratorStore, orchestratorManagerStore, backendUrl, dependencies };
};

describe('createUseGenerationOrchestratorManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('initializes the orchestrator once and propagates notifications', async () => {
    const { dependencies, orchestratorStore } = createDependencies();

    const managerFactory = createUseGenerationOrchestratorManager(dependencies);
    const manager = managerFactory();

    const notify = vi.fn();
    const debug = vi.fn();

    const historyVisibility = ref(false);
    const binding = manager.acquire({ notify, debug, historyVisibility });
    await binding.initialize();
    await binding.initialize();

    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(1);
    expect(manager.isInitialized.value).toBe(true);

    const initArgs = vi.mocked(orchestratorStore.initialize).mock.calls[0][0];
    expect(initArgs.historyLimit).toBe(DEFAULT_HISTORY_LIMIT);
    expect(initArgs.getBackendUrl()).toBe('http://localhost');
    expect(initArgs.notificationAdapter).toBeTruthy();

    initArgs.notificationAdapter.notify('hello');
    expect(notify).toHaveBeenCalledWith('hello', 'info');

    initArgs.notificationAdapter.debug?.('debug-message');
    expect(debug).toHaveBeenCalledWith('debug-message');

    // The environment is synced once initialization succeeds.
    expect(orchestratorStore.resumeTransport).toHaveBeenCalledTimes(1);

    binding.release();
  });

  it('cleans up the orchestrator when the last consumer releases', async () => {
    const { dependencies, orchestratorManagerStore, orchestratorStore } = createDependencies();
    const manager = createUseGenerationOrchestratorManager(dependencies)();

    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility: ref(false) });
    await binding.initialize();
    binding.release();

    expect(orchestratorStore.destroy).toHaveBeenCalledTimes(1);
    expect(orchestratorManagerStore.orchestrator).toBeNull();
    expect(orchestratorManagerStore.isInitialized).toBe(false);

    // Releasing twice is a no-op.
    binding.release();
    expect(orchestratorStore.destroy).toHaveBeenCalledTimes(1);
  });

  it('resets initialization state when initialization fails', async () => {
    const { dependencies, orchestratorManagerStore, orchestratorStore } = createDependencies();
    const error = new Error('failed');
    orchestratorStore.initialize = vi.fn().mockRejectedValue(error);

    const manager = createUseGenerationOrchestratorManager(dependencies)();
    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility: ref(false) });

    await expect(binding.initialize()).rejects.toThrow(error);

    expect(orchestratorManagerStore.initializationPromise).toBeNull();
    expect(orchestratorManagerStore.isInitialized).toBe(false);

    binding.release();
  });

  it('provides reactive job and status references from the orchestrator store', () => {
    const { dependencies, orchestratorStore } = createDependencies();
    const manager = createUseGenerationOrchestratorManager(dependencies)();
    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility: ref(false) });

    orchestratorStore.activeJobs.value = Object.freeze([
      Object.freeze({
        id: '1',
        uiId: '1',
        backendId: 'backend-1',
        jobId: 'backend-1',
        status: 'queued',
      }) as GenerationJobView,
    ]) as ReadonlyQueue;
    orchestratorStore.systemStatus.value = {
      status: 'ok',
    } as unknown as Readonly<SystemStatusState>;

    expect(binding.activeJobs.value).toHaveLength(1);
    expect(manager.activeJobs.value).toHaveLength(1);
    expect(binding.systemStatus.value.status).toBe('ok');

    binding.release();
  });

  it('updates history limit based on consumer history visibility', async () => {
    const { dependencies, orchestratorStore } = createDependencies();
    const manager = createUseGenerationOrchestratorManager(dependencies)();
    const historyVisibility = ref(false);

    const binding = manager.acquire({ notify: vi.fn(), debug: vi.fn(), historyVisibility });
    await binding.initialize();

    historyVisibility.value = true;
    await nextTick();

    expect(orchestratorStore.setHistoryLimit).toHaveBeenCalledWith(HISTORY_LIMIT_WHEN_SHOWING);
    expect(orchestratorStore.loadRecentResults).toHaveBeenCalledWith(false);

    historyVisibility.value = false;
    await nextTick();

    expect(orchestratorStore.setHistoryLimit).toHaveBeenCalledWith(DEFAULT_HISTORY_LIMIT);

    binding.release();
  });

  it('ignores history and backend changes until the orchestrator is initialized', async () => {
    const { dependencies, orchestratorStore, backendUrl } = createDependencies();
    const manager = createUseGenerationOrchestratorManager(dependencies)();
    const historyVisibility = ref(false);

    const binding = manager.acquire({ notify: vi.fn(), historyVisibility });

    historyVisibility.value = true;
    backendUrl.value = 'http://other';
    await nextTick();

    expect(orchestratorStore.setHistoryLimit).not.toHaveBeenCalled();
    expect(orchestratorStore.handleBackendUrlChange).not.toHaveBeenCalled();

    binding.release();
  });

  it('honours per-consumer auto-sync opt-outs', async () => {
    const { dependencies, orchestratorStore, backendUrl } = createDependencies();
    const manager = createUseGenerationOrchestratorManager(dependencies)();
    const historyVisibility = ref(false);

    const historyOnly = manager.acquire({
      notify: vi.fn(),
      historyVisibility,
      autoSync: { historyLimit: true, backendUrl: false },
    });
    await historyOnly.initialize();

    backendUrl.value = 'http://other';
    historyVisibility.value = true;
    await nextTick();

    expect(orchestratorStore.handleBackendUrlChange).not.toHaveBeenCalled();
    expect(orchestratorStore.setHistoryLimit).toHaveBeenCalledWith(HISTORY_LIMIT_WHEN_SHOWING);

    const backendOnly = manager.acquire({
      notify: vi.fn(),
      autoSync: { historyLimit: false },
    });

    backendUrl.value = 'http://third';
    await nextTick();
    expect(orchestratorStore.handleBackendUrlChange).toHaveBeenCalledTimes(1);

    historyOnly.release();
    vi.mocked(orchestratorStore.setHistoryLimit).mockClear();

    historyVisibility.value = false;
    await nextTick();
    expect(orchestratorStore.setHistoryLimit).not.toHaveBeenCalled();

    backendOnly.release();
  });

  it('delegates commands to the orchestrator and normalizes command errors', async () => {
    const { dependencies, orchestratorStore } = createDependencies();
    const manager = createUseGenerationOrchestratorManager(dependencies)();
    const binding = manager.acquire({ notify: vi.fn() });

    await binding.loadSystemStatusData();
    await binding.loadActiveJobsData();
    await binding.loadRecentResultsData();
    await binding.startGeneration({} as GenerationRequestPayload);
    await binding.cancelJob('job-1');
    await binding.clearQueue();
    await binding.deleteResult('result-1');
    await binding.refreshResults(true);
    binding.setHistoryLimit(25);
    await binding.handleBackendUrlChange();

    expect(orchestratorStore.loadSystemStatusData).toHaveBeenCalledTimes(1);
    expect(orchestratorStore.loadActiveJobsData).toHaveBeenCalledTimes(1);
    expect(orchestratorStore.loadRecentResults).toHaveBeenNthCalledWith(1, false);
    expect(orchestratorStore.loadRecentResults).toHaveBeenNthCalledWith(2, true);
    expect(orchestratorStore.cancelJob).toHaveBeenCalledWith('job-1');
    expect(orchestratorStore.clearQueue).toHaveBeenCalledTimes(1);
    expect(orchestratorStore.deleteResult).toHaveBeenCalledWith('result-1');
    expect(orchestratorStore.setHistoryLimit).toHaveBeenCalledWith(25);
    expect(orchestratorStore.handleBackendUrlChange).toHaveBeenCalledTimes(1);
    expect(binding.canCancelJob({} as GenerationJobView)).toBe(true);

    vi.mocked(orchestratorStore.cancelJob).mockRejectedValueOnce('boom');
    await expect(binding.cancelJob('bad-job')).rejects.toThrow('boom');

    vi.mocked(orchestratorStore.clearQueue).mockRejectedValueOnce({});
    await expect(binding.clearQueue()).rejects.toThrow('Generation orchestrator command failed');

    binding.release();
  });
});
