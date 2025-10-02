import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import * as backendClientService from '@/services/shared/http';
import * as backendRefresh from '@/services/system/backendRefresh';
import * as systemService from '@/services/system/systemService';
import * as systemMetrics from '@/utils/systemMetrics';
import { useAdminMetricsStore } from '@/stores/adminMetrics';

const backendRefreshCallbacks: Array<() => void> = [];

const fetchDashboardStatsSpy = vi.spyOn(systemService, 'fetchDashboardStats');
const deriveMetricsSpy = vi.spyOn(systemService, 'deriveMetricsFromDashboard');
const emptyMetricsSpy = vi.spyOn(systemService, 'emptyMetricsSnapshot');
const useBackendClientSpy = vi.spyOn(backendClientService, 'useBackendClient');
const useBackendRefreshSpy = vi.spyOn(backendRefresh, 'useBackendRefresh');
const buildResourceStatsSpy = vi.spyOn(systemMetrics, 'buildResourceStats');
const defaultResourceStatsSpy = vi.spyOn(systemMetrics, 'defaultResourceStats');
const defaultSystemStatusSpy = vi.spyOn(systemMetrics, 'defaultSystemStatus', 'get');
const deriveSeveritySpy = vi.spyOn(systemMetrics, 'deriveSeverityFromMetrics');
const mergeStatusLevelsSpy = vi.spyOn(systemMetrics, 'mergeStatusLevels');
const normaliseStatusSpy = vi.spyOn(systemMetrics, 'normaliseStatus');

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const createSummary = () => ({
  stats: { total_loras: 5 },
  system_health: { status: 'healthy' },
});

describe('adminMetrics store', () => {
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
    fetchDashboardStatsSpy.mockReset().mockResolvedValue(createSummary());
    deriveMetricsSpy.mockReset().mockReturnValue({});
    emptyMetricsSpy.mockReset().mockReturnValue({});
    buildResourceStatsSpy.mockReset().mockReturnValue({});
    defaultResourceStatsSpy.mockReset().mockReturnValue({ cpu: 0 });
    deriveSeveritySpy.mockReset().mockReturnValue('ok');
    mergeStatusLevelsSpy.mockReset().mockImplementation((_, derived) => derived ?? 'healthy');
    normaliseStatusSpy.mockReset().mockReturnValue('healthy');
    defaultSystemStatusSpy.mockReturnValue('healthy');
  });

  afterEach(() => {
    vi.clearAllMocks();
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
  });

  it('loads dashboard metrics and caches the result', async () => {
    const store = useAdminMetricsStore();

    await store.refresh();
    await flushAsync();
    expect(fetchDashboardStatsSpy).toHaveBeenCalledTimes(1);
    expect(store.summary).toEqual(createSummary());

    await store.refresh();
    await flushAsync();
    expect(fetchDashboardStatsSpy).toHaveBeenCalledTimes(2);
  });

  it('exposes error information when the backend fails', async () => {
    const store = useAdminMetricsStore();
    fetchDashboardStatsSpy.mockRejectedValueOnce(new Error('offline'));

    await expect(store.refresh()).rejects.toThrow('offline');
    await flushAsync();
    expect(store.error).toBeInstanceOf(Error);
    expect(store.apiAvailable).toBe(false);
  });

  it('reacts to backend refresh signals', async () => {
    const store = useAdminMetricsStore();
    await store.refresh();
    expect(backendRefreshCallbacks).toHaveLength(1);

    fetchDashboardStatsSpy.mockClear().mockResolvedValue(createSummary());
    backendRefreshCallbacks[0]?.();
    await flushAsync();
    expect(fetchDashboardStatsSpy).toHaveBeenCalledTimes(1);
  });
});
