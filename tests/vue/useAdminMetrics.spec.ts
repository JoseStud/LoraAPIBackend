import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/services', () => ({
  deriveMetricsFromDashboard: vi.fn(),
  emptyMetricsSnapshot: vi.fn(),
  fetchDashboardStats: vi.fn(),
}));

import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import { useAdminMetrics } from '@/composables/useAdminMetrics';
import {
  deriveMetricsFromDashboard,
  emptyMetricsSnapshot,
  fetchDashboardStats,
} from '@/services';

const fetchDashboardStatsMock = vi.mocked(fetchDashboardStats);
const deriveMetricsFromDashboardMock = vi.mocked(deriveMetricsFromDashboard);
const emptyMetricsSnapshotMock = vi.mocked(emptyMetricsSnapshot);

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
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
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());

    emptyMetricsSnapshotMock.mockReturnValue(createMetricsPayload());
    deriveMetricsFromDashboardMock.mockReturnValue(createMetricsPayload());
    fetchDashboardStatsMock.mockResolvedValue(createSummaryPayload());
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
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
    expect(fetchDashboardStatsMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    await flushAsync();
    expect(fetchDashboardStatsMock).toHaveBeenCalledTimes(2);

    wrapper.unmount();

    vi.advanceTimersByTime(1_000);
    await flushAsync();
    expect(fetchDashboardStatsMock).toHaveBeenCalledTimes(2);
  });

  it('shares a single polling loop across multiple consumers', async () => {
    const first = mount(createHarness(1_000));
    await flushAsync();
    expect(fetchDashboardStatsMock).toHaveBeenCalledTimes(1);

    const second = mount(createHarness(2_000));
    await flushAsync();
    expect(fetchDashboardStatsMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    await flushAsync();
    expect(fetchDashboardStatsMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    await flushAsync();
    expect(fetchDashboardStatsMock).toHaveBeenCalledTimes(2);

    second.unmount();

    vi.advanceTimersByTime(2_000);
    await flushAsync();
    expect(fetchDashboardStatsMock).toHaveBeenCalledTimes(3);

    first.unmount();

    vi.advanceTimersByTime(2_000);
    await flushAsync();
    expect(fetchDashboardStatsMock).toHaveBeenCalledTimes(3);
  });
});
