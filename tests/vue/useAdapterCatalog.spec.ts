import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  fetchAdapterListMock: vi.fn(),
  fetchAdapterTagsMock: vi.fn().mockResolvedValue([]),
  performBulkLoraActionMock: vi.fn(),
}));

vi.mock('@/services/lora/loraService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchAdapterList: mocks.fetchAdapterListMock,
    fetchAdapterTags: mocks.fetchAdapterTagsMock,
    performBulkLoraAction: mocks.performBulkLoraActionMock,
  };
});

import { useAdapterCatalog } from '@/composables/compose/useAdapterCatalog';
import { useSettingsStore } from '@/stores/settings';
type CatalogReturn = ReturnType<typeof useAdapterCatalog>;

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

let activePinia: ReturnType<typeof createPinia>;

const withSetup = () => {
  let result: CatalogReturn;
  mount({
    template: '<div />',
    setup() {
      result = useAdapterCatalog();
      return result;
    },
  }, { global: { plugins: [activePinia] } });
  return result!;
};

describe('useAdapterCatalog', () => {
  beforeEach(() => {
    activePinia = createPinia();
    setActivePinia(activePinia);
    const settingsStore = useSettingsStore();
    settingsStore.reset();
    settingsStore.setSettings({ backendUrl: '/api/v1' });

    mocks.fetchAdapterListMock.mockReset();
    mocks.fetchAdapterListMock.mockImplementation(async (_baseUrl, query = {}) => ({
      items: [
        { id: 'alpha', name: 'Alpha', description: 'First adapter', active: true },
        { id: 'beta', name: 'Beta', description: 'Second adapter', active: false },
      ],
      total: 2,
      filtered: 2,
      page: (query as Record<string, number | undefined>).page ?? 1,
      pages: 1,
      per_page: (query as Record<string, number | undefined>).perPage ?? 200,
    }));
  });

  it('fetches adapters and filters them', async () => {
    const state = withSetup();
    await flush();

    expect(mocks.fetchAdapterListMock).toHaveBeenCalledTimes(1);
    expect(state.adapters.value).toHaveLength(2);
    expect(state.adapters.value[1].active).toBe(false);

    state.setActiveOnly(true);
    await nextTick();
    expect(state.filteredAdapters.value).toHaveLength(1);
    expect(state.filteredAdapters.value[0].name).toBe('Alpha');

    state.setActiveOnly(false);
    await nextTick();

    state.setSearchTerm('beta');
    await nextTick();
    expect(state.filteredAdapters.value).toHaveLength(1);

    state.setActiveOnly(true);
    await nextTick();
    expect(state.filteredAdapters.value).toHaveLength(0);
  });

  it('refreshes adapters on demand', async () => {
    const state = withSetup();
    await flush();

    await state.refresh();
    expect(mocks.fetchAdapterListMock).toHaveBeenCalledTimes(2);
  });

  it('only fetches once for multiple subscribers', async () => {
    const first = withSetup();
    await flush();

    const second = withSetup();
    await flush();

    expect(mocks.fetchAdapterListMock).toHaveBeenCalledTimes(1);
    expect(first.adapters.value).toHaveLength(2);
    expect(second.adapters.value).toHaveLength(2);
  });
});
