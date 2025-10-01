import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { createGenerationWebSocketManager } from '@/features/generation/services/websocketManager';
import type { GenerationWebSocketStateSnapshot } from '@/features/generation/types/transport';

let originalWebSocket: typeof WebSocket | undefined;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: (() => void) | null = null;

  onclose: ((event: CloseEvent) => void) | null = null;

  onerror: ((event: Event) => void) | null = null;

  onmessage: ((event: MessageEvent) => void) | null = null;

  readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close(): void {}

  triggerOpen(): void {
    this.onopen?.();
  }

  triggerClose(event: Partial<CloseEvent> = {}): void {
    this.onclose?.(event as CloseEvent);
  }

  triggerError(event: Partial<Event> = {}): void {
    this.onerror?.(event as Event);
  }
}

describe('createGenerationWebSocketManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    originalWebSocket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    (globalThis as { WebSocket?: typeof WebSocket }).WebSocket =
      MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    if (originalWebSocket) {
      (globalThis as { WebSocket?: typeof WebSocket }).WebSocket = originalWebSocket;
    } else {
      delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    }
  });

  it('emits structured telemetry for reconnect attempts', () => {
    const states: GenerationWebSocketStateSnapshot[] = [];
    const errors: unknown[] = [];
    const manager = createGenerationWebSocketManager({
      getBackendUrl: () => 'https://example.test/api',
      onStateChange: (snapshot) => {
        states.push(snapshot);
      },
      onTransportError: (error) => {
        errors.push(error);
      },
    });

    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    manager.start();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(states.at(-1)?.event).toBe('connect:start');

    MockWebSocket.instances[0].triggerOpen();

    expect(states.at(-1)?.event).toBe('connect:success');

    MockWebSocket.instances[0].triggerClose({
      code: 1006,
      reason: 'abnormal',
      wasClean: false,
    });

    expect(states.at(-1)?.event).toBe('reconnect:scheduled');
    expect(states.at(-1)?.reconnectAttempt).toBe(1);
    expect(errors).toHaveLength(1);
    const firstDelay = (timeoutSpy.mock.calls.at(-1)?.[1] as number) ?? 0;
    expect(firstDelay).toBeGreaterThan(0);

    vi.advanceTimersByTime(firstDelay);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(states.at(-1)?.event).toBe('connect:start');

    MockWebSocket.instances[1].triggerClose({
      code: 1006,
      reason: 'again',
      wasClean: false,
    });

    const secondDelay = (timeoutSpy.mock.calls.at(-1)?.[1] as number) ?? 0;
    expect(secondDelay).toBeGreaterThan(firstDelay);
    expect(states.filter((snapshot) => snapshot.event === 'disconnect')).toHaveLength(2);
    const scheduled = states.filter((snapshot) => snapshot.event === 'reconnect:scheduled');
    expect(scheduled.at(-1)?.reconnectAttempt).toBe(2);

    manager.stop();
  });
});
