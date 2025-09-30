import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  emitBackendUrlChanged,
  resetBackendEnvironmentBus,
  subscribe,
  unsubscribe,
} from '@/services/system/backendEnvironmentEventBus';

describe('backendEnvironmentEventBus', () => {
  afterEach(() => {
    resetBackendEnvironmentBus();
  });

  it('notifies subscribers when backend url changes', () => {
    const handler = vi.fn();
    subscribe(handler);

    emitBackendUrlChanged('https://example.com', null);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ next: 'https://example.com', previous: null });
  });

  it('stops notifying after unsubscribe', () => {
    const handler = vi.fn();
    subscribe(handler);
    emitBackendUrlChanged('https://first.example', null);

    unsubscribe(handler);
    emitBackendUrlChanged('https://second.example', 'https://first.example');

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
