/**
 * Lifecycle of the shared generation orchestrator across *separate* `useGenerationOrchestratorManager()`
 * call sites. Each test creates managers through independent calls (as the studio controller, job
 * queue, prompt composer, etc. do) against the real manager store and a mocked orchestrator store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';

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
  loadRecentResults: vi.fn().mockResolvedValue(undefined),
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
