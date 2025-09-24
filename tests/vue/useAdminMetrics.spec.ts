import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SpyInstance } from 'vitest';

vi.mock('@/services', async () => {
  const actual = await vi.importActual('@/services');
  return {
    ...actual,
    deriveMetricsFromDashboard: vi.fn(),
    emptyMetricsSnapshot: vi.fn(),
    fetchDashboardStats: vi.fn(),
  };
});

import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import { useAdminMetrics } from '@/composables/system';
import { useAdminMetricsStore } from '@/stores';
import {
  deriveMetricsFromDashboard,
  emptyMetricsSnapshot,
  fetchDashboardStats,
} from '@/services';

const fetchDashboardStatsMock = vi.mocked(fetchDashboardStats);
const deriveMetricsFromDashboardMock = vi.mocked(deriveMetricsFromDashboard);
const emptyMetricsSnapshotMock = vi.mocked(emptyMetricsSnapshot);

const flushAsync = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

const createMetricsPayload = () => ({
  cpu_percent: 10,
  memory_percent: 20,
  memory_used: 1024,
  memory_total: 2048,
  disk_percent: 30,
  disk_used: 512,
  disk_total: 1024,
  gpus: [],
});

const createSummaryPayload = () => ({
  stats: {
    total_loras: 5,
    active_loras: 2,
    embeddings_coverage: 75,
    recent_imports: 1,
  },
  system_health: { status: 'healthy' },
});

describe('useAdminMetrics composable', () => {
  let store: ReturnType<typeof useAdminMetricsStore>;
  let refreshSpy: SpyInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());

    store = useAdminMetricsStore();
    refreshSpy = vi.spyOn(store, 'refresh');

    emptyMetricsSnapshotMock.mockReturnValue(createMetricsPayload());
    deriveMetricsFromDashboardMock.mockReturnValue(createMetricsPayload());
    fetchDashboardStatsMock.mockResolvedValue(createSummaryPayload());
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    refreshSpy.mockRestore();
  });

  const createHarness = (intervalMs: number) =>
    defineComponent({
      setup() {
        useAdminMetrics({ intervalMs });
        return () => null;
      },
    });

  it('starts polling on mount and stops after unmounting', async () => {
    const wrapper = mount(createHarness(1_000));
    await flushAsync();
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    await flushAsync();
    expect(refreshSpy).toHaveBeenCalledTimes(2);

    wrapper.unmount();

    vi.advanceTimersByTime(1_000);
    await flushAsync();
    expect(refreshSpy).toHaveBeenCalledTimes(2);
  });

  it('shares a single polling loop across multiple consumers', async () => {
    const first = mount(createHarness(1_000));
    await flushAsync();
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    const second = mount(createHarness(2_000));
    await flushAsync();
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    await flushAsync();
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    await flushAsync();
    expect(refreshSpy).toHaveBeenCalledTimes(2);

    second.unmount();

    vi.advanceTimersByTime(2_000);
    await flushAsync();
    expect(refreshSpy).toHaveBeenCalledTimes(3);

    first.unmount();

    vi.advanceTimersByTime(2_000);
    await flushAsync();
    expect(refreshSpy).toHaveBeenCalledTimes(3);
  });
});
