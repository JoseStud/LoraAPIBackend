import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import type { BackendClient } from '@/services';

const serviceMocks = vi.hoisted(() => ({
  fetchSystemStatus: vi.fn(),
  useBackendClient: vi.fn(),
}));

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>();
  return {
    ...actual,
    fetchSystemStatus: serviceMocks.fetchSystemStatus,
    useBackendClient: serviceMocks.useBackendClient,
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
  beforeEach(() => {
    vi.resetModules();
    serviceMocks.fetchSystemStatus.mockReset();
    serviceMocks.fetchSystemStatus.mockResolvedValue(null);
    serviceMocks.useBackendClient.mockReset();
  });

  it('uses the global backend client by default', async () => {
    const defaultClient = createBackendClient('default-');
    serviceMocks.useBackendClient.mockReturnValue(defaultClient);

    const { acquireSystemStatusController } = await import(
      '@/stores/generation/systemStatusController'
    );

    setActivePinia(createPinia());

    const { controller, release } = acquireSystemStatusController();
    await controller.refresh();

    expect(serviceMocks.useBackendClient).toHaveBeenCalledTimes(1);
    expect(serviceMocks.fetchSystemStatus).toHaveBeenCalledWith(defaultClient);

    release();
  });

  it('respects an explicit backend client override', async () => {
    const defaultClient = createBackendClient('default-');
    const overrideClient = createBackendClient('override-');
    serviceMocks.useBackendClient.mockReturnValue(defaultClient);

    const { acquireSystemStatusController } = await import(
      '@/stores/generation/systemStatusController'
    );

    setActivePinia(createPinia());

    const { controller, release } = acquireSystemStatusController({ backendClient: overrideClient });
    await controller.refresh();

    expect(serviceMocks.fetchSystemStatus).toHaveBeenCalledWith(overrideClient);

    release();
  });

  it('creates scoped controllers when provided a backend getter', async () => {
    const defaultClient = createBackendClient('default-');
    const scopedClient = createBackendClient('scoped-');

    const getBackendUrl = vi.fn(() => 'https://example.test/api/');

    serviceMocks.useBackendClient.mockImplementation((override?: unknown) => {
      if (typeof override === 'function') {
        return scopedClient;
      }
      return defaultClient;
    });

    const { acquireSystemStatusController } = await import(
      '@/stores/generation/systemStatusController'
    );

    setActivePinia(createPinia());

    const { controller, release } = acquireSystemStatusController({ getBackendUrl });
    await controller.refresh();

    expect(getBackendUrl).toHaveBeenCalled();
    expect(serviceMocks.useBackendClient).toHaveBeenCalledWith(expect.any(Function));
    expect(serviceMocks.fetchSystemStatus).toHaveBeenCalledWith(scopedClient);

    release();
  });
});
