import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';

import * as services from '@/services';
import { useAsyncResource } from '@/composables/shared';

const backendRefreshCallbacks: Array<() => void> = [];

const useBackendRefreshSpy = vi.spyOn(services, 'useBackendRefresh');

describe('useAsyncResource', () => {
  beforeEach(() => {
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
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
  });

  afterEach(() => {
    vi.clearAllMocks();
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
  });

  it('dedupes concurrent refresh calls', async () => {
    const fetcher = vi.fn(async (value: number) => {
      await Promise.resolve();
      return value;
    });

    const scope = effectScope();
    const resource = scope.run(() => useAsyncResource(fetcher, { initialArgs: 1 }))!;

    const first = resource.refresh(1);
    const second = resource.refresh(1);

    await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('uses cached data until arguments change', async () => {
    const fetcher = vi.fn(async (value: number) => value * 2);

    const scope = effectScope();
    const resource = scope.run(() => useAsyncResource(fetcher, { initialArgs: 1 }))!;

    await resource.ensureLoaded(1);
    await resource.ensureLoaded(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await resource.ensureLoaded(2);
    expect(fetcher).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it('tracks errors and supports backend-triggered refresh', async () => {
    let shouldFail = true;
    const fetcher = vi.fn(async () => {
      if (shouldFail) {
        throw new Error('boom');
      }
      return 'ok';
    });

    const scope = effectScope();
    const resource = scope.run(() =>
      useAsyncResource(fetcher, { backendRefresh: true, initialArgs: undefined }),
    )!;

    await expect(resource.refresh()).rejects.toThrow('boom');
    expect(resource.error.value).toBeInstanceOf(Error);

    shouldFail = false;
    backendRefreshCallbacks.at(-1)?.();
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(resource.error.value).toBeNull();
    expect(resource.data.value).toBe('ok');

    scope.stop();
  });
});
