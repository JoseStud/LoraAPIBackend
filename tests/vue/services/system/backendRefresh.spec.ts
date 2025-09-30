import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBackendRefresh } from '@/services';
import { emitBackendUrlChanged, resetBackendEnvironmentBus } from '@/services/system/backendEnvironmentEventBus';

describe('useBackendRefresh', () => {
  afterEach(() => {
    resetBackendEnvironmentBus();
  });

  it('invokes the refresh callback on backend url changes', () => {
    const refresh = vi.fn();
    const subscription = useBackendRefresh(refresh);

    emitBackendUrlChanged('https://api.example/v1', null);

    expect(refresh).toHaveBeenCalledTimes(1);

    subscription.stop();
  });

  it('stops invoking the callback after stop is called', () => {
    const refresh = vi.fn();
    const subscription = useBackendRefresh(refresh);

    emitBackendUrlChanged('https://api.example/v1', null);
    expect(refresh).toHaveBeenCalledTimes(1);

    subscription.stop();
    emitBackendUrlChanged('https://api.example/v2', 'https://api.example/v1');

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
