import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import * as services from '@/services';
import * as loraService from '@/features/lora/services/lora/loraService';
import { useAdapterCatalogStore } from '@/features/lora/stores/adapterCatalog';

const backendRefreshCallbacks: Array<() => void> = [];

const useBackendClientSpy = vi.spyOn(services, 'useBackendClient');
const useBackendRefreshSpy = vi.spyOn(services, 'useBackendRefresh');
const fetchAdapterListSpy = vi.spyOn(loraService, 'fetchAdapterList');
const fetchAdapterTagsSpy = vi.spyOn(loraService, 'fetchAdapterTags');
const performBulkLoraActionSpy = vi.spyOn(loraService, 'performBulkLoraAction');

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const createResponse = () => ({
  items: [
    { id: 'alpha', name: 'Alpha', description: 'First', active: true },
    { id: 'beta', name: 'Beta', description: 'Second', active: false },
  ],
  total: 2,
  filtered: 2,
  page: 1,
  pages: 1,
  per_page: 200,
});

describe('adapterCatalog store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
    useBackendClientSpy.mockReset().mockReturnValue({});
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
    fetchAdapterListSpy.mockReset().mockResolvedValue(createResponse());
    fetchAdapterTagsSpy.mockReset().mockResolvedValue(['alpha', 'beta']);
    performBulkLoraActionSpy.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
  });

  it('caches adapter summaries and reloads when query changes', async () => {
    const store = useAdapterCatalogStore();

    await store.ensureLoaded();
    expect(fetchAdapterListSpy).toHaveBeenCalledTimes(1);
    expect(store.adapters).toHaveLength(2);

    await store.ensureLoaded();
    expect(fetchAdapterListSpy).toHaveBeenCalledTimes(1);

    await store.ensureLoaded({ page: 2 });
    expect(fetchAdapterListSpy).toHaveBeenCalledTimes(2);
  });

  it('refreshes when backend signals an update', async () => {
    const store = useAdapterCatalogStore();
    await store.ensureLoaded();
    expect(backendRefreshCallbacks).toHaveLength(1);

    fetchAdapterListSpy.mockClear();
    backendRefreshCallbacks[0]?.();
    await flushAsync();

    expect(fetchAdapterListSpy).toHaveBeenCalledTimes(1);
    expect(fetchAdapterTagsSpy).toHaveBeenCalledTimes(2);
  });

  it('surfaces errors from the adapter endpoint', async () => {
    const store = useAdapterCatalogStore();
    fetchAdapterListSpy.mockRejectedValueOnce(new Error('failure'));

    await expect(store.refresh()).rejects.toThrow('failure');
    await flushAsync();
    expect(store.error).toBeInstanceOf(Error);
    expect(store.adapters).toEqual([]);
  });
});
