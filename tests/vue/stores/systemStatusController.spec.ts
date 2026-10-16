import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import type { BackendHttpClient } from '@/services/shared/http';

const backendClientMocks = vi.hoisted(() => ({
  useBackendClient: vi.fn(),
}));

const systemServiceMocks = vi.hoisted(() => ({
  fetchSystemStatus: vi.fn(),
}));

vi.mock('@/services/shared/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/shared/http')>();
  return {
    ...actual,
    useBackendClient: backendClientMocks.useBackendClient,
  };
});

vi.mock('@/services/system/systemService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/system/systemService')>();
  return {
    ...actual,
    fetchSystemStatus: systemServiceMocks.fetchSystemStatus,
  };
});

vi.mock('@/utils/backend', async () => {
  const actual = await vi.importActual<typeof import('@/utils/backend')>('@/utils/backend');
  return {
    ...actual,
    resolveBackendBaseUrl: (base?: string | null) => {
      if (!base) {
        return '/api/v1';
      }
      return base.replace(/\/+$/, '');
    },
  };
});

const createBackendClient = (label: string): BackendHttpClient =>
  ({
    resolve: (path = '') => `${label}${path}`,
    requestJson: vi.fn(),
    getJson: vi.fn(),
    postJson: vi.fn(),
    putJson: vi.fn(),
    patchJson: vi.fn(),
    delete: vi.fn(),
    requestBlob: vi.fn(),
  }) as unknown as BackendHttpClient;

describe('acquireSystemStatusController', () => {
  let resetStore: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    systemServiceMocks.fetchSystemStatus.mockReset();
    systemServiceMocks.fetchSystemStatus.mockResolvedValue(null);
    backendClientMocks.useBackendClient.mockReset();
    setActivePinia(createPinia());
    const { useGenerationOrchestratorManagerStore } = await import(
      '@/features/generation/stores/orchestratorManagerStore'
    );
    const orchestratorManagerStore = useGenerationOrchestratorManagerStore();
    orchestratorManagerStore.destroyOrchestrator();
    resetStore = () => {
      orchestratorManagerStore.destroyOrchestrator();
    };
  });

  afterEach(() => {
    resetStore?.();
    resetStore = null;
  });

  it('uses the global backend client by default', async () => {
    const defaultClient = createBackendClient('default-');
    backendClientMocks.useBackendClient.mockReturnValue(defaultClient);

    const { acquireSystemStatusController } = await import(
      '@/features/generation/stores/systemStatusController'
    );

    const { controller, release } = acquireSystemStatusController();
    await controller.refresh();

    expect(backendClientMocks.useBackendClient).toHaveBeenCalledTimes(1);
    expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledWith(defaultClient);

    release();
  });

  it('rejects an invalid status payload and marks the status as errored', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    backendClientMocks.useBackendClient.mockReturnValue(createBackendClient('default-'));
    systemServiceMocks.fetchSystemStatus.mockResolvedValue({ status: 42 });

    const { acquireSystemStatusController } = await import(
      '@/features/generation/stores/systemStatusController'
    );
    const { useGenerationOrchestratorStore } = await import(
      '@/features/generation/stores/useGenerationOrchestratorStore'
    );

    const { controller, release } = acquireSystemStatusController();
    await controller.refresh();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(useGenerationOrchestratorStore().systemStatus).toMatchObject({
      status: 'error',
      gpu_status: 'Unknown',
    });

    release();
    warnSpy.mockRestore();
  });

  it('respects an explicit backend client override', async () => {
    const defaultClient = createBackendClient('default-');
    const overrideClient = createBackendClient('override-');
    backendClientMocks.useBackendClient.mockReturnValue(defaultClient);

    const { acquireSystemStatusController } = await import(
      '@/features/generation/stores/systemStatusController'
    );

    const { controller, release } = acquireSystemStatusController({ backendClient: overrideClient });
    await controller.refresh();

    expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledWith(overrideClient);

    release();
  });

  it('creates scoped controllers when provided a backend getter', async () => {
    const defaultClient = createBackendClient('default-');
    const scopedClient = createBackendClient('scoped-');

    const getBackendUrl = vi.fn(() => 'https://example.test/api/');

    backendClientMocks.useBackendClient.mockImplementation((override?: unknown) => {
      if (typeof override === 'function') {
        return scopedClient;
      }
      return defaultClient;
    });

    const { acquireSystemStatusController } = await import(
      '@/features/generation/stores/systemStatusController'
    );

    const { controller, release } = acquireSystemStatusController({ getBackendUrl });
    await controller.refresh();

    expect(getBackendUrl).toHaveBeenCalled();
    expect(backendClientMocks.useBackendClient).toHaveBeenCalledWith(expect.any(Function));
    expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledWith(scopedClient);

    release();
  });

  describe('environment pausing', () => {
    let hidden = false;
    let online = true;

    const setHidden = (value: boolean) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };

    const setOnline = (value: boolean) => {
      online = value;
      window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    };

    beforeEach(() => {
      vi.useFakeTimers();
      hidden = false;
      online = true;
      vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
      vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
      backendClientMocks.useBackendClient.mockReturnValue(createBackendClient('default-'));
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    const loadController = async () => {
      const module = await import('@/features/generation/stores/systemStatusController');
      const { generationPollingConfig } = await import(
        '@/features/generation/config/polling'
      );
      return { ...module, intervalMs: generationPollingConfig.systemStatusMs };
    };

    it('stops polling while hidden and refreshes once when visible again', async () => {
      const { acquireSystemStatusController, intervalMs } = await loadController();
      const { controller, release } = acquireSystemStatusController();

      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledTimes(1);

      setHidden(true);
      expect(controller.isPolling.value).toBe(false);
      await vi.advanceTimersByTimeAsync(intervalMs * 3);
      expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledTimes(1);

      setHidden(false);
      expect(controller.isPolling.value).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledTimes(3);

      release();
    });

    it('stops polling while offline', async () => {
      const { acquireSystemStatusController, intervalMs } = await loadController();
      const { controller, release } = acquireSystemStatusController();

      setOnline(false);
      expect(controller.isPolling.value).toBe(false);
      await vi.advanceTimersByTimeAsync(intervalMs * 3);
      expect(systemServiceMocks.fetchSystemStatus).not.toHaveBeenCalled();

      setOnline(true);
      expect(controller.isPolling.value).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledTimes(1);

      release();
    });

    it('does not start the timer when acquired while hidden', async () => {
      hidden = true;
      const { acquireSystemStatusController, intervalMs } = await loadController();
      const { controller, release } = acquireSystemStatusController();

      expect(controller.isPolling.value).toBe(false);
      await vi.advanceTimersByTimeAsync(intervalMs * 2);
      expect(systemServiceMocks.fetchSystemStatus).not.toHaveBeenCalled();

      setHidden(false);
      expect(controller.isPolling.value).toBe(true);

      release();
    });

    it('does not resume a controller that was stopped explicitly', async () => {
      const { acquireSystemStatusController } = await loadController();
      const { controller, release } = acquireSystemStatusController();

      controller.stop();
      setHidden(true);
      setHidden(false);
      await vi.advanceTimersByTimeAsync(0);

      expect(controller.isPolling.value).toBe(false);
      expect(systemServiceMocks.fetchSystemStatus).not.toHaveBeenCalled();

      release();
    });

    it('stops following the environment once the last consumer releases', async () => {
      const { acquireSystemStatusController } = await loadController();
      const first = acquireSystemStatusController();
      const second = acquireSystemStatusController();

      expect(second.controller).toBe(first.controller);

      first.release();
      setHidden(true);
      expect(second.controller.isPolling.value).toBe(false);
      setHidden(false);
      expect(second.controller.isPolling.value).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledTimes(1);

      second.release();
      setHidden(true);
      setHidden(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(second.controller.isPolling.value).toBe(false);
      expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledTimes(1);
    });

    it('shares one controller between default and backend-URL consumers of the same backend', async () => {
      const { acquireSystemStatusController, intervalMs } = await loadController();
      const dashboard = acquireSystemStatusController();
      const studio = acquireSystemStatusController({ getBackendUrl: () => '/api/v1/' });

      expect(studio.controller).toBe(dashboard.controller);

      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledTimes(1);

      dashboard.release();
      studio.release();
    });

    it('coalesces a resume refresh with a concurrent refresh into one request', async () => {
      let resolveFetch: (value: null) => void = () => {};
      systemServiceMocks.fetchSystemStatus.mockImplementation(
        () => new Promise<null>((resolve) => {
          resolveFetch = resolve;
        }),
      );

      const { acquireSystemStatusController } = await loadController();
      const { controller, release } = acquireSystemStatusController();

      setOnline(false);
      const transportRefresh = controller.refresh();
      setOnline(true);
      resolveFetch(null);
      await transportRefresh;

      expect(systemServiceMocks.fetchSystemStatus).toHaveBeenCalledTimes(1);

      release();
    });
  });
});
