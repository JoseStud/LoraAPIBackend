import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import type { BackendClient } from '@/services/backendClient';

const backendClientMocks = vi.hoisted(() => ({
  useBackendClient: vi.fn(),
}));

const systemServiceMocks = vi.hoisted(() => ({
  fetchSystemStatus: vi.fn(),
}));

vi.mock('@/services/backendClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/backendClient')>();
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

const createBackendClient = (label: string): BackendClient =>
  ({
    resolve: (path = '') => `${label}${path}`,
    requestJson: vi.fn(),
    getJson: vi.fn(),
    postJson: vi.fn(),
    putJson: vi.fn(),
    patchJson: vi.fn(),
    delete: vi.fn(),
    requestBlob: vi.fn(),
  }) as unknown as BackendClient;

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
    orchestratorManagerStore.reset();
    resetStore = () => {
      orchestratorManagerStore.reset();
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
});
