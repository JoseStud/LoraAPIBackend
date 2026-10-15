/**
 * Lifecycle of the shared generation orchestrator across *separate* `useGenerationOrchestratorManager()`
 * call sites. Each test creates managers through independent calls (as the studio controller, job
 * queue, prompt composer, etc. do) against the real manager store and a mocked orchestrator store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, watch } from 'vue';

import {
  createUseGenerationOrchestratorManager,
  HISTORY_LIMIT_WHEN_SHOWING,
} from '@/features/generation/composables/useGenerationOrchestratorManager';
import { useGenerationOrchestratorManagerStore } from '@/features/generation/stores/orchestratorManagerStore';
import {
  DEFAULT_HISTORY_LIMIT,
  type GenerationOrchestratorStore,
} from '@/features/generation/stores/useGenerationOrchestratorStore';
import type { useBackendUrl } from '@/utils/backend';
import type { GenerationJobView } from '@/features/generation/orchestrator';
import type { GenerationRequestPayload } from '@/types';

const ENVIRONMENT_EVENTS = ['visibilitychange', 'online', 'offline'] as const;

const createOrchestratorStoreMock = () => ({
  activeJobs: ref([]),
  sortedActiveJobs: ref([]),
  recentResults: ref([]),
  systemStatus: ref({}),
  isConnected: ref(false),
  queueManagerActive: ref(false),
  transportPaused: ref(false),
  transportPauseReasons: ref([]),
  transportPauseSince: ref<number | null>(null),
  initialize: vi.fn().mockResolvedValue(undefined),
  setHistoryLimit: vi.fn(),
  loadSystemStatusData: vi.fn().mockResolvedValue(undefined),
  loadActiveJobsData: vi.fn().mockResolvedValue(undefined),
  loadRecentResults: vi.fn().mockResolvedValue(undefined),
  startGeneration: vi.fn().mockResolvedValue({}),
  cancelJob: vi.fn().mockResolvedValue(undefined),
  removeJob: vi.fn(),
  clearCompletedJobs: vi.fn(),
  clearQueue: vi.fn().mockResolvedValue(undefined),
  deleteResult: vi.fn().mockResolvedValue(undefined),
  isJobCancellable: vi.fn().mockReturnValue(true),
  handleBackendUrlChange: vi.fn().mockResolvedValue(undefined),
  pauseTransport: vi.fn(),
  resumeTransport: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
});

const setup = () => {
  const orchestratorStore = createOrchestratorStoreMock();
  const backendUrl = ref('http://localhost:8000');
  const backendUrlComputed = computed(() => backendUrl.value);

  const useManager = createUseGenerationOrchestratorManager({
    useGenerationOrchestratorManagerStore,
    useGenerationOrchestratorStore: () => orchestratorStore as unknown as GenerationOrchestratorStore,
    useBackendUrl: (() => backendUrlComputed) as unknown as typeof useBackendUrl,
  });

  return { orchestratorStore, backendUrl, useManager };
};

type ListenerSpy = ReturnType<typeof vi.spyOn>;

const callsFor = (spy: ListenerSpy, event: string) =>
  spy.mock.calls.filter(([type]) => type === event);

describe('useGenerationOrchestratorManager lifecycle', () => {
  let documentAdd: ListenerSpy;
  let documentRemove: ListenerSpy;
  let windowAdd: ListenerSpy;
  let windowRemove: ListenerSpy;

  const added = (event: (typeof ENVIRONMENT_EVENTS)[number]) =>
    callsFor(event === 'visibilitychange' ? documentAdd : windowAdd, event);
  const removed = (event: (typeof ENVIRONMENT_EVENTS)[number]) =>
    callsFor(event === 'visibilitychange' ? documentRemove : windowRemove, event);

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    documentAdd = vi.spyOn(document, 'addEventListener');
    documentRemove = vi.spyOn(document, 'removeEventListener');
    windowAdd = vi.spyOn(window, 'addEventListener');
    windowRemove = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes the orchestrator when the first consumer acquires a binding', async () => {
    const { orchestratorStore, useManager } = setup();
    const callSiteA = useManager();
    const callSiteB = useManager();

    const first = callSiteA.acquire({ notify: vi.fn() });
    expect(orchestratorStore.initialize).not.toHaveBeenCalled();

    await first.initialize();
    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(1);
    expect(callSiteA.isInitialized.value).toBe(true);
    expect(callSiteB.isInitialized.value).toBe(true);

    const second = callSiteB.acquire({ notify: vi.fn() });
    await second.initialize();
    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(1);

    first.release();
    second.release();
  });

  it('destroys the orchestrator when the last consumer releases its binding', async () => {
    const { orchestratorStore, useManager } = setup();
    const managerStore = useGenerationOrchestratorManagerStore();

    const first = useManager().acquire({ notify: vi.fn() });
    const second = useManager().acquire({ notify: vi.fn() });
    await Promise.all([first.initialize(), second.initialize()]);

    first.release();
    expect(orchestratorStore.destroy).not.toHaveBeenCalled();
    expect(managerStore.isInitialized).toBe(true);

    second.release();
    expect(orchestratorStore.destroy).toHaveBeenCalledTimes(1);
    expect(managerStore.isInitialized).toBe(false);
    expect(managerStore.orchestrator).toBeNull();
    expect(managerStore.consumers.size).toBe(0);
  });

  it('notifies watchers of the consumer set as call sites acquire and release', () => {
    const { useManager } = setup();
    const managerStore = useGenerationOrchestratorManagerStore();
    const consumerCount = computed(() => managerStore.consumers.size);
    const seen: number[] = [];
    const stop = watch(consumerCount, (size) => seen.push(size), { flush: 'sync' });

    expect(consumerCount.value).toBe(0);

    const bindingA = useManager().acquire({ notify: vi.fn() });
    const bindingB = useManager().acquire({ notify: vi.fn() });
    expect(consumerCount.value).toBe(2);

    bindingA.release();
    expect(consumerCount.value).toBe(1);

    // A repeated release changes nothing.
    bindingA.release();
    bindingB.release();
    expect(consumerCount.value).toBe(0);
    expect(seen).toEqual([1, 2, 1, 0]);

    stop();
  });

  it('keeps a released binding inert while another call site still holds the orchestrator', async () => {
    const { orchestratorStore, useManager } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const released = useManager().acquire({ notify: vi.fn() });
    const live = useManager().acquire({ notify: vi.fn() });
    await Promise.all([released.initialize(), live.initialize()]);

    released.release();

    await expect(released.startGeneration({} as GenerationRequestPayload)).rejects.toThrow(
      /binding was released; cannot run startGeneration\(\)/,
    );
    await expect(released.cancelJob('job-1')).rejects.toThrow(/released/);
    released.removeJob('job-1');
    expect(released.canCancelJob({} as GenerationJobView)).toBe(false);

    expect(orchestratorStore.startGeneration).not.toHaveBeenCalled();
    expect(orchestratorStore.cancelJob).not.toHaveBeenCalled();
    expect(orchestratorStore.removeJob).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('removeJob() ignored'));

    // The other call site's binding is unaffected.
    await live.cancelJob('job-1');
    expect(orchestratorStore.cancelJob).toHaveBeenCalledWith('job-1');
    expect(live.canCancelJob({} as GenerationJobView)).toBe(true);

    live.release();
  });

  it('does not resurrect the orchestrator through a binding released by the last consumer', async () => {
    const { orchestratorStore, useManager } = setup();
    const managerStore = useGenerationOrchestratorManagerStore();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const bindingA = useManager().acquire({ notify: vi.fn() });
    const bindingB = useManager().acquire({ notify: vi.fn() });
    await Promise.all([bindingA.initialize(), bindingB.initialize()]);

    bindingA.release();
    bindingB.release();
    expect(managerStore.orchestrator).toBeNull();
    expect(orchestratorStore.destroy).toHaveBeenCalledTimes(1);

    const asyncCommands = [
      () => bindingA.initialize(),
      () => bindingA.loadSystemStatusData(),
      () => bindingA.loadActiveJobsData(),
      () => bindingB.loadRecentResultsData(),
      () => bindingB.startGeneration({} as GenerationRequestPayload),
      () => bindingB.cancelJob('job-1'),
      () => bindingA.clearQueue(),
      () => bindingA.deleteResult('result-1'),
      () => bindingB.refreshResults(true),
      () => bindingB.handleBackendUrlChange(),
    ];
    for (const command of asyncCommands) {
      await expect(command()).rejects.toThrow(/Generation orchestrator binding was released/);
    }

    bindingA.removeJob('job-1');
    bindingA.clearCompletedJobs();
    bindingB.setHistoryLimit(10);
    expect(bindingB.canCancelJob({} as GenerationJobView)).toBe(false);

    expect(managerStore.orchestrator).toBeNull();
    expect(managerStore.isInitialized).toBe(false);
    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(1);
    expect(orchestratorStore.loadRecentResults).not.toHaveBeenCalled();
    expect(orchestratorStore.removeJob).not.toHaveBeenCalled();
    expect(orchestratorStore.clearCompletedJobs).not.toHaveBeenCalled();
    expect(orchestratorStore.setHistoryLimit).not.toHaveBeenCalled();
    // No effects were restarted behind the manager's back.
    ENVIRONMENT_EVENTS.forEach((event) => {
      expect(added(event)).toHaveLength(1);
    });

    // Releasing again stays a no-op, and a fresh acquire still works normally.
    bindingA.release();
    bindingB.release();
    expect(orchestratorStore.destroy).toHaveBeenCalledTimes(1);

    const bindingC = useManager().acquire({ notify: vi.fn() });
    await bindingC.initialize();
    expect(managerStore.isInitialized).toBe(true);
    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(2);
    bindingC.release();
  });

  it('retries initialization when setup fails and a new consumer subscribes', async () => {
    const { orchestratorStore, useManager } = setup();
    const error = new Error('transport unavailable');
    orchestratorStore.initialize.mockRejectedValueOnce(error);

    const failing = useManager().acquire({ notify: vi.fn() });
    await expect(failing.initialize()).rejects.toThrow(error);
    expect(useManager().isInitialized.value).toBe(false);

    const retrying = useManager().acquire({ notify: vi.fn() });
    await retrying.initialize();

    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(2);
    expect(useManager().isInitialized.value).toBe(true);

    failing.release();
    retrying.release();
  });

  it('re-initializes a fresh orchestrator when the last consumer released during startup', async () => {
    const { orchestratorStore, useManager } = setup();
    const managerStore = useGenerationOrchestratorManagerStore();

    let resolveFirst!: () => void;
    orchestratorStore.initialize.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveFirst = resolve; }),
    );
    let resolveSecond!: () => void;
    orchestratorStore.initialize.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveSecond = resolve; }),
    );

    const callSiteA = useManager();
    const bindingA = callSiteA.acquire({ notify: vi.fn() });
    const firstAttempt = bindingA.initialize();

    // The last consumer leaves while initialize() is still pending (e.g. a fast route change).
    bindingA.release();
    expect(orchestratorStore.destroy).toHaveBeenCalledTimes(1);

    resolveFirst();
    await expect(firstAttempt).resolves.toBeUndefined();
    expect(managerStore.isInitialized).toBe(false);
    expect(managerStore.initializationPromise).toBeNull();

    orchestratorStore.resumeTransport.mockClear();

    const callSiteB = useManager();
    const bindingB = callSiteB.acquire({ notify: vi.fn() });
    const secondAttempt = bindingB.initialize();

    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(2);
    expect(managerStore.isInitialized).toBe(false);

    resolveSecond();
    await secondAttempt;
    expect(managerStore.isInitialized).toBe(true);
    // Only B's attempt syncs the environment.
    expect(orchestratorStore.resumeTransport).toHaveBeenCalledTimes(1);

    bindingB.release();
  });

  it('rejects a superseded failed attempt without touching the current state', async () => {
    const { orchestratorStore, useManager } = setup();
    const managerStore = useGenerationOrchestratorManagerStore();

    let rejectFirst!: (error: Error) => void;
    orchestratorStore.initialize.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => { rejectFirst = reject; }),
    );
    let resolveSecond!: () => void;
    orchestratorStore.initialize.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveSecond = resolve; }),
    );

    const bindingA = useManager().acquire({ notify: vi.fn() });
    const firstAttempt = bindingA.initialize();
    bindingA.release();

    const bindingB = useManager().acquire({ notify: vi.fn() });
    const secondAttempt = bindingB.initialize();
    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(2);

    resolveSecond();
    await secondAttempt;
    expect(managerStore.isInitialized).toBe(true);
    expect(managerStore.initializationPromise).toBeNull();

    // The stale attempt still rejects for its caller but must not reset the live state.
    const error = new Error('stale startup failed');
    rejectFirst(error);
    await expect(firstAttempt).rejects.toThrow(error);
    expect(managerStore.isInitialized).toBe(true);

    bindingB.release();
  });

  it('handles one backend URL change exactly once across call sites', async () => {
    const { orchestratorStore, backendUrl, useManager } = setup();

    const bindings = [useManager(), useManager(), useManager()].map((manager) =>
      manager.acquire({ notify: vi.fn() }),
    );
    await Promise.all(bindings.map((binding) => binding.initialize()));

    backendUrl.value = 'http://other-host:8000';
    await nextTick();

    expect(orchestratorStore.handleBackendUrlChange).toHaveBeenCalledTimes(1);

    const initArgs = orchestratorStore.initialize.mock.calls[0][0];
    expect(initArgs.getBackendUrl()).toBe('http://other-host:8000');

    bindings.forEach((binding) => binding.release());
  });

  it('uses the expanded history limit while any consumer shows history, whichever call site toggles it', async () => {
    const { orchestratorStore, useManager } = setup();
    const managerStore = useGenerationOrchestratorManagerStore();
    const visibleA = ref(false);
    const visibleB = ref(false);

    const bindingA = useManager().acquire({ notify: vi.fn(), historyVisibility: visibleA });
    const bindingB = useManager().acquire({ notify: vi.fn(), historyVisibility: visibleB });
    await Promise.all([bindingA.initialize(), bindingB.initialize()]);
    expect(managerStore.historyLimit).toBe(DEFAULT_HISTORY_LIMIT);

    visibleA.value = true;
    await nextTick();
    expect(managerStore.historyLimit).toBe(HISTORY_LIMIT_WHEN_SHOWING);
    expect(orchestratorStore.setHistoryLimit).toHaveBeenCalledTimes(1);
    expect(orchestratorStore.setHistoryLimit).toHaveBeenLastCalledWith(HISTORY_LIMIT_WHEN_SHOWING);

    visibleB.value = true;
    await nextTick();
    visibleA.value = false;
    await nextTick();

    // B still shows history, so the limit stays expanded and nothing is re-applied.
    expect(managerStore.historyLimit).toBe(HISTORY_LIMIT_WHEN_SHOWING);
    expect(orchestratorStore.setHistoryLimit).toHaveBeenCalledTimes(1);

    visibleB.value = false;
    await nextTick();
    expect(managerStore.historyLimit).toBe(DEFAULT_HISTORY_LIMIT);
    expect(orchestratorStore.setHistoryLimit).toHaveBeenCalledTimes(2);
    expect(orchestratorStore.setHistoryLimit).toHaveBeenLastCalledWith(DEFAULT_HISTORY_LIMIT);

    // Releasing a visible consumer from another call site drops its vote.
    visibleB.value = true;
    await nextTick();
    expect(managerStore.historyLimit).toBe(HISTORY_LIMIT_WHEN_SHOWING);
    bindingB.release();
    await nextTick();
    expect(managerStore.historyLimit).toBe(DEFAULT_HISTORY_LIMIT);

    bindingA.release();
  });

  it('does not start effects before the first acquire', () => {
    const { useManager } = setup();
    useManager();
    useManager();

    ENVIRONMENT_EVENTS.forEach((event) => {
      expect(added(event)).toHaveLength(0);
    });
  });

  it('adds environment listeners once and removes them when the last consumer releases from another call site', async () => {
    const { useManager } = setup();
    const callSiteA = useManager();
    const callSiteB = useManager();

    const bindingA = callSiteA.acquire({ notify: vi.fn() });
    const bindingB = callSiteB.acquire({ notify: vi.fn() });
    await Promise.all([bindingA.initialize(), bindingB.initialize()]);

    ENVIRONMENT_EVENTS.forEach((event) => {
      expect(added(event)).toHaveLength(1);
    });

    bindingA.release();
    ENVIRONMENT_EVENTS.forEach((event) => {
      expect(removed(event)).toHaveLength(0);
    });

    bindingB.release();
    ENVIRONMENT_EVENTS.forEach((event) => {
      expect(removed(event)).toHaveLength(1);
      expect(removed(event)[0][1]).toBe(added(event)[0][1]);
    });

    // A fresh acquire after full teardown starts a fresh set of listeners.
    const bindingC = useManager().acquire({ notify: vi.fn() });
    ENVIRONMENT_EVENTS.forEach((event) => {
      expect(added(event)).toHaveLength(2);
    });
    bindingC.release();
    ENVIRONMENT_EVENTS.forEach((event) => {
      expect(removed(event)).toHaveLength(2);
    });
  });

  it('pauses and resumes the transport once per environment change across call sites', async () => {
    const { orchestratorStore, useManager } = setup();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    const bindingA = useManager().acquire({ notify: vi.fn() });
    const bindingB = useManager().acquire({ notify: vi.fn() });
    await Promise.all([bindingA.initialize(), bindingB.initialize()]);
    orchestratorStore.resumeTransport.mockClear();

    online.mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(orchestratorStore.pauseTransport).toHaveBeenCalledTimes(1);
    expect(orchestratorStore.pauseTransport.mock.calls[0][0]).toMatchObject({
      reasons: ['network-offline'],
      source: 'offline',
    });

    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    expect(orchestratorStore.resumeTransport).toHaveBeenCalledTimes(1);

    bindingA.release();
    bindingB.release();

    online.mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(orchestratorStore.pauseTransport).toHaveBeenCalledTimes(1);
  });

  it('removes listeners and stops watchers when Pinia disposes the store', async () => {
    const { orchestratorStore, backendUrl, useManager } = setup();
    const managerStore = useGenerationOrchestratorManagerStore();

    const binding = useManager().acquire({ notify: vi.fn() });
    await binding.initialize();

    managerStore.$dispose();

    ENVIRONMENT_EVENTS.forEach((event) => {
      expect(removed(event)).toHaveLength(1);
    });

    backendUrl.value = 'http://after-dispose:8000';
    await nextTick();
    expect(orchestratorStore.handleBackendUrlChange).not.toHaveBeenCalled();
  });
});
