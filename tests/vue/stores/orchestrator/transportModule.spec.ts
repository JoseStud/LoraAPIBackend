import { describe, it, expect, vi } from 'vitest';

import { createTransportModule } from '@/features/generation/stores/orchestrator/transportModule';

describe('transportModule', () => {
  it('throws when ensuring transport before initialization', () => {
    const transportModule = createTransportModule();
    expect(() => transportModule.ensureTransport()).toThrowError();
  });

  it('manages lifecycle and delegates operations', () => {
    const adapter = {
      refreshSystemStatus: vi.fn(),
      refreshActiveJobs: vi.fn(),
      refreshRecentResults: vi.fn(),
      refreshAll: vi.fn(),
      cancelJob: vi.fn(),
      deleteResult: vi.fn(),
      startGeneration: vi.fn(),
      reconnect: vi.fn(),
      setPollInterval: vi.fn(),
      clear: vi.fn(),
    } as any;

    const transportModule = createTransportModule();
    transportModule.setTransport(adapter);

    expect(transportModule.ensureTransport()).toEqual(adapter);

    transportModule.setPollInterval(1500);
    expect(adapter.setPollInterval).toHaveBeenCalledWith(1500);

    transportModule.reconnect();
    expect(adapter.reconnect).toHaveBeenCalled();

    transportModule.clearTransport();
    expect(adapter.clear).toHaveBeenCalled();
    expect(() => transportModule.ensureTransport()).toThrowError();
  });

  it('withTransport helper invokes callback with adapter', async () => {
    const adapter = {
      refreshSystemStatus: vi.fn(),
      clear: vi.fn(),
    } as any;

    const transportModule = createTransportModule();
    transportModule.setTransport(adapter);

    await transportModule.withTransport((instance) => instance.refreshSystemStatus());
    expect(adapter.refreshSystemStatus).toHaveBeenCalled();
  });
});
