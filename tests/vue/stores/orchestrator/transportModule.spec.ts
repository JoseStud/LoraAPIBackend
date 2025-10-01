import { describe, it, expect, vi } from 'vitest';

import { createTransportModule } from '@/features/generation/stores/orchestrator/transportModule';
import type { GenerationTransportError, GenerationWebSocketStateSnapshot } from '@/features/generation/types/transport';

const baseSnapshot = (
  overrides: Partial<GenerationWebSocketStateSnapshot> = {},
): GenerationWebSocketStateSnapshot => ({
  event: 'disconnect',
  timestamp: 1,
  url: 'ws://example.test',
  connected: false,
  reconnectAttempt: 1,
  consecutiveFailures: 1,
  nextRetryDelayMs: 1_000,
  lastConnectedAt: 10,
  lastDisconnectedAt: 20,
  downtimeMs: 5,
  error: {
    message: 'boom',
    code: 1006,
    reason: 'closed',
    wasClean: false,
  },
  ...overrides,
});

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

  it('records connection telemetry and exposes metrics', () => {
    const transportModule = createTransportModule();
    const disconnect = baseSnapshot();
    transportModule.recordConnectionSnapshot(disconnect);

    expect(transportModule.phase.value).toBe('disconnected');
    expect(transportModule.metrics.value.totalDowntimeMs).toBe(0);
    expect(transportModule.lastError.value).toMatchObject<GenerationTransportError>({
      source: 'websocket',
      message: 'boom',
      statusCode: 1006,
    });

    const reconnectScheduled = baseSnapshot({
      event: 'reconnect:scheduled',
      connected: false,
      error: null,
    });
    transportModule.recordConnectionSnapshot(reconnectScheduled);
    expect(transportModule.phase.value).toBe('reconnecting');

    const success = baseSnapshot({
      event: 'connect:success',
      connected: true,
      downtimeMs: 5,
      error: null,
    });
    transportModule.recordConnectionSnapshot(success);

    expect(transportModule.phase.value).toBe('connected');
    expect(transportModule.metrics.value.totalDowntimeMs).toBe(5);
    expect(transportModule.lastError.value).toMatchObject({ message: 'boom' });
  });

  it('resets metrics when cleared', () => {
    const adapter = { clear: vi.fn() } as any;
    const transportModule = createTransportModule();
    transportModule.setTransport(adapter);
    transportModule.recordConnectionSnapshot(baseSnapshot());
    transportModule.recordTransportError({
      source: 'http',
      context: 'refresh',
      message: 'fail',
      timestamp: 1,
    });

    transportModule.clearTransport();

    expect(adapter.clear).toHaveBeenCalled();
    expect(transportModule.phase.value).toBe('idle');
    expect(transportModule.lastError.value).toBeNull();
    expect(transportModule.metrics.value.totalDowntimeMs).toBe(0);
  });
});
