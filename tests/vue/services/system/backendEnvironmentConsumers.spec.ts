import { describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const createMockBackendClient = () => ({
  resolve: vi.fn((path: string) => path),
  requestJson: vi.fn(),
  getJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  patchJson: vi.fn(),
  delete: vi.fn(),
  requestBlob: vi.fn(),
});

describe('backend environment consumers', () => {
  const createBackendRefreshStub = () => {
    const handlers: Array<() => void> = [];
    const stub = vi.fn((callback: () => void) => {
      handlers.push(callback);
      return {
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(),
        isActive: () => true,
        trigger: () => callback(),
      };
    });
    const trigger = () => {
      handlers.forEach((callback) => {
        callback();
      });
    };
    return { stub, trigger };
  };

  it('refreshes the adapter catalog when the backend callback runs', async () => {
    vi.resetModules();
    setActivePinia(createPinia());

    const fetchAdapterList = vi.fn().mockResolvedValue({ items: [] });
    const fetchAdapterTags = vi.fn().mockResolvedValue([]);

    vi.doMock('@/services/shared/http', () => ({
      useBackendClient: () => createMockBackendClient(),
      createBackendClient: () => createMockBackendClient(),
      resolveBackendClient: () => createMockBackendClient(),
    }));

    vi.doMock('@/features/lora/services/lora/loraService', () => ({
      fetchAdapterList,
      fetchAdapterTags,
      performBulkLoraAction: vi.fn(),
    }));

    const backendRefresh = createBackendRefreshStub();
    vi.doMock('@/services/system/backendRefresh', async () => {
      const actual = await vi.importActual<typeof import('@/services/system/backendRefresh')>(
        '@/services/system/backendRefresh',
      );
      return {
        ...actual,
        useBackendRefresh: (callback: () => void) => backendRefresh.stub(callback),
      };
    });

    const { useAdapterCatalogStore } = await import('@/features/lora/stores/adapterCatalog');

    useAdapterCatalogStore();
    backendRefresh.trigger();

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchAdapterList).toHaveBeenCalled();
    expect(fetchAdapterTags).toHaveBeenCalled();

    vi.resetModules();
  });

  it('refreshes analytics when the backend callback runs', async () => {
    vi.resetModules();
    setActivePinia(createPinia());

    const fetchPerformanceAnalytics = vi.fn().mockResolvedValue({
      kpis: {},
      chartData: {
        generationVolume: [],
        performance: [],
        loraUsage: [],
        resourceUsage: [],
      },
      errorAnalysis: [],
      performanceInsights: [],
    });
    const fetchTopAdapters = vi.fn().mockResolvedValue([]);

    vi.doMock('@/services/shared/http', () => ({
      useBackendClient: () => createMockBackendClient(),
      createBackendClient: () => createMockBackendClient(),
      resolveBackendClient: () => createMockBackendClient(),
    }));

    vi.doMock('@/features/analytics/services/analyticsService', () => ({
      fetchPerformanceAnalytics,
      exportAnalyticsReport: vi.fn(),
    }));

    vi.doMock('@/features/lora/services/lora/loraService', async () => {
      const actual = await vi.importActual<typeof import('@/features/lora/services/lora/loraService')>(
        '@/features/lora/services/lora/loraService',
      );
      return {
        ...actual,
        fetchTopAdapters,
      };
    });

    vi.doMock('@/features/lora/public', async () => {
      const actual = await vi.importActual<typeof import('@/features/lora/public')>('@/features/lora/public');
      return {
        ...actual,
        fetchTopAdapters,
      };
    });

    const backendRefresh = createBackendRefreshStub();
    vi.doMock('@/services/system/backendRefresh', async () => {
      const actual = await vi.importActual<typeof import('@/services/system/backendRefresh')>(
        '@/services/system/backendRefresh',
      );
      return {
        ...actual,
        useBackendRefresh: (callback: () => void) => backendRefresh.stub(callback),
      };
    });

    const { usePerformanceAnalyticsStore } = await import('@/features/analytics/stores/performanceAnalytics');

    usePerformanceAnalyticsStore();
    backendRefresh.trigger();

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchPerformanceAnalytics).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(fetchTopAdapters).toHaveBeenCalled();
    });

    vi.resetModules();
  });

  it('refreshes admin metrics when the backend callback runs', async () => {
    vi.resetModules();
    setActivePinia(createPinia());

    const fetchDashboardStats = vi.fn().mockResolvedValue(null);

    vi.doMock('@/services/shared/http', () => ({
      useBackendClient: () => createMockBackendClient(),
      createBackendClient: () => createMockBackendClient(),
      resolveBackendClient: () => createMockBackendClient(),
    }));

    vi.doMock('@/services/system/systemService', async () => {
      const actual = await vi.importActual<typeof import('@/services/system/systemService')>(
        '@/services/system/systemService',
      );
      return {
        ...actual,
        fetchDashboardStats,
      };
    });

    const backendRefresh = createBackendRefreshStub();
    vi.doMock('@/services/system/backendRefresh', async () => {
      const actual = await vi.importActual<typeof import('@/services/system/backendRefresh')>(
        '@/services/system/backendRefresh',
      );
      return {
        ...actual,
        useBackendRefresh: (callback: () => void) => backendRefresh.stub(callback),
      };
    });

    const { useAdminMetricsStore } = await import('@/stores/adminMetrics');

    useAdminMetricsStore();
    backendRefresh.trigger();

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchDashboardStats).toHaveBeenCalled();

    vi.resetModules();
  });
});
