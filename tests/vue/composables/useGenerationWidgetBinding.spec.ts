/**
 * Widgets that only read generation state (system status card, job queue) hold an ordinary
 * `acquire()` binding while mounted. Mounted from separate components they share one orchestrator,
 * which is destroyed when the last of them unmounts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';

import { useGenerationWidgetBinding } from '@/features/generation/composables/useGenerationWidgetBinding';
import { useGenerationOrchestratorManagerStore } from '@/features/generation/stores/orchestratorManagerStore';

const mocks = vi.hoisted(() => ({ orchestratorStore: null as unknown }));

vi.mock('@/features/generation/composables/useGenerationOrchestratorManager', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/generation/composables/useGenerationOrchestratorManager')
  >('@/features/generation/composables/useGenerationOrchestratorManager');
  const { useGenerationOrchestratorManagerStore: useManagerStore } = await vi.importActual<
    typeof import('@/features/generation/stores/orchestratorManagerStore')
  >('@/features/generation/stores/orchestratorManagerStore');
  const { computed } = await import('vue');
  const backendUrl = computed(() => 'http://localhost:8000');

  return {
    ...actual,
    useGenerationOrchestratorManager: actual.createUseGenerationOrchestratorManager({
      useGenerationOrchestratorManagerStore: useManagerStore,
      useGenerationOrchestratorStore: () => mocks.orchestratorStore as never,
      useBackendUrl: (() => backendUrl) as never,
    }),
  };
});

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

const widget = (label: string) =>
  defineComponent({
    name: label,
    setup() {
      useGenerationWidgetBinding(label);
      return () => h('div');
    },
  });

describe('useGenerationWidgetBinding', () => {
  let orchestratorStore: ReturnType<typeof createOrchestratorStoreMock>;

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    orchestratorStore = createOrchestratorStoreMock();
    mocks.orchestratorStore = orchestratorStore;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares one orchestrator between widgets and tears it down after the last unmounts', async () => {
    const managerStore = useGenerationOrchestratorManagerStore();

    const status = mount(widget('SystemStatusCard'));
    const queue = mount(widget('JobQueue'));
    await flushPromises();

    expect(managerStore.consumers.size).toBe(2);
    expect(orchestratorStore.initialize).toHaveBeenCalledTimes(1);
    expect(managerStore.isInitialized).toBe(true);

    status.unmount();
    expect(managerStore.consumers.size).toBe(1);
    expect(orchestratorStore.destroy).not.toHaveBeenCalled();

    queue.unmount();
    expect(managerStore.consumers.size).toBe(0);
    expect(orchestratorStore.destroy).toHaveBeenCalledTimes(1);
    expect(managerStore.orchestrator).toBeNull();
  });

  it('keeps the orchestrator for a full consumer when a widget unmounts', async () => {
    const managerStore = useGenerationOrchestratorManagerStore();
    const { useGenerationOrchestratorManager } = await import(
      '@/features/generation/composables/useGenerationOrchestratorManager'
    );
    const studio = useGenerationOrchestratorManager().acquire({ notify: vi.fn() });
    await studio.initialize();

    const status = mount(widget('SystemStatusCard'));
    await flushPromises();
    status.unmount();

    expect(orchestratorStore.destroy).not.toHaveBeenCalled();
    expect(managerStore.isInitialized).toBe(true);

    studio.release();
    expect(orchestratorStore.destroy).toHaveBeenCalledTimes(1);
  });

  it('opts widgets out of history and backend-URL syncing', async () => {
    const managerStore = useGenerationOrchestratorManagerStore();
    const status = mount(widget('SystemStatusCard'));
    await flushPromises();

    const [consumer] = [...managerStore.consumers.values()];
    expect(consumer).toMatchObject({ autoSyncHistory: false, autoSyncBackend: false });

    status.unmount();
  });
});
