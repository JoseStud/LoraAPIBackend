import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import * as backendClient from '@/services/shared/http';
import * as backendRefreshService from '@/services/system/backendRefresh';
import * as analyticsService from '@/features/analytics/services/analyticsService';
import * as loraPublic from '@/features/lora/public';
import { usePerformanceAnalytics } from '@/features/analytics/public';
import { usePerformanceAnalyticsStore } from '@/features/analytics/stores/performanceAnalytics';

import { createPageEnvironment } from '../../mocks/pageEnvironment';

const backendRefreshCallbacks: Array<() => void> = [];

const useBackendClientSpy = vi.spyOn(backendClient, 'useBackendClient');
const useBackendRefreshSpy = vi.spyOn(backendRefreshService, 'useBackendRefresh');
const fetchPerformanceAnalyticsSpy = vi.spyOn(analyticsService, 'fetchPerformanceAnalytics');
const fetchTopAdaptersSpy = vi.spyOn(loraPublic, 'fetchTopAdapters');

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const createSummary = () => ({
  generatedAt: '2024-01-01T00:00:00Z',
  timeRange: '24h',
  kpis: {
    total_generations: 10,
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

const createTopLoras = () => [
  { id: 1, name: 'Alpha', version: '1.0', usage_count: 10, success_rate: 95, avg_time: 40 },
];

describe('performanceAnalytics store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
    useBackendClientSpy.mockReset().mockReturnValue({});
    useBackendRefreshSpy.mockReset().mockImplementation((callback: () => void) => {
      backendRefreshCallbacks.push(callback);
      return {
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(() => {
          callback();
        }),
        isActive: vi.fn(() => true),
        trigger: vi.fn(() => {
          callback();
        }),
      };
    });
    fetchPerformanceAnalyticsSpy.mockReset().mockResolvedValue(createSummary());
    fetchTopAdaptersSpy.mockReset().mockResolvedValue(createTopLoras());
  });

  afterEach(() => {
    vi.clearAllMocks();
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
  });

  it('caches analytics data for repeated loads', async () => {
    const store = usePerformanceAnalyticsStore();

    await store.ensureLoaded();
    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(1);

    await store.ensureLoaded();
    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(1);

    fetchPerformanceAnalyticsSpy.mockClear().mockResolvedValue(createSummary());
    store.setTimeRange('7d');
    await flushAsync();
    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(1);
  });

  it('resets to defaults when the analytics endpoint fails', async () => {
    const store = usePerformanceAnalyticsStore();
    fetchPerformanceAnalyticsSpy.mockRejectedValueOnce(new Error('unavailable'));

    await expect(store.loadAllData()).rejects.toThrow('unavailable');
    await flushAsync();
    expect(store.kpis.total_generations).toBe(0);
    expect(store.chartData.generationVolume).toEqual([]);
  });

  it('responds to backend refresh triggers', async () => {
    const store = usePerformanceAnalyticsStore();
    await store.ensureLoaded();
    expect(backendRefreshCallbacks).toHaveLength(1);

    fetchPerformanceAnalyticsSpy.mockClear().mockResolvedValue(createSummary());
    backendRefreshCallbacks[0]?.();
    await flushAsync();

    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(1);
  });

  it('manages the auto refresh interval based on state changes', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const store = usePerformanceAnalyticsStore();

    await store.ensureLoaded();
    fetchPerformanceAnalyticsSpy.mockClear().mockResolvedValue(createSummary());

    store.toggleAutoRefresh(true);
    await flushAsync();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 30_000);

    vi.advanceTimersByTime(30_000);
    await flushAsync();

    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(1);

    store.toggleAutoRefresh(false);
    await flushAsync();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });

  it('clears the auto refresh interval when the store is disposed', async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const store = usePerformanceAnalyticsStore();
    store.toggleAutoRefresh(true);
    await flushAsync();

    clearIntervalSpy.mockClear();

    store.$dispose();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });

  it('pauses auto refresh while hidden or offline and reloads once on resume', async () => {
    vi.useFakeTimers();
    // Let each load settle so the resource's in-flight dedupe does not swallow the next one.
    const settle = async () => {
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    };
    const environment = createPageEnvironment();
    environment.install();
    const removeListener = vi.spyOn(document, 'removeEventListener');

    const page = usePerformanceAnalytics();
    const toolbar = usePerformanceAnalytics();

    await page.ensureLoaded();
    page.toggleAutoRefresh(true);
    toolbar.toggleAutoRefresh(true);
    await settle();
    fetchPerformanceAnalyticsSpy.mockClear();

    environment.setHidden(true);
    vi.advanceTimersByTime(90_000);
    await settle();
    expect(fetchPerformanceAnalyticsSpy).not.toHaveBeenCalled();

    environment.setHidden(false);
    await settle();
    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(1);

    environment.setOnline(false);
    vi.advanceTimersByTime(90_000);
    await settle();
    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(1);

    environment.setOnline(true);
    await settle();
    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_000);
    await settle();
    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(3);

    toolbar.cleanup();
    await settle();
    expect(page.autoRefresh.value).toBe(false);
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    environment.setHidden(true);
    environment.setHidden(false);
    vi.advanceTimersByTime(60_000);
    await settle();
    expect(fetchPerformanceAnalyticsSpy).toHaveBeenCalledTimes(3);

    removeListener.mockRestore();
    environment.restore();
    vi.useRealTimers();
  });
});
