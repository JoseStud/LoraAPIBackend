import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import * as backendClientService from '@/services/backendClient';
import * as backendRefresh from '@/services/system/backendRefresh';
import * as loraService from '@/features/lora/services/lora/loraService';
import { useAdapterCatalogStore } from '@/features/lora/stores/adapterCatalog';
import type { AdapterListQuery, AdapterListResponse } from '@/types';

const backendRefreshCallbacks: Array<() => void> = [];

const useBackendClientSpy = vi.spyOn(backendClientService, 'useBackendClient');
const useBackendRefreshSpy = vi.spyOn(backendRefresh, 'useBackendRefresh');
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

  it('ignores stale list responses when filters change rapidly', async () => {
    const store = useAdapterCatalogStore();

    const pendingRequests: Array<{
      resolve: (value: AdapterListResponse) => void;
      query: AdapterListQuery;
    }> = [];

    fetchAdapterListSpy.mockImplementation(
      (requestQuery: AdapterListQuery) =>
        new Promise<AdapterListResponse>((resolve) => {
          pendingRequests.push({ resolve, query: requestQuery });
        }),
    );

    const first = store.ensureLoaded({ tags: ['alpha'] });
    await Promise.resolve();

    const second = store.ensureLoaded({ tags: ['beta'] });

    expect(fetchAdapterListSpy).toHaveBeenCalledTimes(2);
    expect(pendingRequests.at(0)?.query.tags).toEqual(['alpha']);
    expect(pendingRequests.at(1)?.query.tags).toEqual(['beta']);

    pendingRequests[1]?.resolve({
      items: [
        { id: 'beta', name: 'Beta', description: 'Latest', active: true },
      ],
      total: 1,
      filtered: 1,
      page: 1,
      pages: 1,
      per_page: 200,
    });

    await second;
    expect(store.adapters).toEqual([
      { id: 'beta', name: 'Beta', description: 'Latest', active: true },
    ]);

    pendingRequests[0]?.resolve({
      items: [
        { id: 'alpha', name: 'Alpha', description: 'Stale', active: true },
      ],
      total: 1,
      filtered: 1,
      page: 1,
      pages: 1,
      per_page: 200,
    });

    await first;
    expect(store.adapters).toEqual([
      { id: 'beta', name: 'Beta', description: 'Latest', active: true },
    ]);
  });
});
