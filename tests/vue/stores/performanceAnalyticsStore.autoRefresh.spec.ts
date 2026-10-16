import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePerformanceAnalytics } from '@/features/analytics/public';
import { usePerformanceAnalyticsStore } from '@/features/analytics/stores/performanceAnalytics';

import { createPageEnvironment } from '../../mocks/pageEnvironment';

// Auto-refresh in the performance analytics store runs on the shared `usePolling` controller with
// a fixed 30 s interval (AUTO_REFRESH_INTERVAL_MS, also its minimum). There is no per-dashboard
// visibility hook or configurable throttle: the timer runs while auto-refresh is enabled, pauses
// while the page is hidden or offline, and stops on cleanup() or store disposal.
const REFRESH_INTERVAL_MS = 30_000;

const mocks = vi.hoisted(() => ({
  fetchPerformanceAnalytics: vi.fn(),
  fetchTopAdapters: vi.fn(),
}));

vi.mock('@/features/analytics/services/analyticsService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/analytics/services/analyticsService')>()),
  fetchPerformanceAnalytics: mocks.fetchPerformanceAnalytics,
}));

vi.mock('@/features/lora/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/lora/public')>()),
  fetchTopAdapters: mocks.fetchTopAdapters,
}));

vi.mock('@/services/system/backendRefresh', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/system/backendRefresh')>()),
  useBackendRefresh: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    isActive: vi.fn(() => true),
    trigger: vi.fn(),
  }),
}));

const createSummary = (totalGenerations = 10) => ({
  generatedAt: '2024-01-01T00:00:00Z',
  timeRange: '24h',
  kpis: {
    total_generations: totalGenerations,
    generation_growth: 5,
    avg_generation_time: 42,
    time_improvement: 2,
    success_rate: 98,
    total_failed: 1,
    active_loras: 3,
    total_loras: 5,
  },
  chartData: {
    generationVolume: [],
    performance: [],
    loraUsage: [],
    resourceUsage: [],
  },
  errorAnalysis: [],
  performanceInsights: [],
});

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

// Let each load settle, so the resource's in-flight dedupe does not swallow the next tick.
const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

const advance = async (ms: number) => {
  vi.advanceTimersByTime(ms);
  await settle();
};

const loadCount = () => mocks.fetchPerformanceAnalytics.mock.calls.length;

describe('performance analytics auto-refresh', () => {
  const environment = createPageEnvironment();

  beforeEach(() => {
    vi.useFakeTimers();
    environment.install();
    mocks.fetchPerformanceAnalytics.mockReset().mockResolvedValue(createSummary());
    mocks.fetchTopAdapters.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    environment.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loads data when enabled and then refreshes every 30 seconds', async () => {
    const page = usePerformanceAnalytics();
    const widget = usePerformanceAnalytics();

    page.toggleAutoRefresh(true);
    await settle();

    expect(widget.autoRefresh.value).toBe(true);
    expect(widget.isInitialized.value).toBe(true);
    expect(loadCount()).toBe(1);

    await advance(REFRESH_INTERVAL_MS - 1);
    expect(loadCount()).toBe(1);

    await advance(1);
    expect(loadCount()).toBe(2);

    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(3);
    expect(mocks.fetchPerformanceAnalytics).toHaveBeenLastCalledWith('24h', expect.anything());
  });

  it('runs a single 30-second timer however many call sites enable it', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const page = usePerformanceAnalytics();
    const widget = usePerformanceAnalytics();

    await page.ensureLoaded();
    mocks.fetchPerformanceAnalytics.mockClear();

    page.toggleAutoRefresh(true);
    widget.toggleAutoRefresh(true);
    page.toggleAutoRefresh(true);
    await settle();

    // Already loaded, so enabling does not fetch again; the first tick does.
    expect(loadCount()).toBe(0);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), REFRESH_INTERVAL_MS);

    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(1);
  });

  it('does not start another load while the previous refresh is still in flight', async () => {
    const page = usePerformanceAnalytics();
    await page.ensureLoaded();
    page.toggleAutoRefresh(true);
    await settle();

    const slowLoad = createDeferred<ReturnType<typeof createSummary>>();
    mocks.fetchPerformanceAnalytics.mockClear().mockImplementation(() => slowLoad.promise);

    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(1);

    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(1);

    slowLoad.resolve(createSummary(20));
    await settle();
    expect(page.kpis.value.total_generations).toBe(20);

    mocks.fetchPerformanceAnalytics.mockResolvedValue(createSummary(30));
    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(2);
    expect(page.kpis.value.total_generations).toBe(30);
  });

  it('keeps polling after a failed refresh', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const page = usePerformanceAnalytics();
    await page.ensureLoaded();
    page.toggleAutoRefresh(true);
    await settle();
    mocks.fetchPerformanceAnalytics.mockClear();

    mocks.fetchPerformanceAnalytics.mockRejectedValueOnce(new Error('unavailable'));
    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(1);
    expect(page.kpis.value.total_generations).toBe(0);
    expect(page.autoRefresh.value).toBe(true);

    mocks.fetchPerformanceAnalytics.mockResolvedValue(createSummary(15));
    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(2);
    expect(page.kpis.value.total_generations).toBe(15);
  });

  it('holds the timer while the page is hidden or offline and refreshes once on resume', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const page = usePerformanceAnalytics();
    const widget = usePerformanceAnalytics();

    environment.setHidden(true);
    page.toggleAutoRefresh(true);
    await settle();

    // Enabling still loads the data once; only the timer waits for the page to be visible.
    expect(loadCount()).toBe(1);
    expect(setIntervalSpy).not.toHaveBeenCalled();

    await advance(REFRESH_INTERVAL_MS * 3);
    expect(loadCount()).toBe(1);

    // One refresh on resume, not one per missed tick.
    environment.setHidden(false);
    await settle();
    expect(loadCount()).toBe(2);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(3);

    environment.setOnline(false);
    await advance(REFRESH_INTERVAL_MS * 3);
    expect(loadCount()).toBe(3);
    expect(widget.autoRefresh.value).toBe(true);

    environment.setOnline(true);
    await settle();
    expect(loadCount()).toBe(4);

    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(5);
  });

  it('stops for every call site when one cleans up, and can be enabled again', async () => {
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const page = usePerformanceAnalytics();
    const widget = usePerformanceAnalytics();

    widget.toggleAutoRefresh(true);
    await settle();
    expect(loadCount()).toBe(1);

    // PerformanceAnalyticsPage calls cleanup() when it unmounts.
    page.cleanup();
    await settle();

    expect(page.autoRefresh.value).toBe(false);
    expect(widget.autoRefresh.value).toBe(false);
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('offline', expect.any(Function));

    await advance(REFRESH_INTERVAL_MS * 3);
    environment.setHidden(true);
    environment.setHidden(false);
    await settle();
    expect(loadCount()).toBe(1);

    widget.toggleAutoRefresh();
    await settle();
    expect(page.autoRefresh.value).toBe(true);

    await advance(REFRESH_INTERVAL_MS);
    expect(loadCount()).toBe(2);
  });

  it('stops polling and detaches its page listeners when the store is disposed', async () => {
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const page = usePerformanceAnalytics();

    page.toggleAutoRefresh(true);
    await settle();
    expect(loadCount()).toBe(1);

    usePerformanceAnalyticsStore().$dispose();

    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    await advance(REFRESH_INTERVAL_MS * 3);
    environment.setHidden(true);
    environment.setHidden(false);
    await settle();
    expect(loadCount()).toBe(1);
  });
});
